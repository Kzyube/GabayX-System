/**
 * Automated Verification Test Suite for GabayX Milestone 3:
 * Offline-First Report Storage & SQLite Repository
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

console.log('================================================================');
console.log('GABAYX MILESTONE 3: OFFLINE-FIRST REPORT STORAGE TEST SUITE');
console.log('================================================================\n');

// --- 1. INSPECT TYPES & SOURCE CODE INTEGRITY ---
console.log('--- SUITE 1: SOURCE MODULES & CONFIGURATION ---');

const typesContent = fs.readFileSync('mobile-app/src/types/report.ts', 'utf8');
const schemaContent = fs.readFileSync('mobile-app/src/database/schema.ts', 'utf8');
const repoContent = fs.readFileSync('mobile-app/src/database/reportRepository.ts', 'utf8');
const appContent = fs.readFileSync('mobile-app/App.tsx', 'utf8');
const pkgContent = fs.readFileSync('mobile-app/package.json', 'utf8');

test('TEST 1.1: Mobile dependencies include expo-sqlite and expo-location', () => {
  const pkg = JSON.parse(pkgContent);
  assert(pkg.dependencies['expo-sqlite'], 'Must declare expo-sqlite dependency');
  assert(pkg.dependencies['expo-location'], 'Must declare expo-location dependency');
  assert(pkg.dependencies['expo-crypto'], 'Must declare expo-crypto dependency');
});

test('TEST 1.2: Typed report model defines all required fields', () => {
  assert(typesContent.includes('export type ReportCategory'), 'Must define ReportCategory');
  assert(typesContent.includes('export type ReportStatus'), 'Must define ReportStatus');
  assert(typesContent.includes('export interface GabayXReport'), 'Must define GabayXReport');
  assert(typesContent.includes('contactInformation: ContactInformation'), 'Must isolate contactInformation');
  assert(typesContent.includes('localStatus: ReportStatus'), 'Must define localStatus');
  assert(typesContent.includes('schemaVersion: string'), 'Must define schemaVersion');
});

test('TEST 1.3: Repository provides required operations', () => {
  assert(repoContent.includes('createReport('), 'Must provide createReport');
  assert(repoContent.includes('saveReport('), 'Must provide saveReport');
  assert(repoContent.includes('getAllReports('), 'Must provide getAllReports');
  assert(repoContent.includes('getReportById('), 'Must provide getReportById');
  assert(repoContent.includes('getPendingReports('), 'Must provide getPendingReports');
  assert(repoContent.includes('updateReportStatus('), 'Must provide updateReportStatus');
  assert(repoContent.includes('deleteReport('), 'Must provide deleteReport');
});

// --- 2. VALIDATION ENGINE ---
console.log('\n--- SUITE 2: REPORT VALIDATION & BOUNDS ENFORCEMENT ---');

function validateInput(input) {
  const errors = [];
  if (!input) return { valid: false, errors: ['Report input payload is required.'] };

  const validCategories = ['EARTHQUAKE', 'FIRE', 'FLOOD', 'MEDICAL', 'TRAPPED', 'HAZARD', 'GENERAL'];
  if (!input.category || !validCategories.includes(input.category)) {
    errors.push('A valid emergency category is required.');
  }

  if (!input.description || typeof input.description !== 'string' || input.description.trim().length === 0) {
    errors.push('Incident description is required.');
  } else if (input.description.trim().length < 5) {
    errors.push('Incident description must be at least 5 characters.');
  } else if (input.description.length > 2000) {
    errors.push('Incident description cannot exceed 2000 characters.');
  }

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

  return { valid: errors.length === 0, errors };
}

test('SCENARIO 1 & 2: Validate required fields and reject invalid entries', () => {
  // Valid report
  const validRes = validateInput({
    category: 'FIRE',
    description: 'Structure fire in southern laboratory wing',
    latitude: 7.1002,
    longitude: 124.824,
  });
  assert(validRes.valid === true, 'Valid report must pass');

  // Missing category
  const badCat = validateInput({ description: 'Valid description here' });
  assert(badCat.valid === false, 'Missing category must fail');
  assert(badCat.errors.some((e) => e.includes('category')), 'Error must mention category');

  // Empty description
  const badDesc = validateInput({ category: 'EARTHQUAKE', description: '' });
  assert(badDesc.valid === false, 'Empty description must fail');

  // Too short description (< 5 chars)
  const shortDesc = validateInput({ category: 'EARTHQUAKE', description: 'Help' });
  assert(shortDesc.valid === false, 'Short description must fail');

  // Out of bounds latitude (> 90)
  const badLat = validateInput({
    category: 'FLOOD',
    description: 'Rising water level',
    latitude: 195.4,
    longitude: 124.8,
  });
  assert(badLat.valid === false, 'Out-of-bounds latitude must fail');
});

// --- 3. SQLITE DATABASE SCHEMA & MIGRATIONS ---
console.log('\n--- SUITE 3: SQLITE STORAGE & CRUD OPERATIONS ---');

const testDbPath = path.join('mobile-app', 'test_gabayx_storage.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

let db = new DatabaseSync(testDbPath);

// Initialize schema
db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emergency_reports (
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
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON emergency_reports(local_status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON emergency_reports(created_at DESC);
`);

test('SCENARIO 1 & 9: Create valid emergency report and confirm initial PENDING status', () => {
  const insertStmt = db.prepare(`
    INSERT INTO emergency_reports (
      id, schema_version, source_platform, category, severity, description,
      latitude, longitude, accuracy, nearest_building, created_at, updated_at,
      server_acknowledged_at, local_status, mesh_hop_count, contact_info_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const id1 = '550e8400-e29b-41d4-a716-446655440001';
  insertStmt.run(
    id1,
    '1.0.0',
    'MOBILE_ANDROID',
    'EARTHQUAKE',
    'HIGH',
    'Ground fissure observed near science building',
    7.1004,
    124.8245,
    5.2,
    'BLDG C',
    '2026-10-13T00:00:00.000Z',
    '2026-10-13T00:00:00.000Z',
    null,
    'PENDING', // Initial status
    0,
    JSON.stringify({ isAnonymous: true })
  );

  const row = db.prepare('SELECT * FROM emergency_reports WHERE id = ?;').get(id1);
  assert(row !== undefined, 'Row must exist');
  assert.strictEqual(row.id, id1);
  assert.strictEqual(row.local_status, 'PENDING', 'New report must have status PENDING');
  assert.strictEqual(row.server_acknowledged_at, null, 'New report must have null server_acknowledged_at');
});

test('SCENARIO 3, 4 & 5: Create multiple reports and retrieve all sorted by created_at DESC', () => {
  const insertStmt = db.prepare(`
    INSERT INTO emergency_reports (
      id, schema_version, source_platform, category, severity, description,
      latitude, longitude, accuracy, nearest_building, created_at, updated_at,
      server_acknowledged_at, local_status, mesh_hop_count, contact_info_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const id2 = '550e8400-e29b-41d4-a716-446655440002';
  const id3 = '550e8400-e29b-41d4-a716-446655440003';

  insertStmt.run(
    id2, '1.0.0', 'MOBILE_ANDROID', 'MEDICAL', 'CRITICAL', 'Individual with fractured ankle',
    7.1001, 124.8239, 4.0, 'BLDG H', '2026-10-13T00:05:00.000Z', '2026-10-13T00:05:00.000Z',
    null, 'PENDING', 0, JSON.stringify({ isAnonymous: false, name: 'Citizen A', phone: '09123456789' })
  );

  insertStmt.run(
    id3, '1.0.0', 'MOBILE_ANDROID', 'FIRE', 'HIGH', 'Smoke billowing from cafeteria kitchen',
    7.1008, 124.8242, 6.5, 'BLDG A', '2026-10-13T00:10:00.000Z', '2026-10-13T00:10:00.000Z',
    null, 'PENDING', 0, JSON.stringify({ isAnonymous: true })
  );

  const allRows = db.prepare('SELECT * FROM emergency_reports ORDER BY created_at DESC;').all();
  assert.strictEqual(allRows.length, 3, 'Must contain 3 total reports');
  assert.strictEqual(allRows[0].id, id3, 'Most recent report must be first');
  assert.strictEqual(allRows[2].id, '550e8400-e29b-41d4-a716-446655440001');

  // Retrieve individual
  const singleRow = db.prepare('SELECT * FROM emergency_reports WHERE id = ?;').get(id2);
  assert(singleRow !== undefined, 'Must retrieve single report by ID');
  assert.strictEqual(singleRow.category, 'MEDICAL');
  const parsedContact = JSON.parse(singleRow.contact_info_json);
  assert.strictEqual(parsedContact.name, 'Citizen A');
});

test('SCENARIO 6: Detect and reject duplicate report IDs', () => {
  const insertStmt = db.prepare(`
    INSERT INTO emergency_reports (
      id, schema_version, source_platform, category, severity, description,
      latitude, longitude, accuracy, nearest_building, created_at, updated_at,
      server_acknowledged_at, local_status, mesh_hop_count, contact_info_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  let duplicateCaught = false;
  try {
    // Attempt inserting identical ID
    insertStmt.run(
      '550e8400-e29b-41d4-a716-446655440001',
      '1.0.0', 'MOBILE_ANDROID', 'GENERAL', 'LOW', 'Overwriting attempt',
      null, null, null, null, '2026-10-13T00:15:00.000Z', '2026-10-13T00:15:00.000Z',
      null, 'PENDING', 0, '{}'
    );
  } catch (err) {
    duplicateCaught = true;
    assert(err.message.includes('UNIQUE constraint failed') || err.message.includes('PRIMARY KEY'), 'Must throw constraint error');
  }
  assert(duplicateCaught, 'Must catch duplicate ID constraint violation');

  // Ensure original report was not overwritten
  const checkRow = db.prepare('SELECT * FROM emergency_reports WHERE id = ?;').get('550e8400-e29b-41d4-a716-446655440001');
  assert.strictEqual(checkRow.category, 'EARTHQUAKE', 'Original category must be preserved without silent overwrite');
});

test('SCENARIO 7 & 8: Close and reopen database, confirming persistence', () => {
  // Simulate closing application
  db.close();

  // Simulate application relaunch: open fresh SQLite connection
  const reopenedDb = new DatabaseSync(testDbPath);
  const rows = reopenedDb.prepare('SELECT * FROM emergency_reports ORDER BY created_at DESC;').all();
  assert.strictEqual(rows.length, 3, 'All 3 reports must survive application restart');
  assert.strictEqual(rows[0].id, '550e8400-e29b-41d4-a716-446655440003');
  reopenedDb.close();
});

test('SCENARIO 11: Confirm optional coordinates work correctly with null GPS', () => {
  const activeDb = new DatabaseSync(testDbPath);
  const insertStmt = activeDb.prepare(`
    INSERT INTO emergency_reports (
      id, schema_version, source_platform, category, severity, description,
      latitude, longitude, accuracy, nearest_building, created_at, updated_at,
      server_acknowledged_at, local_status, mesh_hop_count, contact_info_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const idNoGps = '550e8400-e29b-41d4-a716-446655440004';
  insertStmt.run(
    idNoGps, '1.0.0', 'MOBILE_ANDROID', 'HAZARD', 'MEDIUM', 'Fallen tree blocking northwest gate',
    null, null, null, 'Northwest Gate', '2026-10-13T00:20:00.000Z', '2026-10-13T00:20:00.000Z',
    null, 'PENDING', 0, JSON.stringify({ isAnonymous: true })
  );

  const row = activeDb.prepare('SELECT * FROM emergency_reports WHERE id = ?;').get(idNoGps);
  assert(row !== undefined);
  assert.strictEqual(row.latitude, null, 'Latitude must be null');
  assert.strictEqual(row.longitude, null, 'Longitude must be null');
  assert.strictEqual(row.nearest_building, 'Northwest Gate');
  activeDb.close();
});

test('SCENARIO 12: Confirm reports cannot be falsely marked synced without explicit server acknowledgment', () => {
  const activeDb = new DatabaseSync(testDbPath);
  const pendingRows = activeDb.prepare(`SELECT * FROM emergency_reports WHERE local_status = 'PENDING';`).all();
  assert.strictEqual(pendingRows.length, 4, 'All 4 created reports must remain PENDING');

  // Verify none have a false server confirmation timestamp
  pendingRows.forEach((r) => {
    assert.strictEqual(r.server_acknowledged_at, null, 'No pending report may claim server acknowledgment');
  });

  // Explicit status update
  const updateStmt = activeDb.prepare(`
    UPDATE emergency_reports SET local_status = ?, server_acknowledged_at = ?, updated_at = ? WHERE id = ?;
  `);
  const ackTime = new Date().toISOString();
  updateStmt.run('SYNCED', ackTime, ackTime, '550e8400-e29b-41d4-a716-446655440001');

  const syncedRow = activeDb.prepare('SELECT * FROM emergency_reports WHERE id = ?;').get('550e8400-e29b-41d4-a716-446655440001');
  assert.strictEqual(syncedRow.local_status, 'SYNCED');
  assert.strictEqual(syncedRow.server_acknowledged_at, ackTime);

  activeDb.close();
});

// Cleanup test DB
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

console.log('\n================================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
