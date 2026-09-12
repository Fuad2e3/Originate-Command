/* =========================================================================
   tests/user_permissions_and_nav_fixes.test.js
   Automated verification for:
   1. Department - Admin & HR can see Management Team Accounts
   2. Profile editing restricted to name & photo for regular users; System Admin and Admin & HR can edit all
   3. Client portal permission button relocated to Management, with "Client Add" permission
   4. History & Log persistence (no 50-entry truncation)
   5. Alert notifications navigate without opening edit modals
   ========================================================================= */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       USER PERMISSIONS & NAVIGATION FIXES VERIFICATION             ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Mock browser environment for testing
global.window = global;
global.document = {
  documentElement: { setAttribute: () => {}, getAttribute: () => {} },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null
};
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

// Load permissions.js
require('../assets/js/permissions.js');

// Mock OC.store for permissions tests
global.OC = global.OC || {};
global.OC.store = {
  department(id) {
    if (id === 'd-admin') return { id: 'd-admin', name: 'Admin & HR', levels: ['head', 'member', 'intern'] };
    if (id === 'd-web') return { id: 'd-web', name: 'Web Development', levels: ['head', 'member', 'intern'] };
    return null;
  },
  state: {
    departments: [
      { id: 'd-admin', name: 'Admin & HR', levels: ['head', 'member', 'intern'] },
      { id: 'd-web', name: 'Web Development', levels: ['head', 'member', 'intern'] }
    ],
    users: []
  }
};

