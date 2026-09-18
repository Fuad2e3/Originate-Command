/* =========================================================================
   tests/client_assignee_dynamic_scoping_untick.test.js
   Verifies:
   1. Initial state with 0 assignees shows all users for System Admin.
   2. Selecting a user dynamically scopes the list strictly to their department.
   3. Unticking all members restores the full roster across all departments.
   4. Re-selecting a user from a different department correctly switches scope.
   5. Managing assignees on an existing client with no members (e.g. MRY) shows all users for Admin.
   6. Department Heads remain safely scoped to their own department.
   ========================================================================= */

const assert = require('assert');
require('./harness.js');

function makeElement(tag) {
  var el = {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    value: '',
    textContent: '',
    innerHTML: '',
    checked: false,
    get firstChild() {
      return this.children && this.children.length ? this.children[0] : null;
    },
    classList: {
      add: function (c) { if (!this.contains(c)) this._classes.push(c); },
      remove: function (c) {
        var idx = this._classes.indexOf(c);
        if (idx > -1) this._classes.splice(idx, 1);
      },
      contains: function (c) { return this._classes.indexOf(c) > -1; },
      _classes: []
    },
    style: {},
    attributes: {},
    children: [],
    events: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    appendChild: function (child) {
      if (child) {
        if (child.tagName === 'FRAGMENT') {
          while (child.children.length) {
            var c = child.children.shift();
            c.parentNode = this;
            this.children.push(c);
          }
          return child;
        }
        child.parentNode = this;
        this.children.push(child);
      }
      return child;
    },
    removeChild: function (child) {
      var idx = this.children.indexOf(child);
      if (idx > -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    addEventListener: function (type, handler) { this.events[type] = handler; },
    removeEventListener: function () {},
    querySelector: function (sel) {
      if (sel && sel.startsWith('.')) {
        var cls = sel.slice(1);
        var queue = [this];
        while (queue.length) {
          var curr = queue.shift();
          if (curr.classList && curr.classList.contains(cls)) return curr;
          if (curr.className && curr.className.split(' ').indexOf(cls) > -1) return curr;
          if (Array.isArray(curr.children)) {
            for (var i = 0; i < curr.children.length; i++) queue.push(curr.children[i]);
          }
        }
      }
      return null;
    },
    querySelectorAll: function (sel) {
      var matches = [];
      function walk(node) {
        if (!node) return;
        if (sel === 'input[type="checkbox"]' || sel === 'input') {
          if (node.tagName === 'INPUT' && (node.attributes.type === 'checkbox' || node.type === 'checkbox')) {
            matches.push(node);
          }
        } else if (sel && sel.startsWith('.')) {
          var cls = sel.slice(1);
          if ((node.classList && node.classList.contains(cls)) || (node.className && node.className.split(' ').indexOf(cls) > -1)) {
            matches.push(node);
          }
        }
        if (Array.isArray(node.children)) {
          node.children.forEach(walk);
        }
      }
      walk(this);
      return matches;
    }
  };
  return el;
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) { return { nodeType: 3, text: String(text) }; },
  createDocumentFragment: function () { return makeElement('fragment'); },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  body: makeElement('body'),
  documentElement: { setAttribute: function () {}, removeAttribute: function () {} }
};

function getText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.text || '';
  var s = node.textContent || node.value || '';
  if (Array.isArray(node.children)) {
    s += ' ' + node.children.map(getText).join(' ');
  }
  return s;
}

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/clients.js');

const S = OC.store;
S.load();

console.log('--- Testing Dynamic Client Assignee Scoping and Untick Behavior ---');

const admin = S.user('u-shohag');
const webUser = {
  id: 'u-web-spec1',
  name: 'Web Spec 1',
  email: 'web1@test.com',
  admin: false,
  departments: [{ department: 'd-web', level: 'member' }],
  status: 'active'
};
const outreachUser1 = {
  id: 'u-outreach-spec1',
  name: 'Outreach Spec 1',
  email: 'outreach1@test.com',
  admin: false,
  departments: [{ department: 'd-outreach', level: 'member' }],
  status: 'active'
};
const outreachUser2 = {
  id: 'u-outreach-spec2',
  name: 'Outreach Spec 2',
  email: 'outreach2@test.com',
  admin: false,
  departments: [{ department: 'd-outreach', level: 'member' }],
  status: 'active'
};
const outreachHead = {
  id: 'u-outreach-head',
  name: 'Outreach Head',
  email: 'outreachhead@test.com',
  admin: false,
  departments: [{ department: 'd-outreach', level: 'head' }],
  status: 'active'
};
S.state.users.push(webUser, outreachUser1, outreachUser2, outreachHead);

// Test 1: Admin opens picker with 0 assignees (Add new client scenario)
S.setSession(admin.id);
let picker = OC.ui.clientAssigneePicker([], [], null);
let listEl = picker.node.querySelector('.client-assignee-list');
let checkboxes = listEl.querySelectorAll('input[type="checkbox"]');

