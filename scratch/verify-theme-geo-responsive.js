/**
 * Automated Verification Test Suite for GabayX:
 * Features: Dark/Light Mode, Google Maps Geolocation, and Responsive UI
 */

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
console.log('GABAYX THEME, GEOLOCATION & RESPONSIVE UI TEST SUITE');
console.log('================================================================\n');

const studentHtml = fs.readFileSync('public/student.html', 'utf8');
const adminHtml = fs.readFileSync('public/admin.html', 'utf8');
const swJs = fs.readFileSync('public/sw.js', 'utf8');
const offlineUiJs = fs.readFileSync('public/js/offline-ui.js', 'utf8');
const manifestJson = fs.readFileSync('public/manifest.webmanifest', 'utf8');

// --- TEST 1: LIGHT MODE ---
console.log('--- TEST 1: LIGHT MODE ---');
test('TEST 1.1: Light mode tokens defined in CSS', () => {
    assert(studentHtml.includes('[data-theme="light"]'), 'Must have [data-theme="light"] selector');
    assert(studentHtml.includes('--bg-base: #f8fafc;'), 'Must have light background token');
    assert(studentHtml.includes('--text-main: #0f172a;'), 'Must have light mode text main token');
    assert(studentHtml.includes('--primary: #059669;'), 'Must have high-contrast emerald token');
});

test('TEST 1.2: Light mode preserves emergency severity indicators', () => {
    assert(studentHtml.includes('--danger: #dc2626;'), 'Must have distinct danger color for light mode');
    assert(studentHtml.includes('--warning: #d97706;'), 'Must have distinct warning color for light mode');
});

test('TEST 1.3: Light mode map tiles configured (OpenStreetMap without API key)', () => {
    assert(studentHtml.includes('https://tile.openstreetmap.org/'), 'Must have OpenStreetMap tiles configured');
    assert(studentHtml.includes('.map-tiles-street'), 'Must have map-tiles-street class defined');
});

// --- TEST 2: DARK MODE ---
console.log('\n--- TEST 2: DARK MODE ---');
test('TEST 2.1: Dark mode tokens defined in CSS', () => {
    assert(studentHtml.includes('[data-theme="dark"]'), 'Must have [data-theme="dark"] selector');
    assert(studentHtml.includes('--bg-base: #010a07;'), 'Must have dark background token');
    assert(studentHtml.includes('--text-main: #f8fafc;'), 'Must have dark mode text main token');
    assert(studentHtml.includes('--primary: #10b981;'), 'Must have vibrant emerald token');
});

test('TEST 2.2: Dark mode map tiles configured with CSS tactical filter (zero API key)', () => {
    assert(studentHtml.includes('[data-theme="dark"] .map-tiles-street'), 'Must have dark mode street tile filter');
    assert(studentHtml.includes('invert(100%)'), 'Must use invert filter for dark mode tiles');
});

// --- TEST 3: THEME PERSISTENCE & FOUC PREVENTION ---
console.log('\n--- TEST 3: THEME PERSISTENCE & FOUC PREVENTION ---');
test('TEST 3.1: FOUC prevention script exists in <head>', () => {
    const headSection = studentHtml.substring(0, studentHtml.indexOf('</head>'));
    assert(headSection.includes("localStorage.getItem('gabayx_theme')"), 'Head must read gabayx_theme');
    assert(headSection.includes("document.documentElement.setAttribute('data-theme'"), 'Head must set data-theme before body renders');
});

test('TEST 3.2: Respects system color preference if user has not selected theme', () => {
    assert(studentHtml.includes("window.matchMedia('(prefers-color-scheme: dark)')"), 'Must check system preference matchMedia');
});

test('TEST 3.3: Theme toggle function persists to localStorage', () => {
    assert(studentHtml.includes("function setTheme("), 'Must define setTheme');
    assert(studentHtml.includes("localStorage.setItem('gabayx_theme', theme)"), 'setTheme must save to localStorage');
    assert(studentHtml.includes("function toggleTheme("), 'Must define toggleTheme');
});

test('TEST 3.4: Theme toggle buttons available on header and sidebar', () => {
    assert(studentHtml.includes('id="theme-toggle-header"'), 'Header must contain theme toggle');
    assert(studentHtml.includes('id="theme-pill-dark"'), 'Sidebar must contain dark pill');
    assert(studentHtml.includes('id="theme-pill-light"'), 'Sidebar must contain light pill');
});

// --- TEST 4: GEOLOCATION & CENTERING ---
console.log('\n--- TEST 4: GEOLOCATION & CENTERING ---');
test('TEST 4.1: My Location button exists on map', () => {
    assert(studentHtml.includes('id="btn-my-location"'), 'My Location button must exist');
    assert(studentHtml.includes('onclick="handleMyLocationClick()"'), 'My location must call handler');
});

