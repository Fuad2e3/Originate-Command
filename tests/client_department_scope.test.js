/* Client department scoping — permissions.js, no browser required.
   Run from the repository root:  node tests/client_department_scope.test.js
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

/* three people: a system admin, a Development Operations head, and a Lead
   Generation member. Only admins are seeded, so both non-admins are added
   here rather than assumed to exist. */
const admin = S.user('u-shohag');
const webPerson = {
  id: 'u-web', name: 'Web Person', email: 'web@example.com',
  admin: false, departments: [{ department: 'd-web', level: 'head' }],
  status: 'active'
};
const leadPerson = {
  id: 'u-lead', name: 'Lead Person', email: 'lead@example.com',
  admin: false, departments: [{ department: 'd-leadgen', level: 'member' }],
  status: 'active'
};
S.state.users.push(webPerson, leadPerson);

const openClient = { id: 'c-open', name: 'Open Client', client_code: 'OPN', status: 'active' };
const webClient = { id: 'c-web', name: 'Web Client', client_code: 'WEB', status: 'active', department: 'd-web' };
const leadClient = { id: 'c-lead', name: 'Lead Client', client_code: 'LED', status: 'active', department: 'd-leadgen' };
S.state.clients.push(openClient, webClient, leadClient);

console.log('=== an unscoped client (no department) is visible ONLY to System Admin (Rule 10) ===');
ok('admin sees unscoped', C.seeClient(admin, openClient));
ok('web person cannot see unscoped (Rule 10)', C.seeClient(webPerson, openClient), false);
ok('lead person cannot see unscoped (Rule 10)', C.seeClient(leadPerson, openClient), false);
ok('empty-string department counts as unscoped and is hidden from non-admin',
   C.seeClient(leadPerson, { id: 'x', name: 'X', department: '' }), false);

console.log('=== a scoped client is visible only to that department ===');
ok('web person sees their own department client', C.seeClient(webPerson, webClient));
ok('lead person cannot see the web client', C.seeClient(leadPerson, webClient), false);
ok('web person cannot see the lead client', C.seeClient(webPerson, leadClient), false);
ok('lead person sees their own department client', C.seeClient(leadPerson, leadClient));

console.log('=== the system admin always sees every client ===');
ok('admin sees the web client', C.seeClient(admin, webClient));
ok('admin sees the lead client', C.seeClient(admin, leadClient));

console.log('=== visibleClients returns exactly the permitted set ===');
const ids = u => C.visibleClients(u).map(c => c.id).sort();
ok('admin list', ids(admin), ['c-lead', 'c-open', 'c-web']);
ok('web person list', ids(webPerson), ['c-web']);
ok('lead person list', ids(leadPerson), ['c-lead']);
ok('no user sees nothing', C.visibleClients(null), []);

console.log('=== only the system admin may assign a department ===');
ok('admin may assign', C.assignClientDepartment(admin));
ok('department head may not assign', C.assignClientDepartment(webPerson), false);
ok('member may not assign', C.assignClientDepartment(leadPerson), false);
ok('no user may not assign', C.assignClientDepartment(null), false);

console.log('=== guards ===');
ok('missing client is not visible', C.seeClient(admin, null), false);
ok('a department that no longer exists hides the client from non-admins',
   C.seeClient(leadPerson, { id: 'y', name: 'Y', department: 'd-gone' }), false);
ok('...but the admin still sees it', C.seeClient(admin, { id: 'y', name: 'Y', department: 'd-gone' }));

console.log('=== multiple departments scoping ===');
const multiClient = { id: 'c-multi', name: 'Multi Client', departments: ['d-web', 'd-leadgen'], status: 'active' };
S.state.clients.push(multiClient);
ok('web person sees multi-dept client', C.seeClient(webPerson, multiClient));
ok('lead person sees multi-dept client', C.seeClient(leadPerson, multiClient));
const socialPerson = {
  id: 'u-social', name: 'Social Person', email: 'soc@example.com',
  admin: false, departments: [{ department: 'd-social', level: 'member' }],
  status: 'active'
};
ok('social person cannot see client scoped only to web and lead', C.seeClient(socialPerson, multiClient), false);
ok('admin sees multi-dept client', C.seeClient(admin, multiClient));

console.log(`\n${pass} passed, ${fail.length} failed`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