// Should see all users
assert.ok(checkboxes.length >= 4, 'Should show all active users across departments when 0 chosen');
console.log('  ✓ Initial state (0 chosen): all members across all departments are shown (' + checkboxes.length + ' users)');

// Test 2: Select an Outreach user
let outreachChk = null;
let webChk = null;
for (let i = 0; i < listEl.children.length; i++) {
  let label = listEl.children[i];
  let text = getText(label);
  if (text.indexOf('Outreach Spec 1') > -1) outreachChk = label.children[0];
  if (text.indexOf('Web Spec 1') > -1) webChk = label.children[0];
}
assert.ok(outreachChk, 'Found Outreach Spec 1 checkbox');
assert.ok(webChk, 'Found Web Spec 1 checkbox');

// Check Outreach Spec 1
outreachChk.checked = true;
outreachChk.events.change({ target: outreachChk });

// After checking Outreach Spec 1, picker list should re-render containing ONLY outreach members!
checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
let allAreOutreach = true;
for (let i = 0; i < listEl.children.length; i++) {
  let text = getText(listEl.children[i]);
  if (text.indexOf('Web Spec') > -1) allAreOutreach = false;
}
assert.strictEqual(allAreOutreach, true, 'Web members must be hidden after selecting an Outreach member');
assert.deepStrictEqual(picker.getDerivedDepartments(), ['d-outreach'], 'Derived department must be d-outreach');
console.log('  ✓ After selecting Outreach member: only Outreach team members are shown; Web members hidden');

// Test 3: Untick Outreach Spec 1 (all unchecked)
outreachChk = null;
for (let i = 0; i < listEl.children.length; i++) {
  let label = listEl.children[i];
  let text = getText(label);
  if (text.indexOf('Outreach Spec 1') > -1) outreachChk = label.children[0];
}
assert.ok(outreachChk, 'Found Outreach Spec 1 checkbox in scoped list');
outreachChk.checked = false;
outreachChk.events.change({ target: outreachChk });

// After unticking all, list should immediately show all users across all departments again!
checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
assert.ok(checkboxes.length >= 4, 'All users must be restored when all members are unticked');
let hasWebAgain = false;
for (let i = 0; i < listEl.children.length; i++) {
  let text = getText(listEl.children[i]);
  if (text.indexOf('Web Spec 1') > -1) hasWebAgain = true;
}
assert.strictEqual(hasWebAgain, true, 'Web members must be visible again after unticking all');
assert.deepStrictEqual(picker.getAssignees(), [], 'No assignees chosen');
console.log('  ✓ After unticking all members: all members across all departments are shown again');

// Test 4: Select a Web member now
webChk = null;
for (let i = 0; i < listEl.children.length; i++) {
  let label = listEl.children[i];
  let text = getText(label);
  if (text.indexOf('Web Spec 1') > -1) webChk = label.children[0];
}
assert.ok(webChk, 'Found Web Spec 1 checkbox');
webChk.checked = true;
webChk.events.change({ target: webChk });

assert.deepStrictEqual(picker.getDerivedDepartments(), ['d-web'], 'Derived department must now be d-web');
let hasOutreachNow = false;
for (let i = 0; i < listEl.children.length; i++) {
  let text = getText(listEl.children[i]);
  if (text.indexOf('Outreach Spec') > -1) hasOutreachNow = true;
}
assert.strictEqual(hasOutreachNow, false, 'Outreach members must be hidden after selecting Web member');
console.log('  ✓ Switched to Web member: scoped cleanly to Web department');

// Test 5: Existing client like MRY (initialDepts: ['d-outreach'], but 0 assignees)
let mryPicker = OC.ui.clientAssigneePicker([], ['d-outreach'], null);
let mryList = mryPicker.node.querySelector('.client-assignee-list');
let mryCheckboxes = mryList.querySelectorAll('input[type="checkbox"]');
assert.ok(mryCheckboxes.length >= 4, 'Admin must see all users even if client had previous department when assignees are empty');
console.log('  ✓ Existing client with no assignees shows all users for System Admin to allow department re-scoping');

// Test 6: Department Head (non-admin) remains scoped to their head department
S.setSession(outreachHead.id);
let headPicker = OC.ui.clientAssigneePicker([], [], null);
let headList = headPicker.node.querySelector('.client-assignee-list');
let headCheckboxes = headList.querySelectorAll('input[type="checkbox"]');
let onlyOutreachForHead = true;
for (let i = 0; i < headList.children.length; i++) {
  let text = getText(headList.children[i]);
  if (text.indexOf('Web Spec') > -1) onlyOutreachForHead = false;
}
assert.strictEqual(onlyOutreachForHead, true, 'Department Head must strictly only see their own department');
console.log('  ✓ Department Head strictly scoped to their own department');

console.log('\n🎉 ALL DYNAMIC CLIENT ASSIGNEE SCOPING & UNTICK TESTS PASSED! ✅\n');
process.exit(0);
