/**
 * Verification Script: GabayX Milestone 4 - Mobile Map & Synchronization
 */

const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('GABAYX MILESTONE 4: NATIVE MAP & SYNC VERIFICATION');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

// Read relevant files
const geoDataContent = fs.readFileSync('mobile-app/src/constants/geoData.ts', 'utf8');
const mapScreenContent = fs.readFileSync('mobile-app/src/screens/MapScreen.tsx', 'utf8');
const syncServiceContent = fs.readFileSync('mobile-app/src/sync/syncService.ts', 'utf8');
const appContent = fs.readFileSync('mobile-app/App.tsx', 'utf8');

// --- SUITE 1: GEOGRAPHIC DATA CATALOG ---
console.log('--- SUITE 1: AUTHORITATIVE GEOGRAPHIC DATA ---');

test('TEST 1.1: geoData exports 3 Designated Safe Assembly Zones', () => {
  assert(geoDataContent.includes('SAFE_ASSEMBLY_ZONES'), 'Must export SAFE_ASSEMBLY_ZONES');
  assert(geoDataContent.includes('zone_principal_front'), 'Must include Principal Front Hub');
  assert(geoDataContent.includes('zone_mendoza_court'), 'Must include Mendoza Court Safe Zone');
  assert(geoDataContent.includes('zone_tejada_court'), 'Must include Tejada Court Safe Zone');
});

test('TEST 1.2: geoData exports 19 Designated Campus Buildings (A through S)', () => {
  assert(geoDataContent.includes('CAMPUS_BUILDINGS'), 'Must export CAMPUS_BUILDINGS');
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S']) {
    assert(geoDataContent.includes(`shortLetter: '${letter}'`), `Must include Building ${letter}`);
  }
});

test('TEST 1.3: geoData exports 3 Pre-verified Evacuation Routes', () => {
  assert(geoDataContent.includes('EVACUATION_ROUTES'), 'Must export EVACUATION_ROUTES');
  assert(geoDataContent.includes('route_principal_front'), 'Must include Primary route');
  assert(geoDataContent.includes('route_mendoza_court'), 'Must include Mendoza route');
  assert(geoDataContent.includes('route_tejada_court'), 'Must include Tejada route');
});

// --- SUITE 2: NATIVE MAP SCREEN INTEGRATION ---
console.log('\n--- SUITE 2: NATIVE MAP & GPS INTEGRATION ---');

test('TEST 2.1: MapScreen integrates expo-location for real GPS tracking', () => {
  assert(mapScreenContent.includes("from 'expo-location'"), 'Must import expo-location');
  assert(mapScreenContent.includes('requestForegroundPermissionsAsync'), 'Must request foreground permission');
  assert(mapScreenContent.includes('watchPositionAsync'), 'Must watch position');
  assert(mapScreenContent.includes('UPDATE_USER_LOCATION') || mapScreenContent.includes('showsUserLocation'), 'Must track user location on map');
});

test('TEST 2.2: MapScreen renders campus Markers and Polylines', () => {
  assert(mapScreenContent.includes('L.marker') || mapScreenContent.includes('<Marker'), 'Must render markers');
  assert(mapScreenContent.includes('L.polyline') || mapScreenContent.includes('<Polyline'), 'Must render polylines');
  assert(mapScreenContent.includes('calculateDistanceMeters'), 'Must calculate distance from user GPS');
  assert(mapScreenContent.includes('handleRecenterUser'), 'Must provide recenter to GPS action');
  assert(mapScreenContent.includes('handleRecenterCampus'), 'Must provide recenter to Campus action');
});

test('TEST 2.3: MapScreen provides interactive selection and layer toggles', () => {
  assert(mapScreenContent.includes('selectedPlace'), 'Must support selected place state');
  assert(mapScreenContent.includes('showBuildings'), 'Must support building layer toggle');
  assert(mapScreenContent.includes('showSafeZones'), 'Must support safe zone layer toggle');
  assert(mapScreenContent.includes('showRoutes'), 'Must support routes layer toggle');
});

// --- SUITE 3: BACKEND SYNCHRONIZATION ---
console.log('\n--- SUITE 3: BACKEND SYNCHRONIZATION ---');

test('TEST 3.1: syncService queries pending reports and posts to /api/reports/submit', () => {
  assert(syncServiceContent.includes('reportRepository.getPendingReports'), 'Must get pending reports');
  assert(syncServiceContent.includes('/api/reports/submit'), 'Must target /api/reports/submit endpoint');
  assert(syncServiceContent.includes("updateReportStatus(report.id, 'SYNCED'"), 'Must update status to SYNCED');
});

test('TEST 3.2: App.tsx integrates sync button with loading indicator', () => {
  assert(appContent.includes('syncService.syncPendingReports'), 'Must call syncPendingReports in App');
  assert(appContent.includes('handleSyncReports'), 'Must define handleSyncReports');
  assert(appContent.includes('syncButton'), 'Must render syncButton UI');
});

console.log('\n================================================================');
console.log(`TEST RESULTS: ${passed}/${total} PASSED`);
console.log('================================================================\n');

if (passed !== total) {
  process.exit(1);
}
