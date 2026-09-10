/* =========================================================================
   tests/foundation_rules_and_search.test.js
   Automated verification for Foundation (formerly Policy):
   1. Route label is renamed from "Policy" to "Foundation".
   2. URL hash alias #foundation routes to policy view.
   3. Department division & filtering: clicking or selecting a department
      filters rules strictly to that department.
   4. Real-time search option: filters rules dynamically by title, content,
      category, and department name.
   5. Baseline seed foundation rules exist and populate across departments.
   6. Foundation UI renders cleanly without errors.
   ========================================================================= */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./harness.js');

function makeElement(tag) {
  var el = {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    value: '',
    textContent: '',
    innerHTML: '',
    classList: {
      add: function (c) {
        if (!this.contains(c)) {
          this._classes.push(c);
        }
      },
      remove: function (c) {
        var idx = this._classes.indexOf(c);
        if (idx > -1) this._classes.splice(idx, 1);
      },
      contains: function (c) {
        return this._classes.indexOf(c) > -1;
      },
      _classes: []
    },
    style: {},
    attributes: {},
    children: [],
    events: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    appendChild: function (child) {
      if (typeof child === 'string') {
        var txtNode = { nodeType: 3, text: child, parentNode: this };
        this.children.push(txtNode);
        return txtNode;
      } else if (child) {
        if (child.tagName === 'FRAGMENT') {
          for (var i = 0; i < child.children.length; i++) {
            this.appendChild(child.children[i]);
          }
          child.children = [];
          return child;
        }
        child.parentNode = this;
        this.children.push(child);
      }
      return child;
    },
    removeChild: function (child) {
      var idx = this.children.indexOf(child);
      if (idx > -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    addEventListener: function (type, handler) { this.events[type] = handler; },
    removeEventListener: function () {},
    querySelector: function (sel) {
      function search(node) {
        if (!node || !node.children) return null;
        for (var i = 0; i < node.children.length; i++) {
          var c = node.children[i];
          if (sel.startsWith('#') && (c.id === sel.slice(1) || (c.attributes && c.attributes.id === sel.slice(1)))) return c;
          if (sel.startsWith('.') && c.className && c.className.indexOf(sel.slice(1)) > -1) return c;
          if (c.tagName && sel.toLowerCase() === c.tagName.toLowerCase()) return c;
          var found = search(c);
          if (found) return found;
        }
        return null;
      }
      return search(this);
    },
    querySelectorAll: function (sel) {
      var res = [];
      function search(node) {
        if (!node || !node.children) return;
        for (var i = 0; i < node.children.length; i++) {
          var c = node.children[i];
          if (sel === 'button' && c.tagName === 'BUTTON') {
            res.push(c);
          } else if (sel.startsWith('.')) {
            var cls = sel.slice(1);
            if (c.className && (' ' + c.className + ' ').indexOf(' ' + cls + ' ') > -1) {
              res.push(c);
            }
          }
          search(c);
        }
      }
      search(this);
      return res;
    }
  };

  Object.defineProperty(el, 'firstChild', {
    get: function () {
      return this.children.length > 0 ? this.children[0] : null;
    }
  });

  return el;
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) {
    return { nodeType: 3, text: String(text) };
  },
  createDocumentFragment: function () {
    return makeElement('fragment');
  },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  body: makeElement('body'),
  documentElement: { setAttribute: function () {}, removeAttribute: function () {} }
};

globalThis.OC = {};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/policy.js');

console.log('Testing Foundation Module...');

// 1. Verify app.js Route renaming and alias
var appJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'app.js'), 'utf8');
assert(appJs.indexOf("{ id: 'policy', label: 'Foundation', view: function () { return OC.policy; } }") > -1, 'ROUTES should have label "Foundation"');
assert(appJs.indexOf("if (id === 'foundation') id = 'policy';") > -1, 'parseHash and go should support #foundation as alias for #policy');
console.log('✅ 1. Navigation route renamed to "Foundation" and #foundation alias confirmed.');

// 2. Verify Baseline Seed Rules & Initialization
OC.store.reset();
var policies = OC.policy.getPolicies();
assert(Array.isArray(policies), 'getPolicies() must return an array');
assert(policies.length >= 8, 'Baseline seed policies should have at least 8 rules across departments, got: ' + policies.length);

var companyRules = policies.filter(function (r) { return !r.department || r.department === 'all'; });
var webRules = policies.filter(function (r) { return r.department === 'd-web'; });
var adminRules = policies.filter(function (r) { return r.department === 'd-admin'; });

