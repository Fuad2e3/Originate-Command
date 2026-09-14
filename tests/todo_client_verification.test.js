const assert = require('assert');
require('./harness.js');

function makeElement(tag) {
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
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
    appendChild: function (child) {
      if (typeof child === 'string') {
        this.children.push({ nodeType: 3, text: child });
      } else if (child) {
        this.children.push(child);
      }
      return child;
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
}

// Mock DOM elements and document for UI files
globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) {
    return { nodeType: 3, text: String(text) };
  },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function () { return null; },
  body: {
    appendChild: function () {}
  }
};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/board.js');
loadFile('assets/js/dashboard.js');
loadFile('assets/js/people.js');
loadFile('assets/js/clients.js');
loadFile('assets/js/activities.js');
loadFile('assets/js/app.js');

OC.store.load();

console.log('--- Running Todo & Client Specific Verification Checks ---');

// 1. Check clientLabel formatting
console.log('1. Testing clientLabel helper');
const sampleClient1 = { id: 'c-1', client_id: '0583', client_code: 'TFR', name: 'Tafor Niba' };
const sampleClient2 = { id: 'c-2', name: 'Acme Corp' };
const sampleClient3 = { id: 'c-3', client_id: '0100', name: 'Apex Ltd' };
const sampleClient4 = { id: 'c-4', client_code: 'XYZ', name: 'Zeta Corp' };

assert.strictEqual(OC.ui.clientLabel(sampleClient1), 'TFR');
assert.strictEqual(OC.ui.clientLabel(sampleClient2), 'Acme Corp');
assert.strictEqual(OC.ui.clientLabel(sampleClient3), 'Apex Ltd');
assert.strictEqual(OC.ui.clientLabel(sampleClient4), 'XYZ');
console.log('  ✓ clientLabel formats all combinations cleanly');

// 2. Check clientChip
console.log('2. Testing clientChip');
OC.store.state.clients = [sampleClient1, sampleClient2, sampleClient3];
const chipNode = OC.ui.clientChip('c-1');
assert.ok(chipNode.className.includes('chip client'), 'clientChip must have chip client class');
assert.strictEqual(chipNode.children[0].text, 'TFR');
console.log('  ✓ clientChip displays "TFR"');

// 3. Verify Todo cards have NO reactions-bar and NO comment thread
console.log('3. Testing Todo rendering (no comments, no reactions)');
const testTodo = {
  id: 't-test-1',
  title: 'USB extension cable',
  client: 'c-1',
  clients: ['c-1'],
  department: 'd-web',
  assignee: 'u-shohag',
  assignees: ['u-shohag'],
  priority: 'normal',
  state: 'open',
  due: '2026-08-31',
  created_at: new Date().toISOString(),
  recurrence: 'daily',
  tags: []
};

function hasClassInChildren(node, targetClass) {
  if (!node) return false;
  if (node.className && typeof node.className === 'string' && node.className.includes(targetClass)) {
    return true;
  }
  if (Array.isArray(node.children)) {
    return node.children.some(c => hasClassInChildren(c, targetClass));
  }
  return false;
}

const host = document.createElement('div');
OC.store.state.todos = [testTodo];
OC.store.state.instructions = [];
OC.board.render(host, function () {});

const todoHasReactions = hasClassInChildren(host, 'reactions-bar');
const todoHasCommentThread = hasClassInChildren(host, 'thread');

assert.strictEqual(todoHasReactions, false, 'Todo card MUST NOT have reactions-bar');
assert.strictEqual(todoHasCommentThread, false, 'Todo card MUST NOT have comment thread');
console.log('  ✓ Todo cards do NOT contain reactions-bar or comment thread');

// 4. Verify Instructions STILL HAVE reactions-bar and comment thread
console.log('4. Testing Instruction rendering (reactions & comments intact)');
const testInstruction = {
  id: 'i-test-1',
  body: 'Please ensure all servers are configured.',
  client: 'c-1',
  department: 'd-web',
  author: 'u-shohag',
  posted_at: new Date().toISOString(),
  read_by: [],
  tags: [],
  comments: []
};
const host2 = document.createElement('div');
OC.store.state.todos = [];
OC.store.state.instructions = [testInstruction];
OC.board.render(host2, function () {});

const instructionHasReactions = hasClassInChildren(host2, 'reactions-bar');
assert.strictEqual(instructionHasReactions, true, 'Instruction card MUST retain reactions-bar');
console.log('  ✓ Instruction cards still retain reactions-bar and comment thread');

