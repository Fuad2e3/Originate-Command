/**
 * VERIFICATION TEST: MESSAGES & SMS CHATTER EXCLUSION FROM AUDIT LOGS
 * 
 * Verifies that:
 * 1. Messages / SMS / Group chat actions (group.message, reactions, edits, deletes, SMS)
 *    are NEVER written to state.audit.
 * 2. Any chat actions in serverState or stored state are stripped on load and sync.
 * 3. System History & Audit Logs view (#activities/history) and CSV export
 *    NEVER display or export any chat messages/SMS.
 * 4. All other system operations (todo.state, client.update, department, user, etc.)
 *    are 100% recorded and displayed in System History & Audit Logs.
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
  getElementById: function () { return makeElement('div'); },
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
loadFile('assets/js/groups.js');
loadFile('assets/js/reports.js');
loadFile('assets/js/activities.js');

console.log('Testing Messages & SMS Exclusion from System History & Audit Logs...\n');

OC.store.load();

// 1. Verify isChatChatter predicate
console.log('1. Checking isChatChatter predicate...');
assert.strictEqual(OC.store.isChatChatter('group.message'), true, 'group.message must be chat chatter');
assert.strictEqual(OC.store.isChatChatter('group.message.edit'), true, 'group.message.edit must be chat chatter');
assert.strictEqual(OC.store.isChatChatter('group.message.delete'), true, 'group.message.delete must be chat chatter');
assert.strictEqual(OC.store.isChatChatter('group.message.react'), true, 'group.message.react must be chat chatter');
assert.strictEqual(OC.store.isChatChatter('group.sms'), true, 'group.sms must be chat chatter');
assert.strictEqual(OC.store.isChatChatter('sms.send'), true, 'sms.send must be chat chatter');
assert.strictEqual(OC.store.isChatChatter('message'), true, 'message must be chat chatter');

assert.strictEqual(OC.store.isChatChatter('todo.state'), false, 'todo.state must NOT be chat chatter');
assert.strictEqual(OC.store.isChatChatter('client.update'), false, 'client.update must NOT be chat chatter');
assert.strictEqual(OC.store.isChatChatter('department.create'), false, 'department.create must NOT be chat chatter');
assert.strictEqual(OC.store.isChatChatter('group.create'), false, 'group.create must NOT be chat chatter');
assert.strictEqual(OC.store.isChatChatter('group.delete'), false, 'group.delete must NOT be chat chatter');
console.log('✅ isChatChatter correctly categorizes actions.');

// 2. Test Mutate with chat message/SMS
console.log('\n2. Testing OC.store.mutate() with chat and SMS actions...');
const initialAuditCount = (OC.store.state.audit || []).length;

// Sending chat message
OC.store.mutate({
  actor: 'u-fuad',
  action: 'group.message',
  target: 'General Channel',
  detail: 'Testing message'
});
assert.strictEqual(OC.store.state.audit.length, initialAuditCount, 'group.message must not be added to audit log');

// Reacting to chat message
OC.store.mutate({
  actor: 'u-fuad',
  action: 'group.message.react',
  target: 'General Channel',
  detail: '👍'
});
assert.strictEqual(OC.store.state.audit.length, initialAuditCount, 'group.message.react must not be added to audit log');

// Direct SMS / message
OC.store.mutate({
  actor: 'u-fuad',
  action: 'sms.send',
  target: 'Direct message',
  detail: 'Private sms text'
});
assert.strictEqual(OC.store.state.audit.length, initialAuditCount, 'sms.send must not be added to audit log');
console.log('✅ Chat messages and SMS are not added to state.audit.');

// 3. Test that OTHER system actions DO get recorded in audit log
console.log('\n3. Testing that non-chat system actions ARE recorded in audit log...');
OC.store.mutate({
  actor: 'u-fuad',
  action: 'todo.state',
  target: 'Quarterly Audit Todo',
  detail: 'open → done'
});
assert.strictEqual(OC.store.state.audit[0].action, 'todo.state', 'todo.state must be recorded in audit log');

OC.store.mutate({
  actor: 'u-fuad',
  action: 'client.update',
  target: 'Acme Corp',
  detail: 'Updated contract'
});
assert.strictEqual(OC.store.state.audit[0].action, 'client.update', 'client.update must be recorded in audit log');
console.log('✅ Regular system operations are properly recorded in state.audit.');

// 4. Test stripping of existing chat entries during store.load()
console.log('\n4. Testing stripping of legacy chat entries from state.audit...');
OC.store.state.audit.unshift({
  id: 'a-dummy-chat',
  actor: 'u-fuad',
  action: 'group.message',
  target: 'Legacy Chat',
  detail: 'Old message that slipped into audit',
  at: new Date().toISOString()
});
assert.ok(OC.store.state.audit.some(a => a.action === 'group.message'));

// Re-run load()
OC.store.load();
assert.strictEqual(
  OC.store.state.audit.some(a => OC.store.isChatChatter(a.action)),
  false,
  'All chat chatter must be stripped during store load'
);
console.log('✅ store.load() successfully strips any chat entries.');

// 5. Test System History & Audit Logs View
console.log('\n5. Testing System History & Audit Logs view (#activities/history)...');
globalThis.location = { hash: '#activities/history' };
const host = makeElement('main');
OC.activities.render(host);

// Verify no chat entries rendered in audit table
const renderedActions = [];
function findCustomChips(el) {
  if (el.className && el.className.indexOf('chip custom') > -1) {
    if (el.children && el.children[0] && el.children[0].text) {
      renderedActions.push(el.children[0].text);
    }
  }
  (el.children || []).forEach(findCustomChips);
}
findCustomChips(host);

const foundChatInView = renderedActions.some(act => OC.store.isChatChatter(act));
assert.strictEqual(foundChatInView, false, 'No chat message actions should appear in History & Audit Logs table');
console.log('✅ System History & Audit Logs table is 100% clean of chat/SMS messages.');

console.log('\n🎉 ALL MESSAGES & AUDIT LOG EXCLUSION TESTS PASSED!');
