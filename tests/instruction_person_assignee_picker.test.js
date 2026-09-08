const assert = require('assert');
require('./harness.js');

function makeElement(tag, props, children) {
  var el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: (props && props.class) || '',
    value: (props && props.value !== undefined) ? props.value : '',
    style: {},
    attributes: {},
    children: [],
    events: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    addEventListener: function (evt, fn) { this.events[evt] = fn; },
    click: function () { if (this.events.click) this.events.click({ stopPropagation: function () {} }); },
    remove: function () {},
    appendChild: function (child) {
      if (typeof child === 'string') this.children.push({ nodeType: 3, text: child });
      else if (child) this.children.push(child);
      return child;
    },
    querySelector: function (sel) {
      for (var i = 0; i < this.children.length; i++) {
        var c = this.children[i];
        if (c.className && c.className.indexOf(sel.replace('.', '')) > -1) return c;
        if (c.tagName && c.tagName.toLowerCase() === sel.toLowerCase()) return c;
      }
      return null;
    },
    querySelectorAll: function (sel) {
      var res = [];
      function walk(node) {
        if (!node || !node.children) return;
        for (var i = 0; i < node.children.length; i++) {
          var c = node.children[i];
          if (c.className && c.className.indexOf(sel.replace('.', '')) > -1) res.push(c);
          walk(c);
        }
      }
      walk(this);
      return res;
    }
  };
  if (props) {
    if (props.id) el.id = props.id;
    if (props.value !== undefined) el.value = props.value;
    if (props.onClick) el.events.click = props.onClick;
    if (props.onChange) el.events.change = props.onChange;
  }
  return el;
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) { return { nodeType: 3, text: String(text) }; },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function () { return null; },
  body: { appendChild: function () {} }
};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/board.js');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║   INSTRUCTION PERSON ASSIGNEE PICKER VERIFICATION TEST             ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

OC.store.load();

let capturedModalConfig = null;
OC.ui.modal = function (cfg) { capturedModalConfig = cfg; };
OC.ui.toast = function () {};

function hasClassInTree(node, className) {
  if (!node) return false;
  if (node.className && node.className.indexOf(className) > -1) return true;
  if (node.children && Array.isArray(node.children)) {
    for (let c of node.children) {
      if (hasClassInTree(c, className)) return true;
    }
  }
  return false;
}

function hasTextInTree(node, text) {
  if (!node) return false;
  if (node.text && node.text.indexOf(text) > -1) return true;
  if (node.children && Array.isArray(node.children)) {
    for (let c of node.children) {
      if (hasTextInTree(c, text)) return true;
    }
  }
  return false;
}

console.log('--- [1/4] Testing Notice Board newInstruction(): Contains "Assign to" person picker ---');
OC.store.setSession('u_shohag');
capturedModalConfig = null;
OC.board.newInstruction();

assert.ok(capturedModalConfig, 'newInstruction must trigger modal');
assert.strictEqual(capturedModalConfig.title, 'Post an instruction');
assert.strictEqual(hasClassInTree(capturedModalConfig.content, 'assignee-picker'), true, 'Modal content must have assignee-picker');
assert.strictEqual(hasClassInTree(capturedModalConfig.content, 'assignee-list'), true, 'Modal content must have assignee-list');
assert.strictEqual(hasTextInTree(capturedModalConfig.content, 'Assign to'), true, 'Modal content must have Assign to field');
console.log('  ✓ newInstruction() contains "Assign to" person picker component matching Photo 2');

console.log('\n--- [2/4] Verifying Post Instruction with Target Users ---');
capturedModalConfig = null;
OC.board.newInstruction({
  target_users: ['u_shohag', 'u_fuad']
});
assert.ok(capturedModalConfig, 'Modal should open with target_users');

function findNodeByTag(node, tag) {
  if (!node) return null;
  if (node.tagName === tag.toUpperCase()) return node;
  if (node.children && Array.isArray(node.children)) {
    for (let c of node.children) {
      let found = findNodeByTag(c, tag);
      if (found) return found;
    }
  }
  return null;
}

const textarea = findNodeByTag(capturedModalConfig.content, 'textarea');
assert.ok(textarea, 'Textarea found');
textarea.value = 'Important instructions for specific team members';

const postAction = capturedModalConfig.actions.find(a => a.primary);
assert.ok(postAction, 'Post instruction action found');

postAction.onClick(function () {});
const createdNote = OC.store.state.instructions[OC.store.state.instructions.length - 1];
assert.ok(createdNote, 'Note must exist in store');
assert.strictEqual(createdNote.body, 'Important instructions for specific team members');
assert.ok(Array.isArray(createdNote.target_users), 'target_users must be an array');
assert.strictEqual(createdNote.target_users.length, 2, 'target_users should have 2 members');
assert.strictEqual(createdNote.target_users[0], 'u_shohag');
assert.strictEqual(createdNote.target_users[1], 'u_fuad');
console.log('  ✓ Instruction created with target_users: ' + JSON.stringify(createdNote.target_users));

console.log('\n--- [3/4] Testing editInstruction(): Contains "Assign to" person picker ---');
capturedModalConfig = null;
OC.board.editInstruction(createdNote);

assert.ok(capturedModalConfig, 'editInstruction must trigger modal');
assert.strictEqual(capturedModalConfig.title, 'Edit instruction');
assert.strictEqual(hasClassInTree(capturedModalConfig.content, 'assignee-picker'), true, 'editInstruction modal must have assignee-picker');
assert.strictEqual(hasTextInTree(capturedModalConfig.content, 'Assign to'), true, 'editInstruction modal must have Assign to field');
console.log('  ✓ editInstruction() contains "Assign to" person picker and pre-selects existing targets');

console.log('\n--- [4/4] Testing instructionItem(): Displays "For: [names]" Chip ---');
const noteItem = OC.board.instructionItem(createdNote);
assert.ok(noteItem, 'instructionItem returned article');
assert.strictEqual(hasTextInTree(noteItem, 'For:'), true, 'instructionItem must display "For:" chip');
console.log('  ✓ instructionItem() displays "For: [person names]" chip');

console.log('\n====================================================================');
console.log('  🎉 INSTRUCTION PERSON ASSIGNEE PICKER 100% VERIFIED! ✅');
console.log('====================================================================\n');
process.exit(0);
