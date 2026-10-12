/**
 * Test Suite: GabayX Nearby Places Feature Verification
 */

const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('GABAYX NEARBY PLACES FEATURE VERIFICATION TEST SUITE');
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

// 1. Load service file
const serviceContent = fs.readFileSync('public/js/services/nearbyPlacesService.js', 'utf8');
const studentHtml = fs.readFileSync('public/student.html', 'utf8');
const swJs = fs.readFileSync('public/sw.js', 'utf8');

// Load service directly
const service = require('../public/js/services/nearbyPlacesService.js');

// --- TEST 1: SERVICE MODULE & CONFIGURATION ---
console.log('--- TEST 1: SERVICE MODULE & CONFIGURATION ---');
test('TEST 1.1: Service exports all required methods and configurations', () => {
    assert(service, 'GabayXNearbyPlacesService must be exported');
    assert.strictEqual(typeof service.findNearbyPlaces, 'function');
    assert.strictEqual(typeof service.calculateDistance, 'function');
    assert.strictEqual(typeof service.formatDistance, 'function');
    assert.strictEqual(typeof service.classifyPlace, 'function');
    assert.strictEqual(service.CONFIG.defaultRadius, 2000, 'Default radius must be 2000 meters (2 km)');
    assert(service.CONFIG.availableRadii.includes(2000), 'Must include 2000m in available radii');
});

test('TEST 1.2: Service worker pre-caches nearbyPlacesService.js', () => {
    assert(swJs.includes('/js/services/nearbyPlacesService.js'), 'Service worker must precache nearbyPlacesService.js');
});

// --- TEST 2: DISTANCE CALCULATIONS (STRAIGHT-LINE) ---
console.log('\n--- TEST 2: DISTANCE CALCULATIONS (STRAIGHT-LINE) ---');
test('TEST 2.1: Haversine distance calculation is accurate', () => {
    // USM Principal Front to Mendoza Court (~140m)
    const dist = service.calculateDistance(7.10059, 124.82393, 7.10008, 124.82369);
    assert(dist > 50 && dist < 200, `Expected distance ~80-140m, got ${dist}m`);
    // Same coordinate is 0
    assert.strictEqual(service.calculateDistance(7.1, 124.8, 7.1, 124.8), 0);
});

test('TEST 2.2: Distance formatting correctly differentiates meters and kilometers', () => {
    assert.strictEqual(service.formatDistance(350), '350 m');
    assert.strictEqual(service.formatDistance(999), '999 m');
    assert.strictEqual(service.formatDistance(1000), '1.0 km');
    assert.strictEqual(service.formatDistance(2450), '2.5 km');
});

// --- TEST 3: DISASTER SAFETY CLASSIFICATION TAXONOMY ---
console.log('\n--- TEST 3: DISASTER SAFETY CLASSIFICATION TAXONOMY ---');
test('TEST 3.1: Designated official evacuation centers are classified as VERIFIED_EVACUATION', () => {
    const verifiedResult = service.classifyPlace({ emergency: 'evacuation_centre' }, 'Municipal Evacuation Hub');
    assert.strictEqual(verifiedResult.code, 'VERIFIED_EVACUATION');
    assert.strictEqual(verifiedResult.isVerifiedSafe, true);

    const principalResult = service.classifyPlace({}, 'PRINCIPAL FRONT');
    assert.strictEqual(principalResult.code, 'VERIFIED_EVACUATION');
    assert.strictEqual(principalResult.isVerifiedSafe, true);
});

test('TEST 3.2: Emergency services (hospitals, fire, police) are classified as EMERGENCY_SERVICE', () => {
    const hospital = service.classifyPlace({ amenity: 'hospital' }, 'Kabacan Medical Center');
    assert.strictEqual(hospital.code, 'EMERGENCY_SERVICE');
    assert.strictEqual(hospital.isVerifiedSafe, false, 'Emergency services must not claim verified safe zone status');
    assert(hospital.statusText.includes('unverified'), 'Must explicitly warn that structural integrity is unverified');

    const fireStation = service.classifyPlace({ amenity: 'fire_station' }, 'Kabacan BFP');
    assert.strictEqual(fireStation.code, 'EMERGENCY_SERVICE');
    assert.strictEqual(fireStation.isVerifiedSafe, false);
});

