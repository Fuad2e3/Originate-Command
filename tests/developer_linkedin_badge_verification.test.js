/**
 * tests/developer_linkedin_badge_verification.test.js
 * Automated verification for the 'Developed by Fuad' badge linking to LinkedIn profile
 * on both the main application footer and the login page, with Day/Night mode CSS styling.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const swJs = fs.readFileSync(path.join(rootDir, 'assets', 'pwa', 'sw.js'), 'utf8');
const componentsCss = fs.readFileSync(path.join(rootDir, 'assets', 'css', '04-components.css'), 'utf8');

console.log('--- 1. Testing Footer Implementation in app.js ---');
assert(appJs.includes('developer-badge'), 'Footer should contain developer-badge class');
assert(appJs.includes('https://www.linkedin.com/in/softece'), 'Footer should contain LinkedIn URL https://www.linkedin.com/in/softece');
assert(appJs.includes("target: '_blank'"), 'Link should open in new tab with target="_blank"');
assert(appJs.includes("rel: 'noopener noreferrer'"), 'Link should have rel="noopener noreferrer" for security');
assert(appJs.includes('Developed by'), 'Footer should display "Developed by"');
assert(appJs.includes("'Fuad'"), 'Footer should display "Fuad"');
console.log('✓ Footer badge correctly configured with LinkedIn URL and "Developed by Fuad"');

console.log('--- 2. Testing Login Screen Notice in app.js ---');
assert(appJs.includes('developer-login-badge'), 'Login notice should contain developer-login-badge');
const loginSection = appJs.slice(appJs.indexOf('portal-footer-notice'), appJs.indexOf('portal-footer-notice') + 800);
assert(loginSection.includes('https://www.linkedin.com/in/softece'), 'Login screen should link to LinkedIn profile');
assert(loginSection.includes('Developed by'), 'Login screen should display "Developed by"');
assert(loginSection.includes('Fuad'), 'Login screen should display "Fuad"');
console.log('✓ Login page badge correctly configured with LinkedIn URL');

console.log('--- 3. Testing CSS Rules in 04-components.css ---');
assert(componentsCss.includes('.developer-badge'), 'CSS must style .developer-badge');
assert(componentsCss.includes('.developer-login-badge'), 'CSS must style .developer-login-badge');
assert(componentsCss.includes('.developer-linkedin-icon'), 'CSS must style .developer-linkedin-icon');
assert(componentsCss.includes('#0A66C2'), 'CSS must include LinkedIn brand blue');
assert(componentsCss.includes('#EC6047'), 'CSS must include subtle brand orange hover color');
assert(componentsCss.includes('data-theme="dark"'), 'CSS must support dark theme');
console.log('✓ CSS styling and Day/Night mode verified');

console.log('--- 4. Testing Cache Buster Versions ---');
assert(swJs.includes('oc-pwa-cache-v2.11.70'), 'Service worker cache name should be updated to v2.11.70');
assert(indexHtml.includes('v=2.11.70'), 'index.html should have cache buster v=2.11.70');
assert(!indexHtml.includes('v=2.11.69'), 'index.html should not have old cache buster v=2.11.69');
console.log('✓ Cache buster version v2.11.70 verified');

console.log('\nAll Developer LinkedIn Badge verification tests PASSED successfully!');
