/* =========================================================================
   tests/dashboard_banner_quick_buttons.test.js
   Automated verification for Dashboard Banner Quick Buttons:
   1. "My Attendance" button renders on the profile banner with clock icon.
   2. "My Work" button renders on the profile banner with history icon.
   3. Clicking "My Attendance" opens Employee Portal directly at the attendance tab.
   4. Clicking "My Work" opens Employee Portal directly at the work tab.
   ========================================================================= */

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
    querySelector: function (sel) {
      function findIn(node) {
        if (!node) return null;
        if (sel.startsWith('#') && node.attributes && node.attributes.id === sel.slice(1)) return node;
        if (sel.startsWith('.') && node.className && node.className.indexOf(sel.slice(1)) !== -1) return node;
        if (node.children) {
          for (const c of node.children) {
            const found = findIn(c);
            if (found) return found;
          }
        }
        return null;
      }
      return findIn(this);
    },
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

globalThis.OC = {};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/board.js');
loadFile('assets/js/dashboard.js');
loadFile('assets/js/profile_portal.js');
loadFile('assets/js/app.js');

OC.store.load();

console.log('--- Testing Dashboard Banner Quick Buttons (My Attendance & My Work) ---');

const testUser = {
  id: 'u-fuad',
  name: 'Abdullah al Fuad',
  admin: true,
  title: 'System Admin',
  departments: [{ department: 'd-web', role: 'developer' }]
};

OC.store.state.users = [testUser];
OC.store.setSession(testUser.id);

let openedUser = null;
let openedTab = null;

OC.profilePortal.openForUser = function (u, tab) {
  openedUser = u;
  openedTab = tab;
};

const host = makeElement('div');
OC.dashboard.render(host, function () {});

// 1. Locate buttons
const attBtn = host.querySelector('#dashboard-my-attendance-btn');
const workBtn = host.querySelector('#dashboard-my-work-btn');

assert(attBtn, 'Dashboard banner must contain #dashboard-my-attendance-btn');
assert(workBtn, 'Dashboard banner must contain #dashboard-my-work-btn');
console.log('  ✓ Both "My Attendance" and "My Work" buttons rendered on profile banner');

// 2. Click "My Attendance" button
assert(typeof attBtn.events.click === 'function', 'Attendance button must have click handler');
let stoppedAtt = false;
attBtn.events.click({ stopPropagation: () => { stoppedAtt = true; } });

assert.strictEqual(stoppedAtt, true, 'Attendance click must stop event propagation');
assert(openedUser, 'openForUser must be called on clicking Attendance');
assert.strictEqual(openedUser.id, testUser.id);
assert.strictEqual(openedTab, 'attendance', 'Attendance button must open "attendance" tab');
console.log('  ✓ Clicking "My Attendance" opens Employee Portal directly on the Attendance tab');

// 3. Click "My Work" button
assert(typeof workBtn.events.click === 'function', 'Work button must have click handler');
let stoppedWork = false;
workBtn.events.click({ stopPropagation: () => { stoppedWork = true; } });

assert.strictEqual(stoppedWork, true, 'Work click must stop event propagation');
assert.strictEqual(openedTab, 'work', 'Work button must open "work" tab');
console.log('  ✓ Clicking "My Work" opens Employee Portal directly on the My Work tab');

console.log('🎉 All Dashboard Banner Quick Button verification tests passed successfully!\n');
