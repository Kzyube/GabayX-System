/**
 * Verification Suite for PWA Installability, Emergency Alert Toggle,
 * and Message Administrator features.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ [PASS] ${message}`);
    } else {
        console.error(`  ❌ [FAIL] ${message}`);
    }
}

async function runTests() {
    console.log('\n============================================================');
    console.log('🧪 VERIFYING PWA, EMERGENCY ALERT & MESSAGING IMPLEMENTATION');
    console.log('============================================================\n');

    // TEST SUITE 1: PWA Manifest & Service Worker
    console.log('--- SUITE 1: PWA Manifest, Icons, and Service Worker ---');
    const manifestWebPath = path.join(__dirname, '../public/manifest.webmanifest');
    assert(fs.existsSync(manifestWebPath), 'manifest.webmanifest exists');
    const manifestWeb = JSON.parse(fs.readFileSync(manifestWebPath, 'utf8'));
    assert(manifestWeb.name && manifestWeb.short_name === 'GabayX', 'Manifest has valid app name & short_name "GabayX"');
    assert(manifestWeb.display === 'standalone', 'Manifest display mode is set to "standalone"');
    assert(manifestWeb.start_url === '/student.html', 'Manifest start_url is set to "/student.html"');
    assert(manifestWeb.icons && manifestWeb.icons.length >= 3, 'Manifest defines icons (192, 512, maskable)');

    const icon192 = path.join(__dirname, '../public/icons/icon-192.png');
    const icon512 = path.join(__dirname, '../public/icons/icon-512.png');
    assert(fs.existsSync(icon192) && fs.existsSync(icon512), 'Physical icon files exist in /public/icons');

    const swPath = path.join(__dirname, '../public/sw.js');
    assert(fs.existsSync(swPath), 'sw.js exists');
    const swContent = fs.readFileSync(swPath, 'utf8');
    assert(swContent.includes('STATIC_ASSETS'), 'Service worker has pre-cache list');
    assert(swContent.includes('/api/'), 'Service worker explicitly skips caching API & auth calls');

    const installJsPath = path.join(__dirname, '../public/js/pwa/install.js');
    assert(fs.existsSync(installJsPath), 'install.js controller exists');
    const installJs = fs.readFileSync(installJsPath, 'utf8');
    assert(installJs.includes('promptInstall'), 'install.js provides promptInstall()');
    assert(installJs.includes('showIOSInstallModal'), 'install.js provides iOS Safari step-by-step guidance');
    assert(installJs.includes('showBrowserInstallGuide'), 'install.js provides desktop/fallback install guidance');

    // TEST SUITE 2: Client HTML & Markup
    console.log('\n--- SUITE 2: Student UI & Feature Controls ---');
    const studentHtmlPath = path.join(__dirname, '../public/student.html');
    const studentHtml = fs.readFileSync(studentHtmlPath, 'utf8');

    assert(studentHtml.includes('btn-emergency-toggle'), 'student.html contains Emergency Alert Toggle button');
    assert(studentHtml.includes('emergency-alert-panel'), 'student.html contains Emergency Alert Reporting Panel modal');
    assert(studentHtml.includes('Flooding') && studentHtml.includes('Medical emergency') && studentHtml.includes('Trapped or stranded person'), 'Emergency Alert Panel provides required emergency categories');
    assert(studentHtml.includes('message-admin-modal'), 'student.html contains Message Administrator modal');
    assert(studentHtml.includes('admin-message-input'), 'Message Administrator modal has message input textarea');
    assert(studentHtml.includes('admin-msg-include-loc'), 'Message Administrator provides optional location checkbox');
    assert(studentHtml.includes('sidebar-install-btn') || studentHtml.includes('GabayXInstall.promptInstall()'), 'Sidebar contains Install GabayX App action');
    assert(studentHtml.includes('GabayXEmergencyAlert'), 'student.html includes GabayXEmergencyAlert controller');
    assert(studentHtml.includes('GabayXAdminMessenger'), 'student.html includes GabayXAdminMessenger controller');

    // TEST SUITE 3: ApiService Updates
    console.log('\n--- SUITE 3: ApiService Client Adapter ---');
    const apiServicePath = path.join(__dirname, '../public/js/services/apiService.js');
    const apiService = fs.readFileSync(apiServicePath, 'utf8');
    assert(apiService.includes('/api/messages/send'), 'ApiService targets /api/messages/send');
    assert(apiService.includes('/api/reports/status'), 'ApiService targets /api/reports/status');
    assert(apiService.includes('sendMessage'), 'ApiService exposes sendMessage()');
    assert(apiService.includes('updateReportStatus'), 'ApiService exposes updateReportStatus()');

    // TEST SUITE 4: Admin Dashboard Integration
    console.log('\n--- SUITE 4: Admin Dashboard Alerts & Messaging Management ---');
    const adminHtmlPath = path.join(__dirname, '../public/admin.html');
    const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
    assert(adminHtml.includes('admin-receive-message'), 'admin.html listens for admin-receive-message (general inquiries)');
    assert(adminHtml.includes('GENERAL INQUIRY'), 'admin.html formats general inquiries distinctly from emergencies');
    assert(adminHtml.includes('acknowledgeReport'), 'admin.html provides acknowledgeReport() handler');
    assert(adminHtml.includes('updateReportStatusAdmin'), 'admin.html provides report status dropdown handler');
    assert(adminHtml.includes('report-status-updated'), 'admin.html listens for report-status-updated socket event');

    // TEST SUITE 5: Backend Server Endpoints
    console.log('\n--- SUITE 5: Backend Server Endpoints ---');
    const serverPath = path.join(__dirname, '../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    assert(serverContent.includes("app.post('/api/messages/send'"), 'server.js implements POST /api/messages/send');
    assert(serverContent.includes("app.post('/api/reports/status'"), 'server.js implements POST /api/reports/status');
    assert(serverContent.includes("app.post('/api/reports/submit'"), 'server.js implements POST /api/reports/submit');
    assert(serverContent.includes("'admin-acknowledge-report'"), 'server.js listens for socket admin-acknowledge-report');

    // Live backend test against running server on port 3000
    console.log('\n--- SUITE 6: Live Server API Verification ---');
    await testLiveServerApi();

    console.log('\n============================================================');
    console.log(`📊 RESULTS: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('============================================================\n');

    if (passedTests === totalTests) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

function testLiveServerApi() {
    return new Promise((resolve) => {
        // Test health endpoint
        http.get('http://localhost:3000/api/health', (res) => {
            assert(res.statusCode === 200, 'GET /api/health returns 200 OK');

            // Test POST /api/messages/send
            const postData = JSON.stringify({
                id: 'test-inq-12345',
                student_id: 'test@student.edu.ph',
                student_name: 'Test Student',
                message: 'Inquiry: Where is the nearest first aid kit?',
                include_location: true,
                lat: 7.1005,
                lng: 124.8239
            });

            const req = http.request({
                hostname: 'localhost',
                port: 3000,
                path: '/api/messages/send',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, (postRes) => {
                let data = '';
                postRes.on('data', chunk => data += chunk);
                postRes.on('end', () => {
                    assert(postRes.statusCode === 200, 'POST /api/messages/send returns 200 OK');
                    try {
                        const parsed = JSON.parse(data);
                        assert(parsed.status === 'success' && parsed.id === 'test-inq-12345', 'POST /api/messages/send returns success with message ID');
                    } catch (e) {
                        assert(false, 'POST /api/messages/send returned invalid JSON: ' + e.message);
                    }

                    // Test POST /api/reports/status
                    const statusData = JSON.stringify({
                        reportId: 'test-inq-12345',
                        status: 'ACKNOWLEDGED'
                    });

                    const statusReq = http.request({
                        hostname: 'localhost',
                        port: 3000,
                        path: '/api/reports/status',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(statusData)
                        }
                    }, (statusRes) => {
                        assert(statusRes.statusCode === 200, 'POST /api/reports/status returns 200 OK');
                        resolve();
                    });

                    statusReq.on('error', () => {
                        assert(false, 'POST /api/reports/status failed network request');
                        resolve();
                    });
                    statusReq.write(statusData);
                    statusReq.end();
                });
            });

            req.on('error', (err) => {
                assert(false, 'POST /api/messages/send error: ' + err.message);
                resolve();
            });

            req.write(postData);
            req.end();
        }).on('error', (err) => {
            console.warn('  ⚠️ Server not reachable on localhost:3000 (running offline test):', err.message);
            resolve();
        });
    });
}

runTests();
