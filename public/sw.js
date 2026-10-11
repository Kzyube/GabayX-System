// GabayX Service Worker - Offline PWA Layer & Emergency Push Handler
const CACHE_NAME = 'gabayx-shell-v1';
const RUNTIME_CACHE = 'gabayx-runtime-v1';
const TILE_CACHE = 'gabayx-tiles-v1';

const STATIC_ASSETS = [
    '/',
    '/student.html',
    '/index.html',
    '/register.html',
    '/donate.html',
    '/admin.html',
    '/manifest.json',
    '/GabayXLOGO.jpg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable.png',
    '/icons/apple-touch-icon.png',
    '/js/db.js',
    '/js/sync-manager.js',
    '/js/offline-ui.js'
];

const EXTERNAL_CRITICAL_ASSETS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
    'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// --- 1. INSTALLATION: Cache App Shell & Static Assets ---
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[SW] Pre-caching application shell...');
            // Pre-cache local static assets
            for (const asset of STATIC_ASSETS) {
                try {
                    await cache.add(asset);
                } catch (err) {
                    console.warn('[SW] Could not pre-cache asset:', asset, err);
                }
            }
            // Pre-cache critical external assets gracefully
            for (const ext of EXTERNAL_CRITICAL_ASSETS) {
                try {
                    await cache.add(new Request(ext, { mode: 'cors' }));
                } catch (err) {
                    console.warn('[SW] Could not pre-cache external asset:', ext, err);
                }
            }
        }).then(() => self.skipWaiting())
    );
});

// --- 2. ACTIVATION: Clean old caches and claim clients ---
self.addEventListener('activate', (event) => {
    const currentCaches = [CACHE_NAME, RUNTIME_CACHE, TILE_CACHE];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (!currentCaches.includes(name) && name.startsWith('gabayx-')) {
                        console.log('[SW] Deleting legacy cache:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// --- 3. FETCH: Smart caching strategy ---
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Bypass non-GET requests (e.g. POST /api/sync, /auth/login)
    if (request.method !== 'GET') {
        return;
    }

    // Bypass websocket and socket.io connections
    if (url.pathname.startsWith('/socket.io/')) {
        return;
    }

    // Bypass browser extensions and chrome-specific schemes
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Dynamic API endpoints should never be blindly cached
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        return;
    }

    // A. HTML Navigation Requests: Network-First with Offline Fallback
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    console.log('[SW] Network navigation failed, serving cached fallback for:', request.url);
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // If specific page not found, fallback to student.html or index.html
                    if (url.pathname.includes('student')) {
                        return caches.match('/student.html');
                    }
                    if (url.pathname.includes('admin')) {
                        return caches.match('/admin.html');
                    }
                    return caches.match('/student.html') || caches.match('/index.html');
                })
        );
        return;
    }

    // B. Map Tile Imagery (ArcGIS Tiles) -> Cache-First with update
    if (url.hostname.includes('arcgisonline.com') && url.pathname.includes('/tile/')) {
        event.respondWith(
            caches.open(TILE_CACHE).then((cache) => {
                return cache.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => {
                        // Return empty transparent tile fallback if offline and not cached
                        return new Response('', { status: 503, statusText: 'Offline Tile Unavailable' });
                    });
                });
            })
        );
        return;
    }

    // C. Static Resources (CSS, JS, Fonts, Images) -> Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(RUNTIME_CACHE).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch((err) => {
                    // Network failed, if no cache available, let it fail gracefully
                    return null;
                });

            return cachedResponse || fetchPromise;
        })
    );
});

// --- 4. PUSH NOTIFICATIONS: Emergency Alerts & Alarms ---
self.addEventListener('push', (event) => {
    console.log('[SW] Emergency Push Received');

    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        data = { body: event.data ? event.data.text() : 'Emergency Alert' };
    }

    // 1. Determine Disaster Type
    let alertType = 'DEFAULT';
    if (data.type) {
        alertType = data.type;
    } else {
        const bodyText = (data.body || '').toUpperCase();
        if (bodyText.includes('FIRE')) alertType = 'FIRE';
        else if (bodyText.includes('EARTHQUAKE') || bodyText.includes('QUAKE')) alertType = 'EARTHQUAKE';
        else if (bodyText.includes('FLOOD')) alertType = 'FLOOD';
    }

    // 2. Build the Full URL
    const baseUrl = self.location.origin;
    const targetUrl = `${baseUrl}/student.html?alert=${alertType}`;

    // 3. Vibration Pattern
    const aggressiveVibration = [
        1000, 200, 1000, 200, 1000, 200, 1000, 200, 
        1000, 200, 1000, 200, 1000, 200, 1000, 200
    ];

    event.waitUntil(
        self.registration.showNotification(data.title || "🚨 EMERGENCY ALERT", {
            body: data.body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            vibrate: aggressiveVibration,
            tag: 'emergency-alert',
            renotify: true,
            requireInteraction: true,
            data: { url: targetUrl }
        })
    );
});

// --- 5. NOTIFICATION CLICK: Route user to student app ---
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data ? event.notification.data.url : '/student.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Check if tab is already open
            for (let client of windowClients) {
                if (client.url.includes('student.html') && 'focus' in client) {
                    return client.navigate(targetUrl).then((c) => c.focus());
                }
            }
            // If not open, open new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});