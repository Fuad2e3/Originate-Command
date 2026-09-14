const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./harness.js');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  FILTER BAR LAYOUT & DEPARTMENT LOCKING ALIGNMENT TEST SUITE      ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// 1. Check CSS for .filters alignment
const compCssPath = path.join(__dirname, '../assets/css/04-components.css');
const compCss = fs.readFileSync(compCssPath, 'utf8');

assert.ok(compCss.includes('align-items: start;'), '.filters CSS must use align-items: start for proper top-alignment of field labels');
assert.ok(compCss.includes('.filters .field .chip'), '.filters .field .chip CSS rules must exist for overflow truncation');
console.log('  ✓ Verified 04-components.css uses align-items: start and chip overflow handling');

// 2. Check board.js for locked department select rendering
const boardJsPath = path.join(__dirname, '../assets/js/board.js');
const boardJs = fs.readFileSync(boardJsPath, 'utf8');

assert.ok(
  boardJs.includes('OC.ui.select([{ value: depts[0].id, label: depts[0].name }], depts[0].id, { disabled: true'),
  'board.js must render locked department as a disabled select control matching filter bar dimensions'
);
console.log('  ✓ Verified board.js renders locked department as a disabled select control');

console.log('\n======================================================');
console.log('🎉 ALL FILTER BAR LAYOUT TESTS PASSED!');
console.log('======================================================\n');
