const assert = require('assert');
require('./harness.js');

function makeElement(tag, props, children) {
  var el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: (props && props.class) || '',
    value: (props && props.value !== undefined) ? props.value : '',
    style: {},
    attributes: {},
    children: [],
    events: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    addEventListener: function (evt, fn) { this.events[evt] = fn; },
    click: function () { if (this.events.click) this.events.click({ stopPropagation: function () {} }); },
    remove: function () {},
    appendChild: function (child) {
      if (typeof child === 'string') this.children.push({ nodeType: 3, text: child });
      else if (child) this.children.push(child);
      return child;
    },
    querySelector: function (sel) {
      for (var i = 0; i < this.children.length; i++) {
        var c = this.children[i];
        if (c.className && c.className.indexOf(sel.replace('.', '')) > -1) return c;
        if (c.tagName && c.tagName.toLowerCase() === sel.toLowerCase()) return c;
      }
      return null;
    },
    querySelectorAll: function () { return []; }
  };
  if (props) {
    if (props.id) el.id = props.id;
    if (props.value !== undefined) el.value = props.value;
    if (props.onClick) el.events.click = props.onClick;
    if (props.onChange) el.events.change = props.onChange;
  }
  return el;
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) { return { nodeType: 3, text: String(text) }; },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function () { return null; },
  body: { appendChild: function () {} }
};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/board.js');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  NOTICE BOARD DEPARTMENT LOCKING & ADMIN PERMISSIONS TEST SUITE    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

OC.store.load();

// 1. Setup mock workspace state
OC.store.state.departments = [
  { id: 'd-web', name: 'Web Development' },
  { id: 'd-outreach', name: 'Outreach & Marketing' },
  { id: 'd-design', name: 'Creative Design' }
];
OC.store.state.users = [
  {
    id: 'u-admin',
    name: 'System Admin Fuad',
    admin: true,
    departments: []
  },
  {
    id: 'u-regular',
    name: 'Regular Developer',
    admin: false,
    departments: [{ department: 'd-web', level: 'member' }]
  }
];
OC.store.state.clients = [
  { id: 'c-1', name: 'Client Apex', client_code: 'APX', department: 'd-web' }
];
OC.store.state.instructions = [
  {
    id: 'n-1',
    body: 'Web department notice',
    department: 'd-web',
    departments: ['d-web'],
    author: 'u-regular',
    posted_at: new Date().toISOString()
  }
];
OC.store.state.todos = [
  {
    id: 't-1',
    title: 'Fix website bug',
    department: 'd-web',
    departments: ['d-web'],
    created_by: 'u-regular'
  }
];
OC.store.setSession('u-regular');

// Test 1: deptPicker behavior for regular user vs admin
console.log('--- [1/3] Testing deptPicker Component Locking ---');
const regularUser = OC.store.user('u-regular');
const adminUser = OC.store.user('u-admin');

// Regular user picker
const regPicker = OC.ui.deptPicker([], regularUser);
assert.ok(regPicker, 'deptPicker must return instance');
const regDepts = regPicker.getDepartments();
assert.deepStrictEqual(regDepts, ['d-web'], 'Regular user must have their assigned department automatically fixed');

// Admin user picker
const adminPicker = OC.ui.deptPicker([], adminUser);
assert.ok(adminPicker, 'deptPicker must return instance');
assert.strictEqual(adminPicker.getDepartments().length, 0, 'Admin starts with clean picker so they can choose freely');
console.log('  ✓ deptPicker locks department for regular user and remains flexible for admin');

// Test 2: Notice Board newInstruction() and newTodo() omit Department field
console.log('\n--- [2/3] Testing Notice Board: No Department Shown on Notice Board ---');
let capturedModalConfig = null;
OC.ui.modal = function (cfg) { capturedModalConfig = cfg; };

function hasDeptInTree(node) {
  if (!node) return false;
  if (node.children && Array.isArray(node.children)) {
    for (let c of node.children) {
      if (hasDeptInTree(c)) return true;
    }
  }
  if (node.className && node.className.indexOf('dept-multi-picker') > -1) return true;
  if (node.text && (node.text.indexOf('Fixed to your assigned department') > -1 || node.text.indexOf('Fixed to department') > -1)) return true;
  return false;
}

// Case A: Regular user on Notice Board
OC.store.setSession('u-regular');
capturedModalConfig = null;
OC.board.newInstruction();
assert.ok(capturedModalConfig, 'Modal should be triggered');
assert.strictEqual(hasDeptInTree(capturedModalConfig.content), false, 'Notice Board newInstruction must NOT show department to regular users');

capturedModalConfig = null;
OC.board.newTodo();
assert.ok(capturedModalConfig, 'Modal should be triggered');
assert.strictEqual(hasDeptInTree(capturedModalConfig.content), false, 'Notice Board newTodo must NOT show department to regular users');
console.log('  ✓ Notice Board newInstruction and newTodo do not show department to regular users');

// Case B: System Admin on Notice Board
OC.store.setSession('u-admin');
capturedModalConfig = null;
OC.board.newInstruction();
assert.ok(capturedModalConfig, 'Modal should be triggered');
assert.strictEqual(hasDeptInTree(capturedModalConfig.content), false, 'Notice Board newInstruction must NOT show department to admin');

capturedModalConfig = null;
OC.board.newTodo();
assert.ok(capturedModalConfig, 'Modal should be triggered');
assert.strictEqual(hasDeptInTree(capturedModalConfig.content), false, 'Notice Board newTodo must NOT show department to admin');
console.log('  ✓ Notice Board newInstruction and newTodo do not show department to admin');

// Test 3: Edit modals on Notice Board omit Department field
console.log('\n--- [3/3] Testing Notice Board: editInstruction() & editTodo() Omit Department ---');
const testNote = OC.store.state.instructions[0];
const testTodo = OC.store.state.todos[0];

// Case A: Regular user edit
OC.store.setSession('u-regular');
capturedModalConfig = null;
OC.board.editInstruction(testNote);
assert.ok(capturedModalConfig, 'Modal should be triggered');
assert.strictEqual(hasDeptInTree(capturedModalConfig.content), false, 'Notice Board editInstruction must NOT show department');

capturedModalConfig = null;
OC.board.editTodo(testTodo);
assert.ok(capturedModalConfig, 'Modal should be triggered');
assert.strictEqual(hasDeptInTree(capturedModalConfig.content), false, 'Notice Board editTodo must NOT show department');
console.log('  ✓ Regular user edit modals do not show department on Notice Board');

// Case B: System Admin edit
OC.store.setSession('u-admin');
capturedModalConfig = null;
OC.board.editInstruction(testNote);
assert.ok(capturedModalConfig, 'Modal should be triggered');
assert.strictEqual(hasDeptInTree(capturedModalConfig.content), false, 'Notice Board editInstruction must NOT show department to admin');

capturedModalConfig = null;
OC.board.editTodo(testTodo);
assert.ok(capturedModalConfig, 'Modal should be triggered');
assert.strictEqual(hasDeptInTree(capturedModalConfig.content), false, 'Notice Board editTodo must NOT show department to admin');
console.log('  ✓ Admin edit modals do not show department on Notice Board');

console.log('\n======================================================');
console.log(' 🎉 NOTICE BOARD NO-DEPARTMENT BEHAVIOR VERIFIED! ✅');
console.log('======================================================\n');
