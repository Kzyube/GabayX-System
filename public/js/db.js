// GabayX Offline Storage Layer - IndexedDB Implementation
(function (global) {
    'use strict';

    const DB_NAME = 'GabayX_Offline_DB';
    const DB_VERSION = 1;

    const STORES = {
        PENDING_REPORTS: 'pending_reports',
        EMERGENCY_INFO: 'emergency_info',
        SAFE_ZONES: 'safe_zones',
        EMERGENCY_CONTACTS: 'emergency_contacts',
        SYNC_QUEUE: 'sync_queue'
    };

    let dbInstance = null;

    // Open and initialize database
    function openDB() {
        if (dbInstance) {
            return Promise.resolve(dbInstance);
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 1. Pending Emergency Reports Store
                if (!db.objectStoreNames.contains(STORES.PENDING_REPORTS)) {
                    const reportStore = db.createObjectStore(STORES.PENDING_REPORTS, { keyPath: 'id' });
                    reportStore.createIndex('status', 'status', { unique: false });
                    reportStore.createIndex('timestamp', 'timestamp', { unique: false });
                    reportStore.createIndex('incident_type', 'incident_type', { unique: false });
                }

                // 2. Cached Emergency Information Store
                if (!db.objectStoreNames.contains(STORES.EMERGENCY_INFO)) {
                    db.createObjectStore(STORES.EMERGENCY_INFO, { keyPath: 'id' });
                }

                // 3. Cached Safe Zones Store
                if (!db.objectStoreNames.contains(STORES.SAFE_ZONES)) {
                    db.createObjectStore(STORES.SAFE_ZONES, { keyPath: 'name' });
                }

                // 4. Cached Emergency Contacts Store
                if (!db.objectStoreNames.contains(STORES.EMERGENCY_CONTACTS)) {
                    db.createObjectStore(STORES.EMERGENCY_CONTACTS, { keyPath: 'id' });
                }

                // 5. Synchronization Queue Store
                if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'queueId', autoIncrement: true });
                    queueStore.createIndex('status', 'status', { unique: false });
                    queueStore.createIndex('action_type', 'action_type', { unique: false });
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

    // Generic transaction helper
    function getStore(storeName, mode = 'readonly') {
        return openDB().then((db) => {
            const tx = db.transaction(storeName, mode);
            return tx.objectStore(storeName);
        });
    }

    // --- REPORT OPERATIONS ---
    function saveReport(report) {
        if (!report.id) {
            report.id = 'REP-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
        }
        if (!report.timestamp) {
            report.timestamp = new Date().toISOString();
        }
        if (!report.status) {
            report.status = 'SAVED_OFFLINE';
        }
        if (typeof report.sync_attempts !== 'number') {
            report.sync_attempts = 0;
        }

        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.PENDING_REPORTS, 'readwrite');
                const req = store.put(report);
                req.onsuccess = () => resolve(report);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    function getReport(id) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.PENDING_REPORTS, 'readonly');
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    function getAllReports() {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.PENDING_REPORTS, 'readonly');
                const req = store.getAll();
                req.onsuccess = () => {
                    // Return sorted by timestamp descending
                    const list = (req.result || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    resolve(list);
                };
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    function getPendingReports() {
        return getAllReports().then((reports) => {
            return reports.filter((r) => r.status !== 'SUBMITTED');
        });
    }

    function updateReportStatus(id, newStatus, extraData = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.PENDING_REPORTS, 'readwrite');
                const getReq = store.get(id);
                getReq.onsuccess = () => {
                    const report = getReq.result;
                    if (!report) {
                        return reject(new Error('Report not found: ' + id));
                    }
                    report.status = newStatus;
                    Object.assign(report, extraData);
                    if (newStatus === 'SUBMITTED' && !report.synced_at) {
                        report.synced_at = new Date().toISOString();
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

    function deleteReport(id) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.PENDING_REPORTS, 'readwrite');
                const req = store.delete(id);
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    // --- SYNC QUEUE OPERATIONS ---
    function addToSyncQueue(item) {
        return new Promise(async (resolve, reject) => {
            try {
                item.timestamp = item.timestamp || new Date().toISOString();
                item.status = item.status || 'QUEUED';
                item.attempts = item.attempts || 0;
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

    function removeFromSyncQueue(queueId) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.SYNC_QUEUE, 'readwrite');
                const req = store.delete(queueId);
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

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

    // --- CACHED EMERGENCY INFO ---
    function cacheEmergencyInfo(items) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.EMERGENCY_INFO, 'readwrite');
                for (const item of items) {
                    store.put(item);
                }
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }

    function getEmergencyInfo(id) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.EMERGENCY_INFO, 'readonly');
                if (id) {
                    const req = store.get(id);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => reject(req.error);
                } else {
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    // --- CACHED SAFE ZONES ---
    function cacheSafeZones(zones) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.SAFE_ZONES, 'readwrite');
                for (const zone of zones) {
                    store.put(zone);
                }
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }

    function getSafeZones() {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.SAFE_ZONES, 'readonly');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    // --- CACHED EMERGENCY CONTACTS ---
    function cacheContacts(contacts) {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.EMERGENCY_CONTACTS, 'readwrite');
                for (const contact of contacts) {
                    store.put(contact);
                }
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    }

    function getContacts() {
        return new Promise(async (resolve, reject) => {
            try {
                const store = await getStore(STORES.EMERGENCY_CONTACTS, 'readonly');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            } catch (err) {
                reject(err);
            }
        });
    }

    // Seed default offline critical data if stores are empty
    async function seedDefaultsIfEmpty() {
        try {
            const currentZones = await getSafeZones();
            if (currentZones.length === 0) {
                await cacheSafeZones([
                    { name: 'PRINCIPAL FRONT', coords: [7.100589893149529, 124.82393056927546], description: 'Primary Assembly Zone (Open Ground)', type: 'PRIMARY' },
                    { name: 'MENDOZA COURT', coords: [7.100077551009359, 124.82369094608939], description: 'Covered Court, West Sector Safe Zone', type: 'SECONDARY' },
                    { name: 'TEJADA COURT', coords: [7.1001461901808565, 124.82430112059413], description: 'East Sector Gymnasium Evacuation Hub', type: 'TERTIARY' }
                ]);
            }

            const currentContacts = await getContacts();
            if (currentContacts.length === 0) {
                await cacheContacts([
                    { id: 'clinic', name: 'KNHS Campus Clinic', number: '0912-345-6789', role: 'Medical Triage' },
                    { id: 'emergency911', name: 'National Emergency Hotline', number: '911', role: 'General Emergency' },
                    { id: 'police', name: 'Kabacan PNP Station', number: '0998-598-6721', role: 'Law Enforcement' },
                    { id: 'fire', name: 'Bureau of Fire Protection (BFP)', number: '0922-832-1142', role: 'Fire & Rescue' },
                    { id: 'mdrrmo', name: 'MDRRMO Rescue Operations', number: '0946-502-5720', role: 'Disaster Coordination' }
                ]);
            }

            const currentGuides = await getEmergencyInfo();
            if (currentGuides.length === 0) {
                await cacheEmergencyInfo([
                    {
                        id: 'earthquake',
                        title: 'Earthquake Protocol',
                        summary: 'Drop, Cover, and Hold',
                        steps: [
                            'DROP immediately to your hands and knees.',
                            'COVER your head and neck under a sturdy desk or table.',
                            'HOLD ON until shaking stops.',
                            'Evacuate via marked corridors once safe; avoid glass windows and elevators.',
                            'Proceed to Principal Front open grounds.'
                        ],
                        cachedAt: new Date().toISOString()
                    },
                    {
                        id: 'fire',
                        title: 'Fire Evacuation Protocol',
                        summary: 'Evacuate Immediately, Stay Low',
                        steps: [
                            'Sound the nearest alarm and notify teachers/staff.',
                            'Crawl low under smoke; keep nose and mouth covered with cloth.',
                            'Touch doorknobs with back of hand; do not open hot doors.',
                            'Proceed to Mendoza or Tejada court safe zones.',
                            'Never re-enter a burning structure.'
                        ],
                        cachedAt: new Date().toISOString()
                    },
                    {
                        id: 'flood',
                        title: 'Flood Safety Protocol',
                        summary: 'Move to High Ground',
                        steps: [
                            'Avoid walking or wading through moving water.',
                            'Stay clear of downed electrical wires and power lines.',
                            'Move to upper building levels if routes are submerged.',
                            'Use GabayX Offline Mode to save GPS coordinates for rescue teams.'
                        ],
                        cachedAt: new Date().toISOString()
                    },
                    {
                        id: 'first_aid',
                        title: 'Medical First Aid Quick Reference',
                        summary: 'Stabilize and Signal',
                        steps: [
                            'Severe Bleeding: Apply firm, continuous direct pressure with clean cloth.',
                            'Fractures: Do not move injured limb; immobilize with improvised splint.',
                            'Burns: Cool burn with clean water for 10 minutes; do not apply oil or ice.',
                            'Shock: Keep patient warm and elevate legs if there is no spinal injury.'
                        ],
                        cachedAt: new Date().toISOString()
                    }
                ]);
            }
        } catch (e) {
            console.warn('[IndexedDB] Seeding defaults notice:', e);
        }
    }

    // Auto-seed on load
    openDB().then(seedDefaultsIfEmpty).catch(() => {});

    // Export interface
    global.GabayXDB = {
        openDB,
        saveReport,
        getReport,
        getAllReports,
        getPendingReports,
        updateReportStatus,
        deleteReport,
        addToSyncQueue,
        getSyncQueue,
        removeFromSyncQueue,
        clearSyncQueue,
        cacheEmergencyInfo,
        getEmergencyInfo,
        cacheSafeZones,
        getSafeZones,
        cacheContacts,
        getContacts,
        seedDefaultsIfEmpty,
        STORES
    };

})(typeof window !== 'undefined' ? window : this);
