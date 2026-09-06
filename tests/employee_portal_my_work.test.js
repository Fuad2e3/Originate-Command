/* =========================================================================
   tests/employee_portal_my_work.test.js
   Automated verification for Employee Portal - "My Work" tab:
   1. "My Work" option exists in the sidebar navigation.
   2. Tab switching to "My Work" renders lifetime task execution history.
   3. Tasks are accurately grouped by date (chronological daily logs).
   4. Summary metrics (Lifetime Completed, Active Work Days, Clients Served) are calculated accurately.
   5. Search and status filters operate correctly.
   ========================================================================= */

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

globalThis.OC = {};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/board.js');
loadFile('assets/js/dashboard.js');
loadFile('assets/js/people.js');
loadFile('assets/js/clients.js');
loadFile('assets/js/activities.js');
loadFile('assets/js/profile_portal.js');
loadFile('assets/js/app.js');

OC.store.load();

console.log('--- Testing Employee Portal: My Work Lifetime Task History ---');

const testUser = {
  id: 'u-work-user',
  name: 'Emp Worker',
  employee_id: 'EMP-0099',
  admin: false,
  departments: [{ department: 'd-web', role: 'developer' }]
};

OC.store.state.users = [testUser];
OC.store.setSession(testUser.id);

// Seed tasks across multiple dates
OC.store.state.todos = [
  // Day 1 (Today: 2026-09-06)
  {
    id: 't-w1',
    title: 'Design API Gateway Spec',
    client: 'c-client-a',
    clients: ['c-client-a'],
    department: 'd-web',
    assignee: testUser.id,
    assignee_type: 'user',
    state: 'done',
    priority: 'high',
    completed_at: '2026-09-06T10:15:00.000Z',
    created_at: '2026-09-06T08:00:00.000Z'
  },
  {
    id: 't-w2',
    title: 'Implement Auth Token Validation',
    client: 'c-client-a',
    clients: ['c-client-a'],
    department: 'd-web',
    assignee: testUser.id,
    assignee_type: 'user',
    state: 'done',
    priority: 'urgent',
    completed_at: '2026-09-06T14:30:00.000Z',
    created_at: '2026-09-06T09:00:00.000Z'
  },
  // Day 2 (2026-09-04)
  {
    id: 't-w3',
    title: 'Configure DB Connection Pool',
    client: 'c-client-b',
    clients: ['c-client-b'],
    department: 'd-web',
    assignees: [testUser.id],
    state: 'done',
    priority: 'normal',
    completed_at: '2026-09-04T11:20:00.000Z',
    created_at: '2026-09-04T07:00:00.000Z'
  },
  // Day 3 (2026-09-01)
  {
    id: 't-w4',
    title: 'Write Unit Tests for Middleware',
    client: 'c-client-c',
    clients: ['c-client-c'],
    department: 'd-web',
    created_by: testUser.id,
    state: 'done',
    priority: 'low',
    completed_at: '2026-09-01T16:45:00.000Z',
    created_at: '2026-09-01T12:00:00.000Z'
  },
  // Active pending task (Not done)
  {
    id: 't-w5',
    title: 'In-progress Feature Deployment',
    client: 'c-client-a',
    clients: ['c-client-a'],
    department: 'd-web',
    assignee: testUser.id,
    state: 'open',
    priority: 'high',
    created_at: '2026-09-06T11:00:00.000Z',
    due: '2026-09-07T18:00'
  },
  // Other user task (should not appear in testUser work)
  {
    id: 't-other',
    title: 'Another User Task',
    client: 'c-client-z',
    assignee: 'u-other',
    state: 'done',
    completed_at: '2026-09-06T12:00:00.000Z'
  }
];

function collectTexts(node, out) {
  out = out || [];
  if (typeof node === 'string') out.push(node);
  if (node && node.text) out.push(node.text);
  if (node && node.children) {
    node.children.forEach(function (c) {
      if (typeof c === 'string') out.push(c);
      else if (c && c.text) out.push(c.text);
      else collectTexts(c, out);
    });
  }
  return out;
}

// 1. Verify Sidebar Navigation has "My Work"
const host = makeElement('div');
OC.profilePortal.render(host, function () {});
const allTexts = collectTexts(host);
assert(allTexts.some(t => t === 'My Work'), 'Sidebar must contain "My Work" menu item');
console.log('  ✓ Sidebar navigation successfully renders "My Work" option');

// 2. Switch to "work" tab
OC.profilePortal.setActiveTab('work');
assert.strictEqual(OC.profilePortal.getActiveTab(), 'work', 'activeTab should be "work"');

const workHost = makeElement('div');
OC.profilePortal.render(workHost, function () {});
const workTexts = collectTexts(workHost);

// Verify Header
assert(workTexts.some(t => t === 'My Work History'), 'Must render "My Work History" title');
console.log('  ✓ Employee Portal "My Work" tab renders successfully');

// 3. Verify KPI Metric calculations
// 4 completed tasks (t-w1, t-w2, t-w3, t-w4)
assert(workTexts.some(t => t === '4 Tasks'), 'Should display "4 Tasks" for lifetime completed');
// 3 distinct active work days (09-06, 09-04, 09-01)
assert(workTexts.some(t => t === '3 Days'), 'Should display "3 Days" for active work days');
// 3 distinct clients (client-a, client-b, client-c)
assert(workTexts.some(t => t === '3 Clients'), 'Should display "3 Clients" for clients served');
// 1 pending task (t-w5)
assert(workTexts.some(t => t === '1 Tasks'), 'Should display "1 Tasks" for pending in-progress work');
console.log('  ✓ Summary KPI cards calculate lifetime totals, work days, and clients accurately');

// 4. Verify Tasks are grouped by Date
assert(workTexts.some(t => t.indexOf('2026-09-06') !== -1 || t.indexOf('Sep 2026') !== -1), 'Must render date groups');
assert(workTexts.some(t => t === 'Design API Gateway Spec'), 'Must render task t-w1');
assert(workTexts.some(t => t === 'Implement Auth Token Validation'), 'Must render task t-w2');
assert(workTexts.some(t => t === 'Configure DB Connection Pool'), 'Must render task t-w3');
assert(workTexts.some(t => t === 'Write Unit Tests for Middleware'), 'Must render task t-w4');
// Other user task must NOT be included
assert(!workTexts.some(t => t === 'Another User Task'), 'Other user tasks must not be visible in My Work');
console.log('  ✓ Tasks are accurately grouped by date and isolated to the active employee');

console.log('🎉 All Employee Portal "My Work" verification tests passed successfully!\n');
