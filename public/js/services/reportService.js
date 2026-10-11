/**
 * GabayX Report Service
 * Application service layer responsible for emergency incident report creation,
 * local validation, client ID generation, local-first persistence, and sync orchestration.
 */

(function (global) {
    'use strict';

    /**
     * Generate an RFC4122 compliant UUID v4
     */
    function generateReportId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }

        // Fallback for older browsers using crypto.getRandomValues
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const buf = new Uint8Array(16);
            crypto.getRandomValues(buf);
            buf[6] = (buf[6] & 0x0f) | 0x40; // Version 4
            buf[8] = (buf[8] & 0x3f) | 0x80; // Variant 10
            const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        }

        // Final timestamp fallback
        return 'rep-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
    }

    /**
     * Validate incoming emergency report data
     */
    function validateReportInput(data) {
        if (!data) {
            throw new Error('Report data is required');
        }
        if (!data.incidentType && !data.incident_type) {
            throw new Error('Incident type is required (e.g. FIRE, EARTHQUAKE, MEDICAL)');
        }
    }

    /**
     * Submit an emergency report following the local-first principle
     * Flow:
     * 1. Validate
     * 2. Generate client-side UUID
     * 3. Save locally to IndexedDB with status = PENDING
     * 4. If online, attempt immediate sync via SyncService
     * 5. If confirmed, mark SYNCED
     * 6. If offline or failed, retain PENDING status and queue for background sync
     *
     * @param {Object} input - Raw report fields
     * @returns {Promise<Object>} The locally persisted report
     */
    async function createReport(input) {
        validateReportInput(input);

        const clientUniqueId = input.id || generateReportId();
        const now = new Date().toISOString();
        const incident = (input.incidentType || input.incident_type || 'SOS_EMERGENCY').toUpperCase();

        const report = {
            id: clientUniqueId,
            incidentType: incident,
            incident_type: incident,
            description: input.description || 'Emergency incident reported',
            severity: input.severity || 'HIGH',
            latitude: input.latitude !== undefined ? input.latitude : (input.lat || null),
            lat: input.latitude !== undefined ? input.latitude : (input.lat || null),
            longitude: input.longitude !== undefined ? input.longitude : (input.lng || null),
            lng: input.longitude !== undefined ? input.longitude : (input.lng || null),
            nearest_building: input.nearest_building || input.nearestBuilding || 'Campus',
            student_id: input.student_id || input.studentId || localStorage.getItem('knhs_student_email') || localStorage.getItem('gabayx_device_id') || 'anonymous',
            student_name: input.student_name || input.studentName || localStorage.getItem('knhs_student_name') || 'Citizen',
            createdAt: input.createdAt || now,
            timestamp: input.createdAt || now,
            status: 'PENDING',
            retryCount: 0,
            lastAttemptAt: null,
            syncedAt: null,
            serverConfirmationId: null,
            photo: input.photo || null
        };

        // STEP 1: SAVE LOCALLY FIRST (IndexedDB Persistence)
        if (!global.GabayXDB) {
            throw new Error('GabayXDB storage module is not initialized');
        }

        const savedReport = await global.GabayXDB.saveReport(report);
        console.log(`[ReportService] Report ${savedReport.id} successfully saved locally (Status: PENDING)`);

        // STEP 2: NOTIFY SYNC MANAGER OR ATTEMPT IMMEDIATE SYNC
        const isOnline = navigator.onLine;

        if (isOnline && global.GabayXSync) {
            try {
                const syncResult = await global.GabayXSync.syncSingleReport(savedReport);
                if (syncResult && syncResult.status === 'SYNCED') {
                    savedReport.status = 'SYNCED';
                    savedReport.syncedAt = syncResult.syncedAt;
                    return savedReport;
                }
            } catch (syncErr) {
                console.warn('[ReportService] Immediate sync failed, remaining in queue:', syncErr.message);
            }
        }

        // Return report in its current state (PENDING if offline or sync failed)
        return savedReport;
    }

    /**
     * Get all stored reports
     */
    function getReports() {
        if (!global.GabayXDB) return Promise.resolve([]);
        return global.GabayXDB.getAllReports();
    }

    /**
     * Get reports waiting for synchronization
     */
    function getPendingReports() {
        if (!global.GabayXDB) return Promise.resolve([]);
        return global.GabayXDB.getPendingReports();
    }

    // Expose API
    const ReportService = {
        createReport,
        getReports,
        getPendingReports,
        generateReportId
    };

    global.GabayXReportService = ReportService;
})(typeof window !== 'undefined' ? window : this);
