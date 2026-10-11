/**
 * GabayX Storage Layer - IndexedDB Implementation
 * Provides robust offline local database persistence for emergency reports.
 */

(function (global) {
    'use strict';

    const DB_NAME = 'GabayX_Offline_DB';
    const DB_VERSION = 2;

    const STORES = {
        REPORTS: 'reports',
        SYNC_QUEUE: 'sync_queue'
    };

    let dbInstance = null;

    /**
     * Open and initialize IndexedDB
     */
    function openDB() {
        if (dbInstance) {
            return Promise.resolve(dbInstance);
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 1. Emergency Reports Object Store
                if (!db.objectStoreNames.contains(STORES.REPORTS)) {
                    const reportStore = db.createObjectStore(STORES.REPORTS, { keyPath: 'id' });
                    reportStore.createIndex('status', 'status', { unique: false });
                    reportStore.createIndex('createdAt', 'createdAt', { unique: false });
                    reportStore.createIndex('incidentType', 'incidentType', { unique: false });
                }

                // 2. Action Sync Queue Store (legacy notes, telemetry blips)
                if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'queueId', autoIncrement: true });
                    queueStore.createIndex('status', 'status', { unique: false });
                    queueStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };

            request.onerror = (event) => {
                console.error('[IndexedDB] Failed to open database:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Transaction helper
     */
    function getStore(storeName, mode = 'readonly') {
        return openDB().then((db) => {
            const tx = db.transaction(storeName, mode);
            return tx.objectStore(storeName);
        });
    }

    /**
     * Save or update an emergency report locally
     */
    function saveReport(report) {
        if (!report || !report.id) {
            return Promise.reject(new Error('Cannot save report: missing unique ID'));
        }

        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.REPORTS, 'readwrite');
                const req = store.put(report);
                req.onsuccess = () => resolve(report);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Get a specific report by ID
     */
    function getReport(id) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.REPORTS, 'readonly');
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Retrieve all reports sorted by createdAt descending
     */
    function getAllReports() {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.REPORTS, 'readonly');
                const req = store.getAll();
                req.onsuccess = () => {
                    const list = (req.result || []).sort((a, b) => {
                        const dateA = new Date(a.createdAt || a.timestamp || 0);
                        const dateB = new Date(b.createdAt || b.timestamp || 0);
                        return dateB - dateA;
                    });
                    resolve(list);
                };
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Retrieve only pending and failed reports awaiting synchronization
     */
    function getPendingReports() {
        return getAllReports().then((reports) => {
            return reports.filter((r) => r.status === 'PENDING' || r.status === 'FAILED');
        });
    }

    /**
     * Update report status with audit metadata
     */
    function updateReportStatus(id, newStatus, extraData = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.REPORTS, 'readwrite');
                const getReq = store.get(id);
                getReq.onsuccess = () => {
                    const report = getReq.result;
                    if (!report) {
                        return reject(new Error('Report not found: ' + id));
                    }
                    report.status = newStatus;
                    Object.assign(report, extraData);

                    if (newStatus === 'SYNCED' && !report.syncedAt) {
                        report.syncedAt = new Date().toISOString();
                        report.synced_at = report.syncedAt;
                    }

                    const putReq = store.put(report);
                    putReq.onsuccess = () => resolve(report);
                    putReq.onerror = () => reject(putReq.error);
                };
                getReq.onerror = () => reject(getReq.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Delete report (used only on explicit user action)
     */
    function deleteReport(id) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.REPORTS, 'readwrite');
                const req = store.delete(id);
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Add an item to the action sync queue
     */
    function addToSyncQueue(item) {
        return new Promise(async (resolve, reject) => {
            try {
                item.timestamp = item.timestamp || new Date().toISOString();
                item.status = item.status || 'QUEUED';
                const store = await getStore(STORES.SYNC_QUEUE, 'readwrite');
                const req = store.add(item);
                req.onsuccess = () => {
                    item.queueId = req.result;
                    resolve(item);
                };
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Get all items in the sync queue
     */
    function getSyncQueue() {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.SYNC_QUEUE, 'readonly');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Clear the sync queue after successful upload
     */
    function clearSyncQueue() {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.SYNC_QUEUE, 'readwrite');
                const req = store.clear();
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    // Expose API
    const DB = {
        openDB,
        saveReport,
        getReport,
        getAllReports,
        getPendingReports,
        updateReportStatus,
        deleteReport,
        addToSyncQueue,
        getSyncQueue,
        clearSyncQueue
    };

    global.GabayXDB = DB;
})(typeof window !== 'undefined' ? window : this);
