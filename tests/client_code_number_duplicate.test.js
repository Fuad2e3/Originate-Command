/**
 * client_code_number_duplicate.test.js
 * Verifies strict duplicate checks between Client Code and Client Number fields.
 */

const assert = require('assert');
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
    value: '',
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    removeAttribute: function (k) { delete this.attributes[k]; },
    appendChild: function (child) {
      if (typeof child === 'string') {
        this.children.push({ nodeType: 3, text: child });
      } else if (child) {
        this.children.push(child);
      }
      return child;
    },
    removeChild: function (child) {
      const idx = this.children.indexOf(child);
      if (idx > -1) this.children.splice(idx, 1);
      return child;
    },
    get firstChild() {
      return this.children[0] || null;
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) { return { nodeType: 3, text: String(text) }; },
  createDocumentFragment: function () { return makeElement('fragment'); },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function (id) { return makeElement('div'); },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  body: makeElement('body'),
  documentElement: {
    setAttribute: function () {},
    removeAttribute: function () {}
  }
};

globalThis.OC = {};

loadFile('assets/js/icons.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/store.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/clients.js');

console.log('==========================================================================');
console.log('  CLIENT CODE & CLIENT NUMBER STRICT DUPLICATE CHECK VERIFICATION TEST    ');
console.log('==========================================================================\n');

OC.store.load();

// Set up mock admin user
const adminUser = { id: 'u-admin', name: 'Admin', admin: true };
OC.store.state.session = { user: adminUser };
OC.store.user = () => adminUser;

// Initialize test state
OC.store.state.clients = [
  { id: 'c-1', client_id: 'CL-101', client_code: 'ALPHA', client_number: '1001', name: 'Alpha Corp' },
  { id: 'c-2', client_id: 'CL-102', client_code: 'BETA', client_number: '1002', name: 'Beta Corp' }
];

let capturedModal = null;
const origModal = OC.ui.modal;
OC.ui.modal = function (opts) {
  capturedModal = opts;
  return origModal(opts);
};

// 1. Open newClientModal
OC.ui.newClientModal();
assert.ok(capturedModal, 'newClientModal must open');
const addAction = capturedModal.actions.find(a => a.primary);
assert.ok(addAction, 'Add action must exist');

const inputs = [];
function findInputs(node) {
  if (!node) return;
  if (node.tagName === 'INPUT') inputs.push(node);
  if (Array.isArray(node.children)) node.children.forEach(findInputs);
}
findInputs(capturedModal.content);

const idField = inputs[0];
const numField = inputs[1];
const codeField = inputs[2];
const nameField = inputs[3];

idField.value = 'CL-103';
nameField.value = 'Gamma Corp';

// Test 1: Same Code and Number on same new client
codeField.value = 'SAME123';
numField.value = 'SAME123';
let err = addAction.onClick(() => {});
assert.strictEqual(err, 'Client Code and Client Number cannot be the same.', 'Must reject identical Code & Number');
console.log('  ✓ Rejected same Code & Number on same client: "' + err + '"');

// Test 2: Code matches existing Client Number
codeField.value = '1001'; // Used as client_number on c-1
numField.value = 'NUM-999';
err = addAction.onClick(() => {});
assert.ok(err && err.includes('Duplicate Client Code'), 'Must reject Code matching existing Number: ' + err);
console.log('  ✓ Rejected Code matching existing Client Number: "' + err + '"');

// Test 3: Number matches existing Client Code
codeField.value = 'CODE-999';
numField.value = 'ALPHA'; // Used as client_code on c-1
err = addAction.onClick(() => {});
assert.ok(err && err.includes('Duplicate Client Number'), 'Must reject Number matching existing Code: ' + err);
console.log('  ✓ Rejected Number matching existing Client Code: "' + err + '"');

// Test 4: Code matches existing Client Code
codeField.value = 'BETA'; // Used as client_code on c-2
numField.value = 'NUM-999';
err = addAction.onClick(() => {});
assert.ok(err && err.includes('Duplicate Client Code'), 'Must reject Code matching existing Code: ' + err);
console.log('  ✓ Rejected Code matching existing Client Code: "' + err + '"');

// Test 5: Number matches existing Client Number
codeField.value = 'CODE-999';
numField.value = '1002'; // Used as client_number on c-2
err = addAction.onClick(() => {});
assert.ok(err && err.includes('Duplicate Client Number'), 'Must reject Number matching existing Number: ' + err);
console.log('  ✓ Rejected Number matching existing Client Number: "' + err + '"');

// Test 6: Valid unique inputs
codeField.value = 'GAMMA';
numField.value = '1003';
err = addAction.onClick(() => {});
assert.strictEqual(err, undefined, 'Valid unique inputs must pass creation');
console.log('  ✓ Valid new client created successfully with unique Code & Number');

// Test 7: Edit client duplicate checks
const targetClient = OC.store.state.clients.find(c => c.id === 'c-1');
OC.clients.editClient(targetClient);
assert.ok(capturedModal, 'editClient modal must open');
const saveAction = capturedModal.actions.find(a => a.primary);

inputs.length = 0;
findInputs(capturedModal.content);

const editName = inputs.find(i => i.value === 'Alpha Corp');
const editId = inputs.find(i => i.value === 'CL-101');
const editCode = inputs.find(i => i.value === 'ALPHA');
const editNum = inputs.find(i => i.value === '1001');

// Same Code and Number on edit
editCode.value = 'EDIT-SAME';
editNum.value = 'EDIT-SAME';
err = saveAction.onClick(() => {});
assert.strictEqual(err, 'Client Code and Client Number cannot be the same.', 'Must reject identical Code & Number on edit');
console.log('  ✓ Rejected same Code & Number on client edit: "' + err + '"');

// Code matches other client's Number on edit
editCode.value = '1002'; // c-2's number
editNum.value = '1001';  // c-1's own number
err = saveAction.onClick(() => {});
assert.ok(err && err.includes('Duplicate Client Code'), 'Must reject Code matching other client Number on edit');
console.log('  ✓ Rejected Code matching another client Number on edit');

// Same client's own existing values pass on edit
editCode.value = 'ALPHA'; // c-1's own code
editNum.value = '1001';  // c-1's own number
err = saveAction.onClick(() => {});
assert.strictEqual(err, undefined, 'Editing client with its own Code & Number must succeed');
console.log('  ✓ Edit client with its own existing Code & Number succeeded');

console.log('\n==========================================================================');
console.log('  🎉 ALL CLIENT CODE & NUMBER DUPLICATE TESTS PASSED 100%! ✅');
console.log('==========================================================================\n');

setTimeout(() => process.exit(0), 100);
