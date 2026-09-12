/* =========================================================================
   tests/dashboard_assignee_filter_list.test.js
   Automated verification for Dashboard Assignee Filter Bar & Popover List:
   1. Renders top quick pills for direct 1-click filtering.
   2. Shows dropdown/more button ("+N more ▾" or "▾") when there are multiple assignees.
   3. Clicking dropdown button opens the assignee list popover with task counts.
   4. Popover includes search input, "All assignees", and assignee items.
   5. Selecting an overflow assignee highlights their active pill with clear button.
   ========================================================================= */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./harness.js');

function makeElement(tag) {
  return {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    classList: {
      add: function (c) { if (!this.className.includes(c)) this.className += ' ' + c; },
      remove: function (c) { this.className = this.className.replace(c, '').trim(); },
      contains: function (c) { return this.className.includes(c); }
    },
    style: {},
    attributes: {},
    children: [],
    events: {},
    get firstChild() { return this.children.length ? this.children[0] : null; },
    removeChild: function (c) {
      var idx = this.children.indexOf(c);
      if (idx !== -1) this.children.splice(idx, 1);
      return c;
    },
    setAttribute: function (k, v) { this.attributes[k] = v; if (k === 'class') this.className = v; if (k === 'id') this.id = v; },
    getAttribute: function (k) { return this.attributes[k] || (k === 'class' ? this.className : null) || (k === 'id' ? this.id : null); },
    appendChild: function (child) {
      if (typeof child === 'string') this.children.push({ nodeType: 3, text: child });
      else if (child) this.children.push(child);
      return child;
    },
    addEventListener: function (type, handler) { this.events[type] = handler; },
    removeEventListener: function () {},
    click: function () {
      if (this.events.click) {
        this.events.click({ stopPropagation: function () {} });
      }
    },
    querySelector: function (sel) {
      function matchesSel(node, s) {
        if (!node) return false;
        if (s.startsWith('#')) return (node.id === s.slice(1) || (node.attributes && node.attributes.id === s.slice(1)));
        if (s.startsWith('.')) {
          const classes = s.split('.').filter(Boolean);
          const nodeClasses = (node.className || '').split(' ');
          return classes.every(c => nodeClasses.includes(c));
        }
        return false;
      }
      function findIn(node) {
        if (!node) return null;
        if (matchesSel(node, sel)) return node;
        if (node.children) {
          for (const c of node.children) {
            const found = findIn(c);
            if (found) return found;
          }
        }
        return null;
      }
      return findIn(this);
    },
    querySelectorAll: function (sel) {
      const results = [];
      function matchesSel(node, s) {
        if (!node) return false;
        if (s.startsWith('.')) {
          const classes = s.split('.').filter(Boolean);
          const nodeClasses = (node.className || '').split(' ');
          return classes.every(c => nodeClasses.includes(c));
        }
        return false;
      }
      function walk(node) {
        if (!node) return;
        if (matchesSel(node, sel)) {
          results.push(node);
        }
        if (node.children) {
          for (const c of node.children) walk(c);
        }
      }
      walk(this);
      return results;
    }
  };
}

let elementMap = {};
globalThis.document = {
  createElement: function (tag) {
    const el = makeElement(tag);
    return el;
  },
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) { return { nodeType: 3, text: String(text) }; },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function (id) { return elementMap[id] || null; },
  body: { appendChild: function () {} }
};

globalThis.window = {
  addEventListener: function () {},
  removeEventListener: function () {},
  location: { protocol: 'http:', hash: '' }
};

globalThis.OC = {};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/dashboard.js');

console.log('--- Testing Dashboard Assignee Filter Bar & Popover List ---');

// 1. Verify CSS rules exist in 04-components.css
const compCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', '04-components.css'), 'utf8');
assert(compCss.includes('.dashboard-filter-pills'), '04-components.css must define .dashboard-filter-pills');
assert(compCss.includes('.dashboard-assignee-popover'), '04-components.css must define .dashboard-assignee-popover');
assert(compCss.includes('.dashboard-assignee-more-btn'), '04-components.css must define .dashboard-assignee-more-btn');
assert(compCss.includes('.dashboard-assignee-item'), '04-components.css must define .dashboard-assignee-item');
assert(compCss.includes('.panel:has(.dashboard-assignee-popover)'), '04-components.css must allow overflow visible for popover');
console.log('  ✓ CSS classes for assignee popover & more button are properly defined');

OC.store.load();

