/**
 * GabayX Service Worker Registration
 * Non-blocking, safe registration with lifecycle updates.
 */

(function (global) {
    'use strict';

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('[SW Register] Service workers not supported in this browser.');
            return;
        }

        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('/sw.js', { scope: '/' })
                .then((registration) => {
                    console.log('[SW Register] Service Worker registered with scope:', registration.scope);

                    registration.onupdatefound = () => {
                        const installingWorker = registration.installing;
                        if (!installingWorker) return;

                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed') {
                                if (navigator.serviceWorker.controller) {
                                    console.log('[SW Register] New version available. Refresh to update.');
                                } else {
                                    console.log('[SW Register] Content cached for offline use.');
                                }
                            }
                        };
                    };
                })
                .catch((err) => {
                    console.error('[SW Register] Registration failed:', err);
                });
        });
    }

    registerServiceWorker();
})(typeof window !== 'undefined' ? window : this);
