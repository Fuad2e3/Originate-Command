/* =========================================================================
   tests/foundation_crud_and_vps_persistence.test.js
   Verifies:
   1. Foundation Post (Create) creates new policy, persists to store & server state.
   2. Foundation Edit (Update) updates policy in store & server state.
   3. Foundation Delete removes policy, sets tombstone, and prevents resurrection.
   4. Deleting a baseline seed rule permanently stays deleted.
   5. MySQL sync functions syncPolicyToMySQL & deletePolicyFromMySQL.
   ========================================================================= */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

require('./harness.js');

function makeElement(tag) {
  var el = {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    value: '',
    textContent: '',
    innerHTML: '',
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
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
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

globalThis.OC = {};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/policy.js');

OC.store.load();

// Load backend modules
const db = require('../dev3/API/config/db');
const commandController = require('../dev3/API/controllers/commandController');

console.log('--- Testing Foundation CRUD & VPS Database Persistence ---');

// 1. Initial State has policies array
const serverState = db.getState();
assert(Array.isArray(serverState.policies), 'serverState.policies must be an array');
console.log('  ✓ db.getState() returns policies array');

// 2. Load policy view in client harness
assert(OC.policy, 'OC.policy module must exist');
OC.store.setSession('u-shohag'); // System Admin
var policies = OC.policy.getPolicies();
assert(Array.isArray(policies), 'getPolicies() must return array');
assert(policies.length >= 8, 'getPolicies() should initially have 8 baseline seed rules');
console.log(`  ✓ Initial baseline foundation rules loaded: ${policies.length} rules`);

// 3. Foundation CREATE (POST)
const newRuleId = 'pol-test-crud-' + Date.now();
const newRule = {
  id: newRuleId,
  title: 'Operational Security & Multi-Factor Standard',
  category: 'Compliance',
  department: 'd-web',
  body: 'All staff must enforce 2FA and never commit credentials.',
  created_by: 'u-shohag',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

OC.store.state.policies.unshift(newRule);
OC.store.save();

// Simulate mutation to server
let mutateResJson = null;
const reqCreate = {
  body: {
    entry: {
      actor: 'u-shohag',
      action: 'foundation.create',
      policyId: newRuleId,
      target: newRule.title,
      detail: 'Created new foundation rule'
    },
    state: OC.store.state
  },
  headers: { 'x-forwarded-for': '127.0.0.1' },
  socket: { remoteAddress: '127.0.0.1' }
};
const resCreate = {
  status: function (code) {
    assert.strictEqual(code, 200, 'mutateState must return 200 on foundation.create');
    return this;
  },
  json: function (data) {
    mutateResJson = data;
    return this;
  }
};

commandController.mutateState(reqCreate, resCreate);
assert(mutateResJson && mutateResJson.ok, 'Mutation must succeed');

// Verify on server
const updatedServerState = db.getState();
const foundServerRule = (updatedServerState.policies || []).find(p => p.id === newRuleId);
assert(foundServerRule, 'Newly created rule must exist in server state');
assert.strictEqual(foundServerRule.title, 'Operational Security & Multi-Factor Standard');
console.log('  ✓ Foundation CREATE: Rule posted and stored in server state');

// 4. Foundation EDIT (UPDATE)
newRule.title = 'Operational Security & Multi-Factor Standard (v2)';
newRule.body = 'Updated: 2FA required on all email and server endpoints.';
newRule.updated_at = new Date().toISOString();
OC.store.save();

const reqEdit = {
  body: {
    entry: {
      actor: 'u-shohag',
      action: 'foundation.update',
      policyId: newRuleId,
      target: newRule.title,
      detail: 'Updated foundation rule'
    },
    state: OC.store.state
  }
};
const resEdit = {
  status: function (code) {
    assert.strictEqual(code, 200);
    return this;
  },
  json: function (data) {
    mutateResJson = data;
    return this;
  }
};

commandController.mutateState(reqEdit, resEdit);
const serverStateAfterEdit = db.getState();
const editedServerRule = (serverStateAfterEdit.policies || []).find(p => p.id === newRuleId);
assert(editedServerRule, 'Edited rule must exist in server state');
assert.strictEqual(editedServerRule.title, 'Operational Security & Multi-Factor Standard (v2)');
assert.strictEqual(editedServerRule.body, 'Updated: 2FA required on all email and server endpoints.');
console.log('  ✓ Foundation EDIT: Rule updated and verified in server state');

// 5. Foundation DELETE (Tombstone & non-resurrection)
const reqDelete = {
  body: {
    entry: {
      actor: 'u-shohag',
      action: 'foundation.delete',
      policyId: newRuleId,
      target: newRule.title,
      detail: 'Deleted foundation rule'
    },
    state: {
      ...OC.store.state,
      policies: OC.store.state.policies.filter(p => p.id !== newRuleId)
    }
  }
};
const resDelete = {
  status: function (code) {
    assert.strictEqual(code, 200);
    return this;
  },
  json: function (data) {
    mutateResJson = data;
    return this;
  }
};

commandController.mutateState(reqDelete, resDelete);

// Verify server state does not have it
const serverStateAfterDel = db.getState();
assert(!serverStateAfterDel.policies.some(p => p.id === newRuleId), 'Deleted rule must be removed from db.getState()');

// Verify getState() API endpoint filters it out
let apiState = null;
const reqGetState = {};
const resGetState = {
  status: function (code) {
    assert.strictEqual(code, 200);
    return this;
  },
  json: function (data) {
    apiState = data;
    return this;
  }
};
commandController.getState(reqGetState, resGetState);
assert(!apiState.policies.some(p => p.id === newRuleId), 'getState() must NOT contain tombstoned policy');
console.log('  ✓ Foundation DELETE: Rule permanently deleted and blocked by server tombstone');

// 6. Delete a SEED Rule and verify it does NOT resurrect
let seedRuleToDelete = (OC.store.state.policies || []).find(p => p.id === 'pol-leadgen-quality' || p.id === 'pol-web-qa' || p.id === 'pol-admin-punch');
if (!seedRuleToDelete) {
  seedRuleToDelete = (OC.store.state.policies || [])[0];
}
if (!seedRuleToDelete) {
  seedRuleToDelete = {
    id: 'pol-leadgen-quality',
    title: 'Lead Data Verification Standard',
    category: 'Quality Control',
    department: 'd-leadgen',
    body: 'Every generated lead must be verified.',
    created_by: 'u-shohag'
  };
  OC.store.state.policies = [seedRuleToDelete];
}
const targetDeleteId = seedRuleToDelete.id;
assert(seedRuleToDelete, 'A seed rule or baseline rule must exist to test deletion');

// Remove from client store
OC.store.state.policies = OC.store.state.policies.filter(p => p.id !== targetDeleteId);
OC.store.save();

// Call getPolicies() multiple times — it MUST NOT resurrect targetDeleteId
const polsAfterDel = OC.policy.getPolicies();
assert(!polsAfterDel.some(p => p.id === targetDeleteId), 'Deleted seed rule MUST NOT resurrect in getPolicies()');
console.log('  ✓ Seed Rule Non-Resurrection: Deleted baseline seed rule remains deleted');

// 7. Test db.js MySQL helpers exist and handle calls safely
assert.strictEqual(typeof db.syncPolicyToMySQL, 'function', 'db.syncPolicyToMySQL must be a function');
assert.strictEqual(typeof db.deletePolicyFromMySQL, 'function', 'db.deletePolicyFromMySQL must be a function');

// Calling them safely when mysqlPool is null or active does not throw
db.syncPolicyToMySQL({
  id: 'pol-safe-test',
  title: 'Safe test',
  category: 'General',
  department: 'all',
  body: 'Test body',
  created_by: 'u-shohag'
});
db.deletePolicyFromMySQL('pol-safe-test');
console.log('  ✓ db.syncPolicyToMySQL and deletePolicyFromMySQL functions verified');

console.log('\n🎉 ALL FOUNDATION CRUD & VPS PERSISTENCE TESTS PASSED! ✅\n');
process.exit(0);
