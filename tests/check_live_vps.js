const https = require('https');

https.get('https://api.originateteam.com/api/state', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const state = JSON.parse(data);
      console.log('=== VPS STATE INSPECTION === version:', state.version);
      console.log('Total Users:', (state.users || []).length);
      console.log('Total Departments:', (state.departments || []).length);
      console.log('Departments:');
      (state.departments || []).forEach(d => console.log(`  [${d.id}] ${d.name} (levels: ${(d.levels || []).join(', ')})`));
      console.log('\nUsers & Department Memberships:');
      (state.users || []).forEach(u => {
        console.log(`  - ${u.name} <${u.email}> (${u.id}) [admin: ${!!u.admin}]: departments =`, JSON.stringify(u.departments || []));
      });
      console.log('\nTotal Clients:', (state.clients || []).length);
      console.log('Total Todos:', (state.todos || []).length);
    } catch (e) {
      console.error('Failed to parse state:', e.message);
    }
  });
}).on('error', err => {
  console.error('Request error:', err.message);
});
