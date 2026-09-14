/**
 * todo_instruction_email_notification.test.js
 * Verifies email notification dispatch for Todo & Instruction creation with System Admins in CC.
 */

const assert = require('assert');
require('./harness.js');

function makeElement(tag) {
  return {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
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
    get firstChild() { return this.children[0] || null; },
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
  documentElement: { setAttribute: function () {}, removeAttribute: function () {} }
};

globalThis.OC = {};

loadFile('assets/js/icons.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/store.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/board.js');

console.log('==========================================================================');
console.log('  TODO & INSTRUCTION EMAIL NOTIFICATION (WITH ADMIN CC) TEST              ');
console.log('==========================================================================\n');

OC.store.load();

// Setup Users (1 Creator, 1 Assignee Member, 2 System Admins)
const creatorUser = { id: 'u-creator', name: 'Task Creator', email: 'creator@originate.example', admin: false };
const assigneeUser = { id: 'u-member', name: 'Task Member', email: 'member@originate.example', admin: false };
const admin1 = { id: 'u-admin1', name: 'Admin One', email: 'admin1@originate.example', admin: true };
const admin2 = { id: 'u-admin2', name: 'Admin Two', email: 'admin2@originate.example', admin: true };

OC.store.state.users = [creatorUser, assigneeUser, admin1, admin2];
OC.store.state.session = { user: creatorUser };
OC.store.user = () => creatorUser;

let capturedModal = null;
const origModal = OC.ui.modal;
OC.ui.modal = function (opts) {
  capturedModal = opts;
  return origModal(opts);
};

// Test 1: Verify direct call to dispatchActivityEmail for Todo
console.log('--- [1/2] Verifying Todo Email Dispatch with System Admin CC ---');
const todoPayload = OC.board.dispatchActivityEmail({
  type: 'Todo',
  title: 'Design New Homepage Banner',
  body: 'Complete M3 UI mockup for client portal homepage',
  recipientUserIds: [assigneeUser.id],
  actor: creatorUser
});

assert.ok(todoPayload, 'Todo email payload must be generated');
assert.strictEqual(todoPayload.to, 'member@originate.example', 'TO field must contain assignee email');
assert.ok(todoPayload.cc.includes('admin1@originate.example'), 'CC field must contain Admin 1 email');
assert.ok(todoPayload.cc.includes('admin2@originate.example'), 'CC field must contain Admin 2 email');
assert.strictEqual(todoPayload.type, 'Todo', 'Type must be Todo');
assert.ok(todoPayload.subject.includes('[Todo]'), 'Subject must include [Todo]');
console.log('  ✓ Todo Email Payload:');
console.log('    TO: ' + todoPayload.to);
console.log('    CC: ' + todoPayload.cc);
console.log('    Subject: ' + todoPayload.subject);

// Test 2: Verify direct call to dispatchActivityEmail for Instruction
console.log('\n--- [2/2] Verifying Instruction Email Dispatch with System Admin CC ---');
const instPayload = OC.board.dispatchActivityEmail({
  type: 'Instruction',
  title: 'Instruction (Development Operations)',
  body: 'Please submit weekly progress report before 5 PM Friday.',
  recipientUserIds: [assigneeUser.id],
  actor: creatorUser
});

assert.ok(instPayload, 'Instruction email payload must be generated');
assert.strictEqual(instPayload.to, 'member@originate.example', 'TO field must contain target audience email');
assert.ok(instPayload.cc.includes('admin1@originate.example'), 'CC field must contain Admin 1 email');
assert.ok(instPayload.cc.includes('admin2@originate.example'), 'CC field must contain Admin 2 email');
assert.strictEqual(instPayload.type, 'Instruction', 'Type must be Instruction');
assert.ok(instPayload.subject.includes('[Instruction]'), 'Subject must include [Instruction]');
console.log('  ✓ Instruction Email Payload:');
console.log('    TO: ' + instPayload.to);
console.log('    CC: ' + instPayload.cc);
console.log('    Subject: ' + instPayload.subject);

console.log('\n==========================================================================');
console.log('  🎉 TODO & INSTRUCTION EMAIL NOTIFICATION TESTS PASSED 100%! ✅');
console.log('==========================================================================\n');

setTimeout(() => process.exit(0), 100);
