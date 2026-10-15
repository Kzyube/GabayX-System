/**
 * GabayX Mobile - Emergency Incident Report Type Model
 * Aligned with the Dual-Platform Shared Report Specification.
 * Separates public relay/mesh telemetry from optional private contact information.
 */

export type ReportCategory =
  | 'EARTHQUAKE'
  | 'FIRE'
  | 'FLOOD'
  | 'MEDICAL'
  | 'TRAPPED'
  | 'HAZARD'
  | 'GENERAL';

export type ReportSeverity = 'CRITICAL' | 'EXTREME' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ReportStatus =
  | 'PENDING'   // Saved locally in SQLite; not yet acknowledged by backend
  | 'SYNCING'   // Upload or mesh transfer in progress
  | 'SYNCED'    // Confirmed acknowledged by backend/command center
  | 'FAILED';   // Operation failed / requires retry

export interface ContactInformation {
  isAnonymous: boolean;
  name?: string | null;
  phone?: string | null;
  kinName?: string | null;
  kinPhone?: string | null;
}

export interface LocationCoordinates {
  latitude: number | null;
  longitude: number | null;
  accuracy?: number | null;
  nearestBuilding?: string;
}

export interface GabayXReport {
  id: string;                         // RFC4122 UUID v4 (Primary Key & Idempotency Key)
  schemaVersion: string;              // "1.0.0"
  sourcePlatform: 'MOBILE_ANDROID' | 'MOBILE_IOS';

  // Incident Details
  category: ReportCategory;
  severity: ReportSeverity;
  description: string;

  // Geospatial Data (Optional, captured when permission granted)
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  nearestBuilding: string;

  // Temporal Metadata
  createdAt: string;                 // ISO-8601 UTC
  updatedAt: string;                 // ISO-8601 UTC
  serverAcknowledgedAt: string | null;// ISO-8601 UTC when confirmed by backend

  // Local Processing Status
  localStatus: ReportStatus;

  // Mesh & Relay Prep (Transport agnostic)
  meshHopCount: number;              // 0 = created on this device

  // Sensitive Personal Data (Stored in separate columns/JSON)
  contactInformation: ContactInformation;
}

export interface CreateReportInput {
  category: ReportCategory;
  severity?: ReportSeverity;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  nearestBuilding?: string;
  contactInformation?: Partial<ContactInformation>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate incoming report input before persisting to database
 */
export function validateReportInput(input: Partial<CreateReportInput>): ValidationResult {
  const errors: string[] = [];

  if (!input) {
    return { valid: false, errors: ['Report input payload is required.'] };
  }

  // 1. Required Category
  const validCategories: ReportCategory[] = [
    'EARTHQUAKE',
    'FIRE',
    'FLOOD',
    'MEDICAL',
    'TRAPPED',
    'HAZARD',
    'GENERAL',
  ];
  if (!input.category || !validCategories.includes(input.category)) {
    errors.push('A valid emergency category is required.');
  }

  // 2. Required Description
  if (!input.description || typeof input.description !== 'string' || input.description.trim().length === 0) {
    errors.push('Incident description is required.');
  } else if (input.description.trim().length < 5) {
    errors.push('Incident description must be at least 5 characters.');
  } else if (input.description.length > 2000) {
    errors.push('Incident description cannot exceed 2000 characters.');
  }

  // 3. Optional Coordinates Bounds Check
  if (input.latitude !== undefined && input.latitude !== null) {
    if (isNaN(input.latitude) || input.latitude < -90 || input.latitude > 90) {
      errors.push('Latitude must be a valid coordinate between -90 and 90.');
    }
  }

  if (input.longitude !== undefined && input.longitude !== null) {
    if (isNaN(input.longitude) || input.longitude < -180 || input.longitude > 180) {
      errors.push('Longitude must be a valid coordinate between -180 and 180.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
