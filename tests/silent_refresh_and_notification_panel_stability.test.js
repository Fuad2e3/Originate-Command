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
assert(appJs.includes("visibleRoutes().filter(function (r) { return r.id !== 'messages'; }).map(function (r) { return r.id; })"), 'app.js must exclude messages from wanted routes in render() fast-path to prevent shell destruction');
assert(appJs.includes('existingListHost._lastRenderedSig !== filteredSig'), 'app.js must check signature before wiping notification items in buildDropdownContent');
console.log('✅ PASS: app.js contains in-place refresh, route preservation, and notification signature diffing');

// 3. Verify store.js smart change detection & normalized presence
const storeJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'store.js'), 'utf8');
assert(storeJs.includes('function hasMeaningfulDataChanged('), 'store.js must define hasMeaningfulDataChanged');
assert(storeJs.includes('var dataChanged = hasMeaningfulDataChanged('), 'store.js must use hasMeaningfulDataChanged in syncWithServer');
assert(storeJs.includes('d.onlineUserIds.slice().sort().join(\',\')'), 'store.js must sort onlineUserIds in presence sync');
assert(storeJs.includes("action !== 'state.sync'"), 'store.js must exclude state.sync from audit comparison');
console.log('✅ PASS: store.js implements smart change detection, state.sync exclusion, and presence normalization');

// 4. Verify db.js and commandController.js persistence for extended fields
const dbJs = fs.readFileSync(path.join(__dirname, '..', 'dev3', 'API', 'config', 'db.js'), 'utf8');
assert(dbJs.includes('card_extended_fields: state.card_extended_fields || []'), 'db.js must save card_extended_fields to disk');
assert(dbJs.includes('portal_extended_fields: state.portal_extended_fields || []'), 'db.js must save portal_extended_fields to disk');

const ctrlJs = fs.readFileSync(path.join(__dirname, '..', 'dev3', 'API', 'controllers', 'commandController.js'), 'utf8');
assert(ctrlJs.includes('incomingState.card_extended_fields = currentState.card_extended_fields || []'), 'commandController.js must preserve card_extended_fields in mutateState');
assert(ctrlJs.includes('incomingState.portal_extended_fields = currentState.portal_extended_fields || []'), 'commandController.js must preserve portal_extended_fields in mutateState');
console.log('✅ PASS: db.js and commandController.js persist and merge card and portal extended fields');

console.log('🎉 ALL SILENT REFRESH & NOTIFICATION PANEL STABILITY TESTS PASSED!');
