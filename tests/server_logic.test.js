/* =========================================================================
   server_logic.test.js — Unit tests for dev3 server business logic (OM SRS 001)
   ========================================================================= */

'use strict';

const assert = require('assert');
const logic = require('../dev3/API/lib/logic');
const db = require('../dev3/API/config/db');

console.log('=== dev3 server: logic.js unit tests ===');

// 1. Seed verification
const seed = logic.seed();
assert.strictEqual(seed.departments.length, 6, 'Should have 6 departments');
assert.strictEqual(seed.users.length, 3, 'Should have 3 seed users');
assert.strictEqual(seed.users[0].admin, true);
assert.strictEqual(seed.users[1].admin, true);
assert.strictEqual(seed.users[2].admin, true);
console.log('✓ clean production seed() entities verified (system admins)');

// 2. Recurrence tests (6.2)
assert.strictEqual(logic.nextDue('2026-08-30', 'daily'), '2026-08-31');
assert.strictEqual(logic.nextDue('2026-08-30', 'weekly'), '2026-09-06');
assert.strictEqual(logic.nextDue('2026-08-30', 'monthly'), '2026-09-30');
assert.strictEqual(logic.nextDue('2026-01-31', 'monthly'), '2026-02-28', 'Clamps 31st to 28th Feb');
assert.strictEqual(logic.nextDue('2026-08-30', 'quarterly'), '2026-11-30');

const dummyTodo = { id: 't-100', title: 'Daily sync', due: '2026-08-30', recurrence: 'daily', state: 'done' };
const nextTodo = logic.nextInstance(dummyTodo);
assert.strictEqual(nextTodo.state, 'open', 'Next instance opens fresh');
assert.strictEqual(nextTodo.due, '2026-08-31', 'Due date shifts +1 day');
assert.strictEqual(nextTodo.spawned_from, 't-100', 'Tracks spawned origin');
console.log('✓ recurrence logic verified');

// 3. Overdue Escalation (9.4)
const today = '2026-08-30';
assert.strictEqual(logic.daysLate('2026-08-29', today), 1);
assert.strictEqual(logic.daysLate('2026-08-28', today), 2);
assert.strictEqual(logic.daysLate('2026-08-27', today), 3);

// Test people in department hierarchy
const people = [
  { id: 'u-shohag', admin: true, departments: [] },
  { id: 'u-nadia', admin: false, departments: [{ department: 'd-outreach', rank: 0 }] }, // head
  { id: 'u-rifat', admin: false, departments: [{ department: 'd-outreach', rank: 1 }] }  // member
];

// Outreach assignee: u-rifat (member), head: u-nadia (rank 0), admin: u-shohag
const lateTodo1 = { id: 't-test1', department: 'd-outreach', assignee: 'u-rifat', assignee_type: 'user', due: '2026-08-29', state: 'open' };
const lateTodo2 = { id: 't-test2', department: 'd-outreach', assignee: 'u-rifat', assignee_type: 'user', due: '2026-08-28', state: 'open' };

const r1 = logic.escalationRecipients(lateTodo1, people, today);
assert.ok(r1.includes('u-rifat') && r1.includes('u-nadia'), '1 day late reaches assignee and head');
assert.ok(!r1.includes('u-shohag'), '1 day late does not reach admin yet');

const r2 = logic.escalationRecipients(lateTodo2, people, today);
assert.ok(r2.includes('u-shohag'), '2 days late reaches admin/leadership');
console.log('✓ overdue escalation hierarchy verified (head -> admin)');

// 4. Invites (6.1)
const inv = logic.issueInvite('u-shohag');
assert.ok(inv.token.startsWith('inv-'), 'Generates valid invite token format');
assert.strictEqual(logic.inviteUsable(inv), true, 'Fresh invite is usable');
inv.claimed_at = new Date().toISOString();
assert.strictEqual(logic.inviteUsable(inv), false, 'Claimed invite is no longer usable');
console.log('✓ 72-hour invite token mechanics verified');

// 5. Database engine test
const state = db.getState();
assert.ok(state && state.version === 1, 'Database engine initialized state correctly');
db.mutate({ actor: 'test-runner', action: 'test.run', target: 'dev3' }, s => {
  s.testPassed = true;
});
assert.strictEqual(db.getState().testPassed, true, 'Database mutation applied');
assert.strictEqual(db.getState().audit[0].action, 'test.run', 'Audit log stamped');
console.log('✓ persistent database engine and audit trail verified');

console.log('\n========================================');
console.log(' ALL DEV3 SERVER LOGIC TESTS PASSED! ✅');
console.log('========================================\n');
setTimeout(function () { process.exit(0); }, 100);

