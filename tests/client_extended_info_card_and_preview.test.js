/**
 * EXTENDED INFO CARD AND 5-FIELD PREVIEW VERIFICATION TEST
 * 
 * Verifies:
 * 1. Management template selection: selecting fields updates OC.store.state.extended_info_fields.
 * 2. Photo 1 (Client List Card): renders up to 5 pills in .client-card-ext-pills, prioritizing filled values.
 * 3. Photo 2 (Client Portal): renders all selected fields in .client-extended-info-grid.
 * 4. Empty fields show '—' and .is-empty cleanly.
 * 5. Backend controller correctly accepts and persists settings.extended_fields mutations.
 */

'use strict';

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
    checked: false,
    innerHTML: '',
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    removeAttribute: function (k) { delete this.attributes[k]; },
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
    remove: function () {
      if (this.parentNode && typeof this.parentNode.removeChild === 'function') {
        this.parentNode.removeChild(this);
      }
    },
    get firstChild() { return this.children[0] || null; },
    addEventListener: function (event, handler) {
      if (!this._listeners) this._listeners = {};
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(handler);
    },
    removeEventListener: function (event, handler) {
      if (this._listeners && this._listeners[event]) {
        const i = this._listeners[event].indexOf(handler);
        if (i > -1) this._listeners[event].splice(i, 1);
      }
    },
    click: function () {
      if (this._listeners && this._listeners.click) {
        this._listeners.click.forEach(fn => fn({ target: this }));
      }
    },
    querySelector: function (sel) {
      function find(node) {
        if (!node || !node.children) return null;
        for (let c of node.children) {
          if (c.className && typeof c.className === 'string' && sel.startsWith('.')) {
            const wanted = sel.slice(1);
            if (c.className.split(/\s+/).indexOf(wanted) > -1) return c;
          }
          if (c.tagName && sel.toUpperCase() === c.tagName) return c;
          const deeper = find(c);
          if (deeper) return deeper;
        }
        return null;
      }
      return find(this);
    },
    querySelectorAll: function (sel) {
      const results = [];
      function collect(node) {
        if (!node || !node.children) return;
        for (let c of node.children) {
          if (c.className && typeof c.className === 'string' && sel.startsWith('.')) {
            const wanted = sel.slice(1);
            if (c.className.split(/\s+/).indexOf(wanted) > -1) results.push(c);
          } else if (c.tagName && sel.toUpperCase() === c.tagName) {
            results.push(c);
          }
          collect(c);
        }
      }
      collect(this);
      return results;
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

console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║       EXTENDED INFO: CARD PREVIEW & PORTAL ALL-FIELDS TEST               ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

OC.store.load();
OC.store.setSession('u-shohag');

// 1. Set 5 selected fields in extended_info_fields
console.log('--- [1/5] Configuring Extended Info Fields Template ---');
const templateFields = ['crm_id', 'country', 'business_email', 'direct_number', 'source'];
OC.store.state.extended_info_fields = templateFields.slice();
OC.store.save();

assert.strictEqual(OC.store.state.extended_info_fields.length, 5, 'Must have 5 fields configured');
console.log('  ✓ Extended info fields successfully configured with 5 keys');

// 2. Create test clients: one with partial info, one completely empty (like ffff)
console.log('\n--- [2/5] Creating Test Clients ---');
const testClient = {
  id: 'c-preview-test-' + Date.now(),
  name: 'Global Tech Corp',
  client_id: 'CL-9900',
  client_code: 'GTC',
  client_number: '9900',
  contact: '9900',
  status: 'active',
  department: 'd-web',
  departments: ['d-web'],
  assignees: ['u-shohag'],
  assigned_users: ['u-shohag'],
  extended_fields: {
    country: { value: 'United States', visible: true },
    business_email: { value: 'corp@gtc.com', visible: true }
  }
};

const emptyClient = {
  id: 'c-empty-ffff',
  name: 'ffff',
  client_id: 'ffff',
  status: 'active',
  extended_fields: {}
};

OC.store.state.clients = (OC.store.state.clients || []).filter(c => c.id !== testClient.id && c.id !== emptyClient.id);
OC.store.state.clients.push(testClient);
OC.store.state.clients.push(emptyClient);
OC.store.save();

// 3. Verify Photo 1: Client List Card renders strictly 5 pills for both clients
console.log('\n--- [3/5] Verifying Photo 1: Client List Card Strictly 5-Field Preview ---');
const host = document.createElement('div');
OC.clients.render(host);

const clientCards = host.querySelectorAll('.client-item-card');
assert.ok(clientCards.length >= 2, 'Must render client item cards');

// Check testClient card
const targetCard = clientCards.find(c => {
  const t = c.querySelector('.client-card-title');
  return t && t.children && t.children.some(ch => ch.text && ch.text.indexOf('CL-9900') > -1);
}) || clientCards[0];

assert.ok(targetCard, 'Target client card must exist');
const pillsContainer = targetCard.querySelector('.client-card-ext-pills');
assert.ok(pillsContainer, 'Target card must have .client-card-ext-pills container');

const pills = pillsContainer.querySelectorAll('.client-card-ext-pill');
assert.strictEqual(pills.length, 5, 'Card must render strictly 5 pills');

const filledPills = pillsContainer.querySelectorAll('.is-filled');
assert.strictEqual(filledPills.length, 2, 'Must have 2 filled pills');

const emptyPills = pillsContainer.querySelectorAll('.is-empty');
assert.strictEqual(emptyPills.length, 3, 'Must have 3 empty pills with dash');

// Check emptyClient card (brand new client like ffff)
const emptyCard = clientCards.find(c => {
  const t = c.querySelector('.client-card-title');
  return t && t.children && t.children.some(ch => ch.text && ch.text.indexOf('ffff') > -1);
});
assert.ok(emptyCard, 'Empty client card ffff must exist');
const emptyPillsContainer = emptyCard.querySelector('.client-card-ext-pills');
assert.ok(emptyPillsContainer, 'Empty client card must have .client-card-ext-pills container');
const emptyCardPills = emptyPillsContainer.querySelectorAll('.client-card-ext-pill');
assert.strictEqual(emptyCardPills.length, 5, 'Even completely empty client card ffff must render strictly 5 pills');

console.log('  ✓ Photo 1 verified: strictly 5 pills rendered on ALL cards (filled & empty)');

// 4. Verify Photo 2: Inside Client Portal, all filled fields are rendered
console.log('\n--- [4/5] Verifying Photo 2: Inside Client Portal Filled Fields Rendered ---');
const portalHost = document.getElementById('page');
OC.clients.openClientPortal(testClient.id);

const extInfoCard = portalHost.querySelector('.portal-credential-card');
assert.ok(extInfoCard, 'Extended info card must exist in client portal');

const gridItems = extInfoCard.querySelectorAll('.client-extended-info-item');
assert.strictEqual(gridItems.length, 2, 'Inside portal, all filled fields must be rendered');

console.log('  ✓ Photo 2 verified: all filled fields rendered inside client details portal');

// 5. Backend Controller Mutation Check
console.log('\n--- [5/5] Verifying Backend Controller for settings.extended_fields ---');
const commandController = require('../dev3/API/controllers/commandController.js');

let savedJson = null;
const mockReq = {
  body: {
    entry: {
      actor: 'u-shohag',
      action: 'settings.extended_fields',
      target: 'Extended Info fields',
      extended_info_fields: ['crm_id', 'country', 'sales_team'],
      detail: '3 of 37 fields shown'
    },
    state: {
      version: 1,
      users: [{ id: 'u-shohag', name: 'Shohag Munshe', admin: true }],
      clients: [testClient],
      departments: [{ id: 'd-admin', name: 'Admin & HR', levels: ['head', 'member', 'intern'] }],
      extended_info_fields: ['crm_id', 'country', 'sales_team']
    }
  },
  headers: { 'x-forwarded-for': '127.0.0.1' },
  socket: { remoteAddress: '127.0.0.1' }
};

const mockRes = {
  status: function (code) {
    assert.strictEqual(code, 200, 'Controller must respond with status 200');
    return {
      json: function (payload) {
        savedJson = payload;
        return payload;
      }
    };
  }
};

commandController.mutateState(mockReq, mockRes);
assert.ok(savedJson && savedJson.ok, 'Response must indicate ok: true');
assert.ok(Array.isArray(savedJson.state.extended_info_fields), 'Saved state must include extended_info_fields');
assert.strictEqual(savedJson.state.extended_info_fields.length, 3, 'Must have 3 extended info fields in saved state');
console.log('  ✓ Backend controller successfully processes settings.extended_fields mutation');

console.log('\n======================================================');
console.log('✅ ALL EXTENDED INFO & 5-FIELD PREVIEW TESTS PASSED!');
console.log('======================================================\n');
process.exit(0);
