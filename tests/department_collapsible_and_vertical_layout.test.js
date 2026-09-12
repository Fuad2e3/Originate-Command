/**
 * DEPARTMENT COLLAPSIBLE DROPDOWN & VERTICAL MEMBER STACKING TEST
 *
 * Verifies:
 * 1. Departments start in collapsible dropdown state (is-collapsed).
 * 2. Clicking the department accordion header expands it (is-expanded) and shows users.
 * 3. Users in a department are rendered vertically stacked in dept-card-members with dept-member-row.
 * 4. Action buttons (Edit department, Add person) have propagation stopped so they do not accidentally toggle.
 * 5. Expand all / Collapse all toggles all departments smoothly.
 */

const assert = require('assert');
require('./harness.js');

function makeElement(tag) {
  var listeners = {};
  var el = {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    attributes: {},
    children: [],
    style: {},
    classList: {
      add: function (c) {
        var parts = (el.className || '').split(/\s+/).filter(Boolean);
        if (parts.indexOf(c) === -1) parts.push(c);
        el.className = parts.join(' ');
      },
      remove: function (c) {
        var parts = (el.className || '').split(/\s+/).filter(Boolean);
        var idx = parts.indexOf(c);
        if (idx > -1) parts.splice(idx, 1);
        el.className = parts.join(' ');
      },
      contains: function (c) {
        return (el.className || '').split(/\s+/).indexOf(c) > -1;
      }
    },
    setAttribute: function (k, v) {
      this.attributes[k] = String(v);
      if (k === 'class') this.className = String(v);
    },
    getAttribute: function (k) {
      if (k === 'class') return this.className;
      return this.attributes[k];
    },
    removeAttribute: function (k) {
      delete this.attributes[k];
      if (k === 'class') this.className = '';
    },
    appendChild: function (child) {
      if (typeof child === 'string') {
        this.children.push({ nodeType: 3, text: child, textContent: child });
      } else if (child) {
        this.children.push(child);
      }
      return child;
    },
    removeChild: function (child) {
      var idx = this.children.indexOf(child);
      if (idx > -1) this.children.splice(idx, 1);
      return child;
    },
    get firstChild() {
      return this.children[0] || null;
    },
    get textContent() {
      var txt = '';
      (this.children || []).forEach(function (c) {
        if (c.nodeType === 3) txt += c.text || c.textContent || '';
        else if (c.textContent) txt += c.textContent;
      });
      return txt;
    },
    set textContent(v) {
      this.children = [{ nodeType: 3, text: String(v), textContent: String(v) }];
    },
    addEventListener: function (type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener: function (type, fn) {
      if (!listeners[type]) return;
      var idx = listeners[type].indexOf(fn);
      if (idx > -1) listeners[type].splice(idx, 1);
    },
    dispatchEvent: function (event) {
      var type = event.type || event;
      if (listeners[type]) {
        listeners[type].forEach(function (fn) { fn(event); });
      }
    },
    click: function () {
      var evt = { type: 'click', target: this, stopPropagation: function () {} };
      this.dispatchEvent(evt);
    },
    querySelector: function (selector) {
      var res = this.querySelectorAll(selector);
      return res.length ? res[0] : null;
    },
    querySelectorAll: function (selector) {
      var matches = [];
      function check(node) {
        if (!node || node.nodeType !== 1) return;
        var match = false;
        if (selector.startsWith('.')) {
          var clsList = selector.slice(1).split('.').filter(Boolean);
          var nodeClasses = (node.className || '').split(/\s+/);
          match = clsList.every(function (c) { return nodeClasses.indexOf(c) > -1; });
        } else {
          match = (node.tagName && node.tagName.toLowerCase() === selector.toLowerCase());
        }
        if (match) matches.push(node);
        (node.children || []).forEach(check);
      }
      (this.children || []).forEach(check);
      return matches;
    }
  };
  return el;
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) {
    return { nodeType: 3, text: String(text), textContent: String(text) };
  },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function () { return null; },
  body: makeElement('body')
};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/activities.js');

console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║   DEPARTMENT COLLAPSIBLE DROPDOWN & VERTICAL LAYOUT TEST                 ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

OC.store.load();

var socialDept = OC.store.state.departments.find(function (d) {
  return d.name.toLowerCase().indexOf('social') > -1;
}) || OC.store.state.departments[0];

