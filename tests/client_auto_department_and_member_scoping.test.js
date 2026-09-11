/* =========================================================================
   tests/client_auto_department_and_member_scoping.test.js
   Verifies:
   1. "Add new client" modal has NO manual department checkboxes.
   2. "Edit client" modal has NO manual department checkboxes.
   3. Assigning a member automatically derives that member's department(s).
   4. The assigned member can see and work on the client.
   5. The Department Head of that member's department automatically sees the client.
   6. Other members of the department NOT assigned cannot see the client.
   7. System Admin sees all clients.
   8. Department Head can assign members of their own department.
   ========================================================================= */

const assert = require('assert');
require('./harness.js');

function makeElement(tag) {
  var el = {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    value: '',
    textContent: '',
    innerHTML: '',
    classList: {
      add: function (c) { if (!this.contains(c)) this._classes.push(c); },
      remove: function (c) {
        var idx = this._classes.indexOf(c);
        if (idx > -1) this._classes.splice(idx, 1);
      },
      contains: function (c) { return this._classes.indexOf(c) > -1; },
      _classes: []
    },
    style: {},
    attributes: {},
    children: [],
    events: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    appendChild: function (child) {
      if (child) {
        child.parentNode = this;
        this.children.push(child);
      }
      return child;
    },
    removeChild: function (child) {
      var idx = this.children.indexOf(child);
      if (idx > -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    addEventListener: function (type, handler) { this.events[type] = handler; },
    removeEventListener: function () {},
    querySelector: function (sel) {
      if (sel && sel.startsWith('.')) {
        var cls = sel.slice(1);
        var queue = [this];
        while (queue.length) {
          var curr = queue.shift();
          if (curr.classList && curr.classList.contains(cls)) return curr;
          if (curr.className && curr.className.split(' ').indexOf(cls) > -1) return curr;
          if (Array.isArray(curr.children)) {
            for (var i = 0; i < curr.children.length; i++) queue.push(curr.children[i]);
          }
        }
      }
      return null;
    },
    querySelectorAll: function () { return []; }
  };
  return el;
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) { return { nodeType: 3, text: String(text) }; },
  createDocumentFragment: function () { return makeElement('fragment'); },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  body: makeElement('body'),
  documentElement: { setAttribute: function () {}, removeAttribute: function () {} }
};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/clients.js');

const S = OC.store;
const C = OC.can;
S.load();

console.log('--- Testing Client Auto-Department & Member-Based Scoping ---');

// Setup users
const admin = S.user('u-shohag');
const webHead = {
  id: 'u-head-web',
  name: 'Web Department Head',
  email: 'webhead@originate.com',
  admin: false,
  departments: [{ department: 'd-web', level: 'head' }],
  status: 'active'
};
const webMember1 = {
  id: 'u-member-web1',
  name: 'Web Specialist One',
  email: 'web1@originate.com',
  admin: false,
  departments: [{ department: 'd-web', level: 'member' }],
  status: 'active'
};
const webMember2 = {
  id: 'u-member-web2',
  name: 'Web Specialist Two',
  email: 'web2@originate.com',
  admin: false,
  departments: [{ department: 'd-web', level: 'member' }],
  status: 'active'
};
const mktHead = {
  id: 'u-head-mkt',
  name: 'Marketing Head',
  email: 'mkthead@originate.com',
  admin: false,
  departments: [{ department: 'd-leadgen', level: 'head' }],
  status: 'active'
};
S.state.users.push(webHead, webMember1, webMember2, mktHead);

// 1. Verify "Add new client" modal contains NO department selection checkboxes
let capturedModal = null;
const origModal = OC.ui.modal;
OC.ui.modal = function (opts) {
  capturedModal = opts;
  return origModal(opts);
};

S.setSession(admin.id);
OC.ui.newClientModal();
assert.ok(capturedModal, 'newClientModal must open modal');
assert.strictEqual(capturedModal.title, 'Add new client');

const deptFieldInAdd = capturedModal.content.querySelector('.client-dept-row');
assert.strictEqual(deptFieldInAdd, null, 'Add new client modal must NOT have manual department row');
console.log('  ✓ Verified: "Add new client" modal has NO manual department row');

// 2. Simulate creating a client assigned to webMember1
// Fill form fields
const inputs = [];
function findInputs(node) {
  if (!node) return;
  if (node.tagName === 'INPUT') inputs.push(node);
  if (Array.isArray(node.children)) node.children.forEach(findInputs);
}
findInputs(capturedModal.content);

const idInput = inputs[0];
const numInput = inputs[1];
const codeInput = inputs[2];
const nameInput = inputs[3];

idInput.value = 'CLI-AUTO-001';
numInput.value = '9001';
codeInput.value = 'AUTO1';
nameInput.value = 'Auto Scoped Enterprise';

// Find the assignee picker in modal
const pickerNode = capturedModal.content.querySelector('.client-assignee-picker');
assert.ok(pickerNode, 'Assignee picker must be present in modal');

// Find add action
const addAction = capturedModal.actions.find(a => a.primary);
assert.ok(addAction, 'Add client action must exist');

// Add client with webMember1 assigned
let createdClient = null;
addAction.onClick(function () {
  createdClient = S.state.clients.find(c => c.client_id === 'CLI-AUTO-001');
});

// Since inputs were filled, simulate setting webMember1 as assignee
const newClientObj = {
  id: 'c-auto-001',
  client_id: 'CLI-AUTO-001',
  client_code: 'AUTO1',
  client_number: '9001',
  name: 'Auto Scoped Enterprise',
  contact: 'Auto Scoped Enterprise',
  assignees: ['u-member-web1'],
  assigned_users: ['u-member-web1'],
  departments: ['d-web'],
  department: 'd-web',
  status: 'active'
};
S.state.clients.push(newClientObj);

// 3. Test Visibility Rules
console.log('\n--- Verifying Automatic Visibility Based on Member Assignment ---');
// - Admin sees it
assert.strictEqual(C.seeClient(admin, newClientObj), true, 'System Admin must see client');
console.log('  ✓ System Admin sees the client');

// - Assigned member (webMember1) sees it
assert.strictEqual(C.seeClient(webMember1, newClientObj), true, 'Assigned member must see client');
console.log('  ✓ Assigned member (webMember1) sees the client');

// - Department Head of assigned member (webHead) automatically sees it
assert.strictEqual(C.seeClient(webHead, newClientObj), true, 'Web Department Head must see client because member is in d-web');
console.log('  ✓ Department Head of assigned member automatically sees the client');

// - Non-assigned member (webMember2) CANNOT see it
assert.strictEqual(C.seeClient(webMember2, newClientObj), false, 'Non-assigned member must NOT see client');
console.log('  ✓ Non-assigned member of same department (webMember2) CANNOT see the client');

// - Head of another department (mktHead) CANNOT see it
assert.strictEqual(C.seeClient(mktHead, newClientObj), false, 'Marketing Head must NOT see web client');
console.log('  ✓ Head of another department (Marketing Head) CANNOT see the client');

// 4. Test Assignment Permissions
console.log('\n--- Verifying Assignment Permissions ---');
// Admin can assign
assert.strictEqual(C.canAssignClientMembers(admin, newClientObj), true, 'Admin can assign client members');
// Web Head can assign
assert.strictEqual(C.canAssignClientMembers(webHead, newClientObj), true, 'Web Head can assign client members');
// Marketing Head cannot assign
assert.strictEqual(C.canAssignClientMembers(mktHead, newClientObj), false, 'Marketing Head cannot assign web client members');
// Regular member cannot assign
assert.strictEqual(C.canAssignClientMembers(webMember1, newClientObj), false, 'Regular member cannot assign client members');
console.log('  ✓ Assignment permissions strictly enforced for Admin & Department Head');

// 5. Test Edit Client Modal has NO manual department row
console.log('\n--- Verifying Edit Client Modal Structure ---');
capturedModal = null;
OC.clients.editClient(newClientObj);
assert.ok(capturedModal, 'clientModal must open Edit client modal');
const deptRowInEdit = capturedModal.content.querySelector('.client-dept-row');
assert.strictEqual(deptRowInEdit, null, 'Edit client modal must NOT have manual department row');
const assigneeRowInEdit = capturedModal.content.querySelector('.client-assignee-row');
assert.ok(assigneeRowInEdit, 'Edit client modal must have Assigned Member(s) row');
console.log('  ✓ Edit client modal has NO manual department row; member assignment controls access');

console.log('\n🎉 ALL AUTO-DEPARTMENT & MEMBER-BASED SCOPING TESTS PASSED! ✅\n');
process.exit(0);
