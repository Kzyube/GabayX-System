/**
 * GabayX Mobile SQLite Database Schema & Migrations
 * Uses parameterized DDL and structured versioned migrations.
 */

export const CURRENT_SCHEMA_VERSION = 3;

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
  2: [
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );`,
  ],
  3: [
    `CREATE TABLE IF NOT EXISTS gcash_vouchers (
      id TEXT PRIMARY KEY NOT NULL,
      voucher_code TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      persons_count INTEGER NOT NULL DEFAULT 1,
      donor_name TEXT NOT NULL,
      target_zone TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_claimed INTEGER NOT NULL DEFAULT 0
    );`,
    `CREATE INDEX IF NOT EXISTS idx_vouchers_created ON gcash_vouchers(created_at DESC);`,
    `CREATE TABLE IF NOT EXISTS relief_supplies (
      id TEXT PRIMARY KEY NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,
  ],
};
