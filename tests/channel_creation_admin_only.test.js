/**
 * tests/channel_creation_admin_only.test.js
 * Verification that new channel/group creation:
 * - "+ New" button in Messages / Channels sidebar (#discord-sidebar-new-channel-btn)
 * - OC.can.createGroup
 * - OC.groups.newGroup()
 * is strictly restricted to System Admins only.
 */

const assert = require('assert');
require('./harness.js');

function makeElement(tag) {
  const el = {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    classList: {
      _classes: [],
      add: function (c) { if (this._classes.indexOf(c) === -1) this._classes.push(c); },
      remove: function (c) { const i = this._classes.indexOf(c); if (i > -1) this._classes.splice(i, 1); },
      contains: function (c) { return this._classes.indexOf(c) > -1; }
    },
    style: {},
    attributes: {},
    children: [],
    value: '',
    innerHTML: '',
    events: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    removeAttribute: function (k) { delete this.attributes[k]; },
    addEventListener: function (type, handler) { this.events[type] = handler; },
    removeEventListener: function () {},
    appendChild: function (child) {
      if (!child) return child;
      if (child.nodeType === 11 || child.tagName === 'FRAGMENT') {
        while (child.children.length > 0) this.appendChild(child.children.shift());
        return child;
      }
      if (typeof child === 'string') {
        const textNode = { nodeType: 3, text: child, parentNode: this };
        this.children.push(textNode);
      } else {
        child.parentNode = this;
        this.children.push(child);
      }
      return child;
    },
    removeChild: function (child) {
      const idx = this.children.indexOf(child);
      if (idx > -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    get firstChild() { return this.children[0] || null; },
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
    querySelectorAll: function (sel) {
      const matches = [];
      function findIn(node) {
        if (!node) return;
        if (sel.startsWith('#') && node.attributes && node.attributes.id === sel.slice(1)) matches.push(node);
        if (sel.startsWith('.') && node.className && node.className.indexOf(sel.slice(1)) !== -1) matches.push(node);
        if (node.children) {
          for (const c of node.children) findIn(c);
        }
      }
      findIn(this);
      return matches;
    }
  };
  return el;
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) { return { nodeType: 3, text: String(text) }; },
  createDocumentFragment: function () {
    const frag = makeElement('fragment');
    frag.nodeType = 11;
    return frag;
  },
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
loadFile('assets/js/groups.js');
loadFile('assets/js/messages.js');

OC.store.load();

console.log('--- Testing System Admin Only Channel Creation ---');

const adminUser = { id: 'u-admin-test', name: 'Admin Fuad', admin: true };
const headUser = { id: 'u-head-test', name: 'Web Head', admin: false, departments: [{ department: 'd-web', level: 'head' }] };
const memberUser = { id: 'u-member-test', name: 'Web Member', admin: false, departments: [{ department: 'd-web', level: 'member' }] };

OC.store.state.users.push(adminUser, headUser, memberUser);

// 1. Permission checks
assert.strictEqual(OC.can.createGroup(adminUser), true, 'System Admin must be allowed to create groups');
assert.strictEqual(OC.can.createGroup(headUser), false, 'Department Head must NOT be allowed to create groups');
assert.strictEqual(OC.can.createGroup(memberUser), false, 'Regular member must NOT be allowed to create groups');
console.log('  ✓ OC.can.createGroup strictly allows System Admin and disallows others');

// 2. Render as System Admin
OC.store.setSession(adminUser.id);
const adminHost = makeElement('div');
OC.groups.render(adminHost, () => {}, true);

const adminNewBtn = adminHost.querySelector('#discord-sidebar-new-channel-btn');
assert.ok(adminNewBtn, 'System Admin must see "+ New" channel button in Messages sidebar');
console.log('  ✓ System Admin sees "+ New" button in Channels sidebar');

// 3. Render as Department Head
OC.store.setSession(headUser.id);
const headHost = makeElement('div');
OC.groups.render(headHost, () => {}, true);

const headNewBtn = headHost.querySelector('#discord-sidebar-new-channel-btn');
assert.strictEqual(headNewBtn, null, 'Department Head must NOT see "+ New" channel button');
console.log('  ✓ Department Head cannot see "+ New" channel button');

// 4. Render as Regular Member
OC.store.setSession(memberUser.id);
const memberHost = makeElement('div');
OC.groups.render(memberHost, () => {}, true);

const memberNewBtn = memberHost.querySelector('#discord-sidebar-new-channel-btn');
assert.strictEqual(memberNewBtn, null, 'Regular member must NOT see "+ New" channel button');
console.log('  ✓ Regular member cannot see "+ New" channel button');

// 5. Programmatic call to newGroup by non-admin is blocked
let toastMsg = '';
OC.ui.toast = function (msg) { toastMsg = msg; };
OC.groups.newGroup(() => {});
assert.strictEqual(toastMsg, 'Only System Admins can create a new channel.', 'newGroup must show toast and block non-admins');
console.log('  ✓ Direct execution of newGroup is blocked for non-admins with alert toast');

console.log('🎉 System Admin Only Channel Creation verification tests passed successfully!\n');
