/**
 * USER DATA FILES AND CENTRAL DB CONNECTION TEST
 * 
 * Verifies:
 * 1. 'dev3/API/data/user data' directory exists.
 * 2. Every user ID has its own individual '<user.id>.json' file.
 * 3. Each user file contains their full profile and user-partitioned data (attendance, leaves, notifications, todos).
 * 4. 'originate_db.json' maintains active link with 'user_data_dir' and 'user_data_file' references.
 * 5. Mutations and state saves automatically write to individual user files and synchronize state.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../dev3/API/config/db.js');

console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║        USER DATA FILES & CENTRAL DB CONNECTION VERIFICATION SUITE        ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

const DATA_DIR = path.join(__dirname, '..', 'dev3', 'API', 'data');
const USER_DATA_DIR = path.join(DATA_DIR, 'user data');
const DB_FILE = path.join(DATA_DIR, 'originate_db.json');

// 1. Directory Checks
console.log('--- 1. Checking Directory & Database Files ---');
assert(fs.existsSync(DATA_DIR), 'dev3/API/data directory must exist');
assert(fs.existsSync(USER_DATA_DIR), 'dev3/API/data/user data directory must exist');
assert(fs.existsSync(DB_FILE), 'dev3/API/data/originate_db.json must exist');
console.log('✅ Directories verified: "dev3/API/data/user data" exists.');

// 2. Check Central DB Connections
console.log('\n--- 2. Checking originate_db.json Connections ---');
const dbRaw = fs.readFileSync(DB_FILE, 'utf8');
const dbJSON = JSON.parse(dbRaw);
assert.strictEqual(dbJSON.user_data_dir, 'user data', 'originate_db.json must declare user_data_dir');
assert(Array.isArray(dbJSON.users) && dbJSON.users.length > 0, 'originate_db.json must have users array');

dbJSON.users.forEach(u => {
  assert(u.id, 'User must have an id');
  assert.strictEqual(u.user_data_file, `user data/${u.id}.json`, `User ${u.id} must link to its user_data_file`);
  console.log(`  ✓ User "${u.id}" connected -> "${u.user_data_file}"`);
});

// 3. Check Individual User JSON Files
console.log('\n--- 3. Checking Individual User Data Files in "user data" ---');
const userFiles = fs.readdirSync(USER_DATA_DIR).filter(f => f.endsWith('.json'));
assert(userFiles.length >= dbJSON.users.length, 'There must be at least as many user files as registered users');

dbJSON.users.forEach(u => {
  const filePath = path.join(USER_DATA_DIR, `${u.id}.json`);
  assert(fs.existsSync(filePath), `User file must exist on disk: ${u.id}.json`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const uData = JSON.parse(raw);
  assert.strictEqual(uData.id, u.id, `File ${u.id}.json must contain user id ${u.id}`);
  assert(uData.email, `File ${u.id}.json must contain email`);
  assert(Array.isArray(uData.attendance), `File ${u.id}.json must have partitioned attendance array`);
  assert(Array.isArray(uData.leaves), `File ${u.id}.json must have partitioned leaves array`);
  assert(Array.isArray(uData.notifications), `File ${u.id}.json must have partitioned notifications array`);
  assert(Array.isArray(uData.todos), `File ${u.id}.json must have partitioned todos array`);
  console.log(`  ✓ "${u.id}.json" verified: ${uData.name || u.id} (att: ${uData.attendance.length}, leaves: ${uData.leaves.length}, todos: ${uData.todos.length})`);
});

// 4. Test Live Two-Way Persistence
console.log('\n--- 4. Testing Two-Way Write & Persistence ---');
const testUserId = 'u-test-sync-' + Date.now();
const testUser = {
  id: testUserId,
  name: 'Test Sync User',
  email: testUserId + '@originate.example',
  title: 'QA Engineer',
  admin: false,
  status: 'active',
  departments: ['d-tech']
};

const state = db.getState();
state.users.push(testUser);
state.attendance.push({
  id: 'att-' + testUserId,
  user_id: testUserId,
  date: '2026-09-07',
  status: 'Present'
});

db.saveState(state);

// Verify file was created for the new user
const createdFilePath = path.join(USER_DATA_DIR, `${testUserId}.json`);
assert(fs.existsSync(createdFilePath), 'New user file must be immediately created in "user data"');
const createdRaw = JSON.parse(fs.readFileSync(createdFilePath, 'utf8'));
assert.strictEqual(createdRaw.id, testUserId, 'Created file must match test user ID');
assert.strictEqual(createdRaw.attendance.length, 1, 'Created file must partition the new attendance record');
console.log('✅ New user file creation and partitioned data verified.');

// Clean up test user
state.users = state.users.filter(u => u.id !== testUserId);
state.attendance = state.attendance.filter(a => a.id !== 'att-' + testUserId);
db.saveState(state);
if (fs.existsSync(createdFilePath)) {
  fs.unlinkSync(createdFilePath);
}

console.log('✅ Test artifacts cleaned up successfully.');
console.log('\n🎉 ALL USER DATA FILES & DB CONNECTION TESTS PASSED SUCCESSFULLY!\n');
process.exit(0);
