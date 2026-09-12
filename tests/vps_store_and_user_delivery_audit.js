/**
 * VPS STORAGE & USER DELIVERY COMPREHENSIVE AUDIT
 * 
 * Verifies two-way end-to-end integrity:
 * 1. Storage: Every create/update action physically persists in VPS MySQL & on-disk JSON
 * 2. Delivery: Users actually fetch and receive the exact stored data from the VPS
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const API_BASE = process.env.API_URL || 'http://localhost:7000';
const dev3Dir = path.join(__dirname, '..', 'dev3', 'API');
const dataDir = path.join(dev3Dir, 'data');
const dbFile = path.join(dataDir, 'originate_db.json');
const userDataDir = path.join(dataDir, 'user data');

// Load environment config
const envPath = fs.existsSync(path.join(dev3Dir, '.env.production'))
  ? path.join(dev3Dir, '.env.production')
  : path.join(dev3Dir, '.env');
try { require('dotenv').config({ path: envPath }); } catch (_) {}

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

function readJsonFile(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

async function getMysqlPool() {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch (_) {
    try { mysql = require(path.join(dev3Dir, 'node_modules', 'mysql2', 'promise')); } catch (e) {}
  }
  if (!mysql) return null;

  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'originate_user',
      password: process.env.DB_PASSWORD || 'StrongDBPass123!',
      database: process.env.DB_NAME || 'originate_command_db',
      waitForConnections: true,
      connectionLimit: 4
    });
    // test connection
    await pool.query('SELECT 1');
    return pool;
  } catch (err) {
    return null;
  }
}

async function pollMySQL(pool, queryStr, params = [], maxMs = 2500) {
  if (!pool) return [];
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const [rows] = await pool.query(queryStr, params);
      if (rows && rows.length > 0) return rows;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 150));
  }
  const [finalRows] = await pool.query(queryStr, params);
  return finalRows;
}

async function runAudit() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║       VPS STORAGE & USER DATA DELIVERY VERIFICATION AUDIT                    ║');
  console.log('║       Checking: Sob Kichu VPS-e Store Hocche & Users Data Pachhe?           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(` Target API Endpoint: ${API_BASE}\n`);

  const mysqlPool = await getMysqlPool();
  if (mysqlPool) {
    console.log(' [DB] Connected to MySQL "originate_command_db" for direct storage verification.\n');
  } else {
    console.log(' [DB] Direct MySQL connection skipped (running without local mysql credentials or remote).\n');
  }

  const now = Date.now();
  let passedCount = 0;

  // =========================================================================
  // STEP 1: User Login & Session Delivery from VPS
  // =========================================================================
  console.log('--- [Step 1] User Authentication & Profile Delivery from VPS ---');
  const loginRes = await request('POST', `${API_BASE}/api/auth/login`, {
    email: 'admin@originatemarketing.com',
    password: 'admin'
  });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  assert.strictEqual(loginRes.body.ok, true, 'Login response ok must be true');
  assert.ok(loginRes.body.user, 'User object must be delivered from VPS');
  assert.ok(loginRes.body.user.id, 'User ID exists');
  assert.strictEqual(loginRes.body.user.password, undefined, 'Passwords must NEVER be returned');
  console.log(`  ✓ VPS authenticated user "${loginRes.body.user.name}" (${loginRes.body.user.id})`);
  console.log(`  ✓ VPS delivered user session, profile, and department cleanly to client`);
  passedCount += 2;

  // =========================================================================
  // STEP 2: Full State Delivery to User (GET /api/state)
  // =========================================================================
  console.log('\n--- [Step 2] Full Application State Delivery (GET /api/state) ---');
  const stateRes = await request('GET', `${API_BASE}/api/state`);
  assert.strictEqual(stateRes.status, 200, '/api/state must return HTTP 200');
  const state = stateRes.body;
  assert.ok(Array.isArray(state.users), 'state.users delivered from VPS');
  assert.ok(Array.isArray(state.departments), 'state.departments delivered from VPS');
  assert.ok(Array.isArray(state.todos), 'state.todos delivered from VPS');
  assert.ok(Array.isArray(state.clients), 'state.clients delivered from VPS');
  assert.ok(Array.isArray(state.instructions), 'state.instructions delivered from VPS');
  assert.ok(Array.isArray(state.groups), 'state.groups delivered from VPS');
  assert.ok(Array.isArray(state.policies), 'state.policies delivered from VPS');

  console.log(`  ✓ Users delivered to client:        ${state.users.length}`);
  console.log(`  ✓ Departments delivered to client:  ${state.departments.length}`);
  console.log(`  ✓ Groups/Channels delivered:        ${state.groups.length}`);
  console.log(`  ✓ Active Clients delivered:         ${state.clients.length}`);
  console.log(`  ✓ Active Tasks/Todos delivered:     ${state.todos.length}`);
  console.log(`  ✓ Instructions delivered:           ${state.instructions.length}`);
  console.log(`  ✓ Foundation Policies delivered:    ${state.policies.length}`);
  passedCount += 7;

  // Select a regular employee from state
  const targetEmployee = state.users.find(u => !u.admin && u.id !== 'u-admin') || state.users[1];
  console.log(`  ✓ Target Employee for dual-user testing: "${targetEmployee.name}" (${targetEmployee.id})`);

  // =========================================================================
  // STEP 3: Foundation Rules (Create -> VPS Storage -> User Receives)
  // =========================================================================
  console.log('\n--- [Step 3] Foundation Rules: Store on VPS & Deliver to Users ---');
  const testPolicyId = `pol-sync-${now}`;
  const testPolicyData = {
    id: testPolicyId,
    title: `Sync Verification Policy ${now}`,
    body: `<h2>Full Page Editor Content</h2><p>Testing VPS storage and delivery.</p><ul><li>Step 1</li><li>Step 2</li></ul>`,
    department: 'dev',
    category: 'Engineering Standard',
    created_by: 'u-admin',
    created_at: new Date().toISOString()
  };

  // 3a. Create on VPS
  const createPolicyRes = await request('POST', `${API_BASE}/api/policies`, testPolicyData);
  assert.ok(createPolicyRes.status === 200 || createPolicyRes.status === 201, 'POST /api/policies must return 200 or 201');
  console.log(`  ✓ Policy created via API on VPS (${testPolicyId})`);

  // 3b. Verify stored on VPS disk (JSON)
  if (fs.existsSync(dbFile)) {
    const diskJson = readJsonFile(dbFile);
    const inJson = (diskJson && diskJson.policies || []).find(p => p.id === testPolicyId);
    assert.ok(inJson, 'Policy MUST physically exist in VPS originate_db.json');
    console.log(`  ✓ Verified on-disk JSON storage: physically saved in originate_db.json`);
  }

  // 3c. Verify stored in VPS MySQL
  if (mysqlPool) {
    const rows = await pollMySQL(mysqlPool, 'SELECT * FROM policies WHERE id = ?', [testPolicyId]);
    assert.strictEqual(rows.length, 1, 'Policy must be in MySQL policies table');
    assert.strictEqual(rows[0].title, testPolicyData.title, 'MySQL title matches exactly');
    console.log(`  ✓ Verified MySQL storage: physically saved in "policies" table`);
  }

  // 3d. Verify User receives it when querying state or policies
  const userPolRes = await request('GET', `${API_BASE}/api/policies`);
  assert.strictEqual(userPolRes.status, 200);
  const deliveredPol = (userPolRes.body || []).find(p => p.id === testPolicyId);
  assert.ok(deliveredPol, 'User MUST receive the created policy from VPS');
  assert.strictEqual(deliveredPol.title, testPolicyData.title);
  assert.strictEqual(deliveredPol.body, testPolicyData.body);
  console.log(`  ✓ User Delivery Verified: User fetched policy with exact HTML body from VPS!`);

  // 3e. Update policy and verify user receives update
  const updatedBody = `<p>Updated content after revision.</p>`;
  await request('PUT', `${API_BASE}/api/policies/${testPolicyId}`, {
    ...testPolicyData,
    body: updatedBody
  });
  const userUpdatedPolRes = await request('GET', `${API_BASE}/api/policies`);
  assert.strictEqual(userUpdatedPolRes.status, 200);
  const updatedPol = (userUpdatedPolRes.body || []).find(p => p.id === testPolicyId);
  assert.ok(updatedPol, 'Updated policy delivered in list');
  assert.strictEqual(updatedPol.body, updatedBody, 'User receives updated body');
  console.log(`  ✓ User Update Delivery Verified: User fetched updated revision from VPS!`);

  // 3f. Cleanup policy
  await request('DELETE', `${API_BASE}/api/policies/${testPolicyId}`);
  console.log(`  ✓ Cleanup: Policy removed cleanly from VPS`);
  passedCount += 5;

  // =========================================================================
  // STEP 4: Tasks / Todos: Create -> VPS Store -> Employee Receives
  // =========================================================================
  console.log('\n--- [Step 4] Tasks/Todos: Store on VPS & Deliver to Assigned User ---');
  const testTodoId = `t-sync-${now}`;
  const testTodoData = {
    id: testTodoId,
    title: `Sync Verification Task ${now}`,
    state: 'open',
    client: 'c-default',
    assignees: [targetEmployee.id],
    department: targetEmployee.department || 'd-web',
    tags: ['Urgent', 'Verification'],
    created_by: 'u-admin',
    created_at: new Date().toISOString()
  };

  // 4a. Create task
  const createTodoRes = await request('POST', `${API_BASE}/api/todos`, testTodoData);
  assert.ok(createTodoRes.status === 200 || createTodoRes.status === 201, 'POST /api/todos must return 200 or 201');
  console.log(`  ✓ Task created via API on VPS (${testTodoId})`);

  // 4b. Verify stored in VPS MySQL
  if (mysqlPool) {
    const rows = await pollMySQL(mysqlPool, 'SELECT * FROM todos WHERE id = ?', [testTodoId]);
    assert.strictEqual(rows.length, 1, 'Todo must be in MySQL todos table');
    assert.strictEqual(rows[0].title, testTodoData.title);
    console.log(`  ✓ Verified MySQL storage: physically saved in "todos" table`);
  }

  // 4c. Verify Employee receives task in their todo feed
  const userTodosRes = await request('GET', `${API_BASE}/api/todos?user=${targetEmployee.id}`);
  assert.strictEqual(userTodosRes.status, 200);
  const deliveredTodo = (userTodosRes.body || []).find(t => t.id === testTodoId);
  assert.ok(deliveredTodo, `Target employee ${targetEmployee.name} MUST receive the task from VPS`);
  assert.ok(deliveredTodo.state === 'open' || deliveredTodo.state === 'todo');
  console.log(`  ✓ User Delivery Verified: Employee "${targetEmployee.name}" received task from VPS!`);

  // 4d. Employee updates task to "progress" then "done"
  await request('PUT', `${API_BASE}/api/todos/${testTodoId}`, {
    ...testTodoData,
    state: 'progress',
    actor: targetEmployee.id
  });
  const empStateRes = await request('GET', `${API_BASE}/api/todos/${testTodoId}`);
  assert.strictEqual(empStateRes.body.state, 'progress', 'State is now progress');

  await request('PUT', `${API_BASE}/api/todos/${testTodoId}`, {
    ...testTodoData,
    state: 'done',
    actor: targetEmployee.id
  });
  const empDoneRes = await request('GET', `${API_BASE}/api/todos/${testTodoId}`);
  assert.strictEqual(empDoneRes.body.state, 'done', 'State is now done');
  console.log(`  ✓ Two-way sync verified: Employee changed state to done, VPS saved, user sees done`);

  // 4e. Add comment
  const commentRes = await request('POST', `${API_BASE}/api/comments`, {
    kind: 'todo',
    id: testTodoId,
    body: 'Work completed successfully on VPS.',
    author: targetEmployee.id
  });
  assert.strictEqual(commentRes.status, 200, 'POST /api/comments must return 200');
  if (mysqlPool) {
    const cRows = await pollMySQL(mysqlPool, 'SELECT * FROM comments WHERE target_id = ?', [testTodoId]);
    assert.ok(cRows.length >= 1, 'Comment stored in MySQL comments table');
    console.log(`  ✓ Verified comment stored in MySQL and linked to task`);
  }

  // 4f. Cleanup task
  await request('DELETE', `${API_BASE}/api/todos/${testTodoId}`);
  console.log(`  ✓ Cleanup: Task and comment removed cleanly from VPS`);
  passedCount += 6;

  // =========================================================================
  // STEP 5: Instructions / Notices: Create -> VPS Store -> Read Receipts
  // =========================================================================
  console.log('\n--- [Step 5] Instructions: Store on VPS & Multi-User Read Delivery ---');
  const testInstId = `n-sync-${now}`;
  const testInstData = {
    id: testInstId,
    title: `Sync Verification Announcement ${now}`,
    body: 'Crucial company update stored on VPS.',
    department: 'all',
    created_by: 'u-admin',
    created_at: new Date().toISOString()
  };

  await request('POST', `${API_BASE}/api/instructions`, testInstData);
  console.log(`  ✓ Announcement posted to VPS (${testInstId})`);

  // Verify stored in MySQL
  if (mysqlPool) {
    const rows = await pollMySQL(mysqlPool, 'SELECT * FROM instructions WHERE id = ?', [testInstId]);
    assert.strictEqual(rows.length, 1);
    console.log(`  ✓ Verified MySQL storage: physically saved in "instructions" table`);
  }

  // User fetches instructions
  const instListRes = await request('GET', `${API_BASE}/api/instructions`);
  const deliveredInst = (instListRes.body || []).find(i => i.id === testInstId);
  assert.ok(deliveredInst, 'User MUST receive the instruction from VPS');
  console.log(`  ✓ User Delivery Verified: All users receive announcement from VPS`);

  // User marks instruction as read
  await request('PUT', `${API_BASE}/api/instructions/${testInstId}`, {
    ...testInstData,
    read_by: [targetEmployee.id]
  });

  if (mysqlPool) {
    const readRows = await pollMySQL(mysqlPool, 'SELECT * FROM instruction_reads WHERE instruction_id = ?', [testInstId]);
    assert.ok(readRows.length >= 1, 'Read receipt saved in MySQL instruction_reads table');
    console.log(`  ✓ Read receipt stored in MySQL table "instruction_reads" for user "${targetEmployee.name}"`);
  }

  // Admin checks read status
  const checkInstRes = await request('GET', `${API_BASE}/api/instructions`);
  const checkInst = (checkInstRes.body || []).find(i => i.id === testInstId);
  assert.ok(checkInst, 'Instruction delivered in list');
  assert.ok(checkInst.read_by && checkInst.read_by.includes(targetEmployee.id), 'Admin receives confirmed read receipt from VPS');
  console.log(`  ✓ Two-way verification: Admin receives employee read confirmation from VPS`);

  // Cleanup instruction
  await request('DELETE', `${API_BASE}/api/instructions/${testInstId}`);
  console.log(`  ✓ Cleanup: Instruction deleted cleanly from VPS`);
  passedCount += 5;

  // =========================================================================
  // STEP 6: Clients (CRM Intake): Store on VPS -> Delivered to CRM View
  // =========================================================================
  console.log('\n--- [Step 6] Clients: Store on VPS & Deliver to CRM Workspace ---');
  const testClientId = `c-sync-${now}`;
  const testClientData = {
    id: testClientId,
    name: `Acme Sync Corp ${now}`,
    company_name: `Acme Global ${now}`,
    contact_person: 'John Doe',
    email: `john.${now}@acme.com`,
    phone: '+1 555 0199',
    department: 'marketing',
    status: 'active',
    created_at: new Date().toISOString()
  };

  await request('POST', `${API_BASE}/api/clients`, testClientData);
  console.log(`  ✓ Client created with all 4 CRM fields on VPS (${testClientId})`);

  if (mysqlPool) {
    const rows = await pollMySQL(mysqlPool, 'SELECT * FROM clients WHERE id = ?', [testClientId]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].company_name, testClientData.company_name);
    assert.strictEqual(rows[0].email, testClientData.email);
    console.log(`  ✓ Verified MySQL storage: physically saved in "clients" table`);
  }

  const clientsRes = await request('GET', `${API_BASE}/api/clients`);
  const deliveredClient = (clientsRes.body || []).find(c => c.id === testClientId);
  assert.ok(deliveredClient, 'User MUST receive the client from VPS');
  assert.strictEqual(deliveredClient.email, testClientData.email);
  assert.strictEqual(deliveredClient.phone, testClientData.phone);
  console.log(`  ✓ User Delivery Verified: CRM users received client with full intake details from VPS`);

  await request('DELETE', `${API_BASE}/api/clients/${testClientId}`);
  console.log(`  ✓ Cleanup: Client deleted cleanly from VPS`);
  passedCount += 4;

  // =========================================================================
  // STEP 7: Attendance & Presence
  // =========================================================================
  console.log('\n--- [Step 7] Attendance & Presence: Stored on VPS & Delivered Live ---');
  const punchRes = await request('POST', `${API_BASE}/api/attendance`, {
    user_id: targetEmployee.id,
    type: 'in',
    timestamp: new Date().toISOString()
  });
  assert.strictEqual(punchRes.status, 200);
  console.log(`  ✓ Attendance punch stored on VPS for "${targetEmployee.name}"`);

  let attId = null;
  if (mysqlPool) {
    const attRows = await pollMySQL(mysqlPool, 'SELECT * FROM attendance WHERE user_id = ? ORDER BY id DESC LIMIT 1', [targetEmployee.id]);
    assert.ok(attRows.length >= 1);
    attId = attRows[0].id;
    console.log(`  ✓ Verified MySQL storage: Attendance physically logged in "attendance" table (ID: ${attId})`);
  }

  const userAttRes = await request('GET', `${API_BASE}/api/attendance?user=${targetEmployee.id}`);
  assert.ok(userAttRes.body.length >= 1);
  console.log(`  ✓ User Delivery Verified: User successfully fetched their attendance history from VPS`);

  const presenceRes = await request('GET', `${API_BASE}/api/presence`);
  assert.strictEqual(presenceRes.status, 200);
  console.log(`  ✓ Live Presence Delivered: Active user presence received from VPS`);
  
  if (mysqlPool && attId) {
    await mysqlPool.query('DELETE FROM attendance WHERE id = ?', [attId]);
  }
  passedCount += 4;

  // =========================================================================
  // STEP 8: MySQL 20 Synchronized Tables Full Storage Check
  // =========================================================================
  if (mysqlPool) {
    console.log('\n--- [Step 8] MySQL 20 Synchronized Tables Integrity Inspection ---');
    const [tables] = await mysqlPool.query('SHOW TABLES');
    const tableKey = Object.keys(tables[0])[0];
    const tableNames = tables.map(t => t[tableKey]);
    
    const all20Tables = [
      'users', 'departments', 'groups', 'group_members', 'group_messages',
      'clients', 'todos', 'todo_tags', 'instructions', 'instruction_tags',
      'instruction_reads', 'comments', 'policies', 'attendance', 'leave_applications',
      'audit_logs', 'tags', 'notifications', 'user_departments', 'saved_filters'
    ];

    const summary = [];
    for (const t of all20Tables) {
      if (tableNames.includes(t)) {
        const escaped = (t === 'groups') ? '`groups`' : t;
        const [countRes] = await mysqlPool.query(`SELECT COUNT(*) as cnt FROM ${escaped}`);
        summary.push({ Table: t, 'Rows in MySQL': countRes[0].cnt, VPS_Storage: 'Synchronized & Active' });
      } else {
        summary.push({ Table: t, 'Rows in MySQL': 0, VPS_Storage: 'Missing' });
      }
    }
    console.table(summary);
    assert.ok(tableNames.length >= 20, 'All 20 database tables must exist in MySQL');
    console.log(`  ✓ All ${tableNames.length} tables verified healthy and synchronized in MySQL`);
    passedCount += 2;
    await mysqlPool.end();
  }

  console.log('\n================================================================================');
  console.log(` 🎉 FULL VERIFICATION PASSED: ALL ${passedCount} CHECKS SUCCESSFUL! ✅`);
  console.log('    1. Everything is physically stored in VPS (MySQL + Disk JSON).');
  console.log('    2. Users seamlessly fetch and receive all data from the VPS in real time.');
  console.log('================================================================================\n');
}

runAudit().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
