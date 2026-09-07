/**
 * tests/pwa_install_and_device_detection.test.js
 * Comprehensive tests for PWA installation, device detection (PC vs Phone vs Tablet),
 * topbar install button with colorful circulating spinner, manifest, and service worker.
 */

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
    setAttribute: function (k, v) { this.attributes[k] = v; if (k === 'class') this.className = v; },
    getAttribute: function (k) { return this.attributes[k] || (k === 'class' ? this.className : null); },
    appendChild: function (child) {
      if (typeof child === 'string') this.children.push({ nodeType: 3, text: child });
      else if (child) this.children.push(child);
      return child;
    },
    addEventListener: function (type, handler) { this.events[type] = handler; },
    removeEventListener: function () {},
    querySelector: function (sel) {
      function findIn(node) {
        if (!node) return null;
        if (sel.startsWith('#') && node.attributes && node.attributes.id === sel.slice(1)) return node;
        if (sel.startsWith('.') && node.className && node.className.indexOf(sel.slice(1)) !== -1) return node;
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
    querySelectorAll: function () { return []; }
  };
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

globalThis.window = {
  addEventListener: function () {},
  removeEventListener: function () {},
  matchMedia: function () { return { matches: false }; },
  location: { protocol: 'http:' }
};

globalThis.OC = {};

console.log('--- Testing PWA Install Button, Device Detection & Standalone App Support ---');

// 1. Verify manifest.json
const manifestPath = path.join(__dirname, '..', 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json must exist in project root');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.strictEqual(manifest.name, 'Originate Command', 'manifest name must be Originate Command');
assert.strictEqual(manifest.display, 'standalone', 'manifest display must be standalone');
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest must have at least 2 icons');
console.log('  ✓ manifest.json is valid and configured for standalone PWA');

// 2. Verify sw.js
const swPath = path.join(__dirname, '..', 'sw.js');
assert(fs.existsSync(swPath), 'sw.js must exist in project root');
const swContent = fs.readFileSync(swPath, 'utf8');
assert(swContent.includes('install') && swContent.includes('fetch') && swContent.includes('activate'), 'sw.js must register install, activate and fetch event handlers');
console.log('  ✓ sw.js exists with proper cache and fetch handlers');

// 3. Verify index.html meta tags
const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(htmlContent.includes('manifest.json'), 'index.html must link to manifest.json');
assert(htmlContent.includes('apple-mobile-web-app-capable'), 'index.html must declare apple-mobile-web-app-capable');
assert(htmlContent.includes('mobile-web-app-capable'), 'index.html must declare mobile-web-app-capable');
console.log('  ✓ index.html links manifest.json and standalone mobile meta tags');

// 4. Verify CSS animations & classes in 04-components.css
const cssContent = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', '04-components.css'), 'utf8');
assert(cssContent.includes('@keyframes spin-gradient'), '04-components.css must define @keyframes spin-gradient');
assert(cssContent.includes('@keyframes pulse-glow'), '04-components.css must define @keyframes pulse-glow');
assert(cssContent.includes('.topbar-center-wrap'), '04-components.css must define .topbar-center-wrap');
assert(cssContent.includes('.btn-install-app'), '04-components.css must define .btn-install-app');
assert(cssContent.includes('.install-btn-spinner'), '04-components.css must define .install-btn-spinner');
assert(cssContent.includes('.install-modal-device-card'), '04-components.css must define .install-modal-device-card');
console.log('  ✓ 04-components.css defines rotating gradient, pulse glow, and install modal styles');

// 5. Test getDeviceInfo() detection logic in app.js
loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');
loadFile('assets/js/board.js');
loadFile('assets/js/dashboard.js');
loadFile('assets/js/profile_portal.js');
loadFile('assets/js/app.js');

assert(typeof OC.app.getDeviceInfo === 'function', 'OC.app.getDeviceInfo must be exported');
assert(typeof OC.app.renderInstallButton === 'function', 'OC.app.renderInstallButton must be exported');
assert(typeof OC.app.openPWAInstallModal === 'function', 'OC.app.openPWAInstallModal must be exported');

// Test Windows PC detection
const winUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const winDev = OC.app.getDeviceInfo(winUA);
assert.strictEqual(winDev.type, 'pc', 'Windows NT should be detected as PC');
assert.strictEqual(winDev.os, 'Windows', 'OS should be Windows');
assert.strictEqual(winDev.deviceLabel, 'Windows PC', 'Device label should be Windows PC');
assert.strictEqual(winDev.icon, '💻', 'PC icon should be laptop emoji');
assert.strictEqual(winDev.browser, 'Google Chrome', 'Browser should be Google Chrome');
console.log('  ✓ Windows PC correctly detected');

// Test Android Phone detection
const androidUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const androidDev = OC.app.getDeviceInfo(androidUA);
assert.strictEqual(androidDev.type, 'phone', 'Android Mobile should be detected as phone');
assert.strictEqual(androidDev.os, 'Android', 'OS should be Android');
assert.strictEqual(androidDev.deviceLabel, 'Android Phone', 'Device label should be Android Phone');
assert.strictEqual(androidDev.icon, '📱', 'Phone icon should be mobile emoji');
console.log('  ✓ Android Phone correctly detected');

// Test iPhone / iOS detection
const iphoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const iphoneDev = OC.app.getDeviceInfo(iphoneUA);
assert.strictEqual(iphoneDev.type, 'phone', 'iPhone should be detected as phone');
assert.strictEqual(iphoneDev.os, 'iOS', 'OS should be iOS');
assert.strictEqual(iphoneDev.deviceLabel, 'Apple iPhone', 'Device label should be Apple iPhone');
assert.strictEqual(iphoneDev.icon, '📱', 'iPhone icon should be mobile emoji');
assert.strictEqual(iphoneDev.browser, 'Apple Safari', 'Browser should be Apple Safari');
console.log('  ✓ Apple iPhone correctly detected');

// Test Mac PC detection
const macUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const macDev = OC.app.getDeviceInfo(macUA);
assert.strictEqual(macDev.type, 'pc', 'Mac OS X should be detected as PC');
assert.strictEqual(macDev.os, 'macOS', 'OS should be macOS');
assert.strictEqual(macDev.deviceLabel, 'Apple Mac', 'Device label should be Apple Mac');
console.log('  ✓ Apple Mac correctly detected');

// Test Edge browser detection
const edgeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
const edgeDev = OC.app.getDeviceInfo(edgeUA);
assert.strictEqual(edgeDev.browser, 'Microsoft Edge', 'Edg/ should be detected as Microsoft Edge');
console.log('  ✓ Microsoft Edge browser correctly detected');

// 6. Test renderInstallButton()
const wrapNode = OC.app.renderInstallButton();
assert(wrapNode && wrapNode.className && wrapNode.className.includes('topbar-center-wrap'), 'Button container must have class topbar-center-wrap');
const btnNode = wrapNode.children && wrapNode.children[0];
assert(btnNode && btnNode.className && btnNode.className.includes('btn-install-app'), 'Must contain button with class btn-install-app');

// Check spinner element inside button
const spinnerNode = btnNode.children && btnNode.children.find(c => c.className && c.className.includes('install-btn-spinner'));
assert(spinnerNode, 'Button must contain .install-btn-spinner for circulating colorful gradient');

// Check content element inside button
const contentNode = btnNode.children && btnNode.children.find(c => c.className && c.className.includes('install-btn-content'));
assert(contentNode, 'Button must contain .install-btn-content');

console.log('  ✓ renderInstallButton() generates circulating animated button structure');

console.log('🎉 All PWA Install & Device Detection tests passed successfully!');
