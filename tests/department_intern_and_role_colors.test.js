/* Department Intern and Role Colors test suite
   Tests role color mapping, intern level addition, and member-equivalent permissions for Intern.
   Run: node tests/department_intern_and_role_colors.test.js */

const assert = require('assert');
require('./harness.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');

console.log('=== Test 1: Seed and Department Levels include Intern ===');
localStorage.removeItem('oc-state-v2');
const seed = OC.store.load();
assert(Array.isArray(seed.departments), 'Seed has departments array');
seed.departments.forEach(function (dept) {
  assert(dept.levels.indexOf('head') > -1, dept.name + ' has head level');
  assert(dept.levels.indexOf('member') > -1, dept.name + ' has member level');
  assert(dept.levels.indexOf('intern') > -1, dept.name + ' has intern level');
  assert.strictEqual(dept.levels[0], 'head', 'head is index 0');
  assert.strictEqual(dept.levels[1], 'member', 'member is index 1');
  assert.strictEqual(dept.levels[2], 'intern', 'intern is index 2');
});
console.log('  ✓ Seed department levels contain head, member, intern in correct order');

console.log('=== Test 2: Migration in store.load() ensures Intern is present ===');
localStorage.removeItem('oc-state-v2');
// Simulate legacy state without intern
const legacyState = {
  version: 1,
  departments: [
    { id: 'd-test', name: 'Test Ops', levels: ['head', 'member'] }
  ],
  users: [
    { id: 'u-shohag', name: 'Shohag Munshe', email: 'sm@originatemarketing.com', admin: true, status: 'active', departments: [] },
    { id: 'u-fuad', name: 'Abdullah al Fuad', email: 'fuadkalaroa2002@gmail.com', admin: true, status: 'active', departments: [] }
  ],
  todos: [],
  instructions: [],
  clients: [],
  groups: [],
  attendance: [],
  leaves: [],
  audit: []
};
localStorage.setItem('oc-state-v2', JSON.stringify(legacyState));

OC.store.load();
const loadedDept = OC.store.department('d-test');
assert(loadedDept, 'd-test department found');
assert(loadedDept.levels.indexOf('intern') > -1, 'Migration added intern to d-test');
console.log('  ✓ Existing department automatically migrated to include intern');

console.log('=== Test 3: OC.can.rank() for head, member, intern ===');
assert.strictEqual(OC.can.rank('d-test', 'head'), 0, 'head is rank 0');
assert.strictEqual(OC.can.rank('d-test', 'member'), 1, 'member is rank 1');
assert.strictEqual(OC.can.rank('d-test', 'intern'), 2, 'intern is rank 2');
assert.strictEqual(OC.can.rank('d-test', 'ইন্টান'), 2, 'Bengali tag ইন্টান is rank 2');
assert.strictEqual(OC.can.rank('d-test', 'nope'), Infinity, 'unknown level is rank Infinity');
console.log('  ✓ Rank correctly orders head (0), member (1), intern (2)');

console.log('=== Test 4: OC.can.roleClass() mapping ===');
assert.strictEqual(OC.can.roleClass('head'), 'role-head');
assert.strictEqual(OC.can.roleClass('Department Head'), 'role-head');
assert.strictEqual(OC.can.roleClass('member'), 'role-member');
assert.strictEqual(OC.can.roleClass('Team Member'), 'role-member');
assert.strictEqual(OC.can.roleClass('intern'), 'role-intern');
assert.strictEqual(OC.can.roleClass('Intern'), 'role-intern');
assert.strictEqual(OC.can.roleClass('ইন্টান'), 'role-intern');
assert.strictEqual(OC.can.roleClass('admin'), 'role-admin');
assert.strictEqual(OC.can.roleClass('System Admin'), 'role-admin');
assert.strictEqual(OC.can.roleClass('lead'), 'role-lead');
assert.strictEqual(OC.can.roleClass('Team Lead'), 'role-lead');
console.log('  ✓ OC.can.roleClass correctly maps roles and levels to CSS classes');

console.log('=== Test 5: OC.can.roleLabel() for Intern ===');
const internUser = {
  id: 'u-intern-1',
  name: 'Rahim Intern',
  email: 'rahim@originate.example',
  title: 'Intern',
  admin: false,
  status: 'active',
  departments: [{ department: 'd-test', level: 'intern' }]
};
assert.strictEqual(OC.can.roleLabel(internUser), 'Intern', 'User with level intern gets label "Intern"');

const invitedIntern = {
  id: 'u-intern-inv',
  name: 'Karim Invited',
  email: 'karim@originate.example',
  title: 'Intern',
  admin: false,
  status: 'invited',
  departments: [],
  invite: { level: 'intern', department: 'd-test' }
};
assert.strictEqual(OC.can.roleLabel(invitedIntern), 'Intern', 'Invited user with level intern gets label "Intern"');
console.log('  ✓ roleLabel() correctly identifies Intern');

console.log('=== Test 6: Intern has identical capabilities and permissions as Member ===');
assert.strictEqual(OC.can.inDept(internUser, 'd-test'), true, 'Intern is recognized in department');

// Todos visibility
const deptTodo = { id: 'todo-1', title: 'Task 1', department: 'd-test', state: 'open' };
assert.strictEqual(OC.can.seeTodo(internUser, deptTodo), true, 'Intern can see department todo');

// Instructions visibility
const deptNote = { id: 'note-1', body: 'Dept Note', department: 'd-test' };
assert.strictEqual(OC.can.seeInstruction(internUser, deptNote), true, 'Intern can see department instruction');

// Client visibility
const deptClient = { id: 'client-1', name: 'Client A', departments: ['d-test'] };
assert.strictEqual(OC.can.seeClient(internUser, deptClient), true, 'Intern can see department client');

// Assignable to clients
OC.store.state.users.push(internUser);
const eligibleMembers = OC.can.assignableClientMembers(deptClient);
assert(eligibleMembers.some(u => u.id === 'u-intern-1'), 'Intern is eligible for client assignment');

// Can work on client
assert.strictEqual(OC.can.canWorkOnClient(internUser, deptClient), true, 'Intern can work on client');

// Change state of assigned todo
const assignedTodo = { id: 'todo-2', title: 'Task 2', department: 'd-test', assignee_type: 'user', assignee: 'u-intern-1', state: 'open' };
assert.strictEqual(OC.can.changeState(internUser, assignedTodo), true, 'Intern can change state of assigned todo');

// Cannot assign work to others (same as Member)
const otherUser = { id: 'u-other', name: 'Other', email: 'o@example.com', departments: [{ department: 'd-test', level: 'member' }] };
OC.store.state.users.push(otherUser);
assert.strictEqual(OC.can.assignTo(internUser, 'u-other'), false, 'Intern cannot assign work to others');
assert.strictEqual(OC.can.assignTo(internUser, internUser.id), true, 'Intern can take work themselves');

console.log('  ✓ Intern possesses all member capabilities and proper authority gates');
console.log('✅ ALL INTERN AND ROLE COLORS TESTS PASSED!');
