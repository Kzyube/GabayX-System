/**
 * Verification Script: Targeted Private Two-Way Messaging
 * Validates that MDRRMO Dispatch replies are unique to each user and NOT broadcast to all.
 */

const assert = require('assert');
const { io } = require('../mobile-app/node_modules/socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3004';

async function testTargetedReplies() {
  console.log('================================================================');
  console.log('VERIFYING TARGETED PRIVATE TWO-WAY MESSAGING (MDRRMO <-> USER)');
  console.log('================================================================\n');

  const clientA_Id = 'RESIDENT-UNIT-ALPHA-' + Math.floor(Math.random() * 1000);
  const clientB_Id = 'RESIDENT-UNIT-BRAVO-' + Math.floor(Math.random() * 1000);

  console.log(`Connecting Client A (${clientA_Id})...`);
  const socketA = io(BACKEND_URL);

  console.log(`Connecting Client B (${clientB_Id})...`);
  const socketB = io(BACKEND_URL);

  console.log(`Connecting Admin Dispatcher...`);
  const adminSocket = io(BACKEND_URL);

  await Promise.all([
    new Promise((resolve) => socketA.on('connect', resolve)),
    new Promise((resolve) => socketB.on('connect', resolve)),
    new Promise((resolve) => adminSocket.on('connect', resolve)),
  ]);

  console.log('[PASS] All 3 sockets connected to backend.');

  // Register with retry bursts to accommodate backend database startup
  const registerAll = () => {
    socketA.emit('register-student', clientA_Id);
    socketB.emit('register-student', clientB_Id);
    socketA.emit('register-resident', clientA_Id);
    socketB.emit('register-resident', clientB_Id);
  };
  registerAll();
  setTimeout(registerAll, 500);
  setTimeout(registerAll, 1200);

  // Give server 1.5s to ensure room joined
  await new Promise((r) => setTimeout(r, 1600));

  let clientAReceived = null;
  let clientBReceived = null;

  socketA.on('receive-reply', (data) => {
    clientAReceived = data;
  });

  socketB.on('receive-reply', (data) => {
    clientBReceived = data;
  });

  const testMessage = 'MDRRMO Rescue Unit 1 is en route to your position. Stay calm.';
  console.log(`Admin replying specifically to Client A (${clientA_Id})...`);
  adminSocket.emit('admin-reply', {
    targetId: clientA_Id,
    message: testMessage,
  });

  // Wait 2 seconds for message routing
  await new Promise((r) => setTimeout(r, 2000));

  assert(clientAReceived !== null, 'Client A MUST receive the admin reply');
  assert(clientAReceived.message === testMessage, 'Client A must receive exact message text');
  console.log(`[PASS] Client A received private message: "${clientAReceived.message}"`);

  assert(clientBReceived === null, 'Client B MUST NOT receive Client A private message!');
  console.log('[PASS] Client B did NOT receive the message (verified private and unique per user)');

  socketA.disconnect();
  socketB.disconnect();
  adminSocket.disconnect();

  console.log('\n================================================================');
  console.log('TARGETED TWO-WAY MESSAGING VERIFICATION: 100% PASSED');
  console.log('================================================================\n');
}

testTargetedReplies().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