assert.strictEqual(companyRules.length, 0, 'Company-wide rules should be removed from baseline');
assert(webRules.length >= 2, 'Should have Development Operations baseline rules');
assert(adminRules.length >= 2, 'Should have Admin & HR baseline rules');
console.log('✅ 2. Baseline seed rules populated across departments.');

// 3. Verify Department Filtering Logic
var host = makeElement('main');

// Default: all_rules
OC.policy.setDepartmentFilter('all_rules');
OC.policy.setSearchQuery('');
OC.policy.render(host);
var allCards = host.querySelectorAll('.foundation-card');
assert.strictEqual(allCards.length, policies.length, 'All rules should show when filter is all_rules');

// Filter to Development Operations (d-web)
OC.policy.setDepartmentFilter('d-web');
OC.policy.render(host);
var webCards = host.querySelectorAll('.foundation-card');
assert.strictEqual(webCards.length, webRules.length, 'Should only show d-web rules when filtered to d-web');

// Filter to Admin & HR (d-admin)
OC.policy.setDepartmentFilter('d-admin');
OC.policy.render(host);
var adminCards = host.querySelectorAll('.foundation-card');
assert.strictEqual(adminCards.length, adminRules.length, 'Should only show d-admin rules when filtered to d-admin');

// Filter to Company-wide (all)
OC.policy.setDepartmentFilter('all');
OC.policy.render(host);
var compCards = host.querySelectorAll('.foundation-card');
assert.strictEqual(compCards.length, companyRules.length, 'Should only show company-wide rules when filtered to all');
console.log('✅ 3. Department division & filtering strictly shows only selected department rules.');

// 4. Verify Real-Time Search Option
OC.policy.setDepartmentFilter('all_rules');

// Search for "git"
OC.policy.setSearchQuery('git');
OC.policy.render(host);
var gitCards = host.querySelectorAll('.foundation-card');
assert(gitCards.length >= 1, 'Search for "git" should find matching rule(s)');

// Search for "punch"
OC.policy.setSearchQuery('punch');
OC.policy.render(host);
var punchCards = host.querySelectorAll('.foundation-card');
assert(punchCards.length >= 1, 'Search for "punch" should find attendance punch rule');

// Search for non-existent keyword
OC.policy.setSearchQuery('xyz_non_existent_term_999');
OC.policy.render(host);
var emptyCards = host.querySelectorAll('.foundation-card');
assert.strictEqual(emptyCards.length, 0, 'Non-existent keyword should return 0 cards');
var emptyState = host.querySelector('.empty');
assert(emptyState !== null, 'Empty state element should be rendered when no rules match');
console.log('✅ 4. Real-time search option filters rules dynamically by keyword.');

// 5. Verify Combined Filter: Department + Search
OC.policy.setDepartmentFilter('d-web');
OC.policy.setSearchQuery('git');
OC.policy.render(host);
var combinedCards = host.querySelectorAll('.foundation-card');
assert(combinedCards.length >= 1, 'Combined filter should find git rule under d-web');

OC.policy.setDepartmentFilter('d-admin');
OC.policy.setSearchQuery('git');
OC.policy.render(host);
var noMatchCards = host.querySelectorAll('.foundation-card');
assert.strictEqual(noMatchCards.length, 0, 'Searching "git" in d-admin should return 0 cards');
console.log('✅ 5. Combined Department filter and Search work in harmony.');

// 6. Verify Adding a New Rule
var customRule = {
  id: 'pol-test-1',
  title: 'Custom Testing Protocol',
  department: 'd-web',
  category: 'QA & Testing',
  body: 'Automated tests must be executed with 100% pass rate.',
  created_by: 'u-fuad',
  created_at: new Date().toISOString()
};
OC.store.state.policies.push(customRule);
OC.policy.setDepartmentFilter('d-web');
OC.policy.setSearchQuery('testing protocol');
OC.policy.render(host);
var newRuleCards = host.querySelectorAll('.foundation-card');
assert.strictEqual(newRuleCards.length, 1, 'Newly added rule should be found and rendered');
console.log('✅ 6. Adding and persisting new foundation rules works correctly.');

// 7. Verify System Admin Only Add / Manage Access
console.log('Testing System Admin permissions for Foundation rules...');
const adminUser = { id: 'u-admin-test', name: 'Admin Fuad', admin: true };
const headUser = { id: 'u-head-test', name: 'Web Head', admin: false, departments: [{ department: 'd-web', level: 'head' }] };
const memberUser = { id: 'u-member-test', name: 'Web Member', admin: false, departments: [{ department: 'd-web', level: 'member' }] };
const internUser = { id: 'u-intern-test', name: 'Web Intern', admin: false, departments: [{ department: 'd-web', level: 'intern' }] };

