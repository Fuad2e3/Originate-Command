/* Logic suite — store.js and permissions.js, no browser required.
   Run from the repository root:  node tests/logic.test.js
   Originate Command · application */

require('./harness.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');

let pass = 0, fail = [];
function ok(label, got, want = true) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (good) pass++; else fail.push(`${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}
const S = OC.store, C = OC.can;
S.load();
const u = id => S.user(id);

console.log('=== store.js: clean production seed ===');
/* the seed carries the two system admins only; every other account is
   loaded from the database at runtime */
ok('load returns clean seed', S.state.users.length, 2);
ok('admin user in seed', S.user('u-shohag').name, 'Shohag Munshe');
ok('fuad admin in seed', S.user('u-fuad').name, 'Abdullah al Fuad');
ok('both seeded accounts are admins', S.state.users.every(u => u.admin === true));
ok('department lookup', S.department('d-outreach').name, 'Outreach Operations');
ok('clean tags in seed', S.state.tags.length, 0);
S.mutate(null, () => S.state.tags.push({ id: 't-urgent', label: 'Urgent', kind: 'custom' }));
ok('tag lookup', S.tag('t-urgent').label, 'Urgent');
ok('clean todos in seed', S.state.todos.length, 0);
ok('clean instructions in seed', S.state.instructions.length, 0);
ok('clean clients in seed', S.state.clients.length, 0);
ok('missing id returns null', S.user('nope'), null);
ok('uid is unique', S.uid('x') !== S.uid('x'));
ok('default session is admin', S.session(), 'u-shohag');

let fired = 0; S.onChange(() => fired++);
const auditBefore = S.state.audit.length;
S.mutate({ actor: 'u-shohag', action: 'test.action', target: 'x', detail: 'd' }, () => {});
ok('mutate writes an audit entry', S.state.audit.length, auditBefore + 1);
ok('mutate emits a change', fired, 1);
ok('audit newest first', S.state.audit[0].action, 'test.action');
S.mutate(null, () => {});
ok('mutate with null skips the audit', S.state.audit.length, auditBefore + 1);

const notifBefore = S.state.notifications.length;
S.notify(['u-shohag'], 'hello', 'ref1');
ok('notify adds one row per person', S.state.notifications.length, notifBefore + 1);
ok('notify marks unread', S.state.notifications[0].read, false);
S.notify([], 'ignored');
ok('notify with nobody is a no-op', S.state.notifications.length, notifBefore + 1);
ok('notify persisted to storage',
   JSON.parse(localStorage.getItem('oc-state-v2')).notifications.length, notifBefore + 1);

S.reset();
ok('reset restores the clean seed', S.state.todos.length, 0);
ok('reset clears notifications', S.state.notifications.length, 0);

// Populate mock users, groups, and todos for full permission matrix testing
S.state.users = [
  { id: 'u-shohag', name: 'Shohag Munshe', title: 'Founder', admin: true, departments: [] },
  { id: 'u-imran', name: 'Imran Sheikh', title: 'Operations Manager', admin: false, departments: [{ department: 'd-bizops', level: 'head' }, { department: 'd-admin', level: 'head' }] },
  { id: 'u-nadia', name: 'Nadia Rahman', title: 'Outreach Director', admin: false, departments: [{ department: 'd-outreach', level: 'head' }, { department: 'd-bizops', level: 'member' }] },
  { id: 'u-tanvir', name: 'Tanvir Hasan', title: 'Outreach Specialist', admin: false, departments: [{ department: 'd-outreach', level: 'member' }] },
  { id: 'u-mim', name: 'Mim Akter', title: 'Senior Strategist', admin: false, departments: [{ department: 'd-outreach', level: 'member' }] },
  { id: 'u-rifat', name: 'Rifat Chowdhury', title: 'Outreach Associate', admin: false, departments: [{ department: 'd-outreach', level: 'member' }] },
  { id: 'u-sadia', name: 'Sadia Islam', title: 'Lead Gen Head', admin: false, departments: [{ department: 'd-leadgen', level: 'head' }] },
  { id: 'u-jubayer', name: 'Jubayer Alam', title: 'Researcher', admin: false, departments: [{ department: 'd-leadgen', level: 'member' }] },
  { id: 'u-farhan', name: 'Farhan Kabir', title: 'Web Lead', admin: false, departments: [{ department: 'd-web', level: 'head' }] },
  { id: 'u-ayesha', name: 'Ayesha Noor', title: 'Front-end Developer', admin: false, departments: [{ department: 'd-web', level: 'member' }] },
  { id: 'u-piya', name: 'Piya Das', title: 'Social Media Head', admin: false, departments: [{ department: 'd-social', level: 'head' }, { department: 'd-admin', level: 'member' }] }
];
S.state.groups = [
  { id: 'g-relaunch', name: 'Site Relaunch', members: ['u-tanvir', 'u-ayesha', 'u-shohag'], status: 'active' }
];
S.state.todos = [
  { id: 't-1', title: 'Manual reply check', department: 'd-outreach', assignee_type: 'user', assignee: 'u-rifat', state: 'open' },
  { id: 't-2', title: 'Book demo slots', department: 'd-outreach', assignee_type: 'user', assignee: 'u-mim', state: 'progress' },
  { id: 't-3', title: 'Rebuild hero', department: 'd-web', assignee_type: 'group', assignee: 'g-relaunch', state: 'progress' },
  { id: 't-4', title: 'Weekly sequence report', department: 'd-outreach', assignee_type: 'user', assignee: 'u-tanvir', state: 'done' },
  { id: 't-6', title: 'Rewrite sequence', department: 'd-outreach', assignee_type: 'user', assignee: 'u-mim', state: 'blocked' },
  { id: 't-8', title: 'Booking form redirect', department: 'd-web', assignee_type: 'user', assignee: 'u-ayesha', state: 'open' }
];
S.state.instructions = [
  { id: 'n-1', body: 'Document context', author: 'u-shohag', department: 'd-outreach', read_by: [] }
];

console.log('=== permissions.js: hierarchy ===');
ok('levelIn finds a membership', C.levelIn(u('u-tanvir'), 'd-outreach'), 'member');
ok('levelIn outside a department', C.levelIn(u('u-tanvir'), 'd-web'), null);
ok('rank head is 0', C.rank('d-outreach', 'head'), 0);
ok('rank member is 1', C.rank('d-outreach', 'member'), 1);
ok('unknown level ranks last', C.rank('d-outreach', 'nope'), Infinity);
ok('isHead', C.isHead(u('u-nadia'), 'd-outreach'));
ok('isHead is department-scoped', C.isHead(u('u-nadia'), 'd-web'), false);
ok('inDept', C.inDept(u('u-rifat'), 'd-outreach'));
ok('headOfAny for a head', C.headOfAny(u('u-piya')));
ok('headOfAny false for a member', C.headOfAny(u('u-tanvir')), false);
ok('one person heads two departments', C.departmentsOf(u('u-imran')), ['d-bizops', 'd-admin']);
ok('inGroup', C.inGroup(u('u-ayesha'), 'g-relaunch'));
ok('inGroup false for an outsider', C.inGroup(u('u-rifat'), 'g-relaunch'), false);

console.log('=== permissions.js: role labels ===');
ok('admin label', C.roleLabel(u('u-shohag')), 'System Admin');
ok('head label', C.roleLabel(u('u-nadia')), 'Department Head');
ok('member label 1', C.roleLabel(u('u-tanvir')), 'Member');
ok('member label 2', C.roleLabel(u('u-mim')), 'Member');
ok('member label 3', C.roleLabel(u('u-rifat')), 'Member');
ok('highest grant wins across departments', C.roleLabel(u('u-piya')), 'Department Head');

console.log('=== permissions.js: assignment matrix ===');
const people = ['u-shohag','u-imran','u-nadia','u-tanvir','u-mim','u-rifat','u-sadia','u-jubayer','u-farhan','u-ayesha','u-piya'];
// every account may assign to itself, and nobody may assign upward
people.forEach(id => ok(`${id} may assign to self`, C.assignTo(u(id), id)));
ok('member cannot assign to a peer', C.assignTo(u('u-rifat'), 'u-mim'), false);
ok('member cannot assign to another member', C.assignTo(u('u-mim'), 'u-rifat'), false);
ok('head assigns to member below', C.assignTo(u('u-nadia'), 'u-tanvir'));
ok('head assigns to any member in department', C.assignTo(u('u-nadia'), 'u-rifat'));
ok('head cannot cross departments', C.assignTo(u('u-nadia'), 'u-ayesha'), false);
ok('head cannot assign to another head in the same dept', C.assignTo(u('u-imran'), 'u-imran'));
ok('admin assigns to everyone', C.assignableUsers(u('u-shohag')).length, 11);
ok('member assignable list is self only', C.assignableUsers(u('u-rifat')).map(x => x.id), ['u-rifat']);
ok('head assignable list', C.assignableUsers(u('u-nadia')).map(x => x.id).sort(), ['u-mim','u-nadia','u-rifat','u-tanvir']);

console.log('=== permissions.js: groups ===');
ok('admin may create a group', C.createGroup(u('u-shohag')));
ok('head may not create a group', C.createGroup(u('u-nadia')), false);
ok('member may not', C.createGroup(u('u-tanvir')), false);
ok('member may not create group', C.createGroup(u('u-rifat')), false);
ok('admin may assign to a group', C.assignToGroup(u('u-shohag'), 'g-relaunch'));
ok('group member may assign to it', C.assignToGroup(u('u-ayesha'), 'g-relaunch'));
ok('outsider member may not', C.assignToGroup(u('u-rifat'), 'g-relaunch'), false);
ok('admin may create a client', C.createClient(u('u-shohag')));
ok('head may not create a client', C.createClient(u('u-nadia')), false);
ok('member may not create a client', C.createClient(u('u-tanvir')), false);
ok('member may not create a client 2', C.createClient(u('u-rifat')), false);
ok('assignableGroups excludes archived', (() => {
  S.state.groups[0].status = 'archived';
  const n = C.assignableGroups(u('u-shohag')).length;
  S.state.groups[0].status = 'active';
  return n;
})(), 0);

console.log('=== permissions.js: visibility ===');
const t1 = S.todo('t-1'), t3 = S.todo('t-3'), n1 = S.instruction('n-1');
ok('admin sees every todo', S.state.todos.every(t => C.seeTodo(u('u-shohag'), t)));
ok('assignee sees own todo', C.seeTodo(u('u-rifat'), t1));
/* A department task now stops with that department's head, who assigns it
   on; a colleague who merely shares the department is not shown it. */
ok('department colleague does NOT see it', !C.seeTodo(u('u-mim'), t1));
ok('department head sees it', C.seeTodo(u('u-nadia'), t1));
ok('other department does not', C.seeTodo(u('u-ayesha'), t1), false);
ok('group member sees a cross-department todo', C.seeTodo(u('u-tanvir'), t3));
ok('non-group outsider does not', C.seeTodo(u('u-rifat'), t3), false);
ok('author always sees own instruction', C.seeInstruction(u('u-shohag'), n1));
ok('department sees the instruction', C.seeInstruction(u('u-rifat'), n1));
ok('other department does not', C.seeInstruction(u('u-jubayer'), n1), false);
ok('visibleUsers: admin sees all', C.visibleUsers(u('u-shohag')).length, 11);
ok('visibleUsers: member sees own department', C.visibleUsers(u('u-rifat')).map(x=>x.id).sort(),
   ['u-mim','u-nadia','u-rifat','u-tanvir']);

console.log('=== permissions.js: state changes ===');
ok('assignee may change state', C.changeState(u('u-rifat'), t1));
ok('their head may change state', C.changeState(u('u-nadia'), t1));
ok('a peer may not', C.changeState(u('u-mim'), t1), false);
ok('group member may change a group todo', C.changeState(u('u-ayesha'), t3));
ok('assignee member may not reassign', C.reassign(u('u-rifat'), t1), false);
ok('head of the todo department may reassign', C.reassign(u('u-nadia'), t1));
ok('author may archive own instruction', C.archiveInstruction(u('u-shohag'), n1));
ok('department head may not archive if not author', C.archiveInstruction(u('u-nadia'), n1), false);
ok('department head may not delete if not author', C.canDeleteInstruction(u('u-nadia'), n1), false);
ok('admin may delete instruction', C.canDeleteInstruction(u('u-shohag'), n1), true);
ok('canArchiveTodo: creator yes', C.canArchiveTodo(u('u-nadia'), { created_by: 'u-nadia' }));
ok('canArchiveTodo: admin yes', C.canArchiveTodo(u('u-shohag'), { created_by: 'u-nadia' }));
ok('canArchiveTodo: non-creator dept head no', C.canArchiveTodo(u('u-nadia'), { created_by: 'u-rifat', department: 'd-outreach' }), false);
ok('canDeleteTodo: creator yes', C.canDeleteTodo(u('u-nadia'), { created_by: 'u-nadia' }));
ok('canDeleteTodo: admin yes', C.canDeleteTodo(u('u-shohag'), { created_by: 'u-nadia' }));
ok('canDeleteTodo: non-creator dept head no', C.canDeleteTodo(u('u-nadia'), { created_by: 'u-rifat', department: 'd-outreach' }), false);
ok('member may not archive', C.archiveInstruction(u('u-rifat'), n1), false);
ok('manageDepartment: head yes', C.manageDepartment(u('u-nadia'), 'd-outreach'));
ok('manageDepartment: member no', C.manageDepartment(u('u-tanvir'), 'd-outreach'), false);
ok('invite: head yes', C.invite(u('u-nadia')));
ok('invite: member no', C.invite(u('u-tanvir')), false);
ok('editAccount: admin can edit any member', C.editAccount(u('u-shohag'), u('u-rifat')));
ok('editAccount: user can edit self', C.editAccount(u('u-rifat'), u('u-rifat')));
ok('editAccount: non-admin cannot edit other person', C.editAccount(u('u-nadia'), u('u-rifat')), false);
ok('editAccount: member cannot edit peer', C.editAccount(u('u-rifat'), u('u-mim')), false);
ok('deleteAccount: admin can delete member', C.deleteAccount(u('u-shohag'), u('u-rifat')));
ok('deleteAccount: non-admin cannot delete member', C.deleteAccount(u('u-nadia'), u('u-rifat')), false);
ok('deleteAccount: cannot delete self', C.deleteAccount(u('u-shohag'), u('u-shohag')), false);
ok('audit: admin only', [C.seeAudit(u('u-shohag')), C.seeAudit(u('u-nadia'))], [true, false]);
ok('postInstruction is open to everyone', people.every(id => C.postInstruction(u(id))));

console.log('=== permissions.js: escalation (9.4) ===');
const chain = C.escalationChain(S.todo('t-2'));
ok('chain order', chain.map(c => c.step),
   ['Assignee','Department head, day one','System Admin, day two']);
ok('chain never removes earlier recipients', chain[0].users, ['u-mim']);
ok('leadership is the admin tier', chain[2].users, ['u-shohag']);
ok('group todo expands to its members', C.escalationChain(t3)[0].users.sort(),
   ['u-ayesha','u-shohag','u-tanvir']);
ok('not escalated before it is late', C.escalationReached(S.todo('t-2'), 0), 0);
ok('one day late reaches head', C.escalationReached(S.todo('t-2'), 1), 1);
ok('escalation reaches system admin', C.escalationReached(S.todo('t-2'), 99), 2);

console.log('\npassed: ' + pass);
if (fail.length) { console.log('FAILED ' + fail.length + ':'); fail.forEach(f => console.log('  ' + f)); process.exit(1); }
else console.log('FAILURES: none');

console.log('\n=== reassign, after the fix ===');
let p2 = 0, f2 = [];
function ok2(l, g, w = true) { (JSON.stringify(g) === JSON.stringify(w)) ? p2++ : f2.push(`${l} got=${JSON.stringify(g)}`); }
ok2('member cannot reassign own work', C.reassign(u('u-rifat'), t1), false);
ok2('member cannot reassign', C.reassign(u('u-mim'), S.todo('t-6')), false);
ok2('head reassigns inside its department', C.reassign(u('u-nadia'), t1));
ok2('head cannot reassign another department', C.reassign(u('u-nadia'), S.todo('t-8')), false);
ok2('admin reassigns anything', C.reassign(u('u-shohag'), S.todo('t-8')));
ok2('member still changes state on own work', C.changeState(u('u-rifat'), t1));
ok2('assignsOthers: member false', C.assignsOthers(u('u-rifat')), false);
ok2('assignsOthers: head true', C.assignsOthers(u('u-nadia')));
console.log('passed: ' + p2);
console.log(f2.length ? 'FAILED:\n  ' + f2.join('\n  ') : 'FAILURES: none');
if (f2.length) process.exit(1);
