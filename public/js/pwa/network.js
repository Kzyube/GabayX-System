/**
 * GabayX Network & Connection Status Indicator Controller
 * Extends the existing connection indicator with real-time sync states:
 * 🟢 Online
 * 🔴 Offline
 * 🟡 Syncing
 * 🟠 X reports waiting to sync
 */

(function (global) {
    'use strict';

    const ConnectionState = {
        ONLINE: 'ONLINE',
        OFFLINE: 'OFFLINE',
        SYNCING: 'SYNCING',
        PENDING: 'PENDING'
    };

    let currentState = navigator.onLine ? ConnectionState.ONLINE : ConnectionState.OFFLINE;

    /**
     * Update the visual connection status indicators across the UI
     */
    async function updateIndicators(state, extra = {}) {
        currentState = state;

        const connDot = document.getElementById('conn-dot');
        const connText = document.getElementById('conn-text');
        const badge = document.getElementById('pending-reports-badge');

        let pendingCount = 0;
        if (global.GabayXDB) {
            try {
                const pending = await global.GabayXDB.getPendingReports();
                pendingCount = pending.length;
            } catch {}
        }

        // Update badge count
        if (badge) {
            if (pendingCount > 0) {
                badge.style.display = 'inline-flex';
                badge.innerText = `${pendingCount} waiting`;
                badge.style.background = state === ConnectionState.OFFLINE ? 'rgba(255, 42, 95, 0.2)' : 'rgba(245, 158, 11, 0.2)';
                badge.style.color = state === ConnectionState.OFFLINE ? '#ff2a5f' : '#f59e0b';
                badge.style.border = `1px solid ${state === ConnectionState.OFFLINE ? '#ff2a5f' : '#f59e0b'}`;
            } else {
                badge.style.display = 'none';
            }
        }

        // Update header dot and text
        if (connDot && connText) {
            if (state === ConnectionState.SYNCING) {
                connDot.style.color = 'var(--warning, #f59e0b)';
                connText.innerText = 'SYNCING...';
            } else if (state === ConnectionState.OFFLINE) {
                connDot.style.color = 'var(--danger, #ff2a5f)';
                connText.innerText = pendingCount > 0 ? `${pendingCount} PENDING` : 'OFFLINE';
            } else if (pendingCount > 0) {
                // Online with pending items waiting
                connDot.style.color = '#f59e0b';
                connText.innerText = `${pendingCount} TO SYNC`;
            } else {
                connDot.style.color = 'var(--primary, #10b981)';
                const studentEmail = localStorage.getItem('knhs_student_email') || localStorage.getItem('gabayx_device_id');
                connText.innerText = studentEmail ? 'CONNECTED' : 'ONLINE';
            }
        }

        // Update floating pill
        updateFloatingPill(state, pendingCount, extra);
    }

    /**
     * Floating non-intrusive status pill
     */
    function updateFloatingPill(state, pendingCount, extra) {
        let pill = document.getElementById('gabayx-pwa-status-badge');

        if (!pill) {
            pill = document.createElement('div');
            pill.id = 'gabayx-pwa-status-badge';
            pill.setAttribute('role', 'status');
            pill.setAttribute('aria-live', 'polite');
            pill.style.cssText = [
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
            document.body.appendChild(pill);
        }

        if (state === ConnectionState.OFFLINE) {
            const label = pendingCount > 0 ? `Offline (${pendingCount} reports saved)` : 'Offline (Using cached shell)';
            pill.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ff2a5f; box-shadow:0 0 8px #ff2a5f;"></span><span>${label}</span>`;
            pill.style.background = 'rgba(20, 5, 10, 0.88)';
            pill.style.color = '#ff6b8b';
            pill.style.border = '1px solid rgba(255, 42, 95, 0.35)';
            pill.style.transform = 'translateX(-50%) translateY(0)';
            pill.style.opacity = '1';
            pill.dataset.wasOffline = 'true';
        } else if (state === ConnectionState.SYNCING) {
            pill.innerHTML = '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></span><span>Syncing emergency reports...</span>';
            pill.style.background = 'rgba(25, 20, 5, 0.88)';
            pill.style.color = '#fbbf24';
            pill.style.border = '1px solid rgba(245, 158, 11, 0.35)';
            pill.style.transform = 'translateX(-50%) translateY(0)';
            pill.style.opacity = '1';
        } else if (state === ConnectionState.ONLINE) {
            if (pill.dataset && pill.dataset.wasOffline === 'true') {
                const text = extra.message || (pendingCount > 0 ? `${pendingCount} reports queued` : 'Online (Reconnected)');
                pill.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981;"></span><span>${text}</span>`;
                pill.style.background = 'rgba(2, 20, 14, 0.88)';
                pill.style.color = '#34d399';
                pill.style.border = '1px solid rgba(16, 185, 129, 0.35)';
                pill.style.transform = 'translateX(-50%) translateY(0)';
                pill.style.opacity = '1';

                setTimeout(() => {
                    pill.style.transform = 'translateX(-50%) translateY(-100px)';
                    pill.style.opacity = '0';
                    if (pill.dataset) pill.dataset.wasOffline = 'false';
                }, 3000);
            } else {
                pill.style.transform = 'translateX(-50%) translateY(-100px)';
                pill.style.opacity = '0';
            }
        }
    }

    /**
     * Initialize listeners
     */
    function initNetworkListeners() {
        window.addEventListener('online', () => {
            updateIndicators(ConnectionState.ONLINE, { message: 'Online' });
            if (typeof window.showToast === 'function') {
                window.showToast('🟢 Internet Connection Restored');
            }
        });

        window.addEventListener('offline', () => {
            updateIndicators(ConnectionState.OFFLINE);
            if (typeof window.showToast === 'function') {
                window.showToast('⚠️ Internet Connection Lost (Offline)');
            }
        });

        // Listen for sync service events
        if (global.GabayXSync && typeof global.GabayXSync.onSyncStateChange === 'function') {
            global.GabayXSync.onSyncStateChange((event) => {
                if (event.state === 'SYNCING') {
                    updateIndicators(ConnectionState.SYNCING);
                } else if (event.state === 'SYNCED') {
                    updateIndicators(ConnectionState.ONLINE, { message: event.message || 'All reports synced' });
                    if (typeof window.showToast === 'function' && event.syncedCount > 0) {
                        window.showToast(`✅ ${event.syncedCount} report(s) synced`);
                    }
                } else if (event.state === 'FAILED') {
                    updateIndicators(navigator.onLine ? ConnectionState.ONLINE : ConnectionState.OFFLINE);
                }
            });
        }

        // Initial check
        if (!navigator.onLine) {
            updateIndicators(ConnectionState.OFFLINE);
        } else {
            updateIndicators(ConnectionState.ONLINE);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNetworkListeners);
    } else {
        initNetworkListeners();
    }

    global.GabayXNetwork = {
        getState: () => currentState,
        updateIndicators
    };
})(typeof window !== 'undefined' ? window : this);
