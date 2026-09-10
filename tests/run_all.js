const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const testDir = __dirname;
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js') || f === 'test_group_delete_and_bounce.js');

let passed = 0;
let failed = 0;

for (const f of files) {
  try {
    execSync(`"${process.execPath}" "${path.join(testDir, f)}"`, { stdio: 'pipe' });
    console.log('✅ PASS:', f);
    passed++;
  } catch (e) {
    console.error('❌ FAIL:', f);
    if (e.stdout) console.error(e.stdout.toString());
    if (e.stderr) console.error(e.stderr.toString());
    failed++;
  }
}

console.log('\n====================================');
console.log('Total:', files.length, 'Passed:', passed, 'Failed:', failed);
console.log('====================================');
if (failed > 0) process.exit(1);
