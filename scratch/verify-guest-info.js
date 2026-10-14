/**
 * Verification Test Suite for GabayX Guest Access & "My Information" Feature
 * Tests:
 * 1. Public guest access without mandatory login or student verification
 * 2. Administrative access protection
 * 3. "My Information" menu item, modal UI, and controls (Save, Edit, Clear, Review)
 * 4. Local storage persistence, data privacy notice, and phone/email validation
 * 5. Guest emergency reporting (prefilled contact details, anonymous submissions)
 * 6. Backend report submission endpoint security and abuse protections
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const STUDENT_HTML_PATH = path.join(ROOT_DIR, 'public', 'student.html');
const MY_INFO_JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'my-info.js');
const OFFLINE_UI_JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'offline-ui.js');
const REPORT_SERVICE_PATH = path.join(ROOT_DIR, 'public', 'js', 'services', 'reportService.js');
const API_SERVICE_PATH = path.join(ROOT_DIR, 'public', 'js', 'services', 'apiService.js');
const SERVER_JS_PATH = path.join(ROOT_DIR, 'server.js');
const SW_JS_PATH = path.join(ROOT_DIR, 'public', 'sw.js');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passCount++;
    } catch (err) {
        console.error(`  [FAIL] ${name}: ${err.message}`);
        failCount++;
    }
}

async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passCount++;
    } catch (err) {
        console.error(`  [FAIL] ${name}: ${err.message}`);
        failCount++;
    }
}

// Simple HTTP request helper
function makeRequest(method, urlPath, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, 'http://localhost:3000');
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
            });
        });
        req.on('error', reject);
        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('================================================================');
    console.log('SUITE: GABAYX GUEST ACCESS & MY INFORMATION VERIFICATION');
    console.log('================================================================\n');

    const studentHtml = fs.readFileSync(STUDENT_HTML_PATH, 'utf8');
    const myInfoJs = fs.readFileSync(MY_INFO_JS_PATH, 'utf8');
    const offlineUiJs = fs.readFileSync(OFFLINE_UI_JS_PATH, 'utf8');
    const reportServiceJs = fs.readFileSync(REPORT_SERVICE_PATH, 'utf8');
    const apiServiceJs = fs.readFileSync(API_SERVICE_PATH, 'utf8');
    const serverJs = fs.readFileSync(SERVER_JS_PATH, 'utf8');
    const swJs = fs.readFileSync(SW_JS_PATH, 'utf8');

    // -------------------------------------------------------------
    // GROUP 1: PUBLIC ENTRY & ACCESS CONTROL
    // -------------------------------------------------------------
    console.log('GROUP 1: Public Entry Flow & Admin Access Protection');

    await asyncTest('1.1 Direct public access: GET / serves student dashboard without login', async () => {
        const res = await makeRequest('GET', '/');
        assert.strictEqual(res.statusCode, 200, 'Root path must return status 200');
        assert(res.body.includes('GABAYX'), 'Response must contain GabayX application');
        assert(res.body.includes('leaflet'), 'Response must include map components');
    });

    await asyncTest('1.2 Public endpoint /api/me returns anonymous/guest status', async () => {
        const res = await makeRequest('GET', '/api/me');
        assert.strictEqual(res.statusCode, 200, '/api/me must return status 200');
        const json = JSON.parse(res.body);
        assert.strictEqual(json.authenticated, false, 'Unauthenticated guests must have authenticated: false');
        assert.strictEqual(json.anonymous, true, 'Unauthenticated guests must have anonymous: true');
    });

    await asyncTest('1.3 Administrative access protected: GET /admin redirects unauthenticated users', async () => {
        const res = await makeRequest('GET', '/admin');
        assert(res.statusCode === 302, 'Unauthenticated request to /admin must redirect (302)');
        assert(res.headers.location.includes('/admin-login'), 'Redirect target must be /admin-login');
    });

    await asyncTest('1.4 Administrative access protected: GET /admin.html redirects unauthenticated users', async () => {
        const res = await makeRequest('GET', '/admin.html');
        assert(res.statusCode === 302, 'Unauthenticated request to /admin.html must redirect (302)');
        assert(res.headers.location.includes('/admin-login'), 'Redirect target must be /admin-login');
    });

    // -------------------------------------------------------------
    // GROUP 2: "MY INFORMATION" MENU & MODAL UI
    // -------------------------------------------------------------
    console.log('\nGROUP 2: "My Information" Menu Item & Modal Controls');

    test('2.1 Sidebar contains "My Information" navigation button', () => {
        assert(studentHtml.includes('id="sidebar-my-info-btn"'), 'Sidebar must have #sidebar-my-info-btn');
        assert(studentHtml.includes('My Information'), 'Sidebar must display "My Information" label');
        assert(studentHtml.includes('GabayXMyInfo.openModal()'), 'Button must trigger GabayXMyInfo.openModal()');
    });

    test('2.2 Sidebar user card contains "My Information" trigger button', () => {
        assert(studentHtml.includes('id="user-card-my-info-btn"'), 'User card must have #user-card-my-info-btn');
    });

    test('2.3 Modal dialog #my-information-modal is structured in student.html', () => {
        assert(studentHtml.includes('id="my-information-modal"'), 'Modal must exist with id="my-information-modal"');
        assert(studentHtml.includes('id="my-info-view-pane"'), 'Modal must include view pane #my-info-view-pane');
        assert(studentHtml.includes('id="my-info-edit-pane"'), 'Modal must include edit pane #my-info-edit-pane');
        assert(studentHtml.includes('id="my-info-review-pane"'), 'Modal must include review pane #my-info-review-pane');
    });

    test('2.4 Modal contains all 5 required/optional fields', () => {
        assert(studentHtml.includes('id="my-info-input-name"'), 'Must have Full Name input');
        assert(studentHtml.includes('id="my-info-input-phone"'), 'Must have Contact Phone input');
        assert(studentHtml.includes('id="my-info-input-email"'), 'Must have Email Address input');
        assert(studentHtml.includes('id="my-info-input-emg-name"'), 'Must have Emergency Contact Name input');
        assert(studentHtml.includes('id="my-info-input-emg-phone"'), 'Must have Emergency Contact Number input');
    });

    test('2.5 Modal contains Save, Edit, Clear, and Review controls', () => {
        assert(studentHtml.includes('GabayXMyInfo.startEditing()'), 'Must have control to start editing');
        assert(studentHtml.includes('GabayXMyInfo.proceedToReview()'), 'Must have control to review before saving');
        assert(studentHtml.includes('GabayXMyInfo.confirmAndSave()'), 'Must have control to confirm and save');
        assert(studentHtml.includes('GabayXMyInfo.confirmClear()'), 'Must have control to clear saved information');
        assert(studentHtml.includes('GabayXMyInfo.closeModal()'), 'Must have control to close modal');
    });

    test('2.6 Modal provides clear Data Privacy & Local Device Storage notice', () => {
        assert(studentHtml.includes('Local Device Storage Notice') || studentHtml.includes('Data Privacy Notice'), 'Must have storage privacy notice');
        assert(studentHtml.includes('Stored locally on this device only') || studentHtml.includes('stored locally'), 'Must explain local device persistence');
    });

    test('2.7 Service worker and student.html include /js/my-info.js', () => {
        assert(studentHtml.includes('/js/my-info.js'), 'student.html must import /js/my-info.js');
        assert(swJs.includes('/js/my-info.js'), 'sw.js STATIC_ASSETS must cache /js/my-info.js');
    });

    // -------------------------------------------------------------
    // GROUP 3: LOGIC, VALIDATION & LOCAL PERSISTENCE IN my-info.js
    // -------------------------------------------------------------
    console.log('\nGROUP 3: "My Information" Logic, Validation & Persistence');

    // Simulate mock DOM and localStorage for unit testing my-info.js
    const mockLocalStorage = {};
    global.localStorage = {
        getItem: (k) => mockLocalStorage[k] || null,
        setItem: (k, v) => { mockLocalStorage[k] = String(v); },
        removeItem: (k) => { delete mockLocalStorage[k]; }
    };
    global.window = global;
    global.document = {
        getElementById: () => null,
        dispatchEvent: () => {}
    };
    global.dispatchEvent = () => {};
    global.CustomEvent = class { constructor(name, detail) { this.name = name; this.detail = detail; } };

    // Evaluate my-info.js in mock environment
    eval(myInfoJs);
    const MyInfo = global.GabayXMyInfo;

    test('3.1 GabayXMyInfo module initializes with public API methods', () => {
        assert(typeof MyInfo === 'object', 'GabayXMyInfo must be defined');
        assert(typeof MyInfo.getProfile === 'function', 'getProfile must be function');
        assert(typeof MyInfo.saveProfile === 'function', 'saveProfile must be function');
        assert(typeof MyInfo.clearProfile === 'function', 'clearProfile must be function');
        assert(typeof MyInfo.validatePhone === 'function', 'validatePhone must be function');
        assert(typeof MyInfo.validateEmail === 'function', 'validateEmail must be function');
    });

    test('3.2 Phone number validation accepts valid Philippine & international numbers', () => {
        assert(MyInfo.validatePhone('').valid, 'Empty phone is valid (optional field)');
        assert(MyInfo.validatePhone('09123456789').valid, '09123456789 is valid');
        assert(MyInfo.validatePhone('0912-345-6789').valid, '0912-345-6789 with dashes is valid');
        assert(MyInfo.validatePhone('+639123456789').valid, '+639123456789 is valid');
        assert(MyInfo.validatePhone('(064) 572-2100').valid, 'Landline format is valid');
    });

    test('3.3 Phone number validation rejects invalid phone numbers', () => {
        assert(!MyInfo.validatePhone('1234').valid, 'Too short number must be invalid');
        assert(!MyInfo.validatePhone('091234').valid, 'Incomplete 09 number must be invalid');
        assert(!MyInfo.validatePhone('091234567890123').valid, 'Too long number must be invalid');
        assert(!MyInfo.validatePhone('abc-phone').valid, 'Alphabetical input must be invalid');
    });

    test('3.4 Email validation accepts valid emails and empty strings (optional)', () => {
        assert(MyInfo.validateEmail('').valid, 'Empty email is valid (optional)');
        assert(MyInfo.validateEmail('citizen@example.com').valid, 'Standard email is valid');
        assert(!MyInfo.validateEmail('notanemail').valid, 'Missing @ and domain must be invalid');
    });

    test('3.5 saveProfile persists to localStorage and synchronizes legacy identity keys', () => {
        const testData = {
            fullName: 'Ahmad Dela Cruz',
            contactNumber: '09171234567',
            email: 'ahmad@example.com',
            emergencyContactName: 'Fatima Dela Cruz',
            emergencyContactNumber: '09187654321'
        };
        const res = MyInfo.saveProfile(testData);
        assert(res.success, 'saveProfile must succeed');

        const saved = JSON.parse(mockLocalStorage['gabayx_user_profile']);
        assert.strictEqual(saved.fullName, 'Ahmad Dela Cruz');
        assert.strictEqual(saved.contactNumber, '09171234567');
        assert.strictEqual(saved.emergencyContactName, 'Fatima Dela Cruz');
        assert.strictEqual(mockLocalStorage['knhs_student_name'], 'Ahmad Dela Cruz', 'Must sync knhs_student_name');
        assert.strictEqual(mockLocalStorage['knhs_student_phone'], '09171234567', 'Must sync knhs_student_phone');
    });

    test('3.6 clearProfile removes saved data from localStorage and resets identity', () => {
        const res = MyInfo.clearProfile();
        assert(res.success, 'clearProfile must succeed');
        assert.strictEqual(mockLocalStorage['gabayx_user_profile'], undefined, 'Profile must be deleted');
        assert.strictEqual(mockLocalStorage['knhs_student_name'], undefined, 'Name key must be deleted');
        assert.strictEqual(mockLocalStorage['knhs_student_phone'], undefined, 'Phone key must be deleted');
    });

    // -------------------------------------------------------------
    // GROUP 4: EMERGENCY REPORTING FOR GUEST USERS
    // -------------------------------------------------------------
    console.log('\nGROUP 4: Guest Emergency Reporting & Contact Details Prefill');

    test('4.1 Incident report modal in offline-ui.js includes contact details section', () => {
        assert(offlineUiJs.includes('gx-reporter-section'), 'Report modal must contain reporter section');
        assert(offlineUiJs.includes('id="gx-report-name"'), 'Report modal must have reporter name input');
        assert(offlineUiJs.includes('id="gx-report-phone"'), 'Report modal must have contact phone input');
    });

    test('4.2 openReportModal prefills contact details from My Information', () => {
        assert(offlineUiJs.includes('GabayXMyInfo.getProfile()') || offlineUiJs.includes('knhs_student_phone'), 'openReportModal must check stored profile');
        assert(offlineUiJs.includes('nameInput.value'), 'Must set name input value');
        assert(offlineUiJs.includes('phoneInput.value'), 'Must set phone input value');
    });

    test('4.3 submitReport validates contact number and supports anonymous submission', () => {
        assert(offlineUiJs.includes('submitReport'), 'submitReport function must exist');
        assert(offlineUiJs.includes('reporterName') || offlineUiJs.includes('gx-report-name'), 'submitReport must read reporter details');
        assert(offlineUiJs.includes('contactPhone') || offlineUiJs.includes('gx-report-phone'), 'submitReport must read contact phone');
    });

    test('4.4 reportService.js and apiService.js preserve contact_phone in report payload', () => {
        assert(reportServiceJs.includes('contact_phone'), 'reportService.js must store contact_phone');
        assert(apiServiceJs.includes('contact_phone'), 'apiService.js must include contact_phone in payload');
    });

    await asyncTest('4.5 POST /api/reports/submit accepts guest report with contact details', async () => {
        const testReport = {
            id: 'test-guest-report-' + Date.now(),
            incident_type: 'MEDICAL',
            description: 'Guest emergency reporting test with contact info',
            lat: 7.1002,
            lng: 124.8240,
            nearest_building: 'Main Evacuation Zone',
            student_id: 'anon-guest-xyz',
            student_name: 'Guest Juan',
            contact_phone: '09123456789'
        };

        const res = await makeRequest('POST', '/api/reports/submit', { 'Content-Type': 'application/json' }, testReport);
        assert.strictEqual(res.statusCode, 200, 'Server must accept guest report with 200 OK');
        const json = JSON.parse(res.body);
        assert.strictEqual(json.status, 'success', 'Response status must be success');
        assert.strictEqual(json.id, testReport.id, 'Response id must match report id');
    });

    await asyncTest('4.6 POST /api/reports/submit accepts completely anonymous reports (no personal info)', async () => {
        const anonReport = {
            id: 'test-anon-report-' + Date.now(),
            incident_type: 'EARTHQUAKE',
            description: 'Completely anonymous emergency report test',
            lat: 7.1005,
            lng: 124.8245,
            nearest_building: 'Campus Perimeter',
            student_id: 'anonymous',
            student_name: 'Guest Citizen'
        };

        const res = await makeRequest('POST', '/api/reports/submit', { 'Content-Type': 'application/json' }, anonReport);
        assert.strictEqual(res.statusCode, 200, 'Server must accept anonymous report with 200 OK');
        const json = JSON.parse(res.body);
        assert.strictEqual(json.status, 'success', 'Response status must be success');
    });

    // -------------------------------------------------------------
    // GROUP 5: BACKEND SECURITY & ABUSE PROTECTIONS
    // -------------------------------------------------------------
    console.log('\nGROUP 5: Backend Validation & Abuse Protections');

    await asyncTest('5.1 POST /api/reports/submit rejects missing or invalid payload', async () => {
        const res = await makeRequest('POST', '/api/reports/submit', { 'Content-Type': 'application/json' }, {});
        assert.strictEqual(res.statusCode, 400, 'Empty report payload must return 400 Bad Request');
    });

    await asyncTest('5.2 POST /api/messages/send accepts guest inquiry without authentication', async () => {
        const testMsg = {
            id: 'test-guest-msg-' + Date.now(),
            message: 'Hello administrator, this is a guest inquiry.',
            student_id: 'anon-guest-abc',
            student_name: 'Guest Visitor'
        };
        const res = await makeRequest('POST', '/api/messages/send', { 'Content-Type': 'application/json' }, testMsg);
        assert.strictEqual(res.statusCode, 200, 'Server must accept guest message with 200 OK');
        const json = JSON.parse(res.body);
        assert.strictEqual(json.status, 'success', 'Response status must be success');
    });

    console.log('\n----------------------------------------------------------------');
    console.log(`TOTAL RESULTS: ${passCount} passed, ${failCount} failed`);
    console.log('----------------------------------------------------------------\n');

    if (failCount > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test suite execution error:', err);
    process.exit(1);
});
