self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force update immediately
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('push', event => {
    console.log('[SW] Push Received'); // Debugging Log

    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        data = { body: event.data.text() };
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

    // 2. Build the Full URL (Prevents 502/404 Errors)
    // We explicitly use /student.html because that is your actual file name.
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
            icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
            badge: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
            vibrate: aggressiveVibration,
            tag: 'emergency-alert',
            renotify: true,
            requireInteraction: true,
            data: { url: targetUrl }
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    // Use the absolute URL we built earlier
    const targetUrl = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // A. Check if tab is already open
            for (let client of windowClients) {
                // Check if the client URL contains 'student.html'
                if (client.url.includes('student.html') && 'focus' in client) {
                    // Navigate the existing tab to the alert URL (triggering the route)
                    return client.navigate(targetUrl).then(c => c.focus());
                }
            }
            // B. If not open, open new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});