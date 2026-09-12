/**
 * client_delete_persistence_and_tombstone.test.js
 * Verifies Rule 10.iii:
 * When any client is deleted, it is permanently deleted, never resurrects, and is expunged from the entire database.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

require('./harness.js');

function makeElement(tag) {
  return {
    nodeType: 1,
    tagName: tag ? tag.toUpperCase() : 'DIV',
    className: '',
    classList: {
      add: function () {},
      remove: function () {},
      contains: function () { return false; }
    },
    style: {},
    attributes: {},
    children: [],
    events: {},
    setAttribute: function (k, v) { this.attributes[k] = v; },
    getAttribute: function (k) { return this.attributes[k]; },
    appendChild: function (child) {
      if (typeof child === 'string') {
        this.children.push({ nodeType: 3, text: child });
      } else if (child) {
        this.children.push(child);
      }
      return child;
    },
    addEventListener: function (type, handler) { this.events[type] = handler; },
    removeEventListener: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
}

globalThis.document = {
  createElement: makeElement,
  createElementNS: function (ns, tag) { return makeElement(tag); },
  createTextNode: function (text) {
    return { nodeType: 3, text: String(text) };
  },
  addEventListener: function () {},
  removeEventListener: function () {},
  getElementById: function () { return null; },
  body: { appendChild: function () {} },
  documentElement: { setAttribute: function () {}, removeAttribute: function () {} }
};

loadFile('assets/js/icons.js');
loadFile('assets/js/store.js');
loadFile('assets/js/permissions.js');
loadFile('assets/js/ui.js');

console.log('=== [TEST] Client Delete Persistence & Tombstone (Rule 10.iii) ===');

const store = OC.store;
store.load();

// 1. Verify client tombstone helper functions exist on store
assert(typeof store.markClientDeleted === 'function', 'store.markClientDeleted function must exist');
assert(typeof store.trackClientCreated === 'function', 'store.trackClientCreated function must exist');

// 2. Add a test client to the store
const testClientId = 'c-test-del-' + Date.now();
const testClient = {
  id: testClientId,
  name: 'Temporary Client',
  client_id: 'CLI-DEL-01',
  client_code: 'TCD',
  client_number: '777',
  contact: '777',
  status: 'active',
  department: 'd-web',
  departments: ['d-web']
};

store.state.clients = store.state.clients || [];
store.state.clients.push(testClient);
store.trackClientCreated(testClientId);

assert(store.state.clients.some(c => c.id === testClientId), 'Test client must exist before deletion');

// 3. Perform client.delete mutation
store.mutate({
  actor: 'u-shohag',
  action: 'client.delete',
  target: testClient.name,
  clientId: testClientId
}, () => {
  store.markClientDeleted(testClientId);
  store.state.clients = store.state.clients.filter(c => c.id !== testClientId);
});

// Verify client is expunged from store.state.clients
assert(!store.state.clients.some(c => c.id === testClientId), 'Client must be expunged from store.state.clients');

// Verify tombstone is recorded in localStorage
const storedTombstones = JSON.parse(localStorage.getItem('oc_deleted_clients') || '{}');
assert(storedTombstones[testClientId] === true, 'Deleted client ID must be recorded in localStorage[oc_deleted_clients]');

// 4. Test Server-side Controller & DB persistence
const commandController = require('../dev3/API/controllers/commandController');
const db = require('../dev3/API/config/db');

// Snapshot original db clients to guarantee complete database integrity
const originalDbClients = (db.getState().clients || []).map(c => Object.assign({}, c));

// Inject client into db state
const dbState = db.getState();
dbState.clients = dbState.clients || [];
dbState.clients.push(Object.assign({}, testClient));
db.saveState(dbState);
assert(db.getState().clients.some(c => c.id === testClientId), 'Client must be initially present in db');

// Issue client.delete mutation to server controller with full state representation
let savedResponse = null;
const req = {
  body: {
    entry: {
      actor: 'u-shohag',
      action: 'client.delete',
      target: testClient.name,
      clientId: testClientId
    },
    state: Object.assign({}, db.getState(), {
      clients: db.getState().clients.filter(c => c.id !== testClientId)
    })
  },
  headers: {},
  socket: { remoteAddress: '127.0.0.1' }
};

const res = {
  status: (code) => ({
    json: (data) => {
      savedResponse = { code, data };
      return savedResponse;
    }
  })
};

commandController.mutateState(req, res);
assert(savedResponse && savedResponse.code === 200, 'Server mutateState must return HTTP 200');

// Verify deleted client is expunged from server database
const refreshedDb = db.getState();
assert(!refreshedDb.clients.some(c => c.id === testClientId), 'Client must be completely expunged from db.getState().clients');

// Verify getClients filters out the deleted client
let clientsOut = null;
commandController.getClients({}, {
  status: (code) => ({
    json: (cl) => { clientsOut = cl; }
  })
});
assert(!clientsOut.some(c => c.id === testClientId), 'getClients must not return deleted client');

// Verify getState filters out the deleted client
let stateOut = null;
commandController.getState({}, {
  status: (code) => ({
    json: (st) => { stateOut = st; }
  })
});
assert(!stateOut.clients.some(c => c.id === testClientId), 'getState must not return deleted client');

// 5. Test Anti-Resurrection Protection:
// If a stale client pushes an old snapshot containing this client along with existing clients, the server MUST discard the deleted client
const staleReq = {
  body: {
    entry: {
      actor: 'u-stale',
      action: 'state.sync',
      target: 'workspace'
    },
    state: Object.assign({}, db.getState(), {
      clients: (db.getState().clients || []).concat([Object.assign({}, testClient)])
    })
  },
  headers: {},
  socket: { remoteAddress: '127.0.0.1' }
};

commandController.mutateState(staleReq, {
  status: () => ({ json: () => {} })
});

const postStaleDb = db.getState();
assert(!postStaleDb.clients.some(c => c.id === testClientId), 'Server must never resurrect a deleted client even if sent by stale device');

// 6. Test deleteClient direct route
const anotherTestClientId = 'c-direct-del-' + Date.now();
const liveStateForDirect = db.getState();
liveStateForDirect.clients.push({ id: anotherTestClientId, name: 'Direct Delete Test' });
db.saveState(liveStateForDirect);

commandController.deleteClient({ params: { id: anotherTestClientId } }, {
  status: (code) => ({
    json: (out) => {
      assert(code === 200, 'deleteClient must return 200');
      assert(out.ok === true, 'deleteClient must succeed');
    }
  })
});

const directDelDb = db.getState();
assert(!directDelDb.clients.some(c => c.id === anotherTestClientId), 'Direct deleteClient route must expunge client from database');

// Restore original database clients to guarantee full persistence integrity
const finalCleanState = db.getState();
finalCleanState.clients = originalDbClients;
db.saveState(finalCleanState);

console.log('✅ ALL CHECKS PASSED: Client deletion is completely permanent and protected against resurrection (Rule 10.iii).');
process.exit(0);
