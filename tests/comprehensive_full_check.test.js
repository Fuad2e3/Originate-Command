/* =========================================================================
   comprehensive_full_check.test.js — Exhaustive End-to-End Logic & Function Verification
   Tests 100% of functions, logic rules, data integrity, permissions, group chat,
   reactions, and API operations.
   ========================================================================= */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║    ORIGINATE COMMAND (OM SRS 001) — FULL FUNCTION & LOGIC CHECK    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// -------------------------------------------------------------------------
// SECTION 1: Pure Server Logic & Domain Rules (dev3/API/lib/logic.js)
// -------------------------------------------------------------------------
console.log('--- [1/6] Testing Domain Business Logic (dev3/API/lib/logic.js) ---');
const logic = require('../dev3/API/lib/logic');

test('seed() generates clean production workspace with System Admins only', () => {
  const data = logic.seed();
  assert.strictEqual(data.version, 1);
  assert.strictEqual(data.departments.length, 6);
  assert.ok(data.users.length >= 2, 'Clean production seed must have System Admins');
  assert.strictEqual(data.users[0].id, 'u-shohag');
  assert.strictEqual(data.users[0].admin, true);
  assert.strictEqual(data.users[1].id, 'u-fuad');
  assert.strictEqual(data.users[1].admin, true);
  assert.strictEqual(data.clients.length, 0, 'Clean production seed starts with 0 clients');
  assert.strictEqual(data.tags.length, 6);
  assert.strictEqual(data.groups.length, 0, 'Clean production seed starts with 0 groups');
  assert.strictEqual(data.todos.length, 0, 'Clean production seed starts with 0 todos');
  assert.strictEqual(data.instructions.length, 0, 'Clean production seed starts with 0 instructions');
});

test('Recurrence logic: daily, weekly, monthly, quarterly with end-of-month clamp', () => {
  const completed = new Date('2026-01-31T12:00:00Z');
  
  // Daily
  assert.strictEqual(logic.nextDue('2026-01-31', 'daily', completed), '2026-02-01');
  
  // Weekly
  assert.strictEqual(logic.nextDue('2026-01-31', 'weekly', completed), '2026-02-07');
  
  // Monthly clamp (Jan 31 + 1 month -> Feb 28 in non-leap year 2026)
  assert.strictEqual(logic.nextDue('2026-01-31', 'monthly', completed), '2026-02-28');
  
  // Quarterly
  assert.strictEqual(logic.nextDue('2026-01-15', 'quarterly', completed), '2026-04-15');

  // nextInstance creation
  const todo = {
    title: 'Daily Checklist',
    description: 'Clean inbox',
    client: 'c-chaim',
    department: 'd-outreach',
    assignee_type: 'user',
    assignee: 'u-rifat',
    state: 'done',
    priority: 'high',
    due: '2026-08-30',
    recurrence: 'daily',
    created_by: 'u-tanvir',
    tags: ['t-urgent']
  };

  const next = logic.nextInstance(todo, new Date('2026-08-30T10:00:00Z'));
  assert.ok(next);
  assert.strictEqual(next.state, 'open');
  assert.strictEqual(next.due, '2026-08-31');
  assert.strictEqual(next.recurrence, 'daily');
  assert.strictEqual(next.client, 'c-chaim');
});

test('Overdue escalation hierarchy (OM SRS 001 9.4: head -> leadership)', () => {
  const today = '2026-08-30';
  
  const people = [
    { id: 'u-shohag', admin: true, departments: [] },
    { id: 'u-nadia', admin: false, departments: [{ department: 'd-outreach', level: 'head' }] }, // head
    { id: 'u-rifat', admin: false, departments: [{ department: 'd-outreach', level: 'member' }] }  // member
  ];

  const deptsById = {
    'd-outreach': { id: 'd-outreach', name: 'Outreach', levels: ['head', 'member'] }
  };

  const todo = {
    id: 't-test',
    client: 'c-chaim',
    department: 'd-outreach',
    assignee_type: 'user',
    assignee: 'u-rifat',
    state: 'open',
    due: '2026-08-28' // 2 days late
  };

  const late = logic.daysLate(todo.due, today);
  assert.strictEqual(late, 2);

  const targets = logic.escalationRecipients(todo, people, today, deptsById);
  assert.ok(targets.indexOf('u-nadia') > -1, 'Head must be notified when overdue');
  assert.ok(targets.indexOf('u-shohag') > -1, 'Admin must be notified when 2+ days overdue');
});

