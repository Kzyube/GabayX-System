/**
 * GabayX Synchronization Manager (Sync Service)
 * Handles connectivity monitoring, synchronization queue processing,
 * exponential backoff retry logic, deduplication, and sync state dispatching.
 */

(function (global) {
    'use strict';

    const SyncState = {
        ONLINE: 'ONLINE',
        OFFLINE: 'OFFLINE',
        SYNCING: 'SYNCING',
        SYNCED: 'SYNCED',
        FAILED: 'FAILED'
    };

    let isSyncing = false;
    let syncTimeout = null;
    let consecutiveFailures = 0;
    const listeners = new Set();

    /**
     * Subscribe to synchronization state changes
     */
    function onSyncStateChange(callback) {
        listeners.add(callback);
        // Immediate notification of current state
        callback({
            isSyncing,
            isOnline: navigator.onLine
        });
        return () => listeners.delete(callback);
    }

    /**
     * Broadcast sync updates to UI listeners
     */
    function notifyListeners(eventData) {
        listeners.forEach(cb => {
            try {
                cb(eventData);
            } catch (err) {
                console.error('[SyncService] Listener callback error:', err);
            }
        });
    }

    /**
     * Exponential Backoff calculation
     * 1st failure: ~2-3s
     * 2nd failure: ~4-5s
     * 3rd failure: ~8-9s
     * Max delay: 60s
     */
    function calculateBackoffDelay(failures) {
        const base = 2000;
        const max = 60000;
        const delay = Math.min(max, base * Math.pow(2, failures));
        const jitter = Math.random() * 1000;
        return Math.floor(delay + jitter);
    }

    /**
     * Synchronize a single report
     * Flow:
     * 1. Status -> SYNCING
     * 2. Send via ApiService
     * 3. On success -> SYNCED (server confirmed)
     * 4. On failure -> FAILED (retained in DB)
     */
    async function syncSingleReport(report) {
        if (!global.GabayXDB || !global.GabayXApi) {
            throw new Error('Required modules (GabayXDB or GabayXApi) not available');
        }

        // Transition status to SYNCING
        await global.GabayXDB.updateReportStatus(report.id, 'SYNCING', {
            lastAttemptAt: new Date().toISOString()
        });

        try {
            const result = await global.GabayXApi.submitReport(report);

            // Server confirmation verified
            const syncedReport = await global.GabayXDB.updateReportStatus(report.id, 'SYNCED', {
                syncedAt: new Date().toISOString(),
                serverConfirmationId: result.id || report.id,
                duplicate: result.duplicate || false
            });

            console.log(`[SyncService] Report ${report.id} confirmed by server and marked SYNCED.`);
            return syncedReport;
        } catch (err) {
            console.error(`[SyncService] Failed to sync report ${report.id}:`, err.message);

            const nextRetryCount = (report.retryCount || 0) + 1;
            await global.GabayXDB.updateReportStatus(report.id, 'FAILED', {
                retryCount: nextRetryCount,
                lastAttemptAt: new Date().toISOString(),
                lastError: err.message
            });

            throw err;
        }
    }

    /**
     * Main sync routine: Process all pending and failed reports
     */
    async function triggerSync(isManual = false) {
        if (isSyncing) {
            console.log('[SyncService] Sync already in progress, skipping duplicate invocation.');
            return { alreadyRunning: true };
        }

        if (!global.GabayXDB || !global.GabayXApi) {
            console.warn('[SyncService] Storage or API services not yet ready.');
            return { ready: false };
        }

        // Active reachability check
        const isReachable = await global.GabayXApi.checkHealth(4000);
        if (!isReachable) {
            consecutiveFailures++;
            console.log('[SyncService] Backend currently unreachable. Scheduling retry.');
            scheduleAutoRetry();
            notifyListeners({ state: SyncState.OFFLINE, message: 'Backend unreachable' });
            return { reachable: false };
        }

        isSyncing = true;
        notifyListeners({ state: SyncState.SYNCING, message: 'Syncing emergency reports...' });

        let syncedCount = 0;
        let failedCount = 0;

        try {
            // Retrieve pending and failed reports
            const pendingReports = await global.GabayXDB.getPendingReports();

            console.log(`[SyncService] Found ${pendingReports.length} reports awaiting synchronization.`);

            for (const report of pendingReports) {
                try {
                    await syncSingleReport(report);
                    syncedCount++;
                } catch {
                    failedCount++;
                }
            }

            // Sync legacy queued actions if any exist
            const legacyQueue = await global.GabayXDB.getSyncQueue();
            if (legacyQueue.length > 0) {
                const studentEmail = localStorage.getItem('knhs_student_email') || 'student@gabayx.local';
                try {
                    await global.GabayXApi.syncLogs(studentEmail, legacyQueue);
                    await global.GabayXDB.clearSyncQueue();
                    syncedCount += legacyQueue.length;
                } catch (legacyErr) {
                    console.warn('[SyncService] Legacy queue sync warning:', legacyErr.message);
                }
            }

            // Evaluate results
            if (failedCount > 0) {
                consecutiveFailures++;
                scheduleAutoRetry();
                notifyListeners({
                    state: SyncState.FAILED,
                    syncedCount,
                    failedCount,
                    remaining: failedCount,
                    message: `${failedCount} report(s) waiting to sync`
                });
            } else {
                consecutiveFailures = 0;
                notifyListeners({
                    state: SyncState.SYNCED,
                    syncedCount,
                    message: syncedCount > 0 ? `${syncedCount} report(s) synced` : 'All reports synced'
                });
            }

            return {
                success: failedCount === 0,
                syncedCount,
                failedCount
            };
        } catch (err) {
            console.error('[SyncService] Unhandled sync error:', err);
            consecutiveFailures++;
            scheduleAutoRetry();
            notifyListeners({ state: SyncState.FAILED, error: err.message });
            return { error: err.message };
        } finally {
            isSyncing = false;
        }
    }

    /**
     * Schedule an automated retry using exponential backoff
     */
    function scheduleAutoRetry() {
        if (syncTimeout) {
            clearTimeout(syncTimeout);
        }

        const delay = calculateBackoffDelay(consecutiveFailures);
        console.log(`[SyncService] Scheduling retry in ${Math.round(delay / 1000)} seconds (Failure count: ${consecutiveFailures})`);

        syncTimeout = setTimeout(() => {
            syncTimeout = null;
            if (navigator.onLine) {
                triggerSync(false);
            }
        }, delay);
    }

    /**
     * Initialize connection event listeners
     */
    function initConnectivityMonitoring() {
        window.addEventListener('online', () => {
            console.log('[SyncService] Network restored. Triggering automatic synchronization...');
            consecutiveFailures = 0;
            // Short delay to allow network interface stabilization
            setTimeout(() => triggerSync(false), 800);
        });

        window.addEventListener('offline', () => {
            console.log('[SyncService] Network lost. Pausing active sync attempts.');
            if (syncTimeout) {
                clearTimeout(syncTimeout);
                syncTimeout = null;
            }
            notifyListeners({ state: SyncState.OFFLINE });
        });

        // Trigger sync at startup if online
        window.addEventListener('load', () => {
            setTimeout(() => {
                if (navigator.onLine) {
                    triggerSync(false);
                }
            }, 1500);
        });
    }

    initConnectivityMonitoring();

    // Expose API
    const SyncService = {
        triggerSync,
        syncSingleReport,
        onSyncStateChange,
        isSyncing: () => isSyncing
    };

    global.GabayXSync = SyncService;
})(typeof window !== 'undefined' ? window : this);
