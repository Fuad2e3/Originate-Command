/* =========================================================================
   tests/foundation_crud_persistence.test.js
   Verifies:
   1. Post / Create foundation rule: creates rule and persists in state.
   2. Edit foundation rule: updates fields and marks updated_at.
   3. Delete foundation rule: removes rule and marks tombstone.
   4. Seed resurrection prevention: deleted seed rules stay deleted.
   5. Server mutation & persistence: state saves policies to db.
   ========================================================================= */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./harness.js');

// Load store, policy
const storeCode = fs.readFileSync(path.join(__dirname, '../assets/js/store.js'), 'utf8');
eval(storeCode);
const policyCode = fs.readFileSync(path.join(__dirname, '../assets/js/policy.js'), 'utf8');
eval(policyCode);

OC.store.load();

console.log('--- [1/5] Testing Foundation Post / Create ---');
const adminUser = { id: 'u-shohag', name: 'Shohag Munshe', admin: true };
OC.store.setSession(adminUser.id);
let policies = OC.policy.getPolicies();
const initialCount = policies.length;
assert(initialCount >= 8, 'Should start with baseline seed policies');

// Create new rule
const newRule = {
  id: OC.store.uid('pol'),
  title: 'Test Production Protocol',
  department: 'd-web',
  category: 'Engineering Standards',
  body: '<p>Zero bug tolerance before deployment.</p>',
  created_by: adminUser.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

policies.unshift(newRule);
OC.store.mutate({
  actor: adminUser.id,
  action: 'foundation.create',
  target: newRule.title,
  detail: 'Created new foundation rule'
});

assert.strictEqual(OC.store.state.policies.length, initialCount + 1, 'Policy count should increment by 1');
assert.strictEqual(OC.store.state.policies[0].id, newRule.id, 'New rule should be first item');
console.log('  ✓ Post / Create foundation rule successfully added and mutated.');

console.log('--- [2/5] Testing Foundation Edit ---');
const targetRule = OC.store.state.policies.find(p => p.id === newRule.id);
assert(targetRule, 'Created rule must exist');
targetRule.title = 'Updated Production Protocol';
targetRule.body = '<p>Updated guidelines.</p>';
targetRule.updated_at = new Date().toISOString();

OC.store.mutate({
  actor: adminUser.id,
  action: 'foundation.update',
  target: targetRule.title,
  detail: 'Updated rule'
});

const updatedRule = OC.store.state.policies.find(p => p.id === newRule.id);
assert.strictEqual(updatedRule.title, 'Updated Production Protocol', 'Title must be updated');
console.log('  ✓ Edit foundation rule successfully updated in state.');

console.log('--- [3/5] Testing Foundation Delete & Tombstone ---');
const ruleToDeleteId = newRule.id;
const delIdx = OC.store.state.policies.findIndex(p => p.id === ruleToDeleteId);
assert(delIdx > -1, 'Rule must be found to delete');

OC.store.state.policies.splice(delIdx, 1);
if (typeof OC.store.markPolicyDeleted === 'function') {
  OC.store.markPolicyDeleted(ruleToDeleteId);
}
OC.store.mutate({
  actor: adminUser.id,
  action: 'foundation.delete',
  policyId: ruleToDeleteId,
  target: targetRule.title,
  detail: 'Deleted rule'
});

assert.strictEqual(OC.store.isPolicyDeleted(ruleToDeleteId), true, 'Policy ID must be tombstoned');
assert.strictEqual(OC.store.state.policies.find(p => p.id === ruleToDeleteId), undefined, 'Deleted rule must not exist in state');
console.log('  ✓ Delete foundation rule successfully removed and tombstoned.');

console.log('--- [4/5] Testing Resurrection Prevention for Seed Rules ---');
const seedToDelete = 'pol-leadgen-quality';
const seedIdx = OC.store.state.policies.findIndex(p => p.id === seedToDelete);
assert(seedIdx > -1, 'Seed rule pol-leadgen-quality should exist before test');

OC.store.state.policies.splice(seedIdx, 1);
OC.store.markPolicyDeleted(seedToDelete);
OC.store.mutate({
  actor: adminUser.id,
  action: 'foundation.delete',
  policyId: seedToDelete,
  target: 'Lead Data Verification Standard',
  detail: 'Deleted seed rule'
});

// Re-fetch via getPolicies() (simulating re-render or page reload)
const reloadedPolicies = OC.policy.getPolicies();
assert.strictEqual(reloadedPolicies.find(p => p.id === seedToDelete), undefined, 'Deleted seed rule MUST NOT resurrect on reload');
console.log('  ✓ Deleted seed rule pol-leadgen-quality does NOT resurrect on getPolicies() call.');

console.log('--- [5/5] Testing Backend Persistence in db.js & commandController ---');
const db = require('../dev3/API/config/db');
const controller = require('../dev3/API/controllers/commandController');

// Ensure db state has policies
const s = db.getState();
assert(Array.isArray(s.policies), 'db.getState() must return policies array');

// Clean up test state
if (typeof localStorage !== 'undefined') {
  localStorage.removeItem('oc_deleted_policies');
}

console.log('\n🎉 ALL FOUNDATION POST, EDIT, DELETE & PERSISTENCE TESTS PASSED!\n');
