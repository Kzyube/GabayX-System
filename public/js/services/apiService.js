/**
 * GabayX API Service
 * Centralized HTTP network adapter for communication with the backend.
 * Handles request timeouts, error formatting, and idempotency guarantees.
 */

(function (global) {
    'use strict';

    const API_CONFIG = {
        endpoints: {
            submitReport: '/api/reports/submit',
            health: '/api/health',
            sync: '/api/sync'
        },
        defaultTimeout: 8000
    };

    /**
     * Fetch with timeout helper
     */
    async function fetchWithTimeout(url, options = {}, timeoutMs = API_CONFIG.defaultTimeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error('Network request timed out');
            }
            throw err;
        }
    }

    /**
     * Submit an emergency report to the backend
     * @param {Object} report
     * @returns {Promise<Object>}
     */
    async function submitReport(report) {
        if (!report || !report.id) {
            throw new Error('Report payload missing unique ID');
        }

        // Format payload to satisfy both camelCase and snake_case backend expectations
        const payload = {
            id: report.id,
            incidentType: report.incidentType || report.incident_type,
            incident_type: report.incidentType || report.incident_type,
            description: report.description || '',
            severity: report.severity || 'HIGH',
            lat: report.latitude !== undefined ? report.latitude : report.lat,
            latitude: report.latitude !== undefined ? report.latitude : report.lat,
            lng: report.longitude !== undefined ? report.longitude : report.lng,
            longitude: report.longitude !== undefined ? report.longitude : report.lng,
            nearest_building: report.nearest_building || report.nearestBuilding || 'Campus',
            student_id: report.student_id || report.studentId || 'anonymous',
            student_name: report.student_name || report.studentName || 'Student',
            timestamp: report.createdAt || report.timestamp || new Date().toISOString(),
            createdAt: report.createdAt || report.timestamp || new Date().toISOString(),
            photo: report.photo || null
        };

        const response = await fetchWithTimeout(API_CONFIG.endpoints.submitReport, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Idempotency-Key': report.id
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`Server responded with HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return {
            success: true,
            id: data.id || report.id,
            duplicate: !!data.duplicate,
            receivedAt: data.receivedAt || new Date().toISOString()
        };
    }

    /**
     * Check active backend reachability
     * @returns {Promise<boolean>}
     */
    async function checkHealth(timeoutMs = 4000) {
        if (!navigator.onLine) {
            return false;
        }

        try {
            const response = await fetchWithTimeout(
                `${API_CONFIG.endpoints.health}?_t=${Date.now()}`,
                { method: 'GET', cache: 'no-store' },
                timeoutMs
            );
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Sync legacy action logs
     */
    async function syncLogs(studentId, logs) {
        const response = await fetchWithTimeout(API_CONFIG.endpoints.sync, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: studentId, logs })
        });

        if (!response.ok) {
            throw new Error(`Sync logs responded with status: ${response.status}`);
        }

        return response.json();
    }

    // Expose API
    const ApiService = {
        submitReport,
        checkHealth,
        syncLogs
    };

    global.GabayXApi = ApiService;
})(typeof window !== 'undefined' ? window : this);
