const fs = require('fs');
const assert = require('assert');

console.log('--- VERIFYING EMERGENCY HOTLINES INTEGRATION ---');

const studentHtml = fs.readFileSync('public/student.html', 'utf8');
const offlineUiJs = fs.readFileSync('public/js/offline-ui.js', 'utf8');
const dbJs = fs.readFileSync('public/js/db.js', 'utf8');

const requiredHotlines = [
    { name: 'SSMO', num: '(064) 572 2100', tel: '0645722100' },
    { name: 'PNP', num: '0939-339-3168', tel: '09393393168' },
    { name: 'BFP', num: '0910-048-9571', tel: '09100489571' },
    { name: 'AFP 90th Infantry Battalion', num: '0956-443-0948', tel: '09564430948' },
    { name: 'MDRRM', num: '0910-363-3864', tel: '09103633864' },
    { name: 'RHU', num: '0926-397-0496', tel: '09263970496' }
];

// Check student.html
requiredHotlines.forEach(h => {
    assert(studentHtml.includes(`href="tel:${h.tel}"`), `student.html missing tel link for ${h.name}`);
    assert(studentHtml.includes(h.num), `student.html missing formatted number for ${h.name}`);
});
console.log('[PASS] student.html contains all 6 hotlines with active tel links.');

// Check offline-ui.js
requiredHotlines.forEach(h => {
    assert(offlineUiJs.includes(`href="tel:${h.tel}"`), `offline-ui.js missing tel link for ${h.name}`);
    assert(offlineUiJs.includes(h.num), `offline-ui.js missing formatted number for ${h.name}`);
});
assert(offlineUiJs.includes('openInfoModal'), 'offline-ui.js must define openInfoModal');
assert(offlineUiJs.includes('closeInfoModal'), 'offline-ui.js must define closeInfoModal');
assert(offlineUiJs.includes('id="gx-info-modal"'), 'offline-ui.js must have gx-info-modal backdrop element');
console.log('[PASS] offline-ui.js contains hotline modal with all 6 hotlines and exported open/close modal handlers.');

// Check db.js
requiredHotlines.forEach(h => {
    assert(dbJs.includes(h.num), `db.js missing number for ${h.name}`);
    assert(dbJs.includes(h.tel), `db.js missing tel for ${h.name}`);
});
console.log('[PASS] db.js seeds all 6 official hotlines in IndexedDB cache.');

console.log('ALL HOTLINE CHECKS PASSED SUCCESSFULLY!');
