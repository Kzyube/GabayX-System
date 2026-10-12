// ==============================================================================
// GABAYX SERVICE WORKER
// Progressive Web App (PWA) Foundation & Emergency Alert Service
// ==============================================================================

const CACHE_NAME = 'gabayx-shell-v2';
const RUNTIME_CACHE = 'gabayx-runtime-v2';
const TILE_CACHE = 'gabayx-tiles-v3';

// Application Shell & Critical Static Resources (Pre-cached on Install)
const STATIC_ASSETS = [
    '/',
    '/student.html',
    '/index.html',
    '/register.html',
    '/donate.html',
    '/admin.html',
    '/admin-login.html',
    '/manifest.webmanifest',
    '/manifest.json',
    '/GabayXLOGO.jpg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable.png',
    '/icons/apple-touch-icon.png',
    '/js/pwa.js',
    '/js/storage/db.js',
    '/js/services/apiService.js',
    '/js/services/syncService.js',
    '/js/services/reportService.js',
    '/js/pwa/install.js',
    '/js/pwa/network.js',
    '/js/pwa/sw-register.js',
    '/js/offline-ui.js'
];

// Critical External CDN Dependencies
const EXTERNAL_CRITICAL_ASSETS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
    'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap'
];

// ------------------------------------------------------------------------------
// 1. INSTALLATION: Pre-cache Application Shell
// Strategy: Precache essential assets so the app shell is available offline immediately.
// ------------------------------------------------------------------------------
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[SW] Pre-caching GabayX application shell...');

            // Pre-cache local static assets
            for (const asset of STATIC_ASSETS) {
                try {
                    await cache.add(asset);
                } catch (err) {
                    console.warn('[SW] Could not pre-cache local asset:', asset, err);
                }
            }

            // Pre-cache critical external CDN assets
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

// ------------------------------------------------------------------------------
// 2. ACTIVATION: Cache Cleanup & Client Takeover
// Purges outdated caches from previous versions and takes immediate control.
// ------------------------------------------------------------------------------
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

// ------------------------------------------------------------------------------
// 3. FETCH: Targeted Request Interception & Caching Strategy
// - Navigation requests -> Network-First with Cache Fallback
// - Static assets       -> Stale-While-Revalidate
// - Non-GET requests    -> Network only (never cached)
// - Dynamic APIs / Auth -> Network only (never cached, no blind caching)
// - WebSockets          -> Bypassed
// ------------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Rule 1: Non-GET requests (POST, PUT, PATCH, DELETE) bypass cache entirely
    if (request.method !== 'GET') {
        return;
    }

    // Rule 2: WebSocket and Socket.io endpoints bypass cache
    if (url.pathname.startsWith('/socket.io/')) {
        return;
    }

    // Rule 3: Only handle standard HTTP/HTTPS protocols (ignore extensions/schemes)
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Rule 4: Dynamic APIs, authentication, and session endpoints must NEVER be blindly cached
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        return;
    }

    // Strategy A: HTML Navigation Requests (Network-First with Cache Fallback)
    // Tries to fetch latest version from server; if offline, serves cached application shell.
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
                    console.log('[SW] Network offline, serving cached fallback for:', request.url);
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    // Fallback routing if exact path not in cache
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

    // Strategy B: Map Tile Imagery (OpenStreetMap & Esri Satellite tiles)
    // Cache-First with network fallback. Tiles are cached if fetched online.
    if (url.hostname.includes('tile.openstreetmap.org') || (url.hostname.includes('arcgisonline.com') && url.pathname.includes('/tile/'))) {
        event.respondWith(
            caches.open(TILE_CACHE).then((cache) => {
                return cache.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(request).then((networkResponse) => {
                        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                            cache.put(request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => {
                        // Clean 1x1 transparent png fallback if tile is unreachable offline (prevents broken image icons)
                        const transparentPixel = new Uint8Array([
                            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
                            0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
                            137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0,
                            5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174,
                            66, 96, 130
                        ]);
                        return new Response(transparentPixel, {
                            status: 200,
                            headers: { 'Content-Type': 'image/png' }
                        });
                    });
                });
            })
        );
        return;
    }

    // Strategy C: Static Resources (CSS, JS, Fonts, Images)
    // Stale-While-Revalidate: Return cached version immediately for speed, refresh in background.
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
                .catch(() => null);

            return cachedResponse || fetchPromise;
        })
    );
});

// ------------------------------------------------------------------------------
// 4. PUSH NOTIFICATIONS: Emergency Alerts & Alarms
// Handles background emergency broadcasts from school administration.
// ------------------------------------------------------------------------------
self.addEventListener('push', (event) => {
    console.log('[SW] Emergency Push Received');

    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        data = { body: event.data ? event.data.text() : 'Emergency Alert' };
    }

    let alertType = 'DEFAULT';
    if (data.type) {
        alertType = data.type;
    } else {
        const bodyText = (data.body || '').toUpperCase();
        if (bodyText.includes('FIRE')) alertType = 'FIRE';
        else if (bodyText.includes('EARTHQUAKE') || bodyText.includes('QUAKE')) alertType = 'EARTHQUAKE';
        else if (bodyText.includes('FLOOD')) alertType = 'FLOOD';
    }

    const baseUrl = self.location.origin;
    const targetUrl = `${baseUrl}/student.html?alert=${alertType}`;

    const aggressiveVibration = [
        1000, 200, 1000, 200, 1000, 200, 1000, 200, 
        1000, 200, 1000, 200, 1000, 200, 1000, 200
    ];

    event.waitUntil(
        self.registration.showNotification(data.title || '🚨 EMERGENCY ALERT', {
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

// ------------------------------------------------------------------------------
// 5. NOTIFICATION CLICK: Focus or Open Application
// ------------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data ? event.notification.data.url : '/student.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let client of windowClients) {
                if (client.url.includes('student.html') && 'focus' in client) {
                    return client.navigate(targetUrl).then((c) => c.focus());
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});