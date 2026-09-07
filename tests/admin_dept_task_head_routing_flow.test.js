/* Admin task creation with department routing, Head-only visibility,
   assignment to member, and Client Portal visibility test.
   Workflow:
   1. System Admin creates task, selects department, leaves unassigned.
   2. Initially ONLY that department's Head sees it — other members do not.
   3. Head assigns the task to a member of their department.
   4. That member immediately sees the task in their Client Portal.
   Run: node tests/admin_dept_task_head_routing_flow.test.js
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
    fail.push(`${label} -> got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  }
}

const S = OC.store, C = OC.can;
S.load();

// 1. Users setup
const admin = S.user('u-shohag');

const deptId = 'd-outreach';

const headOfOutreach = {
  id: 'u-outreach-head',
  name: 'Outreach Head',
  email: 'head.outreach@example.com',
  admin: false,
  departments: [{ department: deptId, level: 'head' }],
  status: 'active'
};

const memberOfOutreach = {
  id: 'u-outreach-mem',
  name: 'Outreach Member',
  email: 'mem.outreach@example.com',
  admin: false,
  departments: [{ department: deptId, level: 'member' }],
  status: 'active'
};

const internOfOutreach = {
  id: 'u-outreach-intern',
  name: 'Outreach Intern',
  email: 'intern.outreach@example.com',
  admin: false,
  departments: [{ department: deptId, level: 'intern' }],
  status: 'active'
};

const memberOfOtherDept = {
  id: 'u-other-mem',
  name: 'Other Dept Member',
  email: 'mem.other@example.com',
  admin: false,
  departments: [{ department: 'd-leadgen', level: 'member' }],
  status: 'active'
};

S.state.users.push(headOfOutreach, memberOfOutreach, internOfOutreach, memberOfOtherDept);

// 2. Client setup
const client = {
  id: 'c-client-flow-1',
  name: 'Alpha Client Corp',
  client_id: 'ACC-001',
  client_code: 'ACC',
  departments: [deptId],
  department: deptId,
  assignees: [], // initially no specific client working assignees
  status: 'active'
};
S.state.clients.push(client);

// STEP 1: System Admin creates task with department selected and no assignee
const unassignedTask = {
  id: 't-admin-dept-flow-1',
  title: 'Outreach Launch Campaign',
  client: client.id,
  clients: [client.id],
  department: deptId,
  departments: [deptId],
  assignee: null,
  assignees: [],
  assignee_type: 'user',
  state: 'open',
  priority: 'high',
  due: '2026-09-30T18:00',
  created_by: admin.id,
  created_at: new Date().toISOString(),
  archived: false,
  tags: []
};
S.state.todos.push(unassignedTask);

// STEP 2: Verify Initial Visibility
// System Admin sees the task
ok('Admin can see unassigned department task', C.seeTodo(admin, unassignedTask), true);

// Department Head sees the task
ok('Department Head can see unassigned task routed to their department', C.seeTodo(headOfOutreach, unassignedTask), true);

// Other members/interns of the department DO NOT see the unassigned task
ok('Department Member CANNOT see unassigned task', C.seeTodo(memberOfOutreach, unassignedTask), false);
ok('Department Intern CANNOT see unassigned task', C.seeTodo(internOfOutreach, unassignedTask), false);
ok('Member from other department CANNOT see task', C.seeTodo(memberOfOtherDept, unassignedTask), false);

// Client visibility check:
// Department Head holds live work on this client
ok('Department Head has task on client', C.hasTaskOnClient(headOfOutreach, client.id), true);
ok('Department Head can see client', C.seeClient(headOfOutreach, client), true);

// Department Member does not hold work on this client yet
ok('Member does not hold task on client before assignment', C.hasTaskOnClient(memberOfOutreach, client.id), false);

// In Client Portal: filtering tasks on this client
const headClientTodos = S.state.todos.filter(function (t) {
  const onThisClient = t.client === client.id || (Array.isArray(t.clients) && t.clients.indexOf(client.id) > -1);
  return onThisClient && C.seeTodo(headOfOutreach, t);
});
ok('Head sees task in Client Portal', headClientTodos.some(t => t.id === unassignedTask.id), true);

const memberClientTodosBefore = S.state.todos.filter(function (t) {
  const onThisClient = t.client === client.id || (Array.isArray(t.clients) && t.clients.indexOf(client.id) > -1);
  return onThisClient && C.seeTodo(memberOfOutreach, t);
});
ok('Member does NOT see task in Client Portal before assignment', memberClientTodosBefore.some(t => t.id === unassignedTask.id), false);

// STEP 3: Department Head assigns task to memberOfOutreach
ok('Head has permission to assign/reassign this task', C.reassign(headOfOutreach, unassignedTask), true);
ok('Ordinary member CANNOT reassign', C.reassign(memberOfOutreach, unassignedTask), false);
ok('Head can assign work to memberOfOutreach', C.assignTo(headOfOutreach, memberOfOutreach.id), true);
ok('Head cannot assign work to member of another department', C.assignTo(headOfOutreach, memberOfOtherDept.id), false);

// Head assigns task to memberOfOutreach
unassignedTask.assignee = memberOfOutreach.id;
unassignedTask.assignees = [memberOfOutreach.id];
unassignedTask.assignee_type = 'user';

// STEP 4: Verify Visibility After Assignment
// Now the assigned member can see the task
ok('Assigned member can see the task after assignment', C.seeTodo(memberOfOutreach, unassignedTask), true);

// Assigned member now has task on this client
ok('Assigned member hasTaskOnClient is now true', C.hasTaskOnClient(memberOfOutreach, client.id), true);
ok('Assigned member seeClient is now true', C.seeClient(memberOfOutreach, client), true);

// In Client Portal:
const memberClientTodosAfter = S.state.todos.filter(function (t) {
  const onThisClient = t.client === client.id || (Array.isArray(t.clients) && t.clients.indexOf(client.id) > -1);
  return onThisClient && C.seeTodo(memberOfOutreach, t);
});
ok('Assigned member now sees the task in Client Portal', memberClientTodosAfter.some(t => t.id === unassignedTask.id), true);

// Other unassigned members of the department still cannot see it
ok('Intern still cannot see task assigned to member', C.seeTodo(internOfOutreach, unassignedTask), false);
const internClientTodos = S.state.todos.filter(function (t) {
  const onThisClient = t.client === client.id || (Array.isArray(t.clients) && t.clients.indexOf(client.id) > -1);
  return onThisClient && C.seeTodo(internOfOutreach, t);
});
ok('Intern does not see task in Client Portal', internClientTodos.some(t => t.id === unassignedTask.id), false);

// The assigned member can update state on their assigned task
ok('Assigned member can update task state', C.changeState(memberOfOutreach, unassignedTask), true);

console.log(`PASS: ${pass}, FAIL: ${fail.length}`);
if (fail.length) {
  console.error(fail.join('\n'));
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED for Admin -> Dept -> Head -> Member Client Portal task flow!');
}