test('TEST 4.2: Geolocation API availability check', () => {
    assert(studentHtml.includes("'geolocation' in navigator"), 'Must check navigator.geolocation support');
});

test('TEST 4.3: Loading state displayed during location acquisition', () => {
    assert(studentHtml.includes("locIcon.className = 'fas fa-spinner fa-spin'"), 'Must show spinner icon while locating');
    assert(studentHtml.includes("showToast(\"📍 Finding your location...\")"), 'Must display loading toast message');
});

test('TEST 4.4: Map centers on user coordinates with street-level zoom', () => {
    assert(studentHtml.includes("map.flyTo(latlng, targetZoom"), 'Must center using map.flyTo');
    assert(studentHtml.includes("const targetZoom = Math.max(currentZoom, 17)"), 'Must use zoom 17+ for street level');
});

// --- TEST 5: USER LOCATION MARKER & ACCURACY INDICATOR ---
console.log('\n--- TEST 5: USER LOCATION MARKER & ACCURACY INDICATOR ---');
test('TEST 5.1: Google Maps style pulsing blue dot icon defined', () => {
    assert(studentHtml.includes("user-location-pin"), 'Must define user-location-pin class');
    assert(studentHtml.includes("user-location-pulse"), 'Must define user-location-pulse animation');
    assert(studentHtml.includes("user-location-dot"), 'Must define user-location-dot marker');
    assert(studentHtml.includes("function createGoogleMapsLocationIcon()"), 'Must define createGoogleMapsLocationIcon');
});

test('TEST 5.2: Accuracy circle indicator implemented', () => {
    assert(studentHtml.includes("L.circle(latlng,"), 'Must create L.circle accuracy indicator');
    assert(studentHtml.includes("userAccuracyCircle.setRadius(accuracy)"), 'Must update circle radius dynamically');
});

test('TEST 5.3: Duplicate markers prevented upon multiple clicks', () => {
    assert(studentHtml.includes("if (userLocationMarker)"), 'Must check if userLocationMarker exists');
    assert(studentHtml.includes("userLocationMarker.setLatLng(latlng)"), 'Must update existing marker rather than creating duplicate');
    assert(studentHtml.includes("if (userAccuracyCircle)"), 'Must check if userAccuracyCircle exists');
    assert(studentHtml.includes("userAccuracyCircle.setLatLng(latlng)"), 'Must update existing circle rather than duplicate');
});

// --- TEST 6: GEOLOCATION ERROR HANDLING ---
console.log('\n--- TEST 6: GEOLOCATION ERROR HANDLING ---');
test('TEST 6.1: Permission denied error handling', () => {
    assert(studentHtml.includes("PERMISSION_DENIED"), 'Must handle PERMISSION_DENIED');
    assert(studentHtml.includes("Location permission denied"), 'Must explain how to resolve permission');
});

test('TEST 6.2: Position unavailable error handling', () => {
    assert(studentHtml.includes("POSITION_UNAVAILABLE"), 'Must handle POSITION_UNAVAILABLE');
    assert(studentHtml.includes("Device GPS could not determine your position"), 'Must describe GPS unavailability');
});

test('TEST 6.3: Request timeout error handling', () => {
    assert(studentHtml.includes("TIMEOUT"), 'Must handle TIMEOUT');
    assert(studentHtml.includes("Location request timed out"), 'Must advise retry on timeout');
});

// --- TEST 7: OFFLINE LOCATION SUPPORT ---
console.log('\n--- TEST 7: OFFLINE LOCATION SUPPORT ---');
test('TEST 7.1: Offline location notification communicates device GPS fix', () => {
    assert(studentHtml.includes("Offline GPS position acquired"), 'Must report offline GPS status');
});

test('TEST 7.2: Nearest building math works locally without internet', () => {
    assert(studentHtml.includes("findNearestBuilding(latlng)"), 'Must compute nearest building geometry locally');
    assert(studentHtml.includes("map.distance(userLatLng, b.coords)"), 'Must use local Leaflet coordinate distance');
});

// --- TEST 8: RESPONSIVE LAYOUTS & TOUCH ACCESSIBILITY ---
console.log('\n--- TEST 8: RESPONSIVE LAYOUTS & TOUCH ACCESSIBILITY ---');
test('TEST 8.1: Mobile breakpoint (< 480px) styles defined', () => {
    assert(studentHtml.includes("@media (max-width: 480px)"), 'Must have mobile media query');
    assert(studentHtml.includes("env(safe-area-inset-bottom"), 'Must respect safe-area-inset-bottom');
});

