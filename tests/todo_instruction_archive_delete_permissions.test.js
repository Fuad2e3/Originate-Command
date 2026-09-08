/**
 * Automated Test: Todo & Instruction Archive and Delete Permissions
 * Validates that ONLY the creator and System Admin can archive and delete todos and instructions.
 */

require('./harness.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');

let pass = 0, fail = [];
function ok(label, got, want = true) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (good) {
    pass++;
  } else {
    fail.push(`${label} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  }
}

const S = OC.store;
const C = OC.can;

S.load();
S.reset();

// Configure test accounts
const adminUser = { id: 'u-admin-test', name: 'Admin Test', admin: true, departments: [] };
const deptHead = { id: 'u-head-test', name: 'Head Test', admin: false, departments: [{ department: 'd-test', level: 'head' }] };
const regularCreator = { id: 'u-creator-test', name: 'Creator Test', admin: false, departments: [{ department: 'd-test', level: 'member' }] };
const assigneeUser = { id: 'u-assignee-test', name: 'Assignee Test', admin: false, departments: [{ department: 'd-test', level: 'member' }] };
const otherMember = { id: 'u-other-test', name: 'Other Test', admin: false, departments: [{ department: 'd-other', level: 'member' }] };

S.state.users = [adminUser, deptHead, regularCreator, assigneeUser, otherMember];

// Test Todo
const testTodo = {
  id: 't-test-1',
  title: 'Test Creator Task',
  created_by: 'u-creator-test',
  assignee: 'u-assignee-test',
  assignee_type: 'user',
  department: 'd-test',
  state: 'open',
  archived: false
};

// Test Instruction
const testInstruction = {
  id: 'i-test-1',
  body: 'Test Creator Instruction',
  author: 'u-creator-test',
  department: 'd-test',
  archived: false
};

console.log('=== 1. Todo Archive Permissions ===');
ok('Admin can archive todo', C.canArchiveTodo(adminUser, testTodo), true);
ok('Creator can archive own todo', C.canArchiveTodo(regularCreator, testTodo), true);
ok('Department head (non-creator) CANNOT archive todo', C.canArchiveTodo(deptHead, testTodo), false);
ok('Assignee (non-creator) CANNOT archive todo', C.canArchiveTodo(assigneeUser, testTodo), false);
ok('Other member CANNOT archive todo', C.canArchiveTodo(otherMember, testTodo), false);

console.log('=== 2. Todo Delete Permissions ===');
ok('Admin can delete todo', C.canDeleteTodo(adminUser, testTodo), true);
ok('Creator can delete own todo', C.canDeleteTodo(regularCreator, testTodo), true);
ok('Department head (non-creator) CANNOT delete todo', C.canDeleteTodo(deptHead, testTodo), false);
ok('Assignee (non-creator) CANNOT delete todo', C.canDeleteTodo(assigneeUser, testTodo), false);
ok('Other member CANNOT delete todo', C.canDeleteTodo(otherMember, testTodo), false);

console.log('=== 3. Instruction Archive Permissions ===');
ok('Admin can archive instruction', C.archiveInstruction(adminUser, testInstruction), true);
ok('Creator can archive own instruction', C.archiveInstruction(regularCreator, testInstruction), true);
ok('Department head (non-creator) CANNOT archive instruction', C.archiveInstruction(deptHead, testInstruction), false);
ok('Other member CANNOT archive instruction', C.archiveInstruction(otherMember, testInstruction), false);

console.log('=== 4. Instruction Delete Permissions ===');
ok('Admin can delete instruction', C.canDeleteInstruction(adminUser, testInstruction), true);
ok('Creator can delete own instruction', C.canDeleteInstruction(regularCreator, testInstruction), true);
ok('Department head (non-creator) CANNOT delete instruction', C.canDeleteInstruction(deptHead, testInstruction), false);
ok('Other member CANNOT delete instruction', C.canDeleteInstruction(otherMember, testInstruction), false);

console.log('=== 5. Alternative Creator Properties (author / creator / created_by) ===');
const todoWithAuthor = { id: 't-alt', author: 'u-creator-test', state: 'open' };
const todoWithCreator = { id: 't-alt2', creator: 'u-creator-test', state: 'open' };
const instWithCreatedBy = { id: 'i-alt', created_by: 'u-creator-test' };

ok('Todo with author recognized for creator archive', C.canArchiveTodo(regularCreator, todoWithAuthor), true);
ok('Todo with creator recognized for creator delete', C.canDeleteTodo(regularCreator, todoWithCreator), true);
ok('Instruction with created_by recognized for creator archive', C.archiveInstruction(regularCreator, instWithCreatedBy), true);
ok('Instruction with created_by recognized for creator delete', C.canDeleteInstruction(regularCreator, instWithCreatedBy), true);

console.log('\n--- Summary ---');
console.log(`Passed: ${pass}`);
if (fail.length > 0) {
  console.error(`Failed: ${fail.length}`);
  fail.forEach(f => console.error('  - ' + f));
  process.exit(1);
} else {
  console.log('All todo and instruction archive/delete permission checks passed cleanly!');
}