test('TEST 3.3: Schools and public buildings are NEVER labeled as verified evacuation centers', () => {
    const school = service.classifyPlace({ amenity: 'school' }, 'Kabacan Central Elementary');
    assert.strictEqual(school.code, 'OTHER_MAPPED_PLACE');
    assert.strictEqual(school.isVerifiedSafe, false);
    assert(school.statusText.includes('Not an official evacuation center'), 'Must state not an official evacuation center');

    const college = service.classifyPlace({ amenity: 'university' }, 'University Campus');
    assert.strictEqual(college.code, 'OTHER_MAPPED_PLACE');
    assert.strictEqual(college.isVerifiedSafe, false);

    const townhall = service.classifyPlace({ amenity: 'townhall' }, 'Municipal Town Hall');
    assert.strictEqual(townhall.code, 'OTHER_MAPPED_PLACE');
    assert.strictEqual(townhall.isVerifiedSafe, false);
});

// --- TEST 4: LOCAL CACHE & OFFLINE FALLBACK ---
console.log('\n--- TEST 4: LOCAL CACHE & OFFLINE FALLBACK ---');
test('TEST 4.1: Offline fallback retrieves authoritative campus safe zones and hotlines', async () => {
    // Mock navigator.onLine = false to test offline fallback
    global.navigator = { onLine: false };
    const result = await service.findNearbyPlaces({ lat: 7.1002, lng: 124.824, radius: 2000 });
    assert(result.isOfflineFallback, 'Must indicate offline fallback');
    assert(result.places.length > 0, 'Must return cached facilities');

    const safeZones = result.places.filter(p => p.classification.code === 'VERIFIED_EVACUATION');
    assert(safeZones.length >= 3, 'Must include designated safe zones (Principal Front, Mendoza Court, Tejada Court)');
    assert(safeZones.some(sz => sz.name === 'PRINCIPAL FRONT'), 'Must include PRINCIPAL FRONT');
});

test('TEST 4.2: Results are sorted by straight-line distance by default', async () => {
    const result = await service.findNearbyPlaces({ lat: 7.1002, lng: 124.824, radius: 2000 });
    for (let i = 1; i < result.places.length; i++) {
        assert(result.places[i].distance >= result.places[i - 1].distance, 'Places must be sorted ascending by distance');
    }
});

// --- TEST 5: UI CONTROLS & LEAFLET MAP INTEGRATION ---
console.log('\n--- TEST 5: UI CONTROLS & LEAFLET MAP INTEGRATION ---');
test('TEST 5.1: "Find Nearby Places" controls exist on toolbar and sidebar (floating btn-find-nearby removed per user request)', () => {
    assert(!studentHtml.includes('id="btn-find-nearby"'), 'Floating Find Nearby Places button must be removed per user request');
    assert(studentHtml.includes('id="btn-map-nearby"'), 'Map cluster toolbar Find Nearby Places button must exist');
    assert(studentHtml.includes('Find Nearby Places'), 'Sidebar menu item must be present');
});

test('TEST 5.2: Nearby places panel structure adheres to requirements', () => {
    assert(studentHtml.includes('id="nearby-places-panel"'), 'Nearby places panel must exist');
    assert(studentHtml.includes('id="nearby-radius-select"'), 'Radius selection dropdown must exist');
    assert(studentHtml.includes('id="nearby-results-list"'), 'Results list container must exist');
    assert(studentHtml.includes('id="nearby-empty-state"'), 'Empty state container must exist');
    assert(studentHtml.includes('id="nearby-offline-alert"'), 'Offline alert banner must exist');
});

test('TEST 5.3: Duplicate-marker prevention via LayerGroup clearLayers', () => {
    assert(studentHtml.includes('nearbyPlacesLayer.clearLayers()'), 'Must clear layers before rendering fresh markers');
});

test('TEST 5.4: Map-list synchronization implemented', () => {
    assert(studentHtml.includes('focusPlace(placeId)'), 'Must define focusPlace');
    assert(studentHtml.includes('highlightCard(placeId)'), 'Must define highlightCard');
    assert(studentHtml.includes('map.flyTo('), 'Must focus map onto place coordinates');
});

test('TEST 5.5: Location permission fallback modal prevents silent fake GPS substitution', () => {
    assert(studentHtml.includes('id="nearby-location-fallback-modal"'), 'Fallback modal must exist for GPS denial');
    assert(studentHtml.includes('searchCampusReference()'), 'Must allow explicit manual campus reference fallback');
    assert(studentHtml.includes('Manual reference, not your GPS'), 'Must clearly label manual reference as not user GPS');
});

test('TEST 5.6: Straight-line distance disclaimer banner is displayed', () => {
    assert(studentHtml.includes('Straight-line distances shown'), 'Must display straight-line distance disclaimer');
    assert(studentHtml.includes('Actual road evacuation routes may differ'), 'Must warn that actual routes differ');
});

console.log('\n================================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
console.log('================================================================');

if (passedTests === totalTests) {
    console.log('ALL NEARBY PLACES TESTS PASSED WITH ZERO REGRESSIONS!');
} else {
    process.exit(1);
}
