// GabayX Synchronization Manager
// Handles background connectivity monitoring, active backend verification,
// queue processing, exponential backoff, and duplicate prevention.
(function (global) {
    'use strict';

    const SYNC_STATES = {
        ONLINE: 'ONLINE',
        OFFLINE: 'OFFLINE',
        SYNCING: 'SYNCING',
        SYNCED: 'SYNCED'
    };

    let currentState = navigator.onLine ? SYNC_STATES.ONLINE : SYNC_STATES.OFFLINE;
    let isSyncing = false;
    let syncTimer = null;
    let heartbeatInterval = null;
    let consecutiveFailures = 0;
    const listeners = new Set();

    // Event Dispatcher for UI components
    function emitStateChange(state, metadata = {}) {
        currentState = state;
        listeners.forEach((callback) => {
            try {
                callback({ state, ...metadata });
            } catch (err) {
                console.error('[SyncManager] Listener error:', err);
            }
        });
    }

    function onStateChange(callback) {
        listeners.add(callback);
        // Immediate initial invocation
        callback({ state: currentState });
        return () => listeners.delete(callback);
    }

    // Active Backend Health Verification
    async function checkBackendReachable(timeoutMs = 4000) {
        if (!navigator.onLine) {
            return false;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            // Ping /api/health or fallback to /api/vapid-key
            const response = await fetch('/api/health?t=' + Date.now(), {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch (err) {
            clearTimeout(timeoutId);
            return false;
        }
    }

    // Exponential Backoff calculation
    function getBackoffDelay(attempts) {
        const baseDelay = 2000;
        const maxDelay = 60000;
        const exponential = Math.min(maxDelay, baseDelay * Math.pow(2, attempts));
        const jitter = Math.random() * 1000;
        return Math.floor(exponential + jitter);
    }

    // Process all pending items in sync queue and reports store
    async function triggerSync(forced = false) {
        if (isSyncing) {
            console.log('[SyncManager] Sync already in progress, skipping duplicate call.');
            return;
        }

        if (!global.GabayXDB) {
            console.warn('[SyncManager] GabayXDB not loaded yet.');
            return;
        }

        // 1. Verify actual backend connectivity
        const isReachable = await checkBackendReachable();
        if (!isReachable) {
            consecutiveFailures++;
            emitStateChange(SYNC_STATES.OFFLINE, { reason: 'Backend unreachable' });
            scheduleRetry();
            return;
        }

        // Connectivity verified
        isSyncing = true;
        emitStateChange(SYNC_STATES.SYNCING, { message: 'Synchronizing pending reports...' });

        try {
            // Retrieve pending reports
            const pendingReports = await global.GabayXDB.getPendingReports();
            // Retrieve queued legacy actions (notes, statuses)
            const queuedItems = await global.GabayXDB.getSyncQueue();

            let successfulSyncCount = 0;
            let hadErrors = false;

            // A. Process Pending Emergency Incident Reports
            for (const report of pendingReports) {
                try {
                    await global.GabayXDB.updateReportStatus(report.id, 'SYNCING');

                    const response = await fetch('/api/reports/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(report)
                    });

                    if (response.ok) {
                        const resData = await response.json();
                        // Mark as submitted only on verified server confirmation
                        await global.GabayXDB.updateReportStatus(report.id, 'SUBMITTED', {
                            synced_at: new Date().toISOString(),
                            server_confirmation_id: resData.id || report.id
                        });
                        successfulSyncCount++;
                    } else {
                        throw new Error(`Server returned status: ${response.status}`);
                    }
                } catch (reportErr) {
                    console.error('[SyncManager] Failed to sync report:', report.id, reportErr);
                    hadErrors = true;
                    const attempts = (report.sync_attempts || 0) + 1;
                    await global.GabayXDB.updateReportStatus(report.id, 'SYNC_FAILED', {
                        sync_attempts: attempts,
                        last_sync_error: reportErr.message
                    });
                }
            }

            // B. Process Queued Legacy Actions (Notes / Quick Messages / SOS)
            if (queuedItems.length > 0) {
                const studentEmail = localStorage.getItem('knhs_student_email') || 'student@gabayx.local';
                const formattedLogs = queuedItems.map((item) => ({
                    type: item.action_type || item.type || 'NOTE',
                    content: item.content,
                    lat: item.lat || null,
                    lng: item.lng || null,
                    timestamp: item.timestamp
                }));

                try {
                    const response = await fetch('/api/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: studentEmail, logs: formattedLogs })
                    });

                    if (response.ok) {
                        // Clean up sync queue after successful upload
                        await global.GabayXDB.clearSyncQueue();
                        successfulSyncCount += queuedItems.length;
                    } else {
                        hadErrors = true;
                    }
                } catch (queueErr) {
                    console.error('[SyncManager] Failed to sync queued logs:', queueErr);
                    hadErrors = true;
                }
            }

            // Evaluate sync results
            if (hadErrors) {
                consecutiveFailures++;
                scheduleRetry();
                emitStateChange(SYNC_STATES.ONLINE, {
                    message: 'Some items failed to sync. Will retry automatically.',
                    pendingCount: (await global.GabayXDB.getPendingReports()).length
                });
            } else {
                consecutiveFailures = 0;
                if (successfulSyncCount > 0) {
                    emitStateChange(SYNC_STATES.SYNCED, { count: successfulSyncCount });
                    setTimeout(() => {
                        emitStateChange(SYNC_STATES.ONLINE);
                    }, 3000);
                } else {
                    emitStateChange(SYNC_STATES.ONLINE);
                }
            }
        } catch (globalErr) {
            console.error('[SyncManager] General sync failure:', globalErr);
            consecutiveFailures++;
            scheduleRetry();
            emitStateChange(SYNC_STATES.OFFLINE, { reason: globalErr.message });
        } finally {
            isSyncing = false;
        }
    }

    function scheduleRetry() {
        if (syncTimer) {
            clearTimeout(syncTimer);
        }
        const delay = getBackoffDelay(consecutiveFailures);
        console.log(`[SyncManager] Scheduling retry in ${Math.round(delay / 1000)}s (attempt ${consecutiveFailures})`);
        syncTimer = setTimeout(() => {
            triggerSync();
        }, delay);
    }

    // Initialize listeners
    function init() {
        // Native online event
        window.addEventListener('online', async () => {
            console.log('[SyncManager] Browser reported online event. Verifying connectivity...');
            const reachable = await checkBackendReachable();
            if (reachable) {
                emitStateChange(SYNC_STATES.ONLINE);
                triggerSync();
            } else {
                emitStateChange(SYNC_STATES.OFFLINE);
            }
        });

        // Native offline event
        window.addEventListener('offline', () => {
            console.log('[SyncManager] Browser reported offline event.');
            emitStateChange(SYNC_STATES.OFFLINE);
        });

        // Periodic background heartbeat to detect silent network loss or restoration
        heartbeatInterval = setInterval(async () => {
            const wasOffline = currentState === SYNC_STATES.OFFLINE;
            const reachable = await checkBackendReachable();

            if (reachable && wasOffline) {
                console.log('[SyncManager] Heartbeat detected connection restoration.');
                emitStateChange(SYNC_STATES.ONLINE);
                triggerSync();
            } else if (!reachable && currentState === SYNC_STATES.ONLINE) {
                console.log('[SyncManager] Heartbeat detected connectivity drop.');
                emitStateChange(SYNC_STATES.OFFLINE);
            }
        }, 15000);

        // Immediate check on startup
        checkBackendReachable().then((reachable) => {
            emitStateChange(reachable ? SYNC_STATES.ONLINE : SYNC_STATES.OFFLINE);
            if (reachable) {
                triggerSync();
            }
        });
    }

    // Auto-init on script load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export interface
    global.GabayXSync = {
        SYNC_STATES,
        getState: () => currentState,
        isSyncing: () => isSyncing,
        onStateChange,
        triggerSync,
        checkBackendReachable
    };

})(typeof window !== 'undefined' ? window : this);