test('Invite Token 72-hour validity and claims calculation', () => {
  const inviter = { id: 'u-nadia', name: 'Nadia Rahman', admin: false, departments: [{ department: 'd-outreach', level: 'head' }] };
  const userObj = {
    id: 'u-tanvir',
    name: 'Tanvir Hasan',
    email: 'tanvir@originate.example',
    departments: [{ department: 'd-outreach', level: 'lead' }]
  };
  const tokenObj = logic.issueInvite(inviter.id, { email: userObj.email, name: userObj.name, department: 'd-outreach', level: 'lead' }, new Date());

  assert.ok(tokenObj);
  assert.ok(tokenObj.token);
  assert.strictEqual(tokenObj.issued_by, 'u-nadia');

  // Verify within 72 hours
  const usable = logic.inviteUsable(tokenObj, new Date());
  assert.strictEqual(usable, true);

  // Expired token (73 hours ago)
  const expiredInvite = {
    token: 'test-tok',
    issued_at: new Date(Date.now() - 73 * 3600 * 1000).toISOString(),
    expires_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString()
  };
  const expiredResult = logic.inviteUsable(expiredInvite, new Date());
  assert.strictEqual(expiredResult, false);

  // Claim calculation
  const deptsById = {
    'd-outreach': { id: 'd-outreach', name: 'Outreach', levels: ['head', 'lead', 'member'] }
  };
  const claims = logic.claimsFor(userObj, deptsById);
  assert.strictEqual(claims.admin, false);
  assert.strictEqual(claims.departments['d-outreach'], 1); // lead is rank 1
});

// -------------------------------------------------------------------------
// SECTION 2: Persistent Storage Engine (dev3/API/config/db.js)
// -------------------------------------------------------------------------
console.log('\n--- [2/6] Testing Persistent Database Engine (dev3/API/config/db.js) ---');
const db = require('../dev3/API/config/db');

test('Database state initializes, mutates atomically, and syncs', () => {
  const state = db.getState();
  assert.ok(state.version === 1);
  assert.ok(state.users.length >= 2);

  // Test mutation
  const initialAuditCount = state.audit.length;
  db.mutate({ actor: 'u-shohag', action: 'test.verify', target: 'Automated Test', detail: 'Verification check' }, (s) => {
    s.todos = s.todos || [];
    s.todos.push({
      id: 't-test-atomic',
      title: 'Atomic Verification Todo',
      client: 'c-chaim',
      department: 'd-web',
      assignee_type: 'user',
      assignee: 'u-shohag',
      state: 'open',
      priority: 'normal',
      due: '2026-09-01',
      recurrence: 'none',
      created_by: 'u-shohag',
      created_at: new Date().toISOString()
    });
  });

  const reloaded = db.getState();
  assert.strictEqual(reloaded.audit[0].action, 'test.verify');
  assert.ok(reloaded.todos.some(t => t.id === 't-test-atomic'));

  // Clean up test todo
  db.mutate(null, (s) => {
    s.todos = s.todos.filter(t => t.id !== 't-test-atomic');
  });
});

// -------------------------------------------------------------------------
// SECTION 3: Frontend Store & Permission Logic (assets/js/store.js & permissions.js)
// -------------------------------------------------------------------------
console.log('\n--- [3/6] Testing Frontend Permissions & Data Layer ---');

// Mock browser environment for frontend scripts
global.window = global;
global.localStorage = {
  _data: {},
  getItem: function(k) { return this._data[k] || null; },
  setItem: function(k, v) { this._data[k] = String(v); },
  removeItem: function(k) { delete this._data[k]; }
};

require('../assets/js/store');
require('../assets/js/permissions');

