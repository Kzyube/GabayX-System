/**
 * GabayX Mobile - Report Synchronization Service
 * 
 * Synchronizes offline SQLite reports with the GabayX Express Backend.
 * Strictly adheres to rule: Reports are NEVER marked 'SYNCED' without explicit
 * HTTP 200 server acknowledgment and deduplication verification.
 */

import { reportRepository } from '../database/reportRepository';
import { GabayXReport } from '../types/report';

export interface SyncResult {
  totalPending: number;
  syncedCount: number;
  failedCount: number;
  errors: Array<{ reportId: string; error: string }>;
}

// Configurable backend endpoint with Render cloud production default
const DEFAULT_API_BASE = 'https://gabayx-system.onrender.com';

export const syncService = {
  /**
   * Synchronize all pending offline reports with the backend server
   */
  async syncPendingReports(customApiBase?: string): Promise<SyncResult> {
    const apiBase = customApiBase || DEFAULT_API_BASE;
    const pending = await reportRepository.getPendingReports();

    const result: SyncResult = {
      totalPending: pending.length,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    };

    if (pending.length === 0) {
      return result;
    }

    for (const report of pending) {
      try {
        // Mark as SYNCING locally during in-flight network dispatch
        await reportRepository.updateReportStatus(report.id, 'SYNCING');

        // Format payload to match server.js /api/reports/submit contract
        const payload = {
          id: report.id,
          student_id: report.contactInformation.isAnonymous
            ? 'anonymous'
            : report.contactInformation.name || 'Mobile Resident',
          incident_type: report.category,
          severity: report.severity,
          description: report.description,
          nearest_building: report.nearestBuilding,
          lat: report.latitude,
          lng: report.longitude,
          timestamp: report.createdAt,
          source: report.sourcePlatform,
          phone: report.contactInformation.phone || null,
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

        const response = await fetch(`${apiBase}/api/reports/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }

        const data = await response.json();

        // Strict verification: only mark SYNCED upon valid server acknowledgment
        if (data.status === 'success' || data.duplicate === true) {
          const ackTimestamp = data.receivedAt || new Date().toISOString();
          await reportRepository.updateReportStatus(report.id, 'SYNCED', ackTimestamp);
          result.syncedCount++;
        } else {
          throw new Error(data.error || 'Server did not acknowledge receipt');
        }
      } catch (err: any) {
        const errorMessage = err?.message || 'Network request failed';
        await reportRepository.updateReportStatus(report.id, 'FAILED');
        result.failedCount++;
        result.errors.push({
          reportId: report.id,
          error: errorMessage,
        });
      }
    }

    return result;
  },

  /**
   * Check if backend server is reachable
   */
  async checkBackendHealth(customApiBase?: string): Promise<boolean> {
    const apiBase = customApiBase || DEFAULT_API_BASE;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${apiBase}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  },
};