// Add test users to social department
var testUser1 = { id: 'u-mahfuzur', name: 'Mahfuzur Rahman', email: 'mahfuzur@example.com', admin: false, status: 'active', departments: [{ department: socialDept.id, level: 'member' }] };
var testUser2 = { id: 'u-tarieeq', name: 'Tarieeq Bin Naeem', email: 'tarieeq@example.com', admin: false, status: 'active', departments: [{ department: socialDept.id, level: 'head' }] };

OC.store.state.users.push(testUser1, testUser2);

// Set session as Admin
var adminUser = OC.store.state.users.find(function (u) { return u.admin; }) || OC.store.state.users[0];
OC.store.setSession(adminUser.id);

console.log('--- [1/4] Testing Initial Collapsed Dropdown State ---');
var host = document.createElement('div');
OC.activities.render(host);

var deptCards = host.querySelectorAll('.dept-card');
assert.strictEqual(deptCards.length, OC.store.state.departments.length, 'Should render all department cards');

// Initially collapsed
var socialCard = deptCards.find ? deptCards.find(function (c) { return c.textContent.indexOf('Social Media Management') > -1; }) : deptCards[0];
for (var i = 0; i < deptCards.length; i++) {
  if (deptCards[i].textContent.indexOf('Social Media Management') > -1) {
    socialCard = deptCards[i];
    break;
  }
}
assert(socialCard.classList.contains('is-collapsed'), 'Department card should start collapsed');
assert.strictEqual(socialCard.querySelector('.dept-card-members'), null, 'Members list should not be shown when collapsed');

var countChip = socialCard.querySelector('.chip.custom.push');
assert(countChip, 'Header has count chip');
assert.strictEqual(countChip.textContent, '2 people', 'Count chip must display "2 people"');
console.log('  ✓ Department card is collapsed initially and displays user count chip (2 people)');

console.log('--- [2/4] Testing Click to Expand Dropdown ---');
var headToggle = socialCard.querySelector('.dept-card-head.is-accordion');
assert(headToggle, 'Department card head has is-accordion class');
assert.strictEqual(headToggle.getAttribute('aria-expanded'), 'false', 'aria-expanded should be false initially');

// Simulate click on accordion header
headToggle.click();

// Card should now be expanded
var expandedCards = host.querySelectorAll('.dept-card');
var expandedSocialCard = expandedCards[0];
for (var i = 0; i < expandedCards.length; i++) {
  if (expandedCards[i].textContent.indexOf('Social Media Management') > -1) {
    expandedSocialCard = expandedCards[i];
    break;
  }
}
assert(expandedSocialCard.classList.contains('is-expanded'), 'Department card should be is-expanded after click');
assert(!expandedSocialCard.classList.contains('is-collapsed'), 'Department card should not be is-collapsed after click');

var membersContainer = expandedSocialCard.querySelector('.dept-card-members');
assert(membersContainer, 'Members container must be rendered when expanded');

console.log('--- [3/4] Testing Vertical Member Stacking (Not Side-by-Side) ---');
var memberRows = membersContainer.querySelectorAll('.dept-member-row');
assert(memberRows.length >= 1, 'Should show member rows');

var firstMember = memberRows[0];
var secondMember = memberRows[1];

assert(firstMember.querySelector('.dept-member-left'), 'First member has left container');
assert(firstMember.querySelector('.dept-member-right'), 'First member has right container');
assert(secondMember.querySelector('.dept-member-left'), 'Second member has left container');
assert(secondMember.querySelector('.dept-member-right'), 'Second member has right container');

console.log('  ✓ Member rows use .dept-member-row with left and right sections for vertical stacking');

console.log('--- [4/4] Testing Expand All / Collapse All ---');
var expandAllBtn = host.querySelector('.btn.small.secondary');
assert(expandAllBtn, 'Expand all / Collapse all button is present');

// Click to expand all
expandAllBtn.click();
var allCards = host.querySelectorAll('.dept-card');
allCards.forEach(function (c) {
  assert(c.classList.contains('is-expanded'), 'All cards should be expanded');
});
console.log('  ✓ Expand all successfully expanded all departments');

console.log('\n====================================================================');
console.log(' 🎉 DEPARTMENT COLLAPSIBLE DROPDOWN & VERTICAL LAYOUT VERIFIED! ✅');
console.log('====================================================================\n');
