/**
 * Test Suite: GabayX Offline Maps & Routes Feature Verification
 */

const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('GABAYX OFFLINE MAPS & ROUTES VERIFICATION TEST SUITE');
console.log('================================================================\n');

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

const studentHtml = fs.readFileSync('public/student.html', 'utf8');
const swJs = fs.readFileSync('public/sw.js', 'utf8');
const dbJs = fs.readFileSync('public/js/storage/db.js', 'utf8');
const serviceJs = fs.readFileSync('public/js/services/offlineMapsService.js', 'utf8');
const uiJs = fs.readFileSync('public/js/offline-maps-ui.js', 'utf8');

// Load service module in Node
const service = require('../public/js/services/offlineMapsService.js');

// --- TEST 1: MENU ITEM & INTEGRATION ---
console.log('--- TEST 1: MENU ITEM & INTEGRATION ---');
test('TEST 1.1: Sidebar contains "Offline Maps & Routes" menu item', () => {
    assert(studentHtml.includes('Offline Maps & Routes'), 'Sidebar must include "Offline Maps & Routes" button label');
    assert(studentHtml.includes('id="sidebar-offline-maps-btn"'), 'Sidebar button must have id="sidebar-offline-maps-btn"');
    assert(studentHtml.includes('GabayXOfflineMapsUI.openModal()'), 'Sidebar button must call GabayXOfflineMapsUI.openModal()');
});

test('TEST 1.2: student.html includes offlineMapsService.js and offline-maps-ui.js scripts', () => {
    assert(studentHtml.includes('/js/services/offlineMapsService.js'), 'Must load offlineMapsService.js');
    assert(studentHtml.includes('/js/offline-maps-ui.js'), 'Must load offline-maps-ui.js');
});

test('TEST 1.3: Service Worker pre-caches offline mapping scripts', () => {
    assert(swJs.includes('/js/services/offlineMapsService.js'), 'SW must pre-cache offlineMapsService.js');
    assert(swJs.includes('/js/offline-maps-ui.js'), 'SW must pre-cache offline-maps-ui.js');
});

// --- TEST 2: INTERFACE & DIALOG REQUIREMENTS ---
console.log('\n--- TEST 2: INTERFACE & DIALOG REQUIREMENTS ---');
test('TEST 2.1: Dialog contains routes, map area, and status tabs', () => {
    assert(uiJs.includes('Evacuation Routes'), 'Must provide routes tab');
    assert(uiJs.includes('Map Area Tiles'), 'Must provide map area tiles tab');
    assert(uiJs.includes('Storage & Status'), 'Must provide storage and status tab');
});

test('TEST 2.2: Dialog provides download controls for routes and map area', () => {
    assert(uiJs.includes('Download All Routes'), 'Must provide download all routes option');
    assert(uiJs.includes('Download Campus Map Area'), 'Must provide download map area option');
});

test('TEST 2.3: Dialog provides progress bar and cancellation for map downloads', () => {
    assert(uiJs.includes('id="offline-download-progress-box"'), 'Must have download progress container');
    assert(uiJs.includes('id="offline-progress-bar-fill"'), 'Must have progress bar element');
    assert(uiJs.includes('id="btn-cancel-tile-download"'), 'Must have cancel download button');
    assert(uiJs.includes('cancelMapDownload'), 'Must implement cancelMapDownload');
});

test('TEST 2.4: Dialog displays offline availability status and storage metrics', () => {
    assert(uiJs.includes('SYSTEM READINESS'), 'Must display system readiness status');
    assert(uiJs.includes('BROWSER STORAGE ESTIMATE'), 'Must display browser storage estimate');
    assert(uiJs.includes('LAST DOWNLOAD'), 'Must display last successful download time');
});

test('TEST 2.5: Dialog provides delete options with confirmation', () => {
    assert(uiJs.includes('deleteRoute'), 'Must implement deleteRoute');
    assert(uiJs.includes('deleteMapPackage'), 'Must implement deleteMapPackage');
    assert(uiJs.includes('confirm('), 'Must require confirmation before deleting saved resources');
});

// --- TEST 3: ROUTING & DISASTER SAFETY CATALOG ---
console.log('\n--- TEST 3: ROUTING & DISASTER SAFETY CATALOG ---');
test('TEST 3.1: Service exports authoritative evacuation routes catalog', () => {
    assert(service.ROUTE_CATALOG, 'Must export ROUTE_CATALOG');
    assert(service.ROUTE_CATALOG.length >= 3, 'Must catalog at least 3 official campus routes');

    const principalFront = service.ROUTE_CATALOG.find(r => r.id === 'route_principal_front');
    assert(principalFront, 'Must include Primary Evacuation Hub route');
    assert.strictEqual(principalFront.isOfficialEvacuationRoute, true);
    assert.strictEqual(principalFront.destination.isEvacuationCenter, true);
    assert(Array.isArray(principalFront.destination.coords));
});

test('TEST 3.2: Routes distinguish official evacuation assembly zones from ordinary destinations', () => {
    const officialRoutes = service.ROUTE_CATALOG.filter(r => r.isOfficialEvacuationRoute);
    officialRoutes.forEach(r => {
        assert(r.category.includes('Evacuation') || r.category.includes('Assembly') || r.category.includes('Corridor'), 'Must categorize emergency route role');
        assert(r.disasterTypes.length > 0, 'Must specify disaster types');
    });
});

test('TEST 3.3: Prominent disaster safety disclaimers are enforced', () => {
    assert(service.DISASTER_SAFETY_NOTICE.includes('DISASTER SAFETY WARNING'), 'Must define disaster safety warning');
    assert(service.DISASTER_SAFETY_NOTICE.includes('reference guidelines only'), 'Must state routes are reference only');
    assert(service.DISASTER_SAFETY_NOTICE.includes('block designated roads'), 'Must warn hazards may block roads');
});

// --- TEST 4: TILE PROVIDER CONSTRAINTS & SLIPPY MATH ---
console.log('\n--- TEST 4: TILE PROVIDER CONSTRAINTS & SLIPPY MATH ---');
test('TEST 4.1: Explains ArcGIS bulk tile download restriction policy', () => {
    assert(service.TILE_PROVIDERS.ARCGIS_SATELLITE.supportsOfflineDownload === false, 'ArcGIS bulk download must be flagged as unsupported');
    assert(service.TILE_PROVIDERS.ARCGIS_SATELLITE.policyNotice.includes('Esri Terms of Use prohibit scraping'), 'Must explain Esri terms restriction');
    assert(uiJs.includes('Esri Terms of Use prohibit scraping'), 'UI must communicate ArcGIS restriction to users');
});

test('TEST 4.2: OpenStreetMap bounded campus download is configured and permitted', () => {
    assert(service.TILE_PROVIDERS.OPEN_STREET_MAP.supportsOfflineDownload === true, 'OSM must be enabled for bounded package');
    assert(service.CAMPUS_BOUNDS.south < service.CAMPUS_BOUNDS.north, 'South bound must be less than North');
    assert(service.CAMPUS_BOUNDS.west < service.CAMPUS_BOUNDS.east, 'West bound must be less than East');
});

test('TEST 4.3: Slippy tile mathematics correctly calculates tile coordinate bounds', () => {
    const tiles = service.calculateTileList(service.CAMPUS_BOUNDS, [17, 18]);
    assert(tiles.length >= 10 && tiles.length <= 50, `Tile count should be between 10 and 50 (got ${tiles.length})`);
    tiles.forEach(t => {
        assert(t.z === 17 || t.z === 18, 'Zoom must be 17 or 18');
        assert(typeof t.x === 'number' && typeof t.y === 'number');
        assert(t.url.includes('tile.openstreetmap.org'));
    });
});

test('TEST 4.4: Estimate package calculates tile count and storage bytes', () => {
    const est = service.estimateCampusMapPackage();
    assert.strictEqual(est.id, 'knhs_campus_osm');
    assert(est.tileCount > 0, 'Tile count must be greater than zero');
    assert(est.approxBytes > 100000, 'Bytes must be estimated accurately');
});

// --- TEST 5: INDEXEDDB STORAGE PERSISTENCE ---
console.log('\n--- TEST 5: INDEXEDDB STORAGE PERSISTENCE ---');
test('TEST 5.1: IndexedDB schema defines offline_routes, offline_tiles, and offline_packages', () => {
    assert(dbJs.includes('ROUTES: \'offline_routes\''), 'Must define ROUTES store');
    assert(dbJs.includes('TILES: \'offline_tiles\''), 'Must define TILES store');
    assert(dbJs.includes('PACKAGES: \'offline_packages\''), 'Must define PACKAGES store');
});

test('TEST 5.2: GabayXDB exposes CRUD for routes and map tiles', () => {
    assert(dbJs.includes('saveRoute'), 'Must expose saveRoute');
    assert(dbJs.includes('getRoute'), 'Must expose getRoute');
    assert(dbJs.includes('getAllRoutes'), 'Must expose getAllRoutes');
    assert(dbJs.includes('deleteRoute'), 'Must expose deleteRoute');
    assert(dbJs.includes('saveTile'), 'Must expose saveTile');
    assert(dbJs.includes('getTile'), 'Must expose getTile');
    assert(dbJs.includes('clearTiles'), 'Must expose clearTiles');
    assert(dbJs.includes('getStorageStats'), 'Must expose getStorageStats');
});

// --- TEST 6: LEAFLET INTEGRATION & OFFLINE MAP RENDERING ---
console.log('\n--- TEST 6: LEAFLET INTEGRATION & OFFLINE MAP RENDERING ---');
test('TEST 6.1: Service exports renderRouteOnMap for Leaflet', () => {
    assert(typeof service.renderRouteOnMap === 'function', 'Must export renderRouteOnMap');
    assert(typeof service.clearActiveRouteFromMap === 'function', 'Must export clearActiveRouteFromMap');
});

test('TEST 6.2: Floating offline route card UI exists with metrics and clear action', () => {
    assert(uiJs.includes('active-offline-route-card'), 'Must create active-offline-route-card');
    assert(uiJs.includes('OFFLINE SAVED ROUTE'), 'Must identify active route as offline saved route');
    assert(uiJs.includes('clearActiveRoute'), 'Must provide clearActiveRoute action');
});

test('TEST 6.3: Tactical offline grid CSS defined for missing base map tiles', () => {
    assert(studentHtml.includes('.leaflet-container.offline-tactical-grid'), 'Must define offline-tactical-grid CSS');
    assert(studentHtml.includes('updateOfflineMapVisuals'), 'Must toggle offline visual state');
});

test('TEST 6.4: Stale route detection flags routes older than 7 days', () => {
    assert(serviceJs.includes('daysOld > 7'), 'Service must detect routes > 7 days old');
    assert(uiJs.includes('Stale Data'), 'UI must badge stale route data');
});

console.log('\n================================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
    process.exit(1);
}
