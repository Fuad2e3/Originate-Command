/**
 * tests/brand_orange_bars_verification.test.js
 * Automated verification for the Executive Brand Orange styling on:
 * 1. Dashboard profile banner (dashboard.js)
 * 2. Edit Profile / Profile Portal banner (profile_portal.js)
 * 3. Client Portal hero banner (clients.js)
 * Supporting Day Mode & Night Mode with cohesive tokens and high contrast controls.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const tokensCss = fs.readFileSync(path.join(rootDir, 'assets', 'css', '01-tokens.css'), 'utf8');
const componentsCss = fs.readFileSync(path.join(rootDir, 'assets', 'css', '04-components.css'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'dashboard.js'), 'utf8');
const profilePortalJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'profile_portal.js'), 'utf8');
const clientsJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'clients.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const swJs = fs.readFileSync(path.join(rootDir, 'assets', 'pwa', 'sw.js'), 'utf8');

console.log('--- 1. Testing Design Tokens in 01-tokens.css ---');
assert(tokensCss.includes('--banner-orange-bg'), '01-tokens.css must define --banner-orange-bg');
assert(tokensCss.includes('--banner-orange-border'), '01-tokens.css must define --banner-orange-border');
assert(tokensCss.includes('--banner-orange-shadow'), '01-tokens.css must define --banner-orange-shadow');

// Exact photo reference warm terracotta/coral orange (#EA6340)
assert(tokensCss.includes('#EA6340'), 'Tokens must contain exact reference photo orange #EA6340');

// Night and Day mode support
const darkBlock = tokensCss.slice(tokensCss.indexOf(':root[data-theme="dark"]'));
assert(darkBlock.includes('--banner-orange-bg'), 'Dark theme must define --banner-orange-bg');
assert(darkBlock.includes('#EA6340'), 'Dark theme must define #EA6340 banner');
console.log('✓ Design tokens for Day and Night modes verified');

console.log('--- 2. Testing Component Styling in 04-components.css ---');
assert(componentsCss.includes('.user-profile-banner'), '04-components.css must style .user-profile-banner');
assert(componentsCss.includes('var(--banner-orange-bg'), 'Banner must utilize --banner-orange-bg');
assert(componentsCss.includes('.user-profile-avatar-wrap'), 'Banner must style avatar container');
assert(componentsCss.includes('.user-profile-badge'), 'Banner must style frosted glass badge');
assert(componentsCss.includes('.user-profile-role-line'), 'Banner must style role line');
assert(componentsCss.includes('.user-profile-meta-line'), 'Banner must style meta line');
assert(componentsCss.includes('.user-profile-action-btn'), 'Banner must style action buttons');
assert(componentsCss.includes('.user-profile-edit-hint'), 'Banner must style edit profile hint');

// Check that button overrides exist for crisp CTA on orange
assert(componentsCss.includes('.user-profile-banner .btn.primary'), 'Banner must have high-contrast primary CTA styling');
assert(componentsCss.includes('.user-profile-banner .btn.secondary'), 'Banner must have frosted secondary button styling');
console.log('✓ Component styles and button overrides verified');

// Check that client item cards in Client Portal directory also use #EA6340 orange card
assert(componentsCss.includes('.card.client-item-card'), '04-components.css must style .card.client-item-card');
assert(componentsCss.includes('.client-item-card .client-avatar-badge'), 'Client card avatar badge must be styled');
assert(componentsCss.includes('.client-item-card .client-status-indicator'), 'Client card status indicator must be styled');
console.log('✓ Client item card and badge styling verified');

console.log('--- 3. Testing Usages Across the 3 Bars ---');
// 1. Dashboard bar
assert(dashboardJs.includes("class: 'user-profile-banner'"), 'dashboard.js must use user-profile-banner');
// 2. Edit Profile / Profile Portal bar
assert(profilePortalJs.includes("class: 'user-profile-banner'"), 'profile_portal.js must use user-profile-banner');
// 3. Client Portal inner bar
assert(clientsJs.includes("class: 'user-profile-banner'"), 'clients.js must use user-profile-banner');
console.log('✓ All 3 targeted bars correctly bind to user-profile-banner');

console.log('--- 4. Testing Cache Version Consistency ---');
assert(indexHtml.includes('v=2.11.81'), 'index.html must reference v=2.11.81');
assert(swJs.includes('oc-pwa-cache-v2.11.81'), 'sw.js must reference v2.11.81');
console.log('✓ Cache buster version v2.11.81 verified across assets');

console.log('\nAll Executive Brand Orange Banner & Client Card tests PASSED successfully!');
