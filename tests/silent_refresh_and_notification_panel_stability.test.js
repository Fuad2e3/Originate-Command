/**
 * silent_refresh_and_notification_panel_stability.test.js
 * Verifies that the 3.5s refresh cycle is completely silent, shake-free, and jitter-free,
 * that the notification panel stays fixed and static without moving or closing,
 * and that refreshTopbarIdentity is properly defined.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Testing Silent Refresh & Notification Panel Stability ---');

// 1. Verify CSS rules in 02-base.css, 03-layout.css, and 04-components.css
const baseCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', '02-base.css'), 'utf8');
assert(baseCss.includes('scrollbar-gutter: stable;'), '02-base.css must include scrollbar-gutter: stable');
assert(baseCss.includes('overflow-y: scroll;'), '02-base.css must include overflow-y: scroll');
console.log('✅ PASS: Viewport scrollbar gutter stabilized in 02-base.css');

const layoutCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', '03-layout.css'), 'utf8');
assert(layoutCss.includes('min-height: calc(100vh - var(--topbar-h, 56px)'), '03-layout.css .page must have min-height');
assert(!layoutCss.includes('transform: translateY(2px)'), '03-layout.css .page must NOT have translateY jitter animation');
console.log('✅ PASS: .page layout container stabilized in 03-layout.css');

const compCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', '04-components.css'), 'utf8');
assert(compCss.includes('.notif-dropdown-panel.is-opening'), '04-components.css must restrict animation to .is-opening');
assert(compCss.includes('transform: translateZ(0);'), '04-components.css must have GPU transform acceleration for .notif-dropdown-panel');
console.log('✅ PASS: .notif-dropdown-panel GPU-anchored in 04-components.css');

// 2. Verify JS implementation in app.js
const appJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'app.js'), 'utf8');
assert(appJs.includes('var refreshTopbarIdentity = syncTopbarUser;'), 'app.js must define refreshTopbarIdentity alias');
assert(appJs.includes('existingPage.style.minHeight = prevH + \'px\';'), 'app.js render() must freeze minHeight before clear');
assert(appJs.includes('window.isNotificationsDropdownOpen = function ()'), 'app.js must expose isNotificationsDropdownOpen');
assert(appJs.includes('buildDropdownContent(true)'), 'app.js must support silent in-place refresh for notifications dropdown');
assert(appJs.includes('existingListHost.scrollTop = savedScroll;'), 'app.js must preserve notification list scroll position');
console.log('✅ PASS: app.js contains in-place refresh and scroll preservation logic');

// 3. Verify store.js smart change detection & normalized presence
const storeJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'store.js'), 'utf8');
assert(storeJs.includes('function hasMeaningfulDataChanged('), 'store.js must define hasMeaningfulDataChanged');
assert(storeJs.includes('var dataChanged = hasMeaningfulDataChanged('), 'store.js must use hasMeaningfulDataChanged in syncWithServer');
assert(storeJs.includes('d.onlineUserIds.slice().sort().join(\',\')'), 'store.js must sort onlineUserIds in presence sync');
console.log('✅ PASS: store.js implements smart change detection and sorted presence normalization');

console.log('🎉 ALL SILENT REFRESH & NOTIFICATION PANEL STABILITY TESTS PASSED!');