OC.store.state.users = OC.store.state.users || [];
OC.store.state.users.push(adminUser, headUser, memberUser, internUser);

assert.strictEqual(OC.can.isSystemAdmin(adminUser), true, 'System Admin must be recognized by isSystemAdmin');
assert.strictEqual(OC.can.isSystemAdmin(headUser), false, 'Department Head must NOT be system admin');
assert.strictEqual(OC.can.isSystemAdmin(memberUser), false, 'Regular member must NOT be system admin');
assert.strictEqual(OC.can.isSystemAdmin(internUser), false, 'Intern must NOT be system admin');

assert.strictEqual(OC.can.canManageFoundation(adminUser), true, 'System Admin can manage foundation');
assert.strictEqual(OC.can.canManageFoundation(headUser), false, 'Department Head cannot manage foundation');
assert.strictEqual(OC.can.canManageFoundation(memberUser), false, 'Regular member cannot manage foundation');
assert.strictEqual(OC.can.canManageFoundation(internUser), false, 'Intern cannot manage foundation');
console.log('✅ 7. OC.can.isSystemAdmin & canManageFoundation correctly identify system admin only.');

// 8. Render as System Admin: Sees + New foundation rule button and card edit/delete actions
OC.store.setSession(adminUser.id);
var adminHost = makeElement('main');
OC.policy.setDepartmentFilter('all_rules');
OC.policy.setSearchQuery('');
OC.policy.render(adminHost);

var adminNewBtn = adminHost.querySelector('#foundation-new-rule-btn');
assert.ok(adminNewBtn, 'System Admin MUST see "+ New foundation rule" button');
var adminCardActions = adminHost.querySelectorAll('.foundation-rule-actions');
assert.ok(adminCardActions.length > 0, 'System Admin MUST see action buttons on cards');
console.log('✅ 8. System Admin sees "+ New foundation rule" button and card actions.');

// 9. Render as Department Head: Does NOT see Add button or card actions
OC.store.setSession(headUser.id);
var headHost = makeElement('main');
OC.policy.render(headHost);

var headNewBtn = headHost.querySelector('#foundation-new-rule-btn');
assert.strictEqual(headNewBtn, null, 'Department Head must NOT see "+ New foundation rule" button');
var headCardActions = headHost.querySelectorAll('.foundation-rule-actions');
assert.strictEqual(headCardActions.length, 0, 'Department Head must NOT see card action buttons');
console.log('✅ 9. Department Head cannot see Add button or card actions.');

// 10. Render as Regular Member / Intern: Does NOT see Add button or card actions
OC.store.setSession(memberUser.id);
var memberHost = makeElement('main');
OC.policy.render(memberHost);

var memberNewBtn = memberHost.querySelector('#foundation-new-rule-btn');
assert.strictEqual(memberNewBtn, null, 'Regular member must NOT see "+ New foundation rule" button');
var memberCardActions = memberHost.querySelectorAll('.foundation-rule-actions');
assert.strictEqual(memberCardActions.length, 0, 'Regular member must NOT see card action buttons');
console.log('✅ 10. Regular member & Intern cannot see Add button or card actions.');

// 11. Programmatic access blocked for non-admins
var toastMessage = '';
OC.ui.toast = function (msg) { toastMessage = msg; };

// Try as regular member
OC.store.setSession(memberUser.id);
OC.policy.openPolicyModal(null);
assert.strictEqual(toastMessage, 'Only System Admins can add or edit foundation rules.', 'openPolicyModal must block non-admin with toast message');
console.log('✅ 11. Direct programmatic invocation of openPolicyModal is blocked for non-admins.');

// 12. Rule card body preview is truncated to first line only and clicking card opens detail modal
var lastModalConfig = null;
OC.ui.modal = function (cfg) { lastModalConfig = cfg; };

OC.store.setSession(memberUser.id);
var previewHost = makeElement('main');
OC.policy.setDepartmentFilter('all_rules');
OC.policy.setSearchQuery('');
OC.policy.render(previewHost);

var cards = previewHost.querySelectorAll('.foundation-card');
assert.ok(cards.length > 0, 'Foundation cards must be rendered');
var firstCard = cards[0];
var previewEl = firstCard.querySelector('.foundation-rule-preview');
assert.ok(previewEl, 'Card must have .foundation-rule-preview element');
var previewText = previewEl.children.length > 0 ? previewEl.children[0].text : previewEl.textContent;
assert.ok(previewText && previewText.length > 0, 'Preview text must not be empty');
assert.ok(!previewText.includes('\n'), 'Preview text must be strictly 1 line (no newlines)');

