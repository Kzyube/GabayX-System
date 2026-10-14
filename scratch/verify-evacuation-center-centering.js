/**
 * Verification test for Evacuation Center and Nearest Supplies Centering
 */
const fs = require('fs');
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
console.log('GABAYX EVACUATION CENTER & SUPPLIES CENTERING TEST SUITE');
console.log('================================================================\n');

const adminHtml = fs.readFileSync('public/admin.html', 'utf8');
const studentHtml = fs.readFileSync('public/student.html', 'utf8');

const EVAC_COORDS_STR = '7.100589893149529, 124.82393056927546';

// --- SUITE 1: ADMIN DASHBOARD CENTERING ---
console.log('--- SUITE 1: ADMIN DASHBOARD CENTERING ---');

test('TEST 1.1: admin.html defines EVACUATION_CENTER_LOC', () => {
    assert(adminHtml.includes('EVACUATION_CENTER_LOC'), 'Must define EVACUATION_CENTER_LOC');
    assert(adminHtml.includes(EVAC_COORDS_STR), 'Must use official evacuation center coordinates');
});

test('TEST 1.2: admin.html toggleAllRoutes() centers on Evacuation Center', () => {
    assert(adminHtml.includes('map.flyTo(EVACUATION_CENTER_LOC, 19'), 'toggleAllRoutes must center on EVACUATION_CENTER_LOC');
    assert(adminHtml.includes('Centered on Evacuation Center'), 'toggleAllRoutes must communicate centering on Evacuation Center');
});

test('TEST 1.3: admin.html enableSupplyMarkerMode() centers on nearest supply or Evacuation Center', () => {
    assert(adminHtml.includes('enableSupplyMarkerMode()'), 'Must define enableSupplyMarkerMode');
    assert(adminHtml.includes('map.flyTo(EVACUATION_CENTER_LOC, 19') || adminHtml.includes('map.flyTo(nearestSupply'), 'Must center on evacuation center or nearest supply');
    assert(adminHtml.includes('Centered on Evacuation Center') || adminHtml.includes('Centered on Nearest Supply Drop'), 'Must display centering message');
});

test('TEST 1.4: admin.html placeSupplyDrop() centers map on placed supply drop', () => {
    assert(adminHtml.includes('map.flyTo(latlng, 19'), 'placeSupplyDrop must fly to placed marker');
});

test('TEST 1.5: admin.html provides dedicated centerOnEvacuationCenter control', () => {
    assert(adminHtml.includes('centerOnEvacuationCenter()'), 'Must export centerOnEvacuationCenter');
    assert(adminHtml.includes('id="btn-admin-evac"'), 'Must have button for centering on Evacuation Center');
});

// --- SUITE 2: STUDENT APP CENTERING ---
console.log('\n--- SUITE 2: STUDENT APP CENTERING ---');

test('TEST 2.1: student.html defines EVACUATION_CENTER_COORDS', () => {
    assert(studentHtml.includes('EVACUATION_CENTER_COORDS'), 'Must define EVACUATION_CENTER_COORDS');
    assert(studentHtml.includes(EVAC_COORDS_STR), 'Must use official evacuation center coordinates');
});

test('TEST 2.2: student.html centerOnCampus() centers on Evacuation Center by default', () => {
    assert(studentHtml.includes('map.flyTo(EVACUATION_CENTER_COORDS, 19'), 'centerOnCampus must fly to EVACUATION_CENTER_COORDS');
    assert(studentHtml.includes('🛡️ Centered on Evacuation Center'), 'centerOnCampus must toast Centered on Evacuation Center');
});

test('TEST 2.3: student.html centerOnCampus() centers on active evacuation route destination or nearest supply', () => {
    assert(studentHtml.includes('if (activeDestination && Array.isArray(activeDestination)'), 'centerOnCampus must inspect activeDestination');
    assert(studentHtml.includes('map.flyTo(activeDestination, 19'), 'centerOnCampus must fly to active destination');
    assert(studentHtml.includes('Centered on Nearest Supply Drop'), 'centerOnCampus must handle active supply drop');
});

test('TEST 2.4: student.html handleAlert() automatically focuses map on Evacuation Center / Supply Drop', () => {
    assert(studentHtml.includes('if (map) map.flyTo(activeDestination, 19'), 'handleAlert must fly to bestZone evacuation coords');
    assert(studentHtml.includes('if (map) map.flyTo([data.lat, data.lng], 19'), 'handleAlert must fly to supply drop coordinates');
});

test('TEST 2.5: student.html startSupplyRoute() focuses map on supply drop', () => {
    assert(studentHtml.includes('if (map) map.flyTo([lat, lng], 19'), 'startSupplyRoute must fly to supply destination');
});

console.log('\n================================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
    process.exit(1);
}