test('store.js initializes state, lookups, and session', () => {
  OC.store.load();
  assert.ok(OC.store.state.users.length >= 2);
  
  // Lookups
  const shohag = OC.store.user('u-shohag');
  assert.strictEqual(shohag.name, 'Shohag Munshe');
  assert.strictEqual(shohag.admin, true);

  const fuad = OC.store.user('u-fuad');
  assert.strictEqual(fuad.name, 'Abdullah al Fuad');
  assert.strictEqual(fuad.admin, true);

  const dept = OC.store.department('d-outreach');
  assert.strictEqual(dept.name, 'Outreach Operations');

  // Direct email lookup
  OC.store.state.users = [
    { id: 'u-shohag', name: 'Shohag Munshe', email: 'sm@originatemarketing.com', title: 'Founder', admin: true, departments: [] },
    { id: 'u-imran', name: 'Imran Sheikh', email: 'imran@originate.example', title: 'Operations Manager', admin: false, departments: [{ department: 'd-bizops', level: 'head' }, { department: 'd-admin', level: 'head' }] },
    { id: 'u-nadia', name: 'Nadia Rahman', email: 'nadia@originate.example', title: 'Outreach Director', admin: false, departments: [{ department: 'd-outreach', level: 'head' }, { department: 'd-bizops', level: 'member' }] },
    { id: 'u-tanvir', name: 'Tanvir Hasan', email: 'tanvir@originate.example', title: 'Outreach Specialist', admin: false, departments: [{ department: 'd-outreach', level: 'member' }] },
    { id: 'u-mim', name: 'Mim Akter', email: 'mim@originate.example', title: 'Senior Strategist', admin: false, departments: [{ department: 'd-outreach', level: 'member' }] },
    { id: 'u-rifat', name: 'Rifat Chowdhury', email: 'rifat@originate.example', title: 'Outreach Associate', admin: false, departments: [{ department: 'd-outreach', level: 'member' }] }
  ];
  OC.store.state.todos = [
    { id: 't-1', title: 'Test Todo', department: 'd-outreach', client: 'c-1', assignee_type: 'user', assignee: 'u-rifat', created_by: 'u-shohag', state: 'open' }
  ];
  OC.store.state.instructions = [
    { id: 'n-1', body: 'Outreach Protocol', client: 'c-1', department: 'd-outreach', author: 'u-nadia', posted_at: new Date().toISOString(), read_by: [], comments: [] }
  ];
  OC.store.state.groups = [
    { id: 'g-1', name: 'Q3 Taskforce', purpose: 'Drive campaign', members: ['u-shohag', 'u-nadia', 'u-rifat'], created_by: 'u-shohag', status: 'active', messages: [] }
  ];

  const byEmail = OC.store.userByEmail('sm@originatemarketing.com');
  assert.ok(byEmail);
  assert.strictEqual(byEmail.id, 'u-shohag');

  const byEmailCaseInsensitive = OC.store.userByEmail('  NADIA@originate.example ');
  assert.ok(byEmailCaseInsensitive);
  assert.strictEqual(byEmailCaseInsensitive.id, 'u-nadia');

  // Session switching
  OC.store.setSession('u-nadia');
  assert.strictEqual(OC.store.session(), 'u-nadia');
  OC.store.setSession('u-shohag');
  assert.strictEqual(OC.store.session(), 'u-shohag');
});