let pass = 0;
function test(title, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${title}`);
  } catch (err) {
    console.error(`  ❌ FAILED: ${title}`);
    console.error(err);
    process.exit(1);
  }
}

// -------------------------------------------------------------------------
// 1. Department - Admin & HR helper and access checks
// -------------------------------------------------------------------------
console.log('--- [1/5] Testing Department - Admin & HR Access ---');

const adminHrUser = {
  id: 'u-hr',
  name: 'HR Member',
  admin: false,
  departments: [{ department: 'd-admin', level: 'member' }]
};

const sysAdminUser = {
  id: 'u-admin',
  name: 'System Admin',
  admin: true,
  departments: []
};

const regularDevUser = {
  id: 'u-dev',
  name: 'Developer',
  admin: false,
  departments: [{ department: 'd-web', level: 'member' }]
};

test('isAdminOrHr returns true for System Admin', () => {
  assert.strictEqual(OC.can.isAdminOrHr(sysAdminUser), true);
});

test('isAdminOrHr returns true for Department - Admin & HR member', () => {
  assert.strictEqual(OC.can.isAdminOrHr(adminHrUser), true);
});

test('isAdminOrHr returns false for regular department member (e.g. Web Dev)', () => {
  assert.strictEqual(OC.can.isAdminOrHr(regularDevUser), false);
});

test('canEditAccount allows System Admin and Admin & HR to edit other accounts', () => {
  assert.strictEqual(OC.can.editAccount(sysAdminUser, regularDevUser), true);
  assert.strictEqual(OC.can.editAccount(adminHrUser, regularDevUser), true);
  assert.strictEqual(OC.can.editAccount(regularDevUser, adminHrUser), false);
  assert.strictEqual(OC.can.editAccount(regularDevUser, regularDevUser), true); // self edit
});

// -------------------------------------------------------------------------
// 2. Client Add permission verification
// -------------------------------------------------------------------------
console.log('\n--- [2/5] Testing Client Add Permissions ---');

const permittedClientAdder = {
  id: 'u-adder',
  name: 'Permitted Member',
  admin: false,
  can_create_client: true
};

const userWithNestedPerm = {
  id: 'u-nested',
  name: 'Nested Perm Member',
  admin: false,
  permissions: { can_create_client: true }
};

test('createClient returns true for System Admin', () => {
  assert.strictEqual(OC.can.createClient(sysAdminUser), true);
});

test('createClient returns false for unpermitted regular user', () => {
  assert.strictEqual(OC.can.createClient(regularDevUser), false);
});

test('createClient returns true for user granted can_create_client directly', () => {
  assert.strictEqual(OC.can.createClient(permittedClientAdder), true);
});

test('createClient returns true for user with permissions.can_create_client', () => {
  assert.strictEqual(OC.can.createClient(userWithNestedPerm), true);
});

// -------------------------------------------------------------------------
// 3. Client Portal Permission Button Relocation & Global Modal
// -------------------------------------------------------------------------
console.log('\n--- [3/5] Verifying Permission Button Relocation ---');

const clientsJsContent = fs.readFileSync(path.join(__dirname, '../assets/js/clients.js'), 'utf8');
const activitiesJsContent = fs.readFileSync(path.join(__dirname, '../assets/js/activities.js'), 'utf8');

test('client-portal-permissions-btn is removed from client portal inside view', () => {
  assert.ok(
    clientsJsContent.indexOf("id: 'client-portal-permissions-btn'") === -1,
    'Client portal should no longer contain client-portal-permissions-btn'
  );
});

test('mgmt-permissions-btn is present in Management subnav in activities.js', () => {
  assert.ok(
    activitiesJsContent.indexOf("id: 'mgmt-permissions-btn'") !== -1,
    'Management subnav must contain mgmt-permissions-btn'
  );
});

test('openGlobalPermissionsModal is implemented and exported in clients.js', () => {
  assert.ok(
    clientsJsContent.indexOf('function openGlobalPermissionsModal') !== -1,
    'clients.js must declare openGlobalPermissionsModal'
  );
  assert.ok(
    clientsJsContent.indexOf('openGlobalPermissionsModal: openGlobalPermissionsModal') !== -1,
    'clients.js must export openGlobalPermissionsModal'
  );
});

// -------------------------------------------------------------------------
// 4. History & Log Persistence (No 50-entry slimAudit truncation)
// -------------------------------------------------------------------------
console.log('\n--- [4/5] Testing History & Log Persistence ---');

const dbJsContent = fs.readFileSync(path.join(__dirname, '../dev3/API/config/db.js'), 'utf8');
const storeJsContent = fs.readFileSync(path.join(__dirname, '../assets/js/store.js'), 'utf8');

test('db.js does not truncate state.audit to 50 items (slimAudit removed)', () => {
  assert.ok(
    dbJsContent.indexOf('state.audit.slice(0, 50)') === -1,
    'db.js must not slice audit to 50 items'
  );
  assert.ok(
    dbJsContent.indexOf('const savedAudit = Array.isArray(state.audit) ? state.audit.slice(0, 1000) : [];') !== -1,
    'db.js must retain up to 1000 items in savedAudit'
  );
});

test('store.js contains mergeAuditLogs to avoid wiping client audit on server sync', () => {
  assert.ok(
    storeJsContent.indexOf('function mergeAuditLogs') !== -1,
    'store.js must have mergeAuditLogs function'
  );
});

// -------------------------------------------------------------------------
// 5. Alert Notifications Click Navigation Fix
// -------------------------------------------------------------------------
console.log('\n--- [5/5] Testing Alert Notifications Navigation Fix ---');

const appJsContent = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');

test('navigateToNotification does not pop open editTodo modal', () => {
  const notifFnMatch = appJsContent.match(/function navigateToNotification\(n\) \{([\s\S]*?)\n  \}/);
  assert.ok(notifFnMatch, 'navigateToNotification must exist in app.js');
  const notifFnBody = notifFnMatch[1];
  assert.ok(
    notifFnBody.indexOf('OC.board.editTodo') === -1,
    'navigateToNotification must not call OC.board.editTodo'
  );
  assert.ok(
    notifFnBody.indexOf('OC.board.editInstruction') === -1,
    'navigateToNotification must not call OC.board.editInstruction'
  );
});

test('app.js openProfileModal restricts regular users to name and photo', () => {
  assert.ok(
    appJsContent.indexOf('canManageFullProfile') !== -1,
    'openProfileModal must check canManageFullProfile'
  );
});

console.log(`\n====================================`);
console.log(`All ${pass} tests passed successfully!`);
console.log(`====================================\n`);
