/**
 * GabayX Mobile - Emergency Report Repository
 * Provides structured, parameterized, offline-first SQLite operations.
 * Enforces strict validation, duplicate ID rejection, and safe migrations.
 */

import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { getDatabase } from './index';
import {
  GabayXReport,
  CreateReportInput,
  ReportCategory,
  ReportSeverity,
  ReportStatus,
  ContactInformation,
  validateReportInput,
} from '../types/report';

interface ReportRow {
  id: string;
  schema_version: string;
  source_platform: 'MOBILE_ANDROID' | 'MOBILE_IOS';
  category: string;
  severity: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  nearest_building: string | null;
  created_at: string;
  updated_at: string;
  server_acknowledged_at: string | null;
  local_status: string;
  mesh_hop_count: number;
  contact_info_json: string;
}

/**
 * Convert SQLite row to typed GabayXReport object
 */
function rowToReport(row: ReportRow): GabayXReport {
  let contactInfo: ContactInformation = { isAnonymous: true };
  try {
    if (row.contact_info_json) {
      contactInfo = JSON.parse(row.contact_info_json);
    }
  } catch (e) {
    console.warn('[ReportRepository] Failed to parse contact_info_json for report', row.id, e);
  }

  return {
    id: row.id,
    schemaVersion: row.schema_version,
    sourcePlatform: row.source_platform,
    category: row.category as ReportCategory,
    severity: row.severity as ReportSeverity,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    nearestBuilding: row.nearest_building || 'Central Poblacion Zone',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    serverAcknowledgedAt: row.server_acknowledged_at,
    localStatus: row.local_status as ReportStatus,
    meshHopCount: row.mesh_hop_count,
    contactInformation: contactInfo,
  };
}

/**
 * Report Repository Service
 */
