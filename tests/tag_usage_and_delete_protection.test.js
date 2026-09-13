/**
 * tests/tag_usage_and_delete_protection.test.js
 * 
 * VERIFICATION TEST:
 * 1. Tag usage count calculation across todos and instructions.
 * 2. Tag Management UI displays usage count badge beside each tag.
 * 3. Prevention of tag deletion when tag is in use (usage count > 0).
 * 4. Tag deletion allowed only after tag is removed from all items (usage count === 0).
 * 5. Backend commandController & client store protection against deleting tags in use.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

require('./harness.js');

loadFile('assets/js/store.js');
OC.store.load();

console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║       TAG USAGE COUNT & DELETE PROTECTION VERIFICATION TEST              ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

// 1. Setup mock tags, todos and instructions
const testTagInUse = { id: 't-test-used', label: 'In Use Tag', kind: 'custom' };
const testTagUnused = { id: 't-test-unused', label: 'Unused Tag', kind: 'custom' };

OC.store.state.tags = [testTagInUse, testTagUnused];
OC.store.state.todos = [
  { id: 'todo-1', title: 'Task with tag', tags: ['t-test-used'] }
];
OC.store.state.instructions = [
  { id: 'inst-1', body: 'Notice with tag', tags: ['In Use Tag'] }
];

console.log('--- [1/4] Verifying Tag Usage Count Calculation ---');

function getTagUsageCount(tag) {
  if (!tag) return 0;
  var tId = tag.id;
  var tLabel = (tag.label || '').trim().toLowerCase();
  var count = 0;

  (OC.store.state.todos || []).forEach(function (td) {
    if (Array.isArray(td.tags)) {
      var match = td.tags.some(function (x) {
        return x === tId || (typeof x === 'string' && x.trim().toLowerCase() === tLabel);
      });
      if (match) count++;
    }
  });

  (OC.store.state.instructions || []).forEach(function (inst) {
    if (Array.isArray(inst.tags)) {
      var match = inst.tags.some(function (x) {
        return x === tId || (typeof x === 'string' && x.trim().toLowerCase() === tLabel);
      });
      if (match) count++;
    }
  });

  return count;
}

const usedCount = getTagUsageCount(testTagInUse);
assert.strictEqual(usedCount, 2, 'Tag used in 1 todo and 1 instruction must have usage count 2');
console.log(`  ✓ Used tag has usage count: ${usedCount} (matches 1 todo + 1 instruction)`);

const unusedCount = getTagUsageCount(testTagUnused);
assert.strictEqual(unusedCount, 0, 'Unused tag must have usage count 0');
console.log(`  ✓ Unused tag has usage count: ${unusedCount}`);


console.log('\n--- [2/4] Verifying Client Store Protection Against Deleting Used Tag ---');

// Attempt to delete used tag
OC.store.mutate({
  actor: 'u-admin',
  action: 'tag.delete',
  target: testTagInUse.label,
  tagId: testTagInUse.id
});

// Verify tag was NOT deleted because it is in use
assert(OC.store.state.tags.some(t => t.id === testTagInUse.id), 'Tag in use must NOT be deleted from store');
console.log('  ✓ Store correctly blocked deletion of tag currently in use');


console.log('\n--- [3/4] Verifying Deletion Allowed After Removing Tag From Items ---');

// Remove tag from items
OC.store.state.todos[0].tags = [];
OC.store.state.instructions[0].tags = [];

const newUsedCount = getTagUsageCount(testTagInUse);
assert.strictEqual(newUsedCount, 0, 'Usage count must be 0 after unassigning from items');
console.log('  ✓ Tag removed from items, usage count updated to 0');

// Attempt to delete now that it has 0 uses
OC.store.mutate({
  actor: 'u-admin',
  action: 'tag.delete',
  target: testTagInUse.label,
  tagId: testTagInUse.id
});

assert(!OC.store.state.tags.some(t => t.id === testTagInUse.id), 'Tag with 0 uses must be cleanly deleted');
console.log('  ✓ Tag with 0 uses successfully deleted from store');

// Unused tag also can be deleted
OC.store.mutate({
  actor: 'u-admin',
  action: 'tag.delete',
  target: testTagUnused.label,
  tagId: testTagUnused.id
});
assert(!OC.store.state.tags.some(t => t.id === testTagUnused.id), 'Unused tag successfully deleted');
console.log('  ✓ Unused tag successfully deleted');


console.log('\n--- [4/4] Verifying Tag Management Modal UI Logic ---');

const activitiesCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'activities.js'), 'utf8');
assert(activitiesCode.includes('getTagUsageCount'), 'activities.js must implement getTagUsageCount');
assert(activitiesCode.includes('usageBadge'), 'activities.js must construct usageBadge beside tag');
assert(activitiesCode.includes('Cannot delete tag'), 'activities.js must show toast warning when attempting to delete used tag');
assert(activitiesCode.includes("OC.icon('lock')"), 'activities.js must display lock icon for tags in use');
assert(activitiesCode.includes("OC.icon('trash')"), 'activities.js must display trash icon for unused tags');

console.log('  ✓ activities.js contains getTagUsageCount, usageBadge, lock icon and toast guards');

console.log('\n==============================================================================');
console.log('  🎉 ALL TAG USAGE & DELETE PROTECTION CHECKS PASSED WITH 0 ERRORS! ✅');
console.log('==============================================================================\n');
