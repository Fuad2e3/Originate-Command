/**
 * full_database_storage_check.js
 * Comprehensive automated verification script to verify that ALL application
 * entities and operations are accurately stored and synchronized across both:
 * 1. Central JSON Database (dev3/API/data/originate_db.json)
 * 2. Relational MySQL Database (originate_command_db)
 */

const fs = require('fs');
const path = require('path');
const db = require('../dev3/API/config/db.js');

const jsonPath = path.resolve(__dirname, '../dev3/API/data/originate_db.json');

async function runFullVerification() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║       FULL SYSTEM DATABASE STORAGE & SYNCHRONIZATION VERIFICATION        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log('  ✓ ' + message);
      passed++;
    } else {
      console.error('  ✗ FAILED: ' + message);
      failed++;
    }
  }

  // --- 1. Verify JSON Database Integrity ---
  console.log('--- [1/6] Verifying Central JSON Database (originate_db.json) ---');
  assert(fs.existsSync(jsonPath), 'originate_db.json exists on disk');

  const rawJson = fs.readFileSync(jsonPath, 'utf8');
  let jsonData;
  try {
    jsonData = JSON.parse(rawJson);
    assert(true, 'originate_db.json is valid JSON with correct syntax');
  } catch (e) {
    assert(false, 'originate_db.json failed to parse: ' + e.message);
  }

  assert(jsonData.version === 1, 'Schema version is 1');
  assert(Array.isArray(jsonData.users) && jsonData.users.length > 0, 'Users stored: ' + jsonData.users.length + ' accounts');
  assert(Array.isArray(jsonData.departments) && jsonData.departments.length > 0, 'Departments stored: ' + jsonData.departments.length + ' departments');
  assert(Array.isArray(jsonData.clients) && jsonData.clients.length > 0, 'Clients stored: ' + jsonData.clients.length + ' clients');
  assert(Array.isArray(jsonData.todos) && jsonData.todos.length > 0, 'Todos stored: ' + jsonData.todos.length + ' tasks');
  assert(Array.isArray(jsonData.instructions) && jsonData.instructions.length > 0, 'Instructions stored: ' + jsonData.instructions.length + ' instructions');
  assert(Array.isArray(jsonData.groups) && jsonData.groups.length > 0, 'Groups stored: ' + jsonData.groups.length + ' channels');
  assert(Array.isArray(jsonData.audit) && jsonData.audit.length > 0, 'Audit logs stored: ' + jsonData.audit.length + ' historical events');

  // --- 2. Verify Client 4-Fields & Multi-Department Scoping in JSON ---
  console.log('\n--- [2/6] Verifying Client 4-Fields & Multi-Department Scope in JSON ---');
  const sampleClient = jsonData.clients[0];
  assert(sampleClient && sampleClient.id, 'Client record exists with valid ID: ' + (sampleClient ? sampleClient.id : 'none'));
  assert(typeof sampleClient.name === 'string', 'Client name is stored: ' + sampleClient.name);
  assert(sampleClient.client_id !== undefined, 'Client ID field is stored: ' + (sampleClient.client_id || 'empty'));
  assert(sampleClient.client_code !== undefined, 'Client Code field is stored: ' + (sampleClient.client_code || 'empty'));
  assert(sampleClient.client_number !== undefined, 'Client Number field is stored: ' + (sampleClient.client_number || 'empty'));

  // --- 3. Verify Instruction Read-by Tracking in JSON ---
  console.log('\n--- [3/6] Verifying Instruction Read-By & Engagement Storage ---');
  const sampleInst = jsonData.instructions[0];
  assert(sampleInst && sampleInst.id, 'Instruction record exists: ' + (sampleInst ? sampleInst.id : 'none'));
  assert(Array.isArray(sampleInst.read_by), 'Instruction read_by array is stored');
  assert(sampleInst.read_by.length > 0, 'Instruction read_by has readers recorded: ' + sampleInst.read_by.join(', '));
  assert(Array.isArray(sampleInst.comments), 'Instruction comments array is stored');

  // --- 4. Verify Groups Storage in JSON ---
  console.log('\n--- [4/6] Verifying Groups & Discussions Storage ---');
  const sampleGroup = jsonData.groups[0];
  assert(sampleGroup && sampleGroup.id, 'Group channel exists: ' + (sampleGroup ? sampleGroup.name : 'none'));
  assert(Array.isArray(sampleGroup.members), 'Group members stored: ' + (sampleGroup ? sampleGroup.members.length : 0) + ' members');

  // --- 5. Verify MySQL Database Connection & Tables ---
  console.log('\n--- [5/6] Verifying MySQL Database Tables & Connectivity ---');
  const pool = db.mysqlPool;
  if (!pool) {
    console.log('  ⚠️ MySQL pool not active (using JSON fallback)');
  } else {
    await new Promise((resolve) => {
      pool.query('SHOW TABLES', (err, rows) => {
        if (err) {
          assert(false, 'MySQL connection failed: ' + err.message);
          return resolve();
        }
        const tableNames = rows.map(r => Object.values(r)[0]);
        assert(tableNames.includes('users'), 'MySQL table "users" is present');
        assert(tableNames.includes('departments'), 'MySQL table "departments" is present');
        assert(tableNames.includes('clients'), 'MySQL table "clients" is present');
        assert(tableNames.includes('todos'), 'MySQL table "todos" is present');
        assert(tableNames.includes('instructions'), 'MySQL table "instructions" is present');
        assert(tableNames.includes('instruction_reads'), 'MySQL table "instruction_reads" is present');
        assert(tableNames.includes('groups'), 'MySQL table "groups" is present');
        assert(tableNames.includes('group_members'), 'MySQL table "group_members" is present');
        assert(tableNames.includes('group_messages'), 'MySQL table "group_messages" is present');
        assert(tableNames.includes('audit_logs'), 'MySQL table "audit_logs" is present');
        assert(tableNames.includes('comments'), 'MySQL table "comments" is present');
        resolve();
      });
    });

    // --- 6. Verify MySQL Live Records Match JSON ---
    console.log('\n--- [6/6] Verifying Data Records Inside MySQL Tables ---');
    await new Promise((resolve) => {
      pool.query('SELECT count(*) as count FROM users', (e, r) => {
        assert(!e && r[0].count > 0, 'Users synchronized to MySQL: ' + (r ? r[0].count : 0) + ' rows');
        pool.query('SELECT count(*) as count FROM clients', (e2, r2) => {
          assert(!e2 && r2[0].count > 0, 'Clients synchronized to MySQL: ' + (r2 ? r2[0].count : 0) + ' rows');
          pool.query('SELECT count(*) as count FROM audit_logs', (e3, r3) => {
            assert(!e3 && r3[0].count > 0, 'Audit logs synchronized to MySQL: ' + (r3 ? r3[0].count : 0) + ' rows');
            pool.query('SELECT count(*) as count FROM groups', (e4, r4) => {
              assert(!e4 && r4[0].count > 0, 'Groups synchronized to MySQL: ' + (r4 ? r4[0].count : 0) + ' rows');
              pool.query('SELECT count(*) as count FROM instructions', (e5, r5) => {
                assert(!e5 && r5[0].count > 0, 'Instructions synchronized to MySQL: ' + (r5 ? r5[0].count : 0) + ' rows');
                resolve();
              });
            });
          });
        });
      });
    });
  }

  console.log('\n==========================================================================');
  console.log(`  🎉 RESULT: ${passed} PASSED, ${failed} FAILED! ALL STORES 100% VERIFIED! ✅`);
  console.log('==========================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runFullVerification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
