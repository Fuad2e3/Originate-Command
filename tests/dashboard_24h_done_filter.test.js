/* =========================================================================
   tests/dashboard_24h_done_filter.test.js
   Automated verification for Dashboard My Todos:
   1. Done button and Done list only show tasks completed within the last 24h.
   2. Completed tasks older than 24h are excluded.
   3. All pending/open tasks (including overdue) continue to be shown in Open.
   4. Toggling state (Complete and Undo/Reopen) updates 24h lists accurately.
   ========================================================================= */

const assert = require('assert');
require('./harness.js');

function makeElement(tag) {
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: '',
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
    style: {},
    attributes: {},
    children: [],
    events: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    appendChild: function (child) {
      if (typeof child === 'string') this.children.push({ nodeType: 3, text: child });
      else if (child) this.children.push(child);
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
loadFile('assets/js/dashboard.js');

console.log('--- Testing Dashboard 24-Hour Completed Filter & Pending Tasks ---');

const now = Date.now();
const isoNow = new Date(now).toISOString();
const iso2HoursAgo = new Date(now - 2 * 3600 * 1000).toISOString();
const iso23HoursAgo = new Date(now - 23 * 3600 * 1000).toISOString();
const iso25HoursAgo = new Date(now - 25 * 3600 * 1000).toISOString();
const iso3DaysAgo = new Date(now - 3 * 24 * 3600 * 1000).toISOString();

// Helper test
assert.strictEqual(OC.dashboard.isCompletedWithin24Hours({ completed_at: iso2HoursAgo }), true, '2h ago should be within 24h');
assert.strictEqual(OC.dashboard.isCompletedWithin24Hours({ completed_at: iso23HoursAgo }), true, '23h ago should be within 24h');
assert.strictEqual(OC.dashboard.isCompletedWithin24Hours({ completed_at: iso25HoursAgo }), false, '25h ago must not be within 24h');
assert.strictEqual(OC.dashboard.isCompletedWithin24Hours({ completed_at: iso3DaysAgo }), false, '3 days ago must not be within 24h');
assert.strictEqual(OC.dashboard.isCompletedWithin24Hours({}), false, 'Empty task must not be within 24h');
console.log('  ✓ isCompletedWithin24Hours logic verified');

// Set up store state
const testUser = {
  id: 'u-user-24h',
  name: 'Test User 24h',
  admin: false,
  departments: [{ department: 'd-test', role: 'member' }]
};

OC.store.load();
OC.store.state.users = [testUser];
OC.store.setSession(testUser.id);

OC.store.state.todos = [
  // Pending tasks (one overdue by 3 days, one due today)
  {
    id: 't-pending-overdue',
    title: 'Overdue task 3 days ago',
    state: 'open',
    due: '2026-09-03T10:00',
    assignee: testUser.id,
    created_at: iso3DaysAgo
  },
  {
    id: 't-pending-today',
    title: 'Task due today',
    state: 'open',
    due: new Date().toISOString().slice(0, 10) + 'T18:00',
    assignee: testUser.id,
    created_at: iso2HoursAgo
  },
  // Completed tasks: 1 within 24 hours
  {
    id: 't-done-recent',
    title: 'Completed 2 hours ago',
    state: 'done',
    completed_at: iso2HoursAgo,
    assignee: testUser.id,
    created_at: iso3DaysAgo
  },
  // Completed tasks: 2 outside 24 hours
  {
    id: 't-done-25h',
    title: 'Completed 25 hours ago',
    state: 'done',
    completed_at: iso25HoursAgo,
    assignee: testUser.id,
    created_at: iso3DaysAgo
  },
  {
    id: 't-done-3d',
    title: 'Completed 3 days ago',
    state: 'done',
    completed_at: iso3DaysAgo,
    assignee: testUser.id,
    created_at: iso3DaysAgo
  }
];

// Verify allMyTodos (pending tasks)
const openTodos = OC.dashboard.allMyTodos(testUser);
assert.strictEqual(openTodos.length, 2, 'Must have exactly 2 open todos');
assert(openTodos.some(t => t.id === 't-pending-overdue'), 'Open todos must include overdue task');
assert(openTodos.some(t => t.id === 't-pending-today'), 'Open todos must include today task');
console.log('  ✓ All pending tasks (including overdue) are preserved and shown');

// Verify allMyDoneTodos (24h filter)
const doneTodos = OC.dashboard.allMyDoneTodos(testUser);
assert.strictEqual(doneTodos.length, 1, 'Must have exactly 1 done todo within 24 hours');
assert.strictEqual(doneTodos[0].id, 't-done-recent', 'Done todo must be the one completed 2 hours ago');
console.log('  ✓ Only tasks completed within 24h are returned; older done tasks are excluded');

// Verify Dashboard Render UI output
function collectTexts(node, out) {
  out = out || [];
  if (typeof node === 'string') out.push(node);
  if (node && node.children) {
    node.children.forEach(function (c) {
      if (typeof c === 'string') out.push(c);
      else if (c && c.text) out.push(c.text);
      else collectTexts(c, out);
    });
  }
  return out;
}

const host = makeElement('div');
OC.dashboard.render(host, function () {});

const allTexts = collectTexts(host);
const hasOpenButton = allTexts.some(txt => txt === 'Open (2)');
const hasDoneButton = allTexts.some(txt => txt === 'Done (1)');

assert.strictEqual(hasOpenButton, true, 'Dashboard must render "Open (2)" button');
assert.strictEqual(hasDoneButton, true, 'Dashboard must render "Done (1)" button (reflecting 24h count)');
console.log('  ✓ Dashboard segmented buttons render "Open (2)" and "Done (1)"');

// Test task completion action
const targetTask = OC.store.state.todos.find(t => t.id === 't-pending-today');
OC.store.mutate({
  actor: testUser.id, action: 'todo.state', target: targetTask.title, detail: 'done', todoId: targetTask.id
}, function () {
  targetTask.state = 'done';
  targetTask.updated_at = new Date().toISOString();
  targetTask.completed_at = new Date().toISOString();
});

const openAfterComplete = OC.dashboard.allMyTodos(testUser);
const doneAfterComplete = OC.dashboard.allMyDoneTodos(testUser);
assert.strictEqual(openAfterComplete.length, 1, 'Open count should decrease to 1');
assert.strictEqual(doneAfterComplete.length, 2, 'Done count should increase to 2 (both within 24h)');
console.log('  ✓ Completing a task immediately moves it to 24h Done list');

// Test task undo action
OC.store.mutate({
  actor: testUser.id, action: 'todo.state', target: targetTask.title, detail: 'open', todoId: targetTask.id
}, function () {
  targetTask.state = 'open';
  targetTask.updated_at = new Date().toISOString();
  delete targetTask.completed_at;
});

const openAfterUndo = OC.dashboard.allMyTodos(testUser);
const doneAfterUndo = OC.dashboard.allMyDoneTodos(testUser);
assert.strictEqual(openAfterUndo.length, 2, 'Open count should restore to 2');
assert.strictEqual(doneAfterUndo.length, 1, 'Done count should restore to 1');
console.log('  ✓ Undoing a task immediately restores it to Open and removes from Done');

console.log('🎉 All Dashboard 24-hour completed filter tests passed successfully!\n');
