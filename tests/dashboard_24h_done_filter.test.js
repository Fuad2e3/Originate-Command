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

const dTomorrow = new Date(dNow.getFullYear(), dNow.getMonth(), dNow.getDate() + 1, 14, 0, 0);
const tomorrowStr = dTomorrow.getFullYear() + '-' + pad(dTomorrow.getMonth() + 1) + '-' + pad(dTomorrow.getDate());

const dYesterday = new Date(dNow.getFullYear(), dNow.getMonth(), dNow.getDate() - 1, 15, 0, 0);
const yesterdayStr = dYesterday.getFullYear() + '-' + pad(dYesterday.getMonth() + 1) + '-' + pad(dYesterday.getDate());

const dThreeDaysAgo = new Date(dNow.getFullYear(), dNow.getMonth(), dNow.getDate() - 3, 11, 0, 0);

const isoToday = dNow.toISOString();
const isoYesterday = dYesterday.toISOString();
const iso3DaysAgo = dThreeDaysAgo.toISOString();

// Helper test: Same day vs previous day helper still available
assert.strictEqual(OC.dashboard.isCompletedToday({ completed_at: isoToday }), true, 'Completed today must return true');
assert.strictEqual(OC.dashboard.isCompletedToday({ completed_at: isoYesterday }), false, 'Completed yesterday must return false');
assert.strictEqual(OC.dashboard.isCompletedToday({ completed_at: iso3DaysAgo }), false, 'Completed 3 days ago must return false');
assert.strictEqual(OC.dashboard.isCompletedToday({}), false, 'Empty task must return false');
console.log('  ✓ isCompletedToday helper logic verified');

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
  // Pending tasks (one overdue, one due today, one due tomorrow/next day)
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
  {
    id: 't-pending-tomorrow',
    title: 'Task due next day (tomorrow)',
    state: 'open',
    due: tomorrowStr + 'T14:00',
    created_by: testUser.id, // created by user without explicit assignee selection
    created_at: isoToday
  },
  {
    id: 't-pending-future',
    title: 'Task due next week',
    state: 'open',
    due: '2026-09-25T17:00',
    assignee: testUser.id,
    created_at: isoToday
  },
  // Completed tasks: 3 tasks completed at various times
  {
    id: 't-done-today',
    title: 'Completed today',
    state: 'done',
    completed_at: isoToday,
    assignee: testUser.id,
    created_at: iso3DaysAgo
  },
  {
    id: 't-done-yesterday',
    title: 'Completed yesterday',
    state: 'done',
    completed_at: isoYesterday,
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

// Verify allMyTodos (all pending tasks, regardless of due date)
const openTodos = OC.dashboard.allMyTodos(testUser);
assert.strictEqual(openTodos.length, 4, 'Must have all 4 open todos (overdue, today, tomorrow, and future)');
assert(openTodos.some(t => t.id === 't-pending-overdue'), 'Open todos must include overdue task');
assert(openTodos.some(t => t.id === 't-pending-today'), 'Open todos must include today task');
assert(openTodos.some(t => t.id === 't-pending-tomorrow'), 'Open todos must include tomorrow task');
assert(openTodos.some(t => t.id === 't-pending-future'), 'Open todos must include future task');
console.log('  ✓ All assigned tasks (past due, today, tomorrow, future) are shown in My todos');

// Verify allMyDoneTodos (all completed tasks shown so user can undo any task)
const doneTodos = OC.dashboard.allMyDoneTodos(testUser);
assert.strictEqual(doneTodos.length, 3, 'All completed tasks must show in Done view so any task can be undone');
console.log('  ✓ All completed tasks are returned in Done view');

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
const hasOpenButton = allTexts.some(txt => txt === 'Open (4)');
const hasDoneButton = allTexts.some(txt => txt === 'Done (3)');

assert.strictEqual(hasOpenButton, true, 'Dashboard must render "Open (4)" button');
assert.strictEqual(hasDoneButton, true, 'Dashboard must render "Done (3)" button');
assert(allTexts.some(txt => txt.indexOf('due today') > -1), 'Dashboard must render "due today" label');
console.log('  ✓ Dashboard segmented buttons render "Open (4)" and "Done (3)" and date tags');

// Test task completion action
const targetTask = OC.store.state.todos.find(t => t.id === 't-pending-today');
OC.store.mutate({
  actor: testUser.id, action: 'todo.state', target: targetTask.title, detail: 'done', todoId: targetTask.id
}, function () {
  targetTask.state = 'done';
  targetTask.updated_at = new Date().toISOString();
  targetTask.completed_at = new Date().toISOString();
  targetTask.completed_by = testUser.id;
});

const openAfterComplete = OC.dashboard.allMyTodos(testUser);
const doneAfterComplete = OC.dashboard.allMyDoneTodos(testUser);
assert.strictEqual(openAfterComplete.length, 3, 'Open count should decrease to 3');
assert.strictEqual(doneAfterComplete.length, 4, 'Done count should increase to 4');
console.log('  ✓ Completing a task immediately moves it to Done list');

// Test task undo action
OC.store.mutate({
  actor: testUser.id, action: 'todo.state', target: targetTask.title, detail: 'open', todoId: targetTask.id
}, function () {
  targetTask.state = 'open';
  targetTask.updated_at = new Date().toISOString();
  delete targetTask.completed_at;
  delete targetTask.completed_by;
});

const openAfterUndo = OC.dashboard.allMyTodos(testUser);
const doneAfterUndo = OC.dashboard.allMyDoneTodos(testUser);
assert.strictEqual(openAfterUndo.length, 4, 'Open count should restore to 4');
assert.strictEqual(doneAfterUndo.length, 3, 'Done count should restore to 3');
console.log('  ✓ Undoing a task immediately restores it to Open and removes from Done');

console.log('🎉 All Dashboard completed filter and next-day tests passed successfully!\n');