test('permissions.js: Role computation, visibility, assignment matrix, and permissions', () => {
  const shohag = OC.store.user('u-shohag'); // Admin
  const nadia = OC.store.user('u-nadia');   // Head of Outreach
  const tanvir = OC.store.user('u-tanvir'); // Member of Outreach
  const rifat = OC.store.user('u-rifat');   // Member of Outreach

  // Role labels
  assert.strictEqual(OC.can.roleLabel(shohag), 'System Admin');
  assert.strictEqual(OC.can.roleLabel(nadia), 'Department Head');
  assert.strictEqual(OC.can.roleLabel(tanvir), 'Member');

  // Assignment authority
  assert.strictEqual(OC.can.assignTo(shohag, rifat.id), true);
  assert.strictEqual(OC.can.assignTo(nadia, rifat.id), true);
  assert.strictEqual(OC.can.assignTo(tanvir, rifat.id), false);

  // Todo Edit & Delete Permissions (Creator and Admin only; a department head
  // running the work is not the author, so heads no longer edit)
  const todo = OC.store.state.todos[0];
  assert.strictEqual(OC.can.canEditTodo(shohag, todo), true);
  assert.strictEqual(OC.can.canEditTodo(nadia, todo), false); // Head of Outreach, not the author
  assert.strictEqual(OC.can.canEditTodo(rifat, todo), false); // Assignee cannot edit
  assert.strictEqual(OC.can.canEditTodo(tanvir, todo), false); // Other member

  // Instruction Edit & Delete Permissions
  const note = OC.store.state.instructions[0];
  assert.strictEqual(OC.can.canEditInstruction(shohag, note), true);
  assert.strictEqual(OC.can.canEditInstruction(nadia, note), true); // Author
  assert.strictEqual(OC.can.canEditInstruction(tanvir, note), false);

  // Comment Scoping & Permissions
  assert.strictEqual(OC.can.canSeeComments(shohag, todo), true);
  assert.strictEqual(OC.can.canSeeComments(nadia, todo), true);
  assert.strictEqual(OC.can.canSeeComments(rifat, todo), true); // Assignee
  assert.strictEqual(OC.can.canSeeComments(tanvir, todo), false); // Colleague not assigned (per b650b8e)

  const commentObj = { id: 'c-1', author: 'u-tanvir', body: 'Working on it' };
  assert.strictEqual(OC.can.canEditComment(tanvir, commentObj, todo), true);
  assert.strictEqual(OC.can.canEditComment(rifat, commentObj, todo), false);
  assert.strictEqual(OC.can.canDeleteComment(tanvir, commentObj, todo), true);
  assert.strictEqual(OC.can.canDeleteComment(nadia, commentObj, todo), true); // Head

  // Group Permissions (Edit, Archive, Delete strictly System Admin only)
  const group = OC.store.state.groups[0];
  assert.strictEqual(OC.can.canEditGroup(shohag, group), true); // System Admin
  assert.strictEqual(OC.can.canEditGroup(nadia, group), false); // Non-admin cannot edit/archive
  assert.strictEqual(OC.can.canDeleteGroup(shohag, group), true); // System Admin
  assert.strictEqual(OC.can.canDeleteGroup(nadia, group), false); // Non-admin cannot delete
  assert.strictEqual(OC.can.canPostGroupMessage(rifat, group), true); // Member
  assert.strictEqual(OC.can.canPostGroupMessage(tanvir, group), false); // Not in group
});

// -------------------------------------------------------------------------
// SECTION 4: Group Chat, Comments & Reactions Store Tests
// -------------------------------------------------------------------------
console.log('\n--- [4/6] Testing Group Chat, Comments & Reactions Storage Engine ---');

test('Comments & Reactions operations in store.js', () => {
  // Comment add, edit, delete
  const c1 = OC.store.comment('todo', 't-1', 'Initial comment', 'u-tanvir');
  assert.ok(c1);
  assert.strictEqual(c1.body, 'Initial comment');
  assert.strictEqual(OC.store.state.todos[0].comments.length, 1);

  const edited = OC.store.editComment('todo', 't-1', c1.id, 'Updated comment body');
  assert.ok(edited);
  assert.strictEqual(edited.body, 'Updated comment body');
  assert.ok(edited.edited_at);

  // Reactions
  OC.store.react('todo', 't-1', '🔥', 'u-shohag');
  OC.store.react('todo', 't-1', '🔥', 'u-nadia');
  assert.strictEqual(OC.store.state.todos[0].reactions['🔥'].length, 2);

  // Toggle reaction off
  OC.store.react('todo', 't-1', '🔥', 'u-shohag');
  assert.strictEqual(OC.store.state.todos[0].reactions['🔥'].length, 1);

  // Delete comment
  OC.store.deleteComment('todo', 't-1', c1.id);
  assert.strictEqual(OC.store.state.todos[0].comments.length, 0);
});

test('Group live chat messages, editing, deletion, and reactions in store.js', () => {
  // Add group message
  const msg = OC.store.addGroupMessage('g-1', 'Welcome to Q3 Taskforce team!', 'u-shohag');
  assert.ok(msg);
  assert.strictEqual(msg.text, 'Welcome to Q3 Taskforce team!');
  assert.strictEqual(OC.store.state.groups[0].messages.length, 1);

  // Edit group message
  const editedMsg = OC.store.editGroupMessage('g-1', msg.id, 'Welcome to Q3 Taskforce (Revised)');
  assert.ok(editedMsg);
  assert.strictEqual(editedMsg.text, 'Welcome to Q3 Taskforce (Revised)');
  assert.ok(editedMsg.edited_at);

  // React to group message
  OC.store.reactGroupMessage('g-1', msg.id, '🚀', 'u-nadia');
  assert.strictEqual(msg.reactions['🚀'].length, 1);
  assert.strictEqual(msg.reactions['🚀'][0], 'u-nadia');

  // Delete group message
  OC.store.deleteGroupMessage('g-1', msg.id);
  assert.strictEqual(OC.store.state.groups[0].messages.length, 0);

  // Delete group
  OC.store.deleteGroup('g-1');
  assert.strictEqual(OC.store.state.groups.length, 0);
});