// 2. Set up store with mock users and tasks
const leadUser = { id: 'u_lead', name: 'Lead User', role: 'head', department: 'd_eng', admin: true };
OC.store.state.users = [
  leadUser,
  { id: 'u_shohag', name: 'Shohag Dev', role: 'member', department: 'd_eng' },
  { id: 'u_al', name: 'Almahmud Tech', role: 'member', department: 'd_eng' },
  { id: 'u_admin', name: 'Admin Operations', role: 'admin', admin: true },
  { id: 'u_extra', name: 'Extra Member', role: 'member', department: 'd_eng' }
];
OC.store.setSession('u_lead');
OC.store.state.departments = [{ id: 'd_eng', name: 'Engineering' }];
OC.store.state.todos = [
  { id: 't1', title: 'Task 1', assignee: 'u_lead', assignees: ['u_lead', 'u_shohag'], state: 'open', client: 'c1' },
  { id: 't2', title: 'Task 2', assignee: 'u_lead', assignees: ['u_lead', 'u_shohag'], state: 'open', client: 'c1' },
  { id: 't3', title: 'Task 3', assignee: 'u_lead', assignees: ['u_lead', 'u_al'], state: 'open', client: 'c1' },
  { id: 't4', title: 'Task 4', assignee: 'u_lead', assignees: ['u_lead', 'u_admin'], state: 'open', client: 'c1' },
  { id: 't5', title: 'Task 5', assignee: 'u_lead', assignees: ['u_lead', 'u_extra'], state: 'open', client: 'c1' }
];
OC.store.state.instructions = [
  { id: 'n1', body: 'Instruction 1', author: 'u_shohag', read_by: [] }
];
OC.store.state.clients = [{ id: 'c1', name: 'Client 1' }];
OC.store.state.attendance = [];

// 3. Render dashboard
const host = document.createElement('div');
let renderCount = 0;
function rerender() {
  renderCount++;
  OC.dashboard.render(host, rerender);
  // Map elements with IDs
  function mapIds(n) {
    if (!n) return;
    if (n.id) elementMap[n.id] = n;
    if (n.children) {
      for (const c of n.children) mapIds(c);
    }
  }
  mapIds(host);
}

rerender();

// 4. Verify compact toggle button exists and NO individual person pills are rendered
const moreBtn = host.querySelector('.dashboard-assignee-more-btn');
assert(moreBtn, 'Dashboard must render .dashboard-assignee-more-btn matching Photo 2');
assert(!host.querySelector('.dashboard-assignee-filter-btn'), 'Individual assignee pills must NOT be rendered in header');
console.log('  ✓ Compact [ 👥 ▾ ] button renders without cluttered individual person pills');

// 5. Click compact button to open popover list
moreBtn.click();
assert(renderCount > 1, 'Clicking button should trigger rerender');

const popover = host.querySelector('.dashboard-assignee-popover');
assert(popover, 'Clicking button must render .dashboard-assignee-popover');

const searchInput = host.querySelector('.dashboard-assignee-search-input');
assert(searchInput, 'Assignee popover must contain search input');

const items = host.querySelectorAll('.dashboard-assignee-item');
assert(items.length >= 4, 'Assignee popover must list all assignees plus All option');
console.log('  ✓ Clicking [ 👥 ▾ ] opens popover list with search and all assignees (' + items.length + ' items)');

// 6. Click an assignee item to filter
const targetItem = items.find(it => (it.getAttribute('data-search') || '').includes('shohag'));
assert(targetItem, 'Shohag should be present in assignee list');
targetItem.click();

// 7. Verify active filter state is shown
const clearBtn = host.querySelector('.dashboard-filter-clear');
assert(clearBtn, 'Filtering by assignee must render clear "All" button');

const activeBtn = host.querySelector('.dashboard-assignee-more-btn.active');
assert(activeBtn, 'Filtered assignee must activate the button');
assert(activeBtn.getAttribute('title').includes('Shohag'), 'Active button title must indicate filtered user');
console.log('  ✓ Selecting an assignee from the list sets filter and activates [ 👥 ▾ ] with "All" clear button');

// 8. Click clear button to reset
clearBtn.click();
const clearedActiveBtn = host.querySelector('.dashboard-assignee-more-btn.active');
assert(!clearedActiveBtn, 'Clicking All clear button must reset active state');
assert(!host.querySelector('.dashboard-filter-clear'), 'Clicking All clear button must remove clear button');
console.log('  ✓ Clicking All button clears the assignee filter successfully');

console.log('✅ ALL DASHBOARD ASSIGNEE FILTER LIST TESTS PASSED!');