test('TEST 8.2: Tablet breakpoint (>= 768px) docks actions tray nicely', () => {
    assert(studentHtml.includes("@media (min-width: 768px)"), 'Must have tablet media query');
    assert(studentHtml.includes("width: 380px;"), 'Tablet must dock actions tray as floating panel');
});

test('TEST 8.3: Desktop breakpoint (>= 1024px) layout defined', () => {
    assert(studentHtml.includes("@media (min-width: 1024px)"), 'Must have desktop media query');
    assert(studentHtml.includes("width: 420px;"), 'Desktop must constrain actions tray');
});

test('TEST 8.4: Touch targets adhere to accessibility guidelines (>= 40px)', () => {
    assert(studentHtml.includes("width: 44px;"), 'Map control buttons must have 44px target');
    assert(studentHtml.includes("height: 44px;"), 'Map control buttons must have 44px target');
});

test('TEST 8.5: Reduced motion preference respected', () => {
    assert(studentHtml.includes("@media (prefers-reduced-motion: reduce)"), 'Must include prefers-reduced-motion media query');
});

// --- TEST 9: LEAFLET INTEGRATION & MAP CONTROLS ---
console.log('\n--- TEST 9: LEAFLET INTEGRATION & MAP CONTROLS ---');
test('TEST 9.1: Dedicated map controls toolbar with zoom, recenter, layer switch', () => {
    assert(studentHtml.includes('class="map-controls-cluster"'), 'Must have map-controls-cluster');
    assert(studentHtml.includes('id="btn-recenter"'), 'Must have recenter campus button');
    assert(studentHtml.includes('id="btn-map-layer"'), 'Must have map layer toggle button');
    assert(studentHtml.includes('id="btn-zoom-in"'), 'Must have zoom in button');
    assert(studentHtml.includes('id="btn-zoom-out"'), 'Must have zoom out button');
});

test('TEST 9.2: Map resizing handlers recalculate Leaflet dimensions', () => {
    assert(studentHtml.includes("window.addEventListener('resize'"), 'Must listen for window resize');
    assert(studentHtml.includes("map.invalidateSize()"), 'Must call map.invalidateSize()');
    assert(studentHtml.includes("window.addEventListener('orientationchange'"), 'Must handle orientationchange');
});

test('TEST 9.3: Campus buildings and safe zones preserved', () => {
    assert(studentHtml.includes('BUILDINGS = ['), 'Building definitions must remain intact');
    assert(studentHtml.includes('LOCATIONS = {'), 'Safe zone locations must remain intact');
    assert(studentHtml.includes('loadBuildingLabels()'), 'Building labels function must exist');
    assert(studentHtml.includes('updateLabels()'), 'updateLabels function must exist');
});

// --- TEST 10: PWA & SERVICE WORKER CACHING ---
console.log('\n--- TEST 10: PWA & SERVICE WORKER CACHING ---');
test('TEST 10.1: Service Worker tile cache includes OpenStreetMap and Esri satellite', () => {
    assert(swJs.includes('tile.openstreetmap.org'), 'sw.js must cache OpenStreetMap tiles');
    assert(swJs.includes('arcgisonline.com'), 'sw.js must cache Esri satellite tiles');
});

test('TEST 10.2: Web App Manifest valid and intact', () => {
    const manifest = JSON.parse(manifestJson);
    assert(manifest.name.includes('GabayX'), 'Manifest name valid');
    assert(manifest.display === 'standalone', 'Standalone display preserved');
});

// --- TEST 11: OFFLINE MODALS & INCIDENT REPORTING THEMED ---
console.log('\n--- TEST 11: OFFLINE MODALS & INCIDENT REPORTING THEMED ---');
test('TEST 11.1: offline-ui.js uses theme variables for modals', () => {
    assert(offlineUiJs.includes('var(--modal-bg,'), 'Modal card must use var(--modal-bg)');
    assert(offlineUiJs.includes('var(--text-main,'), 'Modal text must use var(--text-main)');
    assert(offlineUiJs.includes('var(--bg-input,'), 'Form inputs must use var(--bg-input)');
});

test('TEST 11.2: Emergency reporting functions preserved', () => {
    assert(studentHtml.includes('function markAsDanger()'), 'Emergency SOS function preserved');
    assert(studentHtml.includes('function markAsSafe()'), 'Mark as safe function preserved');
    assert(studentHtml.includes('function sendNote()'), 'Send note function preserved');
});

console.log('\n================================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
console.log('================================================================\n');

if (passedTests === totalTests) {
    process.exit(0);
} else {
    process.exit(1);
}
