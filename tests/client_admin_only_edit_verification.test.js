/**
 * tests/client_admin_only_edit_verification.test.js
 * Verification that Photo 2 edit actions:
 * 1. "Edit Client" button on client hero banner (#client-portal-edit-client-btn)
 * 2. "Edit" button on Extended Info card (#client-portal-edit-extended-btn)
 * are strictly restricted to System Admins only.
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
        while (child.children.length > 0) {
          this.appendChild(child.children.shift());
        }
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
  getElementById: function (id) {
    if (!this._elements) this._elements = {};
    if (!this._elements[id]) this._elements[id] = makeElement('div');
    return this._elements[id];
  },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  body: makeElement('body'),
  documentElement: {
    setAttribute: function () {},
    removeAttribute: function () {}
  }
};

globalThis.OC = {};

loadFile('assets/js/icons.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/store.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/clients.js');

OC.store.load();

console.log('--- Testing System Admin Only Client Edit Restriction (Photo 2) ---');

const adminUser = { id: 'u-admin-test', name: 'Admin Test', admin: true };
const headUser = { id: 'u-head-test', name: 'Head Test', admin: false, departments: [{ department: 'd-web', level: 'head' }] };
const memberUser = { id: 'u-member-test', name: 'Member Test', admin: false, departments: [{ department: 'd-web', level: 'member' }] };

OC.store.state.users.push(adminUser, headUser, memberUser);

const testClient = {
  id: 'c-test-client',
  name: 'Test Client',
  client_id: '0624 - SPN - Stephanie Sprayregen',
  client_code: 'SPN',
  client_number: '0624',
  status: 'paused',
  departments: ['d-web'],
  extended_fields: {}
};

OC.store.state.clients = (OC.store.state.clients || []).filter(c => c.id !== testClient.id);
OC.store.state.clients.push(testClient);

// 1. Check permission helper directly
assert.strictEqual(OC.can.canEditClient(adminUser, testClient), true, 'System Admin must have canEditClient = true');
assert.strictEqual(OC.can.canEditClient(headUser, testClient), false, 'Department Head must have canEditClient = false');
assert.strictEqual(OC.can.canEditClient(memberUser, testClient), false, 'Member must have canEditClient = false');
console.log('  ✓ OC.can.canEditClient strictly allows System Admin and disallows others');

// 2. Render Client Portal as System Admin
OC.store.setSession(adminUser.id);
const adminPage = document.getElementById('page');
OC.clients.openClientPortal(testClient.id);

const adminEditClientBtn = adminPage.querySelector('#client-portal-edit-client-btn');
const adminEditExtBtn = adminPage.querySelector('#client-portal-edit-extended-btn');

assert.ok(adminEditClientBtn, 'System Admin must see "Edit Client" button on Hero Banner');
assert.ok(adminEditExtBtn, 'System Admin must see "Edit" button on Extended Info Card');
console.log('  ✓ System Admin sees both Photo 2 edit buttons in Client Portal');

// 3. Render Client Portal as Department Head
OC.store.setSession(headUser.id);
const headPage = makeElement('div');
document._elements['page'] = headPage;
OC.clients.openClientPortal(testClient.id);

const headEditClientBtn = headPage.querySelector('#client-portal-edit-client-btn');
const headEditExtBtn = headPage.querySelector('#client-portal-edit-extended-btn');

assert.strictEqual(headEditClientBtn, null, 'Department Head must NOT see "Edit Client" button');
assert.strictEqual(headEditExtBtn, null, 'Department Head must NOT see "Edit" button on Extended Info');
console.log('  ✓ Department Head cannot see Photo 2 edit buttons');

// 4. Render Client Portal as Member
OC.store.setSession(memberUser.id);
const memberPage = makeElement('div');
document._elements['page'] = memberPage;
OC.clients.openClientPortal(testClient.id);

const memberEditClientBtn = memberPage.querySelector('#client-portal-edit-client-btn');
const memberEditExtBtn = memberPage.querySelector('#client-portal-edit-extended-btn');

assert.strictEqual(memberEditClientBtn, null, 'Member must NOT see "Edit Client" button');
assert.strictEqual(memberEditExtBtn, null, 'Member must NOT see "Edit" button on Extended Info');
console.log('  ✓ Regular Member cannot see Photo 2 edit buttons');

// 5. Direct call to editClient by non-admin is blocked
let toastMsg = '';
OC.ui.toast = function (msg) { toastMsg = msg; };
OC.clients.editClient(testClient, () => {});
assert.strictEqual(toastMsg, 'Only System Admins can edit client details.', 'Direct call to editClient must be blocked');
console.log('  ✓ Programmatic execution of editClient is blocked with admin-only toast alert');

console.log('🎉 System Admin Client Edit Restriction tests passed successfully!\n');
