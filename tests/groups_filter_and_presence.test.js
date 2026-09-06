/* =========================================================================
   tests/groups_filter_and_presence.test.js
   Automated verification for Groups & Messages:
   1. Segmented tab renamed from "Group name" to "Group".
   2. Tab bar only has "Group" and "Mine" (no awkward active user button).
   3. In "Mine", online persons display green presence indicator dot.
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
          if (sel === '.segmented' && c.className && c.className.indexOf('segmented') > -1) return c;
          if (sel === '.discord-dm-section' && c.className && c.className.indexOf('discord-dm-section') > -1) return c;
          if (sel === '.discord-channels-list' && c.className && c.className.indexOf('discord-channels-list') > -1) return c;
          if (sel === '.discord-avatar-online-dot' && c.className && c.className.indexOf('discord-avatar-online-dot') > -1) return c;
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
          if (sel === '.segmented button' && c.tagName === 'BUTTON' && node.className && node.className.indexOf('segmented') > -1) res.push(c);
          if (sel === '.discord-dm-pill' && c.className && c.className.indexOf('discord-dm-pill') > -1) res.push(c);
          if (sel === '.discord-avatar-online-dot' && c.className && c.className.indexOf('discord-avatar-online-dot') > -1) res.push(c);
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
loadFile('assets/js/groups.js');

console.log('Testing Groups & Messages presence and tab filters...');

OC.store.reset();
var host = makeElement('main');

// Set Shohag as online in store
OC.store.state.users = [
  { id: 'u-fuad', name: 'Abdullah al Fuad', admin: true, status: 'active' },
  { id: 'u-shohag', name: 'Shohag Munshe', admin: true, status: 'active' }
];
OC.store.setSession('u-fuad');

// Render groups
OC.groups.render(host);

// 1. Check segmented buttons
var seg = host.querySelector('.segmented');
assert(seg !== null, 'Segmented control must exist');

// Get all buttons in segmented control
var segButtons = [];
for (var i = 0; i < seg.children.length; i++) {
  if (seg.children[i].tagName === 'BUTTON') segButtons.push(seg.children[i]);
}

assert.strictEqual(segButtons.length, 2, 'Should have exactly 2 tab buttons: Group and Mine');
assert(segButtons[0].children[0].text.indexOf('Group (') === 0, 'First button must be labeled Group (count), got: ' + segButtons[0].children[0].text);
assert(segButtons[1].children[0].text.indexOf('Mine (') === 0, 'Second button must be labeled Mine (count), got: ' + segButtons[1].children[0].text);
console.log('✅ 1. Tabs updated: "Group name" is now "Group" and only "Group" + "Mine" tabs exist.');

// 2. Click "Mine" button to view Direct Messages
segButtons[1].events.click();

// 3. Check Direct Message list for presence indicator
var dmPills = host.querySelectorAll('.discord-dm-pill');
assert(dmPills.length > 0, 'Should display DM pills for users');

// Check that Shohag has an online indicator if online
// Simulate Shohag being online via OC.store.onlineUserIds
OC.store.onlineUserIds = function () { return ['u-shohag']; };
OC.groups.render(host);

var onlineDots = host.querySelectorAll('.discord-avatar-online-dot');
assert(onlineDots.length >= 1, 'Online user in Mine must display green avatar online dot');
console.log('✅ 2. Online users inside Mine display green presence indicator.');

console.log('\n🎉 ALL GROUPS FILTER & PRESENCE TESTS PASSED SUCCESSFULLY!');
