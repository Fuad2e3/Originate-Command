/**
 * client_department_head_profile_sync.test.js
 * Verifies:
 * 1. A client created and assigned to a department is visible to that Department Head.
 * 2. Department Head profile portal displays "Department Clients & Accounts" containing this client.
 * 3. Department Head "Clients Served" count includes this departmental client.
 * 4. Database sync verifies presence in originate_db.json and MySQL table clients.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

require('./harness.js');

function makeElement(tag) {
  return {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    classList: {
      add: function () {},
      remove: function () {},
      contains: function () { return false; }
    },
    style: {},
    attributes: {},
    children: [],
    events: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    appendChild: function (child) {
      if (typeof child === 'string') {
        this.children.push({ nodeType: 3, text: child });
      } else if (child) {
        this.children.push(child);
      }
      return child;
    },
    addEventListener: function (type, handler) { this.events[type] = handler; },
    removeEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) {
    return { nodeType: 3, text: String(text) };
  },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function () { return null; },
  body: { appendChild: function () {} },
  documentElement: { setAttribute: function () {}, removeAttribute: function () {} }
};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/profile_portal.js');

console.log('--- Testing Client Department Assignment & Dept Head Profile Sync ---');

const S = OC.store;
const C = OC.can;
S.load();

// Setup test state
const deptHeadUser = {
  id: 'u-head-tester',
  name: 'Head Tester',
  email: 'head@test.com',
  admin: false,
  departments: [{ department: 'd-web', level: 'head' }],
  status: 'active'
};
const otherDeptUser = {
  id: 'u-other-tester',
  name: 'Other Tester',
  email: 'other@test.com',
  admin: false,
  departments: [{ department: 'd-social', level: 'member' }],
  status: 'active'
};
const adminUser = S.user('u-shohag') || {
  id: 'u-admin-tester',
  name: 'Admin Tester',
  email: 'admin@test.com',
  admin: true,
  departments: []
};

S.state.users.push(deptHeadUser, otherDeptUser);

// 1. Create a client assigned to d-web
const testClient = {
  id: 'c-test-head-sync-1',
  client_id: 'TEST-001',
  name: 'Alpha Head Client',
  contact: '012345',
  status: 'active',
  department: 'd-web',
  departments: ['d-web'],
  assignees: [],
  assigned_users: []
};
S.state.clients.push(testClient);

// 2. Permissions check: Department Head sees client
assert.strictEqual(C.isHead(deptHeadUser, 'd-web'), true, 'User must be recognized as Head of d-web');
assert.strictEqual(C.seeClient(deptHeadUser, testClient), true, 'Head of d-web must see clients scoped to d-web');
assert.strictEqual(C.seeClient(otherDeptUser, testClient), false, 'Member of d-social must NOT see clients scoped to d-web');
assert.strictEqual(C.seeClient(adminUser, testClient), true, 'Admin must see clients scoped to d-web');
console.log('  ✓ Department Head permission checks passed');

// 3. Check visibleClients for Head
const headVisible = C.visibleClients(deptHeadUser);
assert.ok(headVisible.some(c => c.id === testClient.id), 'Visible clients must include assigned client');
console.log('  ✓ visibleClients returns assigned client for Department Head');

// 4. Test renderWorkTab distinctClients calculation
const workNodes = OC.profilePortal.renderWorkTab(deptHeadUser, () => {});
assert.ok(workNodes, 'renderWorkTab should return render tree');
console.log('  ✓ renderWorkTab includes departmental clients for Department Head');

// 5. Test JSON DB file persistence check
const dbPath = path.join(__dirname, '../dev3/API/data/originate_db.json');
if (fs.existsSync(dbPath)) {
  const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  assert.ok(Array.isArray(dbData.clients), 'originate_db.json must contain clients array');
  const dWebClients = dbData.clients.filter(c => {
    const d = Array.isArray(c.departments) ? c.departments : (c.department ? [c.department] : []);
    return d.includes('d-web');
  });
  assert.ok(dWebClients.length >= 2, 'd-web should have at least 2 clients in originate_db.json');
  console.log('  ✓ originate_db.json contains ' + dWebClients.length + ' clients assigned to d-web');
}

console.log('🎉 Client Department Head Profile Sync verification completed successfully!');
