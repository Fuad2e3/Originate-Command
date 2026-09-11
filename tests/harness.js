/* Minimal browser-shaped globals so the logic files can be exercised in Node.
   store.js and permissions.js touch only window and localStorage, which is
   what makes them testable without a browser at all. */
globalThis.window = globalThis;
if (typeof globalThis.addEventListener !== 'function') {
  globalThis.addEventListener = function () {};
}
if (typeof globalThis.removeEventListener !== 'function') {
  globalThis.removeEventListener = function () {};
}
var mem = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; }
};
const fs = require('fs');
const path = require('path');
globalThis.loadFile = function (p) {
  const resolved = fs.existsSync(p) ? p : path.resolve(__dirname, '..', p);
  (0, eval)(fs.readFileSync(resolved, 'utf8'));
};
