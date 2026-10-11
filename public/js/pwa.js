/**
 * GabayX Progressive Web App (PWA) Foundation Controller
 * Handles Service Worker registration, lifecycle logging,
 * and unified online/offline connection state detection.
 */

(function () {
    'use strict';

    const PWA_CONFIG = {
        swUrl: '/sw.js',
        scope: '/'
    };

    // Connection states: ONLINE, OFFLINE, SYNCING
    const ConnectionState = {
        ONLINE: 'ONLINE',
        OFFLINE: 'OFFLINE',
        SYNCING: 'SYNCING'
    };

    let currentState = navigator.onLine ? ConnectionState.ONLINE : ConnectionState.OFFLINE;

    /**
     * Update the visual connection status indicator across the UI
     * @param {string} state - ConnectionState enum
     */
    function updateConnectionUI(state) {
        currentState = state;

        // If advanced GabayXNetwork controller is active, delegate to it
        if (typeof window !== 'undefined' && window.GabayXNetwork && typeof window.GabayXNetwork.updateIndicators === 'function') {
            window.GabayXNetwork.updateIndicators(state);
            return;
        }

        // 1. Update existing GabayX header indicators if present (e.g. student.html)
        const connDot = document.getElementById('conn-dot');
        const connText = document.getElementById('conn-text');

        if (connDot) {
            if (state === ConnectionState.ONLINE) {
                connDot.style.color = 'var(--primary, #10b981)';
            } else if (state === ConnectionState.OFFLINE) {
                connDot.style.color = 'var(--danger, #ff2a5f)';
            } else if (state === ConnectionState.SYNCING) {
                connDot.style.color = 'var(--warning, #f59e0b)';
            }
        }

        if (connText) {
            if (state === ConnectionState.ONLINE) {
                // If studentEmail is active on student page, preserve CONNECTED
                const studentEmail = window.studentEmail || (typeof studentEmail !== 'undefined' ? studentEmail : null);
                connText.innerText = studentEmail ? 'CONNECTED' : 'ONLINE';
            } else if (state === ConnectionState.OFFLINE) {
                connText.innerText = 'OFFLINE';
            } else if (state === ConnectionState.SYNCING) {
                connText.innerText = 'SYNCING';
            }
        }

        // 2. Manage floating non-intrusive status pill
        ensureStatusBadge(state);
    }

    /**
     * Render a lightweight, non-intrusive status pill at the top of the screen
     * Designed to never block emergency SOS controls or map interaction.
     */
    function ensureStatusBadge(state) {
        let badge = document.getElementById('gabayx-pwa-status-badge');

        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'gabayx-pwa-status-badge';
            badge.setAttribute('role', 'status');
            badge.setAttribute('aria-live', 'polite');
            badge.style.cssText = [
                'position: fixed',
                'top: 12px',
                'left: 50%',
                'transform: translateX(-50%) translateY(-100px)',
                'z-index: 9999',
                'display: flex',
                'align-items: center',
                'gap: 8px',
                'padding: 6px 14px',
                'border-radius: 9999px',
                'font-size: 11px',
                'font-weight: 700',
                'font-family: var(--font-data, "Space Mono", monospace), system-ui, sans-serif',
                'letter-spacing: 0.5px',
                'text-transform: uppercase',
                'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45)',
                'pointer-events: none',
                'transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease',
                'opacity: 0',
                'backdrop-filter: blur(12px)',
                '-webkit-backdrop-filter: blur(12px)'
            ].join(';');

            document.body.appendChild(badge);
        }

        if (state === ConnectionState.OFFLINE) {
            badge.innerHTML = '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ff2a5f; box-shadow:0 0 8px #ff2a5f;"></span><span>Offline (Using cached shell)</span>';
            badge.style.background = 'rgba(20, 5, 10, 0.88)';
            badge.style.color = '#ff6b8b';
            badge.style.border = '1px solid rgba(255, 42, 95, 0.35)';
            badge.style.transform = 'translateX(-50%) translateY(0)';
            badge.style.opacity = '1';
        } else if (state === ConnectionState.ONLINE) {
            // Only show briefly when transitioning back online
            if (badge.dataset.wasOffline === 'true') {
                badge.innerHTML = '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981;"></span><span>Online (Reconnected)</span>';
                badge.style.background = 'rgba(2, 20, 14, 0.88)';
                badge.style.color = '#34d399';
                badge.style.border = '1px solid rgba(16, 185, 129, 0.35)';
                badge.style.transform = 'translateX(-50%) translateY(0)';
                badge.style.opacity = '1';

                setTimeout(() => {
                    badge.style.transform = 'translateX(-50%) translateY(-100px)';
                    badge.style.opacity = '0';
                    badge.dataset.wasOffline = 'false';
                }, 3000);
            } else {
                badge.style.transform = 'translateX(-50%) translateY(-100px)';
                badge.style.opacity = '0';
            }
        } else if (state === ConnectionState.SYNCING) {
            badge.innerHTML = '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></span><span>Syncing Data...</span>';
            badge.style.background = 'rgba(25, 20, 5, 0.88)';
            badge.style.color = '#fbbf24';
            badge.style.border = '1px solid rgba(245, 158, 11, 0.35)';
            badge.style.transform = 'translateX(-50%) translateY(0)';
            badge.style.opacity = '1';
        }

        if (state === ConnectionState.OFFLINE) {
            badge.dataset.wasOffline = 'true';
        }
    }

    /**
     * Non-blocking Service Worker Registration
     */
    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('[PWA] Service Worker not supported in this browser.');
            return;
        }

        // Wait until window load so page load performance is not degraded
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register(PWA_CONFIG.swUrl, { scope: PWA_CONFIG.scope })
                .then((registration) => {
                    console.log('[PWA] Service Worker registered successfully with scope:', registration.scope);

                    // Check for updates
                    registration.onupdatefound = () => {
                        const installingWorker = registration.installing;
                        if (!installingWorker) return;
                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed') {
                                if (navigator.serviceWorker.controller) {
                                    console.log('[PWA] New PWA version available. Reload to update.');
                                } else {
                                    console.log('[PWA] Content is cached for offline use.');
                                }
                            }
                        };
                    };
                })
                .catch((error) => {
                    console.error('[PWA] Service Worker registration failed:', error);
                });
        });
    }

    /**
     * Setup online/offline event listeners
     */
    function initConnectionListeners() {
        window.addEventListener('online', () => {
            console.log('[PWA] Network status: ONLINE');
            updateConnectionUI(ConnectionState.ONLINE);

            // Notify application toast if available
            if (typeof window.showToast === 'function') {
                window.showToast('🟢 Internet Connection Restored');
            }

            // If socket is available and disconnected, reconnect
            if (window.socket && !window.socket.connected && typeof window.socket.connect === 'function') {
                window.socket.connect();
            }
        });

        window.addEventListener('offline', () => {
            console.log('[PWA] Network status: OFFLINE');
            updateConnectionUI(ConnectionState.OFFLINE);

            // Notify application toast if available
            if (typeof window.showToast === 'function') {
                window.showToast('⚠️ Internet Connection Lost (Offline)');
            }
        });

        // Initialize state on page load
        if (!navigator.onLine) {
            updateConnectionUI(ConnectionState.OFFLINE);
        } else {
            updateConnectionUI(ConnectionState.ONLINE);
        }
    }

    // Initialize PWA foundation
    registerServiceWorker();

    // Auto-load install controller if not present
    if (typeof window !== 'undefined' && !window.GabayXInstall && typeof document !== 'undefined') {
        const installScript = document.createElement('script');
        installScript.src = '/js/pwa/install.js';
        installScript.async = true;
        document.head.appendChild(installScript);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initConnectionListeners);
    } else {
        initConnectionListeners();
    }

    // Expose clean public interface on window
    window.GabayXPWA = {
        getState: () => (window.GabayXNetwork ? window.GabayXNetwork.getState() : currentState),
        isOnline: () => (window.GabayXNetwork ? window.GabayXNetwork.getState() === ConnectionState.ONLINE : currentState === ConnectionState.ONLINE),
        setSyncing: (isSyncing) => {
            updateConnectionUI(isSyncing ? ConnectionState.SYNCING : (navigator.onLine ? ConnectionState.ONLINE : ConnectionState.OFFLINE));
        },
        getInstallController: () => (window.GabayXInstall || null)
    };
})();