export const reportRepository = {
  /**
   * Initialize local database storage
   */
  async initStorage(): Promise<void> {
    await getDatabase();
  },

  /**
   * Create and persist a new emergency report
   * Validates inputs, generates RFC4122 UUID v4, and rejects duplicate IDs
   */
  async createReport(input: CreateReportInput, customId?: string): Promise<GabayXReport> {
    const validation = validateReportInput(input);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(' ')}`);
    }

    const db = await getDatabase();
    const id = customId || Crypto.randomUUID();
    const now = new Date().toISOString();

    // 1. Guard against duplicate report IDs (never silently overwrite)
    const existing = await this.getReportById(id);
    if (existing) {
      throw new Error(`Duplicate report ID: A report with ID "${id}" already exists.`);
    }

    const platformSource = Platform.OS === 'ios' ? 'MOBILE_IOS' : 'MOBILE_ANDROID';
    const contactInfo: ContactInformation = {
      isAnonymous: input.contactInformation?.isAnonymous ?? true,
      name: input.contactInformation?.name || null,
      phone: input.contactInformation?.phone || null,
      kinName: input.contactInformation?.kinName || null,
      kinPhone: input.contactInformation?.kinPhone || null,
    };

    const report: GabayXReport = {
      id,
      schemaVersion: '1.0.0',
      sourcePlatform: platformSource,
      category: input.category,
      severity: input.severity || 'HIGH',
      description: input.description.trim(),
      latitude: input.latitude !== undefined ? input.latitude : null,
      longitude: input.longitude !== undefined ? input.longitude : null,
      accuracy: input.accuracy !== undefined ? input.accuracy : null,
      nearestBuilding: input.nearestBuilding || 'Central Poblacion Zone',
      createdAt: now,
      updatedAt: now,
      serverAcknowledgedAt: null,
      localStatus: 'PENDING', // All newly created offline reports start as PENDING
      meshHopCount: 0,
      contactInformation: contactInfo,
    };

    await db.runAsync(
      `INSERT INTO emergency_reports (
        id, schema_version, source_platform, category, severity, description,
        latitude, longitude, accuracy, nearest_building, created_at, updated_at,
        server_acknowledged_at, local_status, mesh_hop_count, contact_info_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        report.id,
        report.schemaVersion,
        report.sourcePlatform,
        report.category,
        report.severity,
        report.description,
        report.latitude,
        report.longitude,
        report.accuracy,
        report.nearestBuilding,
        report.createdAt,
        report.updatedAt,
        report.serverAcknowledgedAt,
        report.localStatus,
        report.meshHopCount,
        JSON.stringify(report.contactInformation),
      ]
    );

    return report;
  },

  /**
   * Save a fully constructed GabayXReport object (used for relays or migrations)
   * Enforces strict duplicate prevention.
   */
  async saveReport(report: GabayXReport): Promise<GabayXReport> {
    const db = await getDatabase();
    const existing = await this.getReportById(report.id);
    if (existing) {
      throw new Error(`Duplicate report ID: A report with ID "${report.id}" already exists.`);
    }

    await db.runAsync(
      `INSERT INTO emergency_reports (
        id, schema_version, source_platform, category, severity, description,
        latitude, longitude, accuracy, nearest_building, created_at, updated_at,
        server_acknowledged_at, local_status, mesh_hop_count, contact_info_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        report.id,
        report.schemaVersion,
        report.sourcePlatform,
        report.category,
        report.severity,
        report.description,
        report.latitude,
        report.longitude,
        report.accuracy,
        report.nearestBuilding,
        report.createdAt,
        report.updatedAt,
        report.serverAcknowledgedAt,
        report.localStatus,
        report.meshHopCount,
        JSON.stringify(report.contactInformation),
      ]
    );

    return report;
  },

  /**
   * Retrieve all saved emergency reports ordered by creation date descending
   */
  async getAllReports(): Promise<GabayXReport[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ReportRow>(
      'SELECT * FROM emergency_reports ORDER BY created_at DESC;'
    );
    return rows.map(rowToReport);
  },

  /**
   * Retrieve an individual report by its unique ID
   */
  async getReportById(id: string): Promise<GabayXReport | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ReportRow>(
      'SELECT * FROM emergency_reports WHERE id = ?;',
      [id]
    );
    return row ? rowToReport(row) : null;
  },

  /**
   * Retrieve reports pending synchronization (localStatus === 'PENDING' or 'FAILED')
   */
  async getPendingReports(): Promise<GabayXReport[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ReportRow>(
      `SELECT * FROM emergency_reports WHERE local_status = 'PENDING' OR local_status = 'FAILED' ORDER BY created_at ASC;`
    );
    return rows.map(rowToReport);
  },

  /**
   * Transport-agnostic query for reports eligible for Bluetooth relaying
   */
  async getRelayableReports(): Promise<GabayXReport[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ReportRow>(
      `SELECT * FROM emergency_reports WHERE local_status IN ('PENDING', 'SYNCING', 'SYNCED') ORDER BY created_at DESC;`
    );
    return rows.map(rowToReport);
  },

  /**
   * Update report processing status
   */
  async updateReportStatus(
    id: string,
    status: ReportStatus,
    serverAcknowledgedAt?: string | null
  ): Promise<GabayXReport> {
    const db = await getDatabase();
    const existing = await this.getReportById(id);
    if (!existing) {
      throw new Error(`Report not found: No report with ID "${id}" exists.`);
    }

    const now = new Date().toISOString();
    const ackTime = serverAcknowledgedAt !== undefined ? serverAcknowledgedAt : existing.serverAcknowledgedAt;

    await db.runAsync(
      `UPDATE emergency_reports SET local_status = ?, updated_at = ?, server_acknowledged_at = ? WHERE id = ?;`,
      [status, now, ackTime, id]
    );

    return {
      ...existing,
      localStatus: status,
      updatedAt: now,
      serverAcknowledgedAt: ackTime,
    };
  },

  /**
   * Update an editable local draft
   */
  async updateDraft(id: string, updates: Partial<CreateReportInput>): Promise<GabayXReport> {
    const db = await getDatabase();
    const existing = await this.getReportById(id);
    if (!existing) {
      throw new Error(`Report not found: No report with ID "${id}" exists.`);
    }

    if (existing.localStatus === 'SYNCED') {
      throw new Error('Cannot edit a report that has already been acknowledged by the server.');
    }

    const now = new Date().toISOString();
    const category = updates.category || existing.category;
    const severity = updates.severity || existing.severity;
    const description = updates.description !== undefined ? updates.description.trim() : existing.description;
    const latitude = updates.latitude !== undefined ? updates.latitude : existing.latitude;
    const longitude = updates.longitude !== undefined ? updates.longitude : existing.longitude;
    const nearestBuilding = updates.nearestBuilding || existing.nearestBuilding;

    let contactInfo = existing.contactInformation;
    if (updates.contactInformation) {
      contactInfo = {
        ...contactInfo,
        ...updates.contactInformation,
      };
    }

    await db.runAsync(
      `UPDATE emergency_reports SET category = ?, severity = ?, description = ?, latitude = ?, longitude = ?, nearest_building = ?, updated_at = ?, contact_info_json = ? WHERE id = ?;`,
      [
        category,
        severity,
        description,
        latitude,
        longitude,
        nearestBuilding,
        now,
        JSON.stringify(contactInfo),
        id,
      ]
    );

    return {
      ...existing,
      category,
      severity,
      description,
      latitude,
      longitude,
      nearestBuilding,
      updatedAt: now,
      contactInformation: contactInfo,
    };
  },

  /**
   * Delete an unsent local draft
   */
  async deleteReport(id: string): Promise<boolean> {
    const db = await getDatabase();
    const existing = await this.getReportById(id);
    if (!existing) {
      return false;
    }

    await db.runAsync('DELETE FROM emergency_reports WHERE id = ?;', [id]);
    return true;
  },

  /**
   * Get count of stored reports
   */
  async getReportCount(): Promise<number> {
    const db = await getDatabase();
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM emergency_reports;'
    );
    return result?.count || 0;
  },
};
