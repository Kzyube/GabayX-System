/**
 * Verification Script: Real-Time Mobile Disaster Broadcast System
 * Validates Socket.io alert listener, Banner rendering, and Render cloud connection.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { io } = require('../mobile-app/node_modules/socket.io-client');

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

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

async function runAll() {
  console.log('================================================================');
  console.log('GABAYX VERIFICATION: REAL-TIME MOBILE DISASTER BROADCAST SYSTEM');
  console.log('================================================================\n');

  const alertServicePath = path.join(__dirname, '../mobile-app/src/services/alertService.ts');
  const alertBannerPath = path.join(__dirname, '../mobile-app/src/components/DisasterAlertBanner.tsx');
  const appTsxPath = path.join(__dirname, '../mobile-app/App.tsx');
  const packageJsonPath = path.join(__dirname, '../mobile-app/package.json');

  const alertServiceContent = fs.readFileSync(alertServicePath, 'utf8');
  const alertBannerContent = fs.readFileSync(alertBannerPath, 'utf8');
  const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');
  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');

  // --- SUITE 1: DEPENDENCIES & SERVICE CONTRACT ---
  console.log('--- SUITE 1: DEPENDENCIES & SERVICE CONTRACT ---');

  test('TEST 1.1: socket.io-client is declared in mobile-app/package.json', () => {
    const pkg = JSON.parse(packageJsonContent);
    assert(pkg.dependencies['socket.io-client'], 'socket.io-client must be installed in mobile-app');
  });

  test('TEST 1.2: alertService connects to Render backend with reconnection and websocket transport', () => {
    assert(alertServiceContent.includes('gabayx-system.onrender.com'), 'Must default to Render endpoint');
    assert(alertServiceContent.includes('transports: [\'websocket\', \'polling\']'), 'Must support websocket & polling');
    assert(alertServiceContent.includes('reconnection: true'), 'Must enable auto reconnection');
  });

  test('TEST 1.3: alertService listens to receive-alert and triggers emergency vibration', () => {
    assert(alertServiceContent.includes("receive-alert"), 'Must listen for receive-alert from Incident Command');
    assert(alertServiceContent.includes('Vibration.vibrate'), 'Must trigger tactile vibration pattern');
    assert(alertServiceContent.includes('SAFE') && alertServiceContent.includes('CLEAR'), 'Must handle SAFE and CLEAR triggers');
  });

  test('TEST 1.4: alertService fetches active disaster history on startup', () => {
    assert(alertServiceContent.includes('/api/disaster-history'), 'Must fetch disaster history endpoint');
    assert(alertServiceContent.includes('fetchActiveDisaster'), 'Must export fetchActiveDisaster helper');
  });

  // --- SUITE 2: HIGH-VISIBILITY BANNER COMPONENT ---
  console.log('\n--- SUITE 2: HIGH-VISIBILITY BANNER COMPONENT ---');

  test('TEST 2.1: DisasterAlertBanner handles distinct disaster icons and colors', () => {
    assert(alertBannerContent.includes('EARTHQUAKE'), 'Must recognize EARTHQUAKE');
    assert(alertBannerContent.includes('FIRE'), 'Must recognize FIRE');
    assert(alertBannerContent.includes('FLOOD'), 'Must recognize FLOOD');
    assert(alertBannerContent.includes('SUPPLY'), 'Must recognize SUPPLY');
  });

  test('TEST 2.2: DisasterAlertBanner supports both full announcement and minimized pill mode', () => {
    assert(alertBannerContent.includes('isMinimized'), 'Must have isMinimized state');
    assert(alertBannerContent.includes('minimizedPill'), 'Must provide minimized style');
    assert(alertBannerContent.includes('onPressViewMap'), 'Must provide direct route viewing button');
  });

  // --- SUITE 3: APP INTEGRATION & SOCKET LIFECYCLE ---
  console.log('\n--- SUITE 3: APP INTEGRATION & SOCKET LIFECYCLE ---');

  test('TEST 3.1: App.tsx initializes alertService and manages activeAlert state', () => {
    assert(appTsxContent.includes('alertService.connect()'), 'App must connect alertService');
    assert(appTsxContent.includes('alertService.subscribeAlert'), 'App must subscribe to alerts');
    assert(appTsxContent.includes('alertService.subscribeClear'), 'App must subscribe to clear events');
    assert(appTsxContent.includes('<DisasterAlertBanner'), 'App must render DisasterAlertBanner');
  });

  test('TEST 3.2: App.tsx shows live socket connection status dot in header', () => {
    assert(appTsxContent.includes('isSocketConnected'), 'Must track socket connection state');
    assert(appTsxContent.includes('statusDotLive'), 'Must render live status dot');
    assert(appTsxContent.includes('statusDotOffline'), 'Must render offline status dot');
  });

  // --- SUITE 4: LIVE RENDER CLOUD SOCKET TEST ---
  console.log('\n--- SUITE 4: LIVE RENDER CLOUD SOCKET TEST ---');

  await runAsyncTest('TEST 4.1: Render backend Socket.io accepts connection and emits log-history', async () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket connection timed out after 7000ms'));
      }, 7000);

      const socket = io('https://gabayx-system.onrender.com', {
        transports: ['websocket', 'polling'],
        timeout: 5000,
      });

      socket.on('connect', () => {
        // Socket successfully connected to Render backend
      });

      socket.on('log-history', (logs) => {
        clearTimeout(timeout);
        assert(Array.isArray(logs), 'log-history must be an array of disaster logs');
        socket.disconnect();
        resolve();
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        socket.disconnect();
        reject(err);
      });
    });
  });

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