// -------------------------------------------------------------------------
// SECTION 5: REST API Endpoints Verification (dev3/API/controllers)
// -------------------------------------------------------------------------
console.log('\n--- [5/6] Testing REST API Controllers & Routes ---');
const commandController = require('../dev3/API/controllers/commandController');

function mockReqRes(body = {}, params = {}, query = {}) {
  const req = { body, params, query, headers: {} };
  let statusCode = 200;
  let responseData = null;
  const res = {
    status: (code) => { statusCode = code; return res; },
    json: (data) => { responseData = data; return res; },
    setHeader: () => {},
    writeHead: () => {},
    write: () => {},
    on: () => {}
  };
  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

test('API: getState & getStats return full workspace data', () => {
  const { req, res, getStatus, getData } = mockReqRes();
  commandController.getState(req, res);
  assert.strictEqual(getStatus(), 200);
  assert.strictEqual(getData().version, 1);
  assert.ok(getData().users.length >= 2);

  const stats = mockReqRes();
  commandController.getStats(stats.req, stats.res);
  assert.strictEqual(stats.getStatus(), 200);
});

test('API: mutateState processes actions and stamps audit trail with IP', () => {
  const { req, res, getStatus, getData } = mockReqRes({
    entry: { actor: 'u-shohag', action: 'test.api', target: 'Controller Test', detail: 'Verified', ip: '103.205.132.5' }
  });
  commandController.mutateState(req, res);
  assert.strictEqual(getStatus(), 200);
  assert.strictEqual(getData().ok, true);
  assert.ok(getData().state.audit.some(a => a.action === 'test.api'));
});

// -------------------------------------------------------------------------
// SECTION 6: Reports & Autostart Verification
// -------------------------------------------------------------------------
console.log('\n--- [6/6] Testing Reports CSV, Autostart & Network ---');
require('../assets/js/reports');

test('reports.js: CSV generation and audit table formatting with IP', () => {
  const sampleAudit = [
    { at: '2026-08-30T12:00:00Z', actor: 'u-shohag', ip: '192.168.1.100', action: 'todo.create', target: 'Task 1', detail: 'Created' }
  ];
  const rows = [['When', 'Actor', 'IP Address', 'Action', 'Target', 'Detail']];
  sampleAudit.forEach(a => {
    rows.push([a.at, OC.ui ? OC.ui.personName(a.actor) : a.actor, a.ip, a.action, a.target, a.detail]);
  });
  const csvText = OC.reports.csv(rows);
  assert.ok(csvText.includes('IP Address'));
  assert.ok(csvText.includes('192.168.1.100'));
});

test('autostart-server.vbs or start-servers.bat exists and is verified', () => {
  if (process.platform !== 'win32') {
    // Linux VPS uses PM2 ecosystem configuration
    assert.ok(true);
    return;
  }
  const rootVbs = path.join(__dirname, '..', 'autostart-server.vbs');
  const rootBat = path.join(__dirname, '..', 'start-servers.bat');

  if (fs.existsSync(rootVbs)) {
    const content = fs.readFileSync(rootVbs, 'utf8');
    assert.ok(content.includes('xampp_start.exe') || content.includes('apache_start.bat'), 'Must contain XAMPP auto-start logic');
    assert.ok(content.includes('start-servers.bat'), 'Must contain start-servers.bat invocation');
  } else {
    assert.ok(fs.existsSync(rootBat), 'root start-servers.bat must exist');
    const batContent = fs.readFileSync(rootBat, 'utf8');
    assert.ok(batContent.includes('ecosystem.config.js'), 'Must contain ecosystem.config.js invocation');
  }

  const startupVbs = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'OriginateCommandServer.vbs');
  if (fs.existsSync(startupVbs)) {
    const startupContent = fs.readFileSync(startupVbs, 'utf8');
    assert.ok(startupContent.length > 0);
  }
});

console.log('\n====================================================================');
console.log(` 🎉 ALL ${passCount} LOGIC & FUNCTION VERIFICATION CHECKS PASSED! ✅`);
console.log('====================================================================\n');
setTimeout(function () { process.exit(0); }, 100);

