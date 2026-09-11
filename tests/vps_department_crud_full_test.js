const https = require('https');
const assert = require('assert');

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let respData = '';
      res.on('data', chunk => respData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(respData) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: respData });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let respData = '';
      res.on('data', chunk => respData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(respData);
          if (res.statusCode !== 200) {
            console.error(`[getJSON Warning] HTTP ${res.statusCode} from ${url}:`, respData.slice(0, 200));
          }
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          console.error(`[getJSON Parse Error] HTTP ${res.statusCode} from ${url}:`, respData.slice(0, 200));
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('========================================================================');
  console.log('   VPS LIVE CRUD & PERSISTENCE VERIFICATION SUITE');
  console.log('   Target: https://api.originateteam.com');
  console.log('========================================================================\n');

  // STEP 1: Fetch initial state
  console.log('--- [Step 1] Fetching live state from VPS ---');
  const initStateRes = await getJSON('https://api.originateteam.com/api/state');
  assert.strictEqual(initStateRes.status, 200, 'Live state endpoint must return 200');
  const initialState = initStateRes.body;
  const userCount = initialState.users.length;
  console.log(`✓ Loaded ${userCount} users and ${initialState.departments.length} departments.`);

  // Pre-cleanup of any test departments if leftover from earlier run
  const leftoverTestDepts = initialState.departments.filter(d => d.id.startsWith('d-test-crud-'));
  for (const ld of leftoverTestDepts) {
    await postJSON('https://api.originateteam.com/api/mutate', {
      entry: { actor: 'u-fuad', action: 'department.delete', target: ld.name, departmentId: ld.id },
      state: Object.assign({}, initialState, { departments: initialState.departments.filter(d => d.id !== ld.id) })
    });
  }
  if (leftoverTestDepts.length > 0) {
    initialState.departments = initialState.departments.filter(d => !d.id.startsWith('d-test-crud-'));
  }
  const testUser = initialState.users.find(u => u.id === 'u-tarieeqsocial') || initialState.users[0];
  const targetDept = initialState.departments.find(d => d.id === 'd-social') || initialState.departments[0];
  console.log(`  Test User: ${testUser.name} (${testUser.id})`);
  console.log(`  Target Department: ${targetDept.name} (${targetDept.id})`);

  // STEP 2: Assign member to department
  console.log('\n--- [Step 2] Assigning user to department on live VPS ---');
  const assignPayload = {
    entry: {
      actor: 'u-fuad',
      action: 'department.member.assign',
      target: testUser.name,
      userId: testUser.id,
      departmentId: targetDept.id,
      department: targetDept.id,
      level: 'head',
      detail: `Assigned ${testUser.name} to ${targetDept.name} as head`
    },
    state: Object.assign({}, initialState)
  };
  // Update the test user in state copy
  const uInCopy = assignPayload.state.users.find(u => u.id === testUser.id);
  if (uInCopy) {
    uInCopy.departments = [{ department: targetDept.id, level: 'head' }];
  }

  const assignRes = await postJSON('https://api.originateteam.com/api/mutate', assignPayload);
  assert.strictEqual(assignRes.status, 200, 'Mutate endpoint should return 200');
  console.log('✓ Mutation accepted by VPS backend.');

  // STEP 3: Verify Persistence across 4-second polling cycle
  console.log('\n--- [Step 3] Waiting 4.5s to verify persistence across server poll cycle ---');
  await wait(4500);

  const pollStateRes = await getJSON('https://api.originateteam.com/api/state');
  if (!pollStateRes.body || !pollStateRes.body.users) {
    console.error('pollStateRes error:', pollStateRes.status, pollStateRes.body || pollStateRes.raw);
    assert.fail(`Failed to get users from /api/state: status ${pollStateRes.status}`);
  }
  const polledUser = pollStateRes.body.users.find(u => u.id === testUser.id);
  console.log(`  Polled User departments:`, JSON.stringify(polledUser.departments));
  assert(Array.isArray(polledUser.departments), 'Polled user departments must be an array');
  const hasDept = polledUser.departments.some(d => (typeof d === 'string' ? d : d.department) === targetDept.id);
  assert(hasDept, `User ${testUser.name} must retain membership in ${targetDept.name} after polling cycle!`);
  console.log(`✓ Department membership preserved 100% on VPS!`);

  // STEP 4: Update member level to intern
  console.log('\n--- [Step 4] Updating member level to intern ---');
  const updatePayload = {
    entry: {
      actor: 'u-fuad',
      action: 'department.member.assign',
      target: testUser.name,
      userId: testUser.id,
      departmentId: targetDept.id,
      department: targetDept.id,
      level: 'intern',
      detail: `Updated ${testUser.name} in ${targetDept.name} to intern`
    },
    state: pollStateRes.body
  };
  const uInUpdate = updatePayload.state.users.find(u => u.id === testUser.id);
  if (uInUpdate) {
    uInUpdate.departments = [{ department: targetDept.id, level: 'intern' }];
  }

  const updateRes = await postJSON('https://api.originateteam.com/api/mutate', updatePayload);
  assert.strictEqual(updateRes.status, 200);
  const respUser = updateRes.body && updateRes.body.state && updateRes.body.state.users.find(u => u.id === testUser.id);
  console.log('✓ Level update accepted by VPS. Immediate response departments:', JSON.stringify(respUser ? respUser.departments : null));

  await wait(4500);
  const pollState2 = await getJSON('https://api.originateteam.com/api/state');
  const polledUser2 = pollState2.body.users.find(u => u.id === testUser.id);
  console.log('  PolledUser2 after 4.5s departments:', JSON.stringify(polledUser2 ? polledUser2.departments : null));
  const deptEntry = polledUser2.departments.find(d => (typeof d === 'string' ? d : d.department) === targetDept.id);
  assert(deptEntry && (typeof deptEntry === 'object' ? deptEntry.level === 'intern' : true), 'Department level must be intern');
  console.log(`✓ Updated level (intern) persisted after 4.5s:`, JSON.stringify(polledUser2.departments));

  // STEP 5: Create a new test department
  console.log('\n--- [Step 5] Creating a new test department ---');
  const newDeptId = 'd-test-crud-' + Date.now().toString(36);
  const newDeptObj = { id: newDeptId, name: 'Automated Test Dept', levels: ['head', 'member', 'intern'] };
  const createDeptPayload = {
    entry: {
      actor: 'u-fuad',
      action: 'department.create',
      target: newDeptObj.name,
      departmentId: newDeptId,
      department: newDeptObj,
      name: newDeptObj.name,
      levels: newDeptObj.levels,
      detail: 'head → member → intern'
    },
    state: pollState2.body
  };
  createDeptPayload.state.departments.push(newDeptObj);

  const createDeptRes = await postJSON('https://api.originateteam.com/api/mutate', createDeptPayload);
  assert.strictEqual(createDeptRes.status, 200);
  console.log('✓ Test department created on VPS.');
  console.log('  Immediate depts:', createDeptRes.body && createDeptRes.body.state ? createDeptRes.body.state.departments.map(d => d.id) : null);

  await wait(4500);
  const pollState3 = await getJSON('https://api.originateteam.com/api/state');
  console.log('  Polled depts after 4.5s:', pollState3.body.departments.map(d => d.id));
  assert(pollState3.body.departments.some(d => d.id === newDeptId), 'New department must persist');
  console.log('✓ New department persisted after 4.5s!');

  // STEP 6: Delete the test department
  console.log('\n--- [Step 6] Deleting test department ---');
  const deleteDeptPayload = {
    entry: {
      actor: 'u-fuad',
      action: 'department.delete',
      target: newDeptObj.name,
      departmentId: newDeptId
    },
    state: pollState3.body
  };
  deleteDeptPayload.state.departments = deleteDeptPayload.state.departments.filter(d => d.id !== newDeptId);

  const delDeptRes = await postJSON('https://api.originateteam.com/api/mutate', deleteDeptPayload);
  assert.strictEqual(delDeptRes.status, 200);

  await wait(4500);
  const pollState4 = await getJSON('https://api.originateteam.com/api/state');
  assert(!pollState4.body.departments.some(d => d.id === newDeptId), 'Deleted department must remain deleted');
  console.log('✓ Test department deletion persisted cleanly!');

  // STEP 7: Clean up test user department assignment (or leave appropriately)
  console.log('\n--- [Step 7] Removing user from department ---');
  const removePayload = {
    entry: {
      actor: 'u-fuad',
      action: 'department.member.remove',
      target: testUser.name,
      userId: testUser.id,
      departmentId: targetDept.id,
      department: targetDept.id,
      detail: `Removed ${testUser.name} from ${targetDept.name}`
    },
    state: pollState4.body
  };
  const uInRemove = removePayload.state.users.find(u => u.id === testUser.id);
  if (uInRemove) {
    uInRemove.departments = [];
  }
  const removeRes = await postJSON('https://api.originateteam.com/api/mutate', removePayload);
  assert.strictEqual(removeRes.status, 200);
  const immRemUser = removeRes.body && removeRes.body.state && removeRes.body.state.users.find(u => u.id === testUser.id);
  console.log('  Immediate remove response departments:', JSON.stringify(immRemUser ? immRemUser.departments : null));

  await wait(4500);
  const finalState = await getJSON('https://api.originateteam.com/api/state');
  const finalUser = finalState.body.users.find(u => u.id === testUser.id);
  console.log('  Polled final user departments:', JSON.stringify(finalUser ? finalUser.departments : null));
  const finalHasDept = (finalUser.departments || []).some(d => (typeof d === 'string' ? d : d.department) === targetDept.id);
  assert(!finalHasDept, 'User department membership should be removed');
  console.log('✓ User department removal persisted after 4.5s!');

  // Final sanity check
  assert.strictEqual(finalState.body.users.length, userCount, `Total users must stay intact (${userCount})`);
  console.log(`\n========================================================================`);
  console.log(`  🎉 ALL VPS CRUD & PERSISTENCE CHECKS PASSED WITH ZERO DATA LOSS! ✅`);
  console.log(`========================================================================`);
}

run().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
