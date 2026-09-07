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

console.log('--- Testing Dashboard Today-Only Completed Filter & Pending Tasks ---');

const dNow = new Date();
const pad = function (n) { return n < 10 ? '0' + n : String(n); };
const todayStr = dNow.getFullYear() + '-' + pad(dNow.getMonth() + 1) + '-' + pad(dNow.getDate());

const dYesterday = new Date(dNow.getFullYear(), dNow.getMonth(), dNow.getDate() - 1, 15, 0, 0);
const yesterdayStr = dYesterday.getFullYear() + '-' + pad(dYesterday.getMonth() + 1) + '-' + pad(dYesterday.getDate());

const dThreeDaysAgo = new Date(dNow.getFullYear(), dNow.getMonth(), dNow.getDate() - 3, 11, 0, 0);

const isoToday = dNow.toISOString();
const isoYesterday = dYesterday.toISOString();
const iso3DaysAgo = dThreeDaysAgo.toISOString();

// Helper test: Same day vs previous day
assert.strictEqual(OC.dashboard.isCompletedToday({ completed_at: isoToday }), true, 'Completed today must return true');
assert.strictEqual(OC.dashboard.isCompletedToday({ completed_at: isoYesterday }), false, 'Completed yesterday (previous date, e.g. 6th vs 7th) must return false on new day');
assert.strictEqual(OC.dashboard.isCompletedToday({ completed_at: iso3DaysAgo }), false, 'Completed 3 days ago must return false');
assert.strictEqual(OC.dashboard.isCompletedToday({}), false, 'Empty task must return false');
console.log('  ✓ isCompletedToday (new day exclusion) logic verified');

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
    due: todayStr + 'T18:00',
    assignee: testUser.id,
    created_at: isoToday
  },
  // Completed today: 1
  {
    id: 't-done-today',
    title: 'Completed today',
    state: 'done',
    completed_at: isoToday,
    assignee: testUser.id,
    created_at: iso3DaysAgo
  },
  // Completed yesterday (e.g. 6th when today is 7th): must NOT show on new day
  {
    id: 't-done-yesterday',
    title: 'Completed yesterday',
    state: 'done',
    completed_at: isoYesterday,
    assignee: testUser.id,
    created_at: iso3DaysAgo
  },
  // Completed 3 days ago: must NOT show
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

// Verify allMyDoneTodos (today-only filter)
const doneTodos = OC.dashboard.allMyDoneTodos(testUser);
assert.strictEqual(doneTodos.length, 1, 'Must have exactly 1 done todo completed today');
assert.strictEqual(doneTodos[0].id, 't-done-today', 'Done todo must be the one completed today');
console.log('  ✓ Only tasks completed today are returned; yesterday (6th date) and older tasks are excluded on the new day (7th date)');

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
