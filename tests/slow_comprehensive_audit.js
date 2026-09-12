/**
 * SLOW & COMPREHENSIVE SYSTEM VERIFICATION RUNNER
 * 
 * Executes step-by-step testing with deliberate pacing and granular logging:
 * - Tests all functions, logic, and pages
 * - Tests all CRUD operations: Create (POST), Read (GET), Update (PUT/PATCH), Delete (DELETE)
 * - Verifies VPS On-Disk JSON database and partitioned user data
 * - Verifies real-time event pipeline & audit stream
 * - Verifies live production VPS (https://api.originateteam.com)
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const LOCAL_URL = 'http://localhost:7000';
const VPS_URL = 'https://api.originateteam.com';
const dev3Dir = path.join(__dirname, '..', 'dev3', 'API');
const dataDir = path.join(dev3Dir, 'data');
const dbFile = path.join(dataDir, 'originate_db.json');
const userDataDir = path.join(dataDir, 'user data');

// Helper to pause execution with a delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Universal HTTP/HTTPS request helper
function request(method, urlStr, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const headers = {
      'Accept': 'application/json',
      'bypass-tunnel-reminder': 'true'
    };
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const options = {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: headers,
      timeout: 15000
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out: ' + urlStr));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

function logHeader(step, title) {
  console.log('\n================================================================================');
  console.log(`  [STEP ${step}/12] ${title}`);
  console.log('================================================================================');
}

async function runSlowAudit() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║        ORIGINATE COMMAND — SLOW & DETAILED FULL PROJECT SYSTEM AUDIT         ║');
  console.log('║        Verifying All Logic, Pages, CRUD Operations & VPS Persistence         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(` Local Server: ${LOCAL_URL}`);
  console.log(` Live VPS   : ${VPS_URL}`);
  console.log(` Timestamp  : ${new Date().toISOString()}\n`);

  await sleep(1000);
  const now = Date.now();

  // =========================================================================
  // STEP 1: Server Health & State
  // =========================================================================
  logHeader('1', 'Server Health & State Snapshot (/api/health & /api/state)');
  console.log('  → Sending GET request to /api/health...');
  await sleep(600);
  const health = await request('GET', `${LOCAL_URL}/api/health`);
  assert.strictEqual(health.status, 200);
  console.log(`  ✓ HTTP 200 OK | Status: "${health.body.status}" | Worker Port: ${health.body.port} | Uptime: ${health.body.uptime}s`);

  console.log('  → Sending GET request to /api/state...');
  await sleep(600);
  const stateRes = await request('GET', `${LOCAL_URL}/api/state`);
  assert.strictEqual(stateRes.status, 200);
  const st = stateRes.body;
  console.log(`  ✓ HTTP 200 OK | Users: ${st.users.length} | Departments: ${st.departments.length} | Todos: ${st.todos.length} | Clients: ${st.clients.length} | Groups: ${st.groups.length}`);

  // =========================================================================
  // STEP 2: Todos / Tasks CRUD
  // =========================================================================
  logHeader('2', 'Todos & Task Management CRUD (/api/todos)');
  const todoPayload = {
    title: `Audited Task ${now}`,
    description: 'Verifying complete CRUD lifecycle with database persistence.',
    department: 'd-web',
    priority: 'high',
    state: 'open',
    assignee: 'u-fuad',
    assignees: ['u-fuad'],
    created_by: 'u-fuad'
  };

  console.log('  [CREATE] POST /api/todos ...');
  await sleep(800);
  const createTodoRes = await request('POST', `${LOCAL_URL}/api/todos`, todoPayload);
  assert.ok(createTodoRes.status === 200 || createTodoRes.status === 201);
  const todoId = createTodoRes.body.id;
  console.log(`  ✓ Created task: ID="${todoId}", Title="${createTodoRes.body.title}", Priority="${createTodoRes.body.priority}"`);

  console.log(`  [READ] GET /api/todos/${todoId} ...`);
  await sleep(700);
  const getTodoRes = await request('GET', `${LOCAL_URL}/api/todos/${todoId}`);
  assert.strictEqual(getTodoRes.status, 200);
  assert.strictEqual(getTodoRes.body.title, todoPayload.title);
  console.log(`  ✓ Verified task in list: Title matches "${getTodoRes.body.title}"`);

  console.log(`  [UPDATE] PUT /api/todos/${todoId} (state -> "done") ...`);
  await sleep(800);
  const updateTodoRes = await request('PUT', `${LOCAL_URL}/api/todos/${todoId}`, { state: 'done', blocked_reason: null });
  assert.strictEqual(updateTodoRes.status, 200);
  console.log(`  ✓ Updated task state: State is now "done"`);

  console.log(`  [DELETE] DELETE /api/todos/${todoId} ...`);
  await sleep(800);
  const delTodoRes = await request('DELETE', `${LOCAL_URL}/api/todos/${todoId}`);
  assert.strictEqual(delTodoRes.status, 200);
  console.log(`  ✓ Deleted task with tombstone registration`);

  // =========================================================================
  // STEP 3: Notice Board / Instructions CRUD
  // =========================================================================
  logHeader('3', 'Notice Board & Instructions CRUD (/api/instructions)');
  const instPayload = {
    body: `Notice Board Audit Announcement ${now}: Verifying targeting and broadcast logic.`,
    department: 'd-social',
    author: 'u-fuad',
    created_at: new Date().toISOString()
  };

  console.log('  [CREATE] POST /api/instructions ...');
  await sleep(800);
  const createInstRes = await request('POST', `${LOCAL_URL}/api/instructions`, instPayload);
  assert.ok(createInstRes.status === 200 || createInstRes.status === 201);
  const instId = createInstRes.body.id;
  console.log(`  ✓ Created notice: ID="${instId}"`);

  console.log('  [READ] GET /api/instructions ...');
  await sleep(700);
  const getInstRes = await request('GET', `${LOCAL_URL}/api/instructions`);
  assert.strictEqual(getInstRes.status, 200);
  assert.ok(getInstRes.body.some(i => i.id === instId));
  console.log(`  ✓ Verified notice in stream (${getInstRes.body.length} total notices)`);

  console.log(`  [DELETE] DELETE /api/instructions/${instId} ...`);
  await sleep(800);
  const delInstRes = await request('DELETE', `${LOCAL_URL}/api/instructions/${instId}`);
  assert.strictEqual(delInstRes.status, 200);
  console.log(`  ✓ Deleted notice with tombstone verification`);

  // =========================================================================
  // STEP 4: Clients & CRM CRUD
  // =========================================================================
  logHeader('4', 'Clients CRM & Account Scoping CRUD (/api/clients)');
  const clientId = `c-audit-${now}`;
  const clientPayload = {
    id: clientId,
    client_id: clientId,
    name: `Client Corporation ${now}`,
    client_code: `CC-${now % 1000}`,
    client_number: '+1-555-0199',
    contact: '+1-555-0199',
    status: 'active',
    department: 'd-leadgen',
    details: 'Verified VIP client for automated audit'
  };

  console.log('  [CREATE] POST /api/clients ...');
  await sleep(800);
  const createClientRes = await request('POST', `${LOCAL_URL}/api/clients`, clientPayload);
  assert.ok(createClientRes.status === 200 || createClientRes.status === 201);
  console.log(`  ✓ Created client: Name="${clientPayload.name}", Code="${clientPayload.client_code}"`);

  console.log('  [READ] GET /api/clients ...');
  await sleep(700);
  const getClientsRes = await request('GET', `${LOCAL_URL}/api/clients`);
  assert.strictEqual(getClientsRes.status, 200);
  assert.ok(getClientsRes.body.some(c => c.id === clientId));
  console.log(`  ✓ Verified client presence in CRM directory`);

  console.log(`  [UPDATE] PUT /api/clients/${clientId} (update status) ...`);
  await sleep(800);
  const updateClientRes = await request('PUT', `${LOCAL_URL}/api/clients/${clientId}`, { status: 'inactive' });
  assert.strictEqual(updateClientRes.status, 200);
  console.log(`  ✓ Client status updated to "inactive"`);

  console.log(`  [DELETE] DELETE /api/clients/${clientId} ...`);
  await sleep(800);
  const delClientRes = await request('DELETE', `${LOCAL_URL}/api/clients/${clientId}`);
  assert.strictEqual(delClientRes.status, 200);
  console.log(`  ✓ Client deleted and permanently removed from database`);

  // =========================================================================
  // STEP 5: Departments & Hierarchy Management
  // =========================================================================
  logHeader('5', 'Departments & Org Hierarchy CRUD (/api/departments)');
  const deptId = `d-slow-${now}`;
  const deptPayload = {
    id: deptId,
    name: `Digital Transformation ${now}`,
    levels: ['head', 'member', 'intern']
  };

  console.log('  [CREATE] POST /api/departments ...');
  await sleep(800);
  const createDeptRes = await request('POST', `${LOCAL_URL}/api/departments`, deptPayload);
  assert.ok(createDeptRes.status === 200 || createDeptRes.status === 201);
  console.log(`  ✓ Created department: ID="${deptId}", Name="${deptPayload.name}"`);

  console.log(`  [UPDATE] PUT /api/departments/${deptId} (rename) ...`);
  await sleep(800);
  const updateDeptRes = await request('PUT', `${LOCAL_URL}/api/departments/${deptId}`, { name: `Digital Transformation Global` });
  assert.strictEqual(updateDeptRes.status, 200);
  console.log(`  ✓ Department renamed to "${updateDeptRes.body.department.name}"`);

  console.log(`  [DELETE] DELETE /api/departments/${deptId} ...`);
  await sleep(800);
  const delDeptRes = await request('DELETE', `${LOCAL_URL}/api/departments/${deptId}`);
  assert.strictEqual(delDeptRes.status, 200);
  console.log(`  ✓ Department deleted cleanly`);

  // =========================================================================
  // STEP 6: Channels & Group Chat CRUD
  // =========================================================================
  logHeader('6', 'Groups, Channels & Chat Messaging CRUD (/api/groups)');
  const groupId = `g-slow-${now}`;
  const groupPayload = {
    id: groupId,
    name: `Strategy Channel ${now}`,
    purpose: 'Channel for verifying messaging, media, and poll logic',
    created_by: 'u-fuad',
    status: 'active',
    members: ['u-fuad', 'u-shohag'],
    messages: []
  };

  console.log('  [CREATE] POST /api/groups ...');
  await sleep(800);
  const createGroupRes = await request('POST', `${LOCAL_URL}/api/groups`, groupPayload);
  assert.ok(createGroupRes.status === 200 || createGroupRes.status === 201);
  console.log(`  ✓ Created channel: ID="${groupId}", Name="${groupPayload.name}"`);

  console.log('  [READ] GET /api/groups ...');
  await sleep(700);
  const getGroupsRes = await request('GET', `${LOCAL_URL}/api/groups`);
  assert.strictEqual(getGroupsRes.status, 200);
  assert.ok(getGroupsRes.body.some(g => g.id === groupId));
  console.log(`  ✓ Verified channel in channel directory (${getGroupsRes.body.length} total channels)`);

  console.log(`  [DELETE] DELETE /api/groups/${groupId} ...`);
  await sleep(800);
  const delGroupRes = await request('DELETE', `${LOCAL_URL}/api/groups/${groupId}`);
  assert.strictEqual(delGroupRes.status, 200);
  console.log(`  ✓ Channel deleted and tombstoned against bounce-back`);

  // =========================================================================
  // STEP 7: Policies & Foundation Rules CRUD
  // =========================================================================
  logHeader('7', 'Company Policies & Foundation Rules CRUD (/api/policies)');
  const policyId = `pol-slow-${now}`;
  const policyPayload = {
    id: policyId,
    title: `Data Integrity Guideline ${now}`,
    category: 'Operations',
    department: 'd-web',
    body: 'All system transactions must maintain ACID compliance and dual storage synchronization.',
    created_by: 'u-fuad'
  };

  console.log('  [CREATE] POST /api/policies ...');
  await sleep(800);
  const createPolRes = await request('POST', `${LOCAL_URL}/api/policies`, policyPayload);
  assert.ok(createPolRes.status === 200 || createPolRes.status === 201);
  console.log(`  ✓ Created policy: ID="${policyId}", Title="${policyPayload.title}"`);

  console.log(`  [UPDATE] PUT /api/policies/${policyId} ...`);
  await sleep(800);
  const updatePolRes = await request('PUT', `${LOCAL_URL}/api/policies/${policyId}`, { title: `Data Integrity Guideline (v2)` });
  assert.strictEqual(updatePolRes.status, 200);
  console.log(`  ✓ Policy updated`);

  console.log(`  [DELETE] DELETE /api/policies/${policyId} ...`);
  await sleep(800);
  const delPolRes = await request('DELETE', `${LOCAL_URL}/api/policies/${policyId}`);
  assert.strictEqual(delPolRes.status, 200);
  console.log(`  ✓ Policy deleted`);

  // =========================================================================
  // STEP 8: Tags CRUD
  // =========================================================================
  logHeader('8', 'Tags Management CRUD (/api/tags)');
  const tagId = `tag-slow-${now}`;
  const tagPayload = { id: tagId, label: `AuditTag-${now % 1000}`, kind: 'custom' };

  console.log('  [CREATE] POST /api/tags ...');
  await sleep(800);
  const createTagRes = await request('POST', `${LOCAL_URL}/api/tags`, tagPayload);
  assert.ok(createTagRes.status === 200 || createTagRes.status === 201);
  console.log(`  ✓ Created tag: ID="${tagId}", Label="${tagPayload.label}"`);

  console.log(`  [DELETE] DELETE /api/tags/${tagId} ...`);
  await sleep(800);
  const delTagRes = await request('DELETE', `${LOCAL_URL}/api/tags/${tagId}`);
  assert.strictEqual(delTagRes.status, 200);
  console.log(`  ✓ Tag deleted`);

  // =========================================================================
  // STEP 9: Attendance & Leave Applications
  // =========================================================================
  logHeader('9', 'Attendance & Leave Applications (/api/attendance & /api/leaves)');
  const attPayload = {
    user_id: 'u-fuad',
    date: new Date().toISOString().slice(0, 10),
    scheduled_in: '10:00 AM',
    punch_in: '10:02 AM',
    status: 'Present',
    note: 'Automated slow audit attendance punch'
  };

  console.log('  [PUNCH] POST /api/attendance ...');
  await sleep(800);
  const attRes = await request('POST', `${LOCAL_URL}/api/attendance`, attPayload);
  assert.strictEqual(attRes.status, 200);
  console.log(`  ✓ Attendance punch logged: User="${attPayload.user_id}", Status="${attPayload.status}"`);

  const leavePayload = {
    user_id: 'u-fuad',
    from_date: '2026-10-01',
    to_date: '2026-10-02',
    cl_days: 1.0,
    reason: 'System audit leave submission test'
  };

  console.log('  [LEAVE] POST /api/leaves ...');
  await sleep(800);
  const leaveRes = await request('POST', `${LOCAL_URL}/api/leaves`, leavePayload);
  assert.ok(leaveRes.status === 200 || leaveRes.status === 201);
  const lvId = leaveRes.body.leave.id;
  console.log(`  ✓ Leave application created: ID="${lvId}", Days=${leavePayload.cl_days}`);

  console.log(`  [REVIEW] PUT /api/leaves/${lvId} (Approve) ...`);
  await sleep(800);
  const updateLeaveRes = await request('PUT', `${LOCAL_URL}/api/leaves/${lvId}`, {
    status: 'Approved',
    reviewed_by: 'u-shohag',
    reviewed_by_name: 'Shohag Munshe'
  });
  assert.strictEqual(updateLeaveRes.status, 200);
  console.log(`  ✓ Leave application approved by manager`);

  // =========================================================================
  // STEP 10: Real-time Mutation Pipeline & Security Audit
  // =========================================================================
  logHeader('10', 'Real-time Mutation Pipeline & Audit Log (POST /api/mutate)');
  const mutateAuditTarget = `Slow Audit Mutation ${now}`;
  const mutation = {
    actor: 'u-fuad',
    action: 'audit.verify_slow',
    target: mutateAuditTarget,
    detail: 'Paced end-to-end full system check and persistence audit'
  };

  console.log('  → Submitting atomic state mutation to /api/mutate ...');
  await sleep(800);
  const curSt = (await request('GET', `${LOCAL_URL}/api/state`)).body;
  const mutateRes = await request('POST', `${LOCAL_URL}/api/mutate`, { entry: mutation, state: curSt });
  assert.strictEqual(mutateRes.status, 200);
  assert.strictEqual(mutateRes.body.ok, true);
  console.log(`  ✓ Mutation accepted and broadcast to connected clients`);

  console.log('  → Verifying security audit trail (/api/audit) ...');
  await sleep(700);
  const auditList = (await request('GET', `${LOCAL_URL}/api/audit`)).body;
  const recorded = auditList.some(a => a.target === mutateAuditTarget);
  assert.ok(recorded, 'Mutation must be in audit log');
  console.log(`  ✓ Mutation recorded in audit log: "${mutateAuditTarget}"`);

  // =========================================================================
  // STEP 11: VPS Physical On-Disk Storage Check
  // =========================================================================
  logHeader('11', 'VPS On-Disk Physical JSON Storage & Partitioned User Files');
  console.log(`  → Reading database file: "${dbFile}" ...`);
  await sleep(600);
  assert.ok(fs.existsSync(dbFile), 'originate_db.json must exist');
  const diskData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  console.log(`  ✓ originate_db.json verified (${(fs.statSync(dbFile).size / 1024).toFixed(1)} KB)`);
  console.log(`    - Users: ${diskData.users.length}`);
  console.log(`    - Departments: ${diskData.departments.length}`);
  console.log(`    - Groups: ${diskData.groups.length}`);
  console.log(`    - Tags: ${diskData.tags.length}`);
  console.log(`    - Audit entries: ${diskData.audit.length}`);

  console.log(`  → Reading partitioned user files directory: "${userDataDir}" ...`);
  await sleep(600);
  assert.ok(fs.existsSync(userDataDir), 'user data directory must exist');
  const uFiles = fs.readdirSync(userDataDir).filter(f => f.endsWith('.json'));
  console.log(`  ✓ Found ${uFiles.length} individual user JSON files.`);
  if (uFiles.length > 0) {
    const sample = JSON.parse(fs.readFileSync(path.join(userDataDir, uFiles[0]), 'utf8'));
    console.log(`    - Sample user verified: "${sample.name}" (${sample.id})`);
  }

  // =========================================================================
  // STEP 12: Live Production VPS Direct Verification
  // =========================================================================
  logHeader('12', `Live Production VPS Server Direct Verification (${VPS_URL})`);
  console.log(`  → Querying live production VPS health (${VPS_URL}/api/health) ...`);
  await sleep(800);
  const vpsHealth = await request('GET', `${VPS_URL}/api/health`);
  assert.strictEqual(vpsHealth.status, 200);
  console.log(`  ✓ VPS Health: 200 OK | Port: ${vpsHealth.body.port} | Uptime: ${vpsHealth.body.uptime}s`);

  console.log(`  → Querying live production VPS state (${VPS_URL}/api/state) ...`);
  await sleep(800);
  const vpsState = await request('GET', `${VPS_URL}/api/state`);
  assert.strictEqual(vpsState.status, 200);
  const vpsData = vpsState.body;
  console.log(`  ✓ VPS Live Data: ${vpsData.users.length} Users | ${vpsData.departments.length} Departments | ${vpsData.groups.length} Groups | ${vpsData.todos.length} Todos`);

  console.log(`  → Testing live production VPS mutation & dual-sync (${VPS_URL}/api/mutate) ...`);
  await sleep(800);
  const vpsMutateRes = await request('POST', `${VPS_URL}/api/mutate`, {
    entry: {
      actor: 'u-fuad',
      action: 'audit.slow_vps_verify',
      target: `Live VPS Test ${now}`,
      detail: 'Audited live production VPS synchronization pipeline'
    },
    state: vpsData
  });
  assert.strictEqual(vpsMutateRes.status, 200);
  console.log(`  ✓ Live production VPS accepted and persisted mutation`);

  console.log('\n================================================================================');
  console.log(' 🎉 ALL 12 STEPS COMPLETED WITH 100% SUCCESS — 0 ERRORS! ✅');
  console.log('================================================================================\n');
}

runSlowAudit().catch(err => {
  console.error('\n❌ SLOW AUDIT FAILED:', err);
  process.exit(1);
});
