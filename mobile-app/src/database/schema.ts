/**
 * GabayX Mobile SQLite Database Schema & Migrations
 * Uses parameterized DDL and structured versioned migrations.
 */

export const CURRENT_SCHEMA_VERSION = 1;

export const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
`;

export const MIGRATIONS: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS emergency_reports (
      id TEXT PRIMARY KEY NOT NULL,
      schema_version TEXT NOT NULL,
      source_platform TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      accuracy REAL,
      nearest_building TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      server_acknowledged_at TEXT,
      local_status TEXT NOT NULL,
      mesh_hop_count INTEGER NOT NULL DEFAULT 0,
      contact_info_json TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_reports_status ON emergency_reports(local_status);`,
    `CREATE INDEX IF NOT EXISTS idx_reports_created ON emergency_reports(created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_reports_category ON emergency_reports(category);`,
  ],
};
