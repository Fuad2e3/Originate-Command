/**
 * Targeted verification for 3.5s sync, all tombstones, and non-blocking renders
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing 3.5s sync and tombstone fixes...');

// 1. Verify store.js syntax and implementation checks
const storeContent = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'store.js'), 'utf8');

assert(storeContent.includes('function ingestServerTombstones('), 'ingestServerTombstones must be defined');
assert(storeContent.includes('ingestServerTombstones(serverState.tombstones)'), 'syncWithServer must ingest server tombstones');
assert(storeContent.includes('ingestServerTombstones(data.state.tombstones)'), 'pushMutationToServer must ingest server tombstones');
assert(storeContent.includes('Date.now() - lastLocalMutationTime < 1500'), 'Quiet window must be 1500ms so 3.5s cycle is not skipped');
assert(!storeContent.includes('if (isRecentTag || (lt.label && lt.label !== st.label))'), 'Old tag clobber bug must be eliminated');
assert(!storeContent.includes('if (!st) {\n                data.state.todos.push(lt);'), 'Unconditional todo resurrection must be eliminated');

// 2. Verify commandController.js
const controllerContent = fs.readFileSync(path.join(__dirname, '..', 'dev3', 'API', 'controllers', 'commandController.js'), 'utf8');
assert(controllerContent.includes('function buildSanitizedState('), 'buildSanitizedState helper must exist');
assert(controllerContent.includes('buildSanitizedState(saved)'), 'mutateState must return buildSanitizedState');
assert(controllerContent.includes('buildSanitizedState(db.getState())'), 'getState and fallback must return buildSanitizedState');

// 3. Verify app.js non-blocking render logic
const appContent = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'app.js'), 'utf8');
assert(appContent.includes('lastTypingTime'), 'lastTypingTime must be tracked in app.js');
assert(appContent.includes('Date.now() - lastTypingTime < 1200'), 'renderInPlace should only defer when actively typing within 1.2s');

console.log('✅ All code-level assertions passed!');