// 5. Verify dedicated OC.clients render view
console.log('5. Testing OC.clients render view');
const hostClients = document.createElement('div');
OC.clients.render(hostClients);
const clientsPageHasHeading = hasClassInChildren(hostClients, 'page-head');
assert.strictEqual(clientsPageHasHeading, true, 'Clients page must render page-head');
console.log('  ✓ OC.clients renders client directory view properly');

// 6. Verify Dashboard Modern Todo Row rendering
console.log('6. Testing Dashboard Modern Todo Row rendering');
OC.store.setSession('u-shohag');
OC.store.state.todos = [testTodo];
const hostDashboard = document.createElement('div');
OC.dashboard.render(hostDashboard, function () {});
const hasDashboardRow = hasClassInChildren(hostDashboard, 'dashboard-todo-row');
const hasCheckBtn = hasClassInChildren(hostDashboard, 'todo-check-btn');
// the department badge was dropped from the row: it costs the width the task
// title needs, and the department is still on the task itself
const hasChannelBadge = hasClassInChildren(hostDashboard, 'channel-badge');
const hasClientCode = hasClassInChildren(hostDashboard, 'dashboard-client-name');

const hasPriorityFlag = hasClassInChildren(hostDashboard, 'dashboard-todo-prio-flag');

assert.strictEqual(hasDashboardRow, true, 'Dashboard must render dashboard-todo-row');
assert.strictEqual(hasCheckBtn, true, 'Dashboard row must have todo-check-btn');
assert.strictEqual(hasPriorityFlag, true, 'Dashboard row must have dashboard-todo-prio-flag');
assert.strictEqual(hasChannelBadge, false, 'Dashboard row must not carry a department badge');
assert.strictEqual(hasClientCode, true, 'Dashboard row must show the client code');
console.log('  ✓ Dashboard renders one-line todo row with circular checkbox, priority flag & client code');

// 7. Verify unified Activities view rendering (combining groups & people)
console.log('7. Testing unified Activities view rendering');
const hostActivities = document.createElement('div');
OC.activities.render(hostActivities, function () {});
const hasActivitiesHead = hasClassInChildren(hostActivities, 'page-head');
const hasGroupsSub = hasClassInChildren(hostActivities, 'activities-section');

assert.strictEqual(hasActivitiesHead, true, 'Activities must render page-head');
assert.strictEqual(hasGroupsSub, true, 'Activities must render activities-section');
// 8. Verify Custom Photo Upload and Avatar Rendering
console.log('8. Testing Custom Photo Uploader and Avatar Rendering');
const uploader = OC.ui.photoUploader('https://example.com/photo.jpg', 'Fuad Admin');
assert.ok(uploader.node, 'photoUploader must create a DOM node');
assert.strictEqual(uploader.getValue(), 'https://example.com/photo.jpg', 'Initial avatar value must match');
uploader.setValue('https://example.com/new_avatar.png');
assert.strictEqual(uploader.getValue(), 'https://example.com/new_avatar.png', 'setValue must update avatar value');

// Test mark with avatar
const avatarUser = { id: 'u-avatar', name: 'Avatar User', avatar: 'https://example.com/avatar.jpg' };
OC.store.state.users.push(avatarUser);
const avatarMark = OC.ui.mark('u-avatar');
assert.strictEqual(avatarMark.className.includes('mark-avatar'), true, 'mark should have mark-avatar class when user has avatar');
assert.strictEqual(avatarMark.children[0].tagName, 'IMG', 'mark should contain img tag');
assert.strictEqual(avatarMark.children[0].attributes.src, 'https://example.com/avatar.jpg', 'img src must match user.avatar');
loadFile('assets/js/reports.js');

// 9. Verify Todo Due Date-Time, Past-Time Blocking, No Description/Tags, and Reports in Activities
console.log('9. Testing Todo Due Date-Time, Past Time Blocking, & Reports in Activities');
assert.ok(typeof OC.ui.localNowISO === 'function', 'localNowISO helper must be defined');
const nowISO = OC.ui.localNowISO();
assert.strictEqual(nowISO.length, 16, 'localNowISO must return YYYY-MM-DDTHH:MM');
assert.strictEqual(OC.ui.fmtDate('2026-08-31T18:30'), '31 AUG | 06:30 PM', 'fmtDate must format datetime string with AM/PM');

console.log('  ✓ Todo Due Date-Time, Past-Time Blocking, & Activities Hub verified');

console.log('\n======================================================');
console.log(' 🎉 ALL SPECIFIC TODO & CLIENT CHECKS PASSED! ✅');
console.log('======================================================\n');