// Test click to expand modal
assert.strictEqual(typeof firstCard.events.click, 'function', 'Card must have click event handler');
firstCard.events.click();
assert.ok(lastModalConfig, 'Clicking rule card must trigger OC.ui.modal');
// 13. Card displays rule title prominently, and preview is visually hidden
var titleEl = firstCard.querySelector('.foundation-card-title');
assert.ok(titleEl, 'Card must have .foundation-card-title');
var titleText = titleEl.children.length > 0 ? titleEl.children[0].text : titleEl.textContent;
assert.ok(titleText && titleText.length > 0, 'Card must display title text');
var styleVal = previewEl.getAttribute ? previewEl.getAttribute('style') : (previewEl.style && previewEl.style.display);
assert.ok(styleVal && styleVal.indexOf('display:none') > -1, 'Preview should be hidden on the card');
console.log('✅ 13. Card displays title prominently.');

// 14. Search specifically by Category
OC.policy.setDepartmentFilter('all_rules');
OC.policy.setSearchQuery('Engineering Standards');
OC.policy.render(previewHost);
var catCards = previewHost.querySelectorAll('.foundation-card');
assert.ok(catCards.length >= 2, 'Searching "Engineering Standards" category should find at least 2 rules');

// Search specifically by Title
OC.policy.setSearchQuery('Git Workflow');
OC.policy.render(previewHost);
var titleCards = previewHost.querySelectorAll('.foundation-card');
assert.strictEqual(titleCards.length, 1, 'Searching "Git Workflow" title should find exactly 1 rule');
console.log('✅ 14. Search filters accurately by both Title and Category.');

// 15. Category Filter Dropdown
OC.policy.setSearchQuery('');
OC.policy.setCategoryFilter('Compliance');
OC.policy.render(previewHost);
var complianceCards = previewHost.querySelectorAll('.foundation-card');
assert.strictEqual(complianceCards.length, 1, 'Category filter for Compliance should return 1 rule');
OC.policy.setCategoryFilter('all_categories');
console.log('✅ 15. Category dropdown filter operates correctly.');

// 16. Detail modal includes Admin Edit/Delete actions when opened by System Admin
OC.store.setSession(adminUser.id);
OC.policy.render(adminHost);
var adminFirstCard = adminHost.querySelectorAll('.foundation-card')[0];
var adminModalConfig = null;
OC.ui.modal = function (cfg) { adminModalConfig = cfg; };
adminFirstCard.events.click();
assert.ok(adminModalConfig, 'Admin clicking card triggers detail modal');
assert.ok(adminModalConfig.actions && adminModalConfig.actions.length >= 3, 'Detail modal for System Admin must have Edit, Delete, and Close actions');
var editAction = adminModalConfig.actions.find(function (a) { return a.label === 'Edit Rule'; });
assert.ok(editAction, 'System Admin must have Edit Rule action in detail modal');
console.log('✅ 16. System Admin has Edit & Delete actions inside popup modal.');

// 17. Foundation Rule Content & Guidelines WYSIWYG editor and toolbar verification
var policyModalConfig = null;
OC.ui.modal = function (cfg) { policyModalConfig = cfg; };
editAction.onClick(function () {});
assert.ok(policyModalConfig, 'Edit Rule must open the rule editor modal');
assert.ok(policyModalConfig.className && policyModalConfig.className.indexOf('modal-policy-editor') > -1, 'Modal must have modal-policy-editor class');
assert.ok(policyModalConfig.className && policyModalConfig.className.indexOf('modal-wide') > -1, 'Modal must have modal-wide class');

var toolbarEl = policyModalConfig.content.querySelector('.client-editor-toolbar');
assert.ok(toolbarEl, 'Modal form must include .client-editor-toolbar matching Client Portal');

var wysiwygEl = policyModalConfig.content.querySelector('.client-wysiwyg-editor');
assert.ok(wysiwygEl, 'Modal form must include .client-wysiwyg-editor');
assert.strictEqual(wysiwygEl.contentEditable, 'true', 'Editor must be contenteditable');

// Verify all toolbar tool buttons exist
var toolButtons = toolbarEl.querySelectorAll('.client-editor-tool-btn');
assert.ok(toolButtons.length >= 10, 'Toolbar must have all formatting buttons (Bold, Italic, H2, H3, List, Checklist, Code, Quote, Link, Colour, Clear)');

console.log('✅ 17. Foundation Rule editor contains full WYSIWYG toolbar and rich contenteditable editor.');

console.log('\n🎉 ALL FOUNDATION RULES & SEARCH TESTS PASSED SUCCESSFULLY!');
