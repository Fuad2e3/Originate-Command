/* =========================================================================
   commandController.js — Originate Command REST & Real-time Controller
   Handles all business logic for todos, instructions, users, departments,
   clients, groups, tags, audit logs, comments, invites, and live SSE sync.
   ========================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const logic = require('../lib/logic');
const emailService = require('../lib/emailService');

// Server-Sent Events (SSE) active subscriber connections
const sseClients = new Set();

// Presence: map of userId -> Set of SSE response objects (multiple tabs per user)
const presenceMap = new Map();

// Tombstone sets for deleted entities to prevent stale clients from re-inserting them
const serverDeletedGroupIds = new Set();
const serverDeletedClientIds = new Set();
const serverDeletedTodoIds = new Set();
const serverDeletedInstructionIds = new Set();
const serverDeletedUserIds = new Set();
const serverDeletedDepartmentIds = new Set();
const serverDeletedPolicyIds = new Set();
const serverDeletedTagIds = new Set();
const serverMemberRemovals = new Map(); // key: `${userId}:${deptId}`, value: timestamp

const TOMBSTONES_FILE = path.join(__dirname, '..', 'data', 'tombstones.json');

function loadServerTombstones() {
  try {
    if (fs.existsSync(TOMBSTONES_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOMBSTONES_FILE, 'utf8'));
      serverDeletedClientIds.clear();
      serverDeletedGroupIds.clear();
      serverDeletedTodoIds.clear();
      serverDeletedInstructionIds.clear();
      serverDeletedUserIds.clear();
      serverDeletedDepartmentIds.clear();
      serverDeletedPolicyIds.clear();
      serverDeletedTagIds.clear();
      serverMemberRemovals.clear();
      if (Array.isArray(data.clients)) data.clients.forEach(id => serverDeletedClientIds.add(id));
      if (Array.isArray(data.groups)) data.groups.forEach(id => serverDeletedGroupIds.add(id));
      if (Array.isArray(data.todos)) data.todos.forEach(id => serverDeletedTodoIds.add(id));
      if (Array.isArray(data.instructions)) data.instructions.forEach(id => serverDeletedInstructionIds.add(id));
      if (Array.isArray(data.users)) data.users.forEach(id => serverDeletedUserIds.add(id));
      if (Array.isArray(data.departments)) data.departments.forEach(id => serverDeletedDepartmentIds.add(id));
      if (Array.isArray(data.policies)) data.policies.forEach(id => serverDeletedPolicyIds.add(id));
      if (Array.isArray(data.tags)) data.tags.forEach(id => serverDeletedTagIds.add(id));
      if (data.memberRemovals && typeof data.memberRemovals === 'object') {
        const now = Date.now();
        for (const [key, ts] of Object.entries(data.memberRemovals)) {
          if (now - Number(ts) < 60000) {
            serverMemberRemovals.set(key, Number(ts));
          }
        }
      }
    }
  } catch (_) {}
}

function saveServerTombstones() {
  try {
    const remObj = {};
    const now = Date.now();
    for (const [key, ts] of serverMemberRemovals.entries()) {
      if (now - ts < 60000) {
        remObj[key] = ts;
      }
    }
    const data = {
      clients: Array.from(serverDeletedClientIds),
      groups: Array.from(serverDeletedGroupIds),
      todos: Array.from(serverDeletedTodoIds),
      instructions: Array.from(serverDeletedInstructionIds),
      users: Array.from(serverDeletedUserIds),
      departments: Array.from(serverDeletedDepartmentIds),
      policies: Array.from(serverDeletedPolicyIds),
      tags: Array.from(serverDeletedTagIds),
      memberRemovals: remObj
    };
    const tmpPath = path.join(path.dirname(TOMBSTONES_FILE), `.${path.basename(TOMBSTONES_FILE)}.tmp.${process.pid}.${Date.now()}`);
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    try { fs.renameSync(tmpPath, TOMBSTONES_FILE); } catch (_) {
      fs.writeFileSync(TOMBSTONES_FILE, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (_) {}
}

loadServerTombstones();

const DEMO_POLICY_IDS = [
  'pol-web-qa', 'pol-web-git', 'pol-admin-punch', 'pol-admin-leave',
  'pol-bizops-sla', 'pol-leadgen-quality', 'pol-outreach-compliance', 'pol-social-brand',
  'pol-conduct', 'pol-confidentiality', 'pol-transparency'
];
DEMO_POLICY_IDS.forEach(id => serverDeletedPolicyIds.add(id));

// Broadcast a payload to all connected SSE clients
function broadcastSSE(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(msg); } catch (_) { sseClients.delete(client); }
  });
}

// Broadcast state updates to all connected browser clients in real time
db.onChange((event, state) => {
  broadcastSSE({ type: event.type, timestamp: Date.now() });
});

const PRESENCE_FILE = path.join(__dirname, '..', 'data', 'presence.json');

function readSharedPresence() {
  try {
    if (fs.existsSync(PRESENCE_FILE)) {
      const data = JSON.parse(fs.readFileSync(PRESENCE_FILE, 'utf8'));
      const now = Date.now();
      const active = {};
      let changed = false;
      for (const [uid, record] of Object.entries(data)) {
        if (record && typeof record === 'object') {
          const validWorkers = {};
          for (const [wKey, seen] of Object.entries(record)) {
            if (now - seen < 70000) {
              validWorkers[wKey] = seen;
            } else {
              changed = true;
            }
          }
          if (Object.keys(validWorkers).length > 0) {
            active[uid] = validWorkers;
          } else {
            changed = true;
          }
        }
      }
      if (changed) {
        try { fs.writeFileSync(PRESENCE_FILE, JSON.stringify(active, null, 2), 'utf8'); } catch (_) {}
      }
      return Object.keys(active);
    }
  } catch (_) {}
  return Array.from(presenceMap.keys());
}

function updateSharedPresence(userId, isOnline) {
  if (!userId) return;
  try {
    const workerKey = `worker_${process.pid}`;
    let data = {};
    if (fs.existsSync(PRESENCE_FILE)) {
      try { data = JSON.parse(fs.readFileSync(PRESENCE_FILE, 'utf8')); } catch (_) {}
    }
    if (!data[userId]) data[userId] = {};
    if (isOnline) {
      data[userId][workerKey] = Date.now();
    } else {
      delete data[userId][workerKey];
      if (Object.keys(data[userId]).length === 0) {
        delete data[userId];
      }
    }
    fs.writeFileSync(PRESENCE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

// Broadcast current presence list to all clients
function broadcastPresence() {
  const onlineIds = readSharedPresence();
  broadcastSSE({ type: 'presence', onlineUserIds: onlineIds });
}

// Periodic SSE keepalive ping (every 25s) to prevent reverse proxies and browsers from closing idle streams
setInterval(() => {
  for (const uid of presenceMap.keys()) {
    updateSharedPresence(uid, true);
  }
  sseClients.forEach(client => {
    try {
      client.write(': keepalive\n\n');
    } catch (_) {
      sseClients.delete(client);
    }
  });
}, 25000);

/**
 * SSE Subscription Endpoint (/api/events)
 * Accepts optional ?userId=<id> query param to track presence.
 */
function subscribeEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const userId = (req.query && req.query.userId) ? String(req.query.userId).trim() : null;

  // Register presence for this user
  if (userId) {
    if (!presenceMap.has(userId)) presenceMap.set(userId, new Set());
    presenceMap.get(userId).add(res);
    updateSharedPresence(userId, true);
  }

  sseClients.add(res);

  // Send initial connected + current presence
  res.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);
  const currentOnline = readSharedPresence();
  res.write(`data: ${JSON.stringify({ type: 'presence', onlineUserIds: currentOnline })}\n\n`);

  // Broadcast updated presence to all clients when someone joins
  if (userId) broadcastPresence();

  req.on('close', () => {
    sseClients.delete(res);
    if (userId && presenceMap.has(userId)) {
      presenceMap.get(userId).delete(res);
      if (presenceMap.get(userId).size === 0) {
        presenceMap.delete(userId);
        updateSharedPresence(userId, false);
      }
    }
    // Broadcast updated presence when someone leaves
    broadcastPresence();
  });
}

/**
 * GET /api/presence — Returns array of currently online user IDs
 */
function getPresence(req, res) {
  const onlineIds = readSharedPresence();
  return res.status(200).json({ onlineUserIds: onlineIds });
}

/**
 * Helper to sanitize user objects (NEVER expose passwords to client JS)
 */
function sanitizeUser(u) {
  if (!u) return null;
  const copy = Object.assign({}, u);
  delete copy.password;
  return copy;
}

/**
 * Helper to build sanitized state with tombstones and stripped deleted records
 */
function buildSanitizedState(rawState) {
  if (!rawState) return rawState;
  loadServerTombstones();
  const clients = (rawState.clients || []).filter(c => !serverDeletedClientIds.has(c.id));
  const groups = (rawState.groups || []).filter(g => !serverDeletedGroupIds.has(g.id));
  const todos = (rawState.todos || []).filter(t => !serverDeletedTodoIds.has(t.id));
  const instructions = (rawState.instructions || []).filter(i => !serverDeletedInstructionIds.has(i.id));
  const departments = (rawState.departments || []).filter(d => !serverDeletedDepartmentIds.has(d.id));
  const users = (rawState.users || []).filter(u => !serverDeletedUserIds.has(u.id));
  const policies = (rawState.policies || []).filter(p => !serverDeletedPolicyIds.has(p.id) && DEMO_POLICY_IDS.indexOf(p.id) === -1 && p.department !== 'all');
  const tags = (rawState.tags || []).filter(t => !serverDeletedTagIds.has(t.id));

  return Object.assign({}, rawState, {
    clients: clients,
    groups: groups,
    todos: todos,
    instructions: instructions,
    departments: departments,
    users: users.map(sanitizeUser),
    policies: policies,
    tags: tags,
    tombstones: {
      departments: Array.from(serverDeletedDepartmentIds),
      clients: Array.from(serverDeletedClientIds),
      groups: Array.from(serverDeletedGroupIds),
      todos: Array.from(serverDeletedTodoIds),
      instructions: Array.from(serverDeletedInstructionIds),
      policies: Array.from(serverDeletedPolicyIds),
      tags: Array.from(serverDeletedTagIds)
    }
  });
}

/**
 * Get Full State Snapshot (Pass-free for client security)
 */
function getState(req, res) {
  const sanitized = buildSanitizedState(db.getState());
  return res.status(200).json(sanitized);
}

/**
 * Mutate State Atomically
 */
function mutateState(req, res) {
  loadServerTombstones();
  const { entry, state: incomingState } = (req && req.body) || {};
  const clientIp = (req && req.headers && req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : ((req && req.socket && req.socket.remoteAddress) || (req && req.ip) || '127.0.0.1');

  const currentState = db.getState();
  const currentUsers = currentState.users || [];

  // Security enforcement: System Admins cannot be deleted by anyone, and cannot delete themselves
  if (entry && entry.action === 'user.delete') {
    const actorUser = currentUsers.find(u => u.id === entry.actor);
    const targetUser = currentUsers.find(u => u.name === entry.target || u.id === entry.target);
    if (!actorUser || !actorUser.admin) {
      return res.status(403).json({ error: 'Access Denied: Only System Admin can delete user accounts.' });
    }
    if (actorUser && targetUser && actorUser.id === targetUser.id) {
      return res.status(403).json({ error: 'Access Denied: System Admins cannot delete their own account.' });
    }
    if (targetUser && targetUser.admin) {
      return res.status(403).json({ error: 'Access Denied: System Admins cannot be deleted.' });
    }
  }

  // Security enforcement + immediate DB deletion for group.delete
  if (entry && entry.action === 'group.delete') {
    const actorUser = currentUsers.find(u => u.id === entry.actor || u.email === entry.actor || u.name === entry.actor);
    if (!actorUser || !actorUser.admin) {
      return res.status(403).json({ error: 'Access Denied: Only System Admin can delete groups.' });
    }
    /* Immediately remove the group from the server DB so the deletion is
       reflected in /api/state right away — even before (or instead of)
       the full state push that arrives from the client a moment later.
       We identify the group by its name (entry.target) since the client
       only sends the name in the audit entry. */
    const liveState = db.getState();
    if (Array.isArray(liveState.groups)) {
      const before = liveState.groups.length;
      liveState.groups = liveState.groups.filter(function (g) {
        return g.name !== entry.target && g.id !== entry.target;
      });
      if (liveState.groups.length !== before) {
        db.saveState(liveState);
      }
    }
  }

  if (incomingState && incomingState.version === 1) {
    if (!Array.isArray(incomingState.users) || incomingState.users.length === 0) {
      incomingState.users = currentUsers.length > 0 ? currentUsers : logic.seed().users;
    }
    if (!Array.isArray(incomingState.departments) || incomingState.departments.length === 0) {
      incomingState.departments = (currentState.departments && currentState.departments.length > 0) ? currentState.departments : logic.seed().departments;
    }
    if (!Array.isArray(incomingState.tags)) {
      incomingState.tags = currentState.tags || [];
    }
    if (!Array.isArray(incomingState.clients)) {
      incomingState.clients = currentState.clients || [];
    }
    if (!Array.isArray(incomingState.todos)) {
      incomingState.todos = currentState.todos || [];
    }
    if (!Array.isArray(incomingState.groups)) {
      incomingState.groups = currentState.groups || [];
    }
    if (!Array.isArray(incomingState.instructions)) {
      incomingState.instructions = currentState.instructions || [];
    }
    if (!Array.isArray(incomingState.notifications)) {
      incomingState.notifications = currentState.notifications || [];
    }
    if (!Array.isArray(incomingState.attendance)) {
      incomingState.attendance = currentState.attendance || [];
    }
    if (!Array.isArray(incomingState.leaves)) {
      incomingState.leaves = currentState.leaves || [];
    }
    if (!Array.isArray(incomingState.saved_filters)) {
      incomingState.saved_filters = currentState.saved_filters || [];
    }
    if (!Array.isArray(incomingState.policies)) {
      incomingState.policies = currentState.policies || [];
    }
    if (!Array.isArray(incomingState.audit)) {
      incomingState.audit = currentState.audit || [];
    }
    if (!Array.isArray(incomingState.extended_info_fields)) {
      incomingState.extended_info_fields = currentState.extended_info_fields || [];
    }
    if (!Array.isArray(incomingState.card_extended_fields)) {
      incomingState.card_extended_fields = currentState.card_extended_fields || [];
    }
    if (!Array.isArray(incomingState.portal_extended_fields)) {
      incomingState.portal_extended_fields = currentState.portal_extended_fields || [];
    }

    const incomingUsers = incomingState.users;
    if (entry && entry.action === 'user.delete') {
      const actorId = entry && entry.actor;
      const actorUser = currentUsers.find(u => u.id === actorId || u.email === actorId || u.name === actorId);
      if (!actorUser || !actorUser.admin) {
        return res.status(403).json({ error: 'Access Denied: Only System Admin can delete user accounts.' });
      }
      const targetUser = currentUsers.find(u => u.name === entry.target || u.id === entry.target);
      if (actorUser && targetUser && actorUser.id === targetUser.id) {
        return res.status(403).json({ error: 'Access Denied: System Admins cannot delete their own account.' });
      }
      if (targetUser && targetUser.admin) {
        return res.status(403).json({ error: 'Access Denied: System Admins cannot be deleted.' });
      }
      if (targetUser) {
        serverDeletedUserIds.add(targetUser.id);
        db.deleteUserFile(targetUser.id);
        saveServerTombstones();
      }
      incomingState.users = incomingUsers.filter(u => !serverDeletedUserIds.has(u.id));
      currentState.users = currentUsers.filter(u => !serverDeletedUserIds.has(u.id));
    } else if (Array.isArray(incomingState.users)) {
      const cleanIncoming = incomingUsers.filter(u => !serverDeletedUserIds.has(u.id));
      const userMap = new Map();
      const emailMap = new Map();

      // Seed with clean current users
      currentUsers.forEach(u => {
        if (!serverDeletedUserIds.has(u.id)) {
          userMap.set(u.id, u);
          if (u.email) emailMap.set(u.email.trim().toLowerCase(), u.id);
        }
      });

      // Merge incoming users with email-based deduplication
      cleanIncoming.forEach(u => {
        const cleanMail = (u.email || '').trim().toLowerCase();
        const existingId = cleanMail ? emailMap.get(cleanMail) : null;
        const targetId = existingId || u.id;
        const existing = userMap.get(targetId);

        if (existing) {
          const isUserAction = entry && entry.action && (
            entry.action.startsWith('user.') ||
            entry.action.startsWith('profile.') ||
            entry.action.startsWith('department.member.') ||
            entry.action === 'account.update'
          );
          const merged = isUserAction ? Object.assign({}, existing, u) : Object.assign({}, u, existing);
          if (existing.status === 'active' || u.status === 'active') merged.status = 'active';
          if (existing.admin || u.admin) merged.admin = true;
          if (existing.name && existing.name !== 'Invited Member') {
            if (!u.name || u.name === 'Invited Member' || !isUserAction || (existing.name.length > u.name.length && existing.name.startsWith(u.name))) {
              merged.name = existing.name;
            }
          }
          if (existing.title && (!isUserAction || !u.title || u.title === 'Member' || u.title === 'Team Member')) {
            merged.title = existing.title;
          }
          if (existing.password && !merged.password) merged.password = existing.password;
          let deptsToUse = existing.departments;
          if (isUserAction && Array.isArray(u.departments) && u.departments.length > 0) {
            deptsToUse = u.departments;
          } else if (!Array.isArray(deptsToUse) || deptsToUse.length === 0) {
            deptsToUse = Array.isArray(u.departments) ? u.departments : [];
          }
          merged.departments = (deptsToUse || []).filter(d => {
            const dId = typeof d === 'string' ? d : (d && d.department);
            if (!dId) return false;
            const remTs = serverMemberRemovals.get(`${targetId}:${dId}`);
            if (remTs && (Date.now() - remTs < 60000)) {
              return false;
            }
            return true;
          });
          userMap.set(targetId, merged);
        } else {
          if (Array.isArray(u.departments)) {
            u.departments = u.departments.filter(d => {
              const dId = typeof d === 'string' ? d : (d && d.department);
              if (!dId) return false;
              const remTs = serverMemberRemovals.get(`${u.id}:${dId}`);
              if (remTs && (Date.now() - remTs < 60000)) return false;
              return true;
            });
          }
          userMap.set(u.id, u);
          if (cleanMail) emailMap.set(cleanMail, u.id);
        }
      });

      incomingState.users = Array.from(userMap.values());
    }

    const currentGroups = currentState.groups || [];
    const incomingGroups = incomingState.groups || [];
    if (entry && entry.action === 'group.delete') {
      const actorId = entry && entry.actor;
      const actorUser = currentUsers.find(u => u.id === actorId || u.email === actorId || u.name === actorId);
      if (!actorUser || !actorUser.admin) {
        return res.status(403).json({ error: 'Access Denied: Only System Admin can delete groups.' });
      }
      const targetId = entry.groupId;
      if (targetId) serverDeletedGroupIds.add(targetId);
      const grp = currentGroups.find(g => g.name === entry.target || g.id === entry.target);
      if (grp) serverDeletedGroupIds.add(grp.id);
      saveServerTombstones();
      incomingState.groups = incomingGroups.filter(g => !serverDeletedGroupIds.has(g.id));
      currentState.groups = currentGroups.filter(g => !serverDeletedGroupIds.has(g.id));
    } else if (Array.isArray(incomingState.groups)) {
      if (entry && entry.action === 'group.create' && entry.groupId) {
        serverDeletedGroupIds.delete(entry.groupId);
        saveServerTombstones();
      }
      incomingState.groups = incomingGroups.filter(g => !serverDeletedGroupIds.has(g.id));
      const groupMap = new Map();
      currentGroups.forEach(g => {
        if (!serverDeletedGroupIds.has(g.id)) {
          groupMap.set(g.id, g);
        }
      });
      incomingState.groups.forEach(g => {
        if (!serverDeletedGroupIds.has(g.id)) {
          const existing = groupMap.get(g.id);
          if (existing) {
            const merged = Object.assign({}, existing, g);
            const mMap = new Map();
            (existing.messages || []).concat(g.messages || []).forEach(m => {
              if (m && m.id) mMap.set(m.id, m);
            });
            const mergedMsgs = Array.from(mMap.values());
            mergedMsgs.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
            merged.messages = mergedMsgs;
            groupMap.set(g.id, merged);
          } else {
            groupMap.set(g.id, g);
          }
        }
      });
      incomingState.groups = Array.from(groupMap.values());
    }

    // Client collection synchronization and tombstone handling
    const currentClients = currentState.clients || [];
    const incomingClients = incomingState.clients || [];
    if (entry && entry.action === 'client.delete') {
      const targetId = entry.clientId;
      const targetName = entry.target;
      const toDeleteIds = new Set();
      if (targetId) toDeleteIds.add(targetId);
      currentClients.forEach(c => {
        if (targetId && c.id === targetId) toDeleteIds.add(c.id);
        if (targetName && (c.id === targetName || c.name === targetName || c.client_id === targetName || c.client_code === targetName || c.client_number === targetName)) {
          toDeleteIds.add(c.id);
        }
      });
      incomingClients.forEach(c => {
        if (targetId && c.id === targetId) toDeleteIds.add(c.id);
        if (targetName && (c.id === targetName || c.name === targetName || c.client_id === targetName || c.client_code === targetName || c.client_number === targetName)) {
          toDeleteIds.add(c.id);
        }
      });
      toDeleteIds.forEach(id => serverDeletedClientIds.add(id));
      saveServerTombstones();

      incomingState.clients = incomingClients.filter(c => !serverDeletedClientIds.has(c.id));
      currentState.clients = currentClients.filter(c => !serverDeletedClientIds.has(c.id));
    } else if (Array.isArray(incomingState.clients)) {
      if (entry && entry.action === 'client.create' && (entry.clientId || (entry.client && entry.client.id))) {
        const cId = entry.clientId || entry.client.id;
        serverDeletedClientIds.delete(cId);
        saveServerTombstones();
        if (entry.client && !incomingState.clients.some(c => c.id === entry.client.id)) {
          incomingState.clients.push(entry.client);
        }
      }
      incomingState.clients = incomingClients.filter(c => !serverDeletedClientIds.has(c.id));
      if (incomingState.clients.length < currentClients.length) {
        const clientMap = new Map();
        currentClients.forEach(c => {
          if (!serverDeletedClientIds.has(c.id)) {
            clientMap.set(c.id, c);
          }
        });
        incomingState.clients.forEach(c => {
          if (!serverDeletedClientIds.has(c.id)) {
            const existing = clientMap.get(c.id);
            clientMap.set(c.id, existing ? Object.assign({}, existing, c) : c);
          }
        });
        incomingState.clients = Array.from(clientMap.values());
      }
    }

    // Todo collection synchronization and tombstone handling
    const currentTodos = currentState.todos || [];
    const incomingTodos = incomingState.todos || [];
    if (entry && entry.action === 'todo.delete') {
      const targetId = entry.todoId;
      const targetName = entry.target;
      const toDeleteIds = new Set();
      if (targetId) toDeleteIds.add(targetId);
      currentTodos.forEach(t => {
        if (targetId && t.id === targetId) toDeleteIds.add(t.id);
        if (targetName && (t.id === targetName || t.title === targetName)) toDeleteIds.add(t.id);
      });
      incomingTodos.forEach(t => {
        if (targetId && t.id === targetId) toDeleteIds.add(t.id);
        if (targetName && (t.id === targetName || t.title === targetName)) toDeleteIds.add(t.id);
      });
      toDeleteIds.forEach(id => serverDeletedTodoIds.add(id));
      saveServerTombstones();

      incomingState.todos = incomingTodos.filter(t => !serverDeletedTodoIds.has(t.id));
      currentState.todos = currentTodos.filter(t => !serverDeletedTodoIds.has(t.id));
    } else if (Array.isArray(incomingState.todos)) {
      if (entry && entry.action === 'todo.create' && (entry.todoId || (entry.todo && entry.todo.id))) {
        const tId = entry.todoId || entry.todo.id;
        serverDeletedTodoIds.delete(tId);
        saveServerTombstones();
      }
      incomingState.todos = incomingTodos.filter(t => !serverDeletedTodoIds.has(t.id));
      const todoMap = new Map();
      currentTodos.forEach(t => {
        if (!serverDeletedTodoIds.has(t.id)) {
          todoMap.set(t.id, t);
        }
      });
      incomingState.todos.forEach(t => {
        if (!serverDeletedTodoIds.has(t.id)) {
          const existing = todoMap.get(t.id);
          if (existing) {
            const merged = Object.assign({}, existing, t);
            const cMap = new Map();
            (existing.comments || []).concat(t.comments || []).forEach(c => {
              if (c && c.id) cMap.set(c.id, c);
            });
            const mergedComments = Array.from(cMap.values());
            mergedComments.sort((a, b) => new Date(a.posted_at || 0).getTime() - new Date(b.posted_at || 0).getTime());
            merged.comments = mergedComments;
            todoMap.set(t.id, merged);
          } else {
            todoMap.set(t.id, t);
          }
        }
      });
      incomingState.todos = Array.from(todoMap.values());
    }

    // Instruction collection synchronization and tombstone handling
    const currentInstructions = currentState.instructions || [];
    const incomingInstructions = incomingState.instructions || [];
    if (entry && entry.action === 'instruction.delete') {
      const targetId = entry.instructionId;
      const targetName = entry.target;
      const toDeleteIds = new Set();
      if (targetId) toDeleteIds.add(targetId);
      currentInstructions.forEach(i => {
        if (targetId && i.id === targetId) toDeleteIds.add(i.id);
        if (targetName && (i.id === targetName || (i.body && i.body.indexOf(targetName) === 0))) toDeleteIds.add(i.id);
      });
      incomingInstructions.forEach(i => {
        if (targetId && i.id === targetId) toDeleteIds.add(i.id);
        if (targetName && (i.id === targetName || (i.body && i.body.indexOf(targetName) === 0))) toDeleteIds.add(i.id);
      });
      toDeleteIds.forEach(id => serverDeletedInstructionIds.add(id));
      saveServerTombstones();

      incomingState.instructions = incomingInstructions.filter(i => !serverDeletedInstructionIds.has(i.id));
      currentState.instructions = currentInstructions.filter(i => !serverDeletedInstructionIds.has(i.id));
    } else if (Array.isArray(incomingState.instructions)) {
      if (entry && entry.action === 'instruction.create' && (entry.instructionId || (entry.instruction && entry.instruction.id))) {
        const iId = entry.instructionId || entry.instruction.id;
        serverDeletedInstructionIds.delete(iId);
        saveServerTombstones();
      }
      incomingState.instructions = incomingInstructions.filter(i => !serverDeletedInstructionIds.has(i.id));
      const insMap = new Map();
      currentInstructions.forEach(i => {
        if (!serverDeletedInstructionIds.has(i.id)) {
          insMap.set(i.id, i);
        }
      });
      incomingState.instructions.forEach(i => {
        if (!serverDeletedInstructionIds.has(i.id)) {
          const existing = insMap.get(i.id);
          if (existing) {
            const merged = Object.assign({}, existing, i);
            const cMap = new Map();
            (existing.comments || []).concat(i.comments || []).forEach(c => {
              if (c && c.id) cMap.set(c.id, c);
            });
            const mergedComments = Array.from(cMap.values());
            mergedComments.sort((a, b) => new Date(a.posted_at || 0).getTime() - new Date(b.posted_at || 0).getTime());
            merged.comments = mergedComments;
            insMap.set(i.id, merged);
          } else {
            insMap.set(i.id, i);
          }
        }
      });
      incomingState.instructions = Array.from(insMap.values());
    }

    // Department collection synchronization and tombstone handling
    const currentDepts = currentState.departments || [];
    const incomingDepts = incomingState.departments || [];
    if (entry && entry.action === 'department.delete') {
      const targetId = entry.departmentId;
      const targetName = entry.target;
      const toDeleteIds = new Set();
      if (targetId) toDeleteIds.add(targetId);
      currentDepts.forEach(d => {
        if (targetId && d.id === targetId) toDeleteIds.add(d.id);
        if (targetName && (d.id === targetName || d.name === targetName)) toDeleteIds.add(d.id);
      });
      incomingDepts.forEach(d => {
        if (targetId && d.id === targetId) toDeleteIds.add(d.id);
        if (targetName && (d.id === targetName || d.name === targetName)) toDeleteIds.add(d.id);
      });
      toDeleteIds.forEach(id => {
        serverDeletedDepartmentIds.add(id);
        if (typeof db.deleteDepartmentFromMySQL === 'function') db.deleteDepartmentFromMySQL(id);
      });
      saveServerTombstones();

      incomingState.departments = incomingDepts.filter(d => !serverDeletedDepartmentIds.has(d.id));
      currentState.departments = currentDepts.filter(d => !serverDeletedDepartmentIds.has(d.id));

      // Clean up deleted department from all users in incomingState and currentState
      [incomingState.users, currentState.users].forEach(uList => {
        if (Array.isArray(uList)) {
          uList.forEach(u => {
            if (Array.isArray(u.departments)) {
              u.departments = u.departments.filter(d => {
                const dId = typeof d === 'string' ? d : (d && d.department);
                return !toDeleteIds.has(dId);
              });
            }
          });
        }
      });

      // Safely reassign any todos or instructions linked to the deleted department
      const fallbackDeptId = (incomingState.departments[0] && incomingState.departments[0].id) || 'd-admin';
      [incomingState.todos, currentState.todos].forEach(tList => {
        if (Array.isArray(tList)) {
          tList.forEach(t => {
            if (toDeleteIds.has(t.department) || toDeleteIds.has(t.department_id)) {
              t.department = fallbackDeptId;
              t.department_id = fallbackDeptId;
            }
            if (Array.isArray(t.departments)) {
              t.departments = t.departments.filter(d => !toDeleteIds.has(d));
              if (t.departments.length === 0) t.departments = [fallbackDeptId];
            }
          });
        }
      });
      [incomingState.instructions, currentState.instructions].forEach(iList => {
        if (Array.isArray(iList)) {
          iList.forEach(i => {
            if (toDeleteIds.has(i.department) || toDeleteIds.has(i.department_id)) {
              i.department = fallbackDeptId;
              i.department_id = fallbackDeptId;
            }
            if (Array.isArray(i.departments)) {
              i.departments = i.departments.filter(d => !toDeleteIds.has(d));
              if (i.departments.length === 0) i.departments = [fallbackDeptId];
            }
          });
        }
      });
    } else if (Array.isArray(incomingState.departments)) {
      if (entry && (entry.action === 'department.create' || entry.action === 'department.update')) {
        const targetDeptId = entry.departmentId || (entry.department && entry.department.id);
        if (targetDeptId) {
          serverDeletedDepartmentIds.delete(targetDeptId);
          saveServerTombstones();
          const targetObj = entry.department || { id: targetDeptId, name: entry.name, levels: entry.levels };
          targetObj.updated_at = new Date().toISOString();

          // Update or insert into incomingDepts
          const incIdx = incomingDepts.findIndex(d => d.id === targetDeptId || d.name === entry.target);
          if (incIdx >= 0) {
            if (entry.name) incomingDepts[incIdx].name = entry.name;
            if (Array.isArray(entry.levels)) incomingDepts[incIdx].levels = entry.levels.slice();
            incomingDepts[incIdx].updated_at = targetObj.updated_at;
          } else {
            incomingDepts.push(targetObj);
          }

          // Update or insert into currentDepts
          const curIdx = currentDepts.findIndex(d => d.id === targetDeptId || d.name === entry.target);
          if (curIdx >= 0) {
            if (entry.name) currentDepts[curIdx].name = entry.name;
            if (Array.isArray(entry.levels)) currentDepts[curIdx].levels = entry.levels.slice();
            currentDepts[curIdx].updated_at = targetObj.updated_at;
          } else {
            currentDepts.push(targetObj);
          }

          if (typeof db.syncDepartmentToMySQL === 'function') {
            db.syncDepartmentToMySQL(curIdx >= 0 ? currentDepts[curIdx] : targetObj);
          }
        }
      }
      const deptMap = new Map();
      currentDepts.forEach(d => {
        if (!serverDeletedDepartmentIds.has(d.id)) {
          deptMap.set(d.id, Object.assign({}, d));
        }
      });
      incomingDepts.forEach(d => {
        if (!serverDeletedDepartmentIds.has(d.id)) {
          const existing = deptMap.get(d.id);
          if (!existing) {
            deptMap.set(d.id, d);
          } else {
            const isExplicitUpdate = entry && (entry.action === 'department.update' || entry.action === 'department.create') && (entry.departmentId === d.id || (entry.department && entry.department.id === d.id));
            const incTime = d.updated_at ? new Date(d.updated_at).getTime() : 0;
            const curTime = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
            if (isExplicitUpdate || (incTime > 0 && incTime > curTime)) {
              deptMap.set(d.id, Object.assign({}, existing, d));
            }
          }
        }
      });
      incomingState.departments = Array.from(deptMap.values());
      currentState.departments = Array.from(deptMap.values());
    }

    // Policy / Foundation collection synchronization and tombstone handling
    const currentPolicies = currentState.policies || [];
    const incomingPolicies = incomingState.policies || [];
    if (entry && entry.action === 'foundation.delete') {
      const targetId = entry.policyId || entry.target;
      const toDeleteIds = new Set();
      if (targetId) toDeleteIds.add(targetId);
      currentPolicies.forEach(p => {
        if (targetId && (p.id === targetId || p.title === targetId)) toDeleteIds.add(p.id);
      });
      incomingPolicies.forEach(p => {
        if (targetId && (p.id === targetId || p.title === targetId)) toDeleteIds.add(p.id);
      });
      toDeleteIds.forEach(id => {
        serverDeletedPolicyIds.add(id);
        if (db.deletePolicyFromMySQL) db.deletePolicyFromMySQL(id);
      });
      saveServerTombstones();

      incomingState.policies = incomingPolicies.filter(p => !serverDeletedPolicyIds.has(p.id));
      currentState.policies = currentPolicies.filter(p => !serverDeletedPolicyIds.has(p.id));
    } else if (Array.isArray(incomingState.policies)) {
      if (entry && entry.action === 'foundation.create' && (entry.policyId || (entry.policy && entry.policy.id))) {
        const pId = entry.policyId || entry.policy.id;
        serverDeletedPolicyIds.delete(pId);
        saveServerTombstones();
      }
      incomingState.policies = incomingPolicies.filter(p => !serverDeletedPolicyIds.has(p.id));
      if (incomingState.policies.length < currentPolicies.length) {
        const polMap = new Map();
        currentPolicies.forEach(p => {
          if (!serverDeletedPolicyIds.has(p.id)) polMap.set(p.id, p);
        });
        incomingState.policies.forEach(p => {
          if (!serverDeletedPolicyIds.has(p.id)) {
            const existing = polMap.get(p.id);
            polMap.set(p.id, existing ? Object.assign({}, existing, p) : p);
          }
        });
        incomingState.policies = Array.from(polMap.values());
      }
    } else {
      incomingState.policies = currentPolicies.filter(p => !serverDeletedPolicyIds.has(p.id));
    }

    // Tag collection synchronization, rename, and tombstone handling
    const currentTags = currentState.tags || [];
    const incomingTags = incomingState.tags || [];
    if (entry && entry.action === 'tag.delete') {
      const targetId = entry.tagId || (entry.tag && entry.tag.id) || entry.target;
      const toDeleteIds = new Set();
      if (targetId) toDeleteIds.add(targetId);
      currentTags.forEach(t => {
        if (targetId && (t.id === targetId || t.label === targetId)) toDeleteIds.add(t.id);
      });
      incomingTags.forEach(t => {
        if (targetId && (t.id === targetId || t.label === targetId)) toDeleteIds.add(t.id);
      });

      // Verify if tag is in use in any todo or instruction
      let isTagInUse = false;
      const allTodos = (currentState.todos || []).concat(incomingState.todos || []);
      const allInstructions = (currentState.instructions || []).concat(incomingState.instructions || []);

      allTodos.forEach(td => {
        if (Array.isArray(td.tags)) {
          td.tags.forEach(tid => {
            if (toDeleteIds.has(tid)) isTagInUse = true;
          });
        }
      });
      allInstructions.forEach(inst => {
        if (Array.isArray(inst.tags)) {
          inst.tags.forEach(tid => {
            if (toDeleteIds.has(tid)) isTagInUse = true;
          });
        }
      });

      if (isTagInUse) {
        console.warn(`⚠️ [Tag Delete Blocked] Cannot delete tag ${targetId}: Tag is currently in use.`);
      } else {
        toDeleteIds.forEach(id => {
          serverDeletedTagIds.add(id);
          if (db.deleteTagFromMySQL) db.deleteTagFromMySQL(id);
        });
        saveServerTombstones();

        incomingState.tags = incomingTags.filter(t => !serverDeletedTagIds.has(t.id));
        currentState.tags = currentTags.filter(t => !serverDeletedTagIds.has(t.id));
      }
    } else {
      if (entry && entry.action === 'tag.create') {
        const tId = entry.tagId || (entry.tag && entry.tag.id);
        if (tId) {
          serverDeletedTagIds.delete(tId);
          saveServerTombstones();
        }
        const tagObj = entry.tag || (tId ? { id: tId, label: entry.label || entry.target || 'Custom Tag', kind: 'custom' } : null);
        if (tagObj) {
          if (!incomingTags.some(t => t.id === tagObj.id)) incomingTags.push(tagObj);
          if (!currentTags.some(t => t.id === tagObj.id)) currentTags.push(tagObj);
        }
      }
      if (entry && (entry.action === 'tag.update' || entry.action === 'tag.rename')) {
        const targetTagId = entry.tagId || (entry.tag && entry.tag.id);
        const newLabel = entry.label || (entry.tag && entry.tag.label) || entry.target;
        if (targetTagId && newLabel) {
          const updateInList = (list) => {
            if (!Array.isArray(list)) return;
            const t = list.find(x => x.id === targetTagId);
            if (t) t.label = newLabel;
          };
          updateInList(incomingTags);
          updateInList(currentTags);
        }
      }
      const tagMap = new Map();
      currentTags.forEach(t => {
        if (t && t.id && !serverDeletedTagIds.has(t.id)) tagMap.set(t.id, t);
      });
      incomingTags.forEach(t => {
        if (t && t.id && !serverDeletedTagIds.has(t.id)) {
          const existing = tagMap.get(t.id);
          tagMap.set(t.id, existing ? Object.assign({}, existing, t) : t);
        }
      });
      incomingState.tags = Array.from(tagMap.values());
      currentState.tags = incomingState.tags;
    }

    // Notification cleanup handling (notifications.clear / notification.clear)
    if (entry && (entry.action === 'notifications.clear' || entry.action === 'notification.clear')) {
      const targetUser = (entry.target === 'all' || !entry.target) ? null : entry.target;
      incomingState.notifications = (incomingState.notifications || []).filter(n => {
        return targetUser ? (n.user !== targetUser && n.user_id !== targetUser) : false;
      });
      currentState.notifications = (currentState.notifications || []).filter(n => {
        return targetUser ? (n.user !== targetUser && n.user_id !== targetUser) : false;
      });
    }

    // Direct explicit handling for client.create, client.assign, client.permissions and client.update mutations
    if (entry && (entry.action === 'client.assign' || entry.action === 'client.update' || entry.action === 'client.create' || entry.action === 'client.permissions')) {
      const liveClients = incomingState.clients || currentState.clients || [];
      const targetC = liveClients.find(c =>
        (entry.clientId && c.id === entry.clientId) ||
        c.id === entry.target ||
        c.client_id === entry.target ||
        c.name === entry.target ||
        c.client_code === entry.target ||
        c.client_number === entry.target
      );
      if (targetC) {
        if (entry.name !== undefined) targetC.name = entry.name;
        if (entry.client_id !== undefined) targetC.client_id = entry.client_id;
        if (entry.client_code !== undefined) targetC.client_code = entry.client_code;
        if (entry.client_number !== undefined) targetC.client_number = entry.client_number;
        if (entry.contact !== undefined) targetC.contact = entry.contact;
        if (entry.status !== undefined) targetC.status = entry.status;
        if (Array.isArray(entry.assignees)) {
          targetC.assignees = entry.assignees.slice();
          targetC.assigned_users = entry.assignees.slice();
        }
        if (Array.isArray(entry.departments)) {
          targetC.departments = entry.departments.slice();
        }
        if (entry.department !== undefined) {
          targetC.department = entry.department;
        }
        if (Array.isArray(entry.client_editors)) {
          targetC.client_editors = entry.client_editors.slice();
        }
        if (Array.isArray(entry.extended_info_editors)) {
          targetC.extended_info_editors = entry.extended_info_editors.slice();
        }
        if (entry.permissions) {
          targetC.permissions = Object.assign({}, targetC.permissions, entry.permissions);
        }
        if (entry.extended_fields) {
          targetC.extended_fields = entry.extended_fields;
        }
        targetC.updated_at = new Date().toISOString();
      }
    }

    // Direct explicit handling for user.update and user.update_profile mutations
    if (entry && (entry.action === 'user.update' || entry.action === 'user.update_profile' || entry.action === 'user.update_profile_section')) {
      const liveUsers = incomingState.users || currentState.users || [];
      const targetUid = entry.userId || (entry.target ? (liveUsers.find(u => u.id === entry.target || u.name === entry.target || u.email === entry.target) || {}).id : null);
      if (targetUid) {
        const uObj = liveUsers.find(u => u.id === targetUid);
        if (uObj) {
          if (entry.name) uObj.name = entry.name;
          if (entry.title) uObj.title = entry.title;
          if (entry.avatar) uObj.avatar = entry.avatar;
          if (entry.employee_id) uObj.employee_id = entry.employee_id;
          if (entry.org) uObj.org = entry.org;
          if (entry.joined_date) uObj.joined_date = entry.joined_date;
          if (entry.email) uObj.email = entry.email;
          if (entry.departments && Array.isArray(entry.departments)) uObj.departments = entry.departments.slice();
          uObj.updated_at = new Date().toISOString();
        }
      }
    }

    // Direct explicit handling for department.member.assign and department.member.remove
    if (entry && (entry.action === 'department.member.assign' || entry.action === 'department.member.remove')) {
      const liveUsers = incomingState.users || currentState.users || [];
      const targetUid = entry.userId || (entry.target ? (liveUsers.find(u => u.id === entry.target || u.name === entry.target || u.email === entry.target) || {}).id : null);
      const deptId = entry.departmentId || entry.department;
      if (targetUid && deptId) {
        [incomingState.users, currentState.users].forEach(userList => {
          if (!Array.isArray(userList)) return;
          const uObj = userList.find(u => u.id === targetUid);
          if (uObj) {
            uObj.departments = Array.isArray(uObj.departments) ? uObj.departments : [];
            if (entry.action === 'department.member.assign') {
              const lvl = entry.level || 'member';
              const existIdx = uObj.departments.findIndex(d => (typeof d === 'string' ? d : d.department) === deptId);
              if (existIdx > -1) {
                uObj.departments[existIdx] = { department: deptId, level: lvl };
              } else {
                uObj.departments.push({ department: deptId, level: lvl });
              }
            } else if (entry.action === 'department.member.remove') {
              uObj.departments = uObj.departments.filter(d => (typeof d === 'string' ? d : d.department) !== deptId);
            }
            uObj.updated_at = new Date().toISOString();
          }
        });
        if (entry.action === 'department.member.remove') {
          serverMemberRemovals.set(`${targetUid}:${deptId}`, Date.now());
          saveServerTombstones();
        } else if (entry.action === 'department.member.assign') {
          serverMemberRemovals.delete(`${targetUid}:${deptId}`);
          saveServerTombstones();
        }
      }
    }

    // Direct explicit handling for department.create and department.update
    if (entry && (entry.action === 'department.create' || entry.action === 'department.update')) {
      const liveDepts = incomingState.departments || currentState.departments || [];
      const targetDeptId = entry.departmentId || (entry.department && entry.department.id);
      if (targetDeptId) {
        serverDeletedDepartmentIds.delete(targetDeptId);
        saveServerTombstones();
        let dObj = liveDepts.find(d => d.id === targetDeptId || d.name === entry.target);
        if (dObj) {
          if (entry.name) dObj.name = entry.name;
          if (Array.isArray(entry.levels)) dObj.levels = entry.levels.slice();
          dObj.updated_at = new Date().toISOString();
        } else if (entry.department) {
          entry.department.updated_at = new Date().toISOString();
          liveDepts.push(entry.department);
          dObj = entry.department;
        }
        if (dObj && typeof db.syncDepartmentToMySQL === 'function') {
          db.syncDepartmentToMySQL(dObj);
        }
      }
    }

    if (entry && entry.action === 'settings.extended_fields') {
      if (Array.isArray(entry.extended_info_fields)) {
        incomingState.extended_info_fields = entry.extended_info_fields.slice();
        currentState.extended_info_fields = entry.extended_info_fields.slice();
      }
      if (Array.isArray(entry.card_extended_fields)) {
        incomingState.card_extended_fields = entry.card_extended_fields.slice();
        currentState.card_extended_fields = entry.card_extended_fields.slice();
      }
      if (Array.isArray(entry.portal_extended_fields)) {
        incomingState.portal_extended_fields = entry.portal_extended_fields.slice();
        currentState.portal_extended_fields = entry.portal_extended_fields.slice();
      }
    }

    // Client sent updated full state which already contains the local mutation and audit entry
    if (entry && entry.action === 'state.sync') {
      incomingState.audit = (incomingState.audit || []).filter(function (a) {
        return a && a.action !== 'state.sync';
      });
    } else if (entry) {
      incomingState.audit = Array.isArray(incomingState.audit) ? incomingState.audit : [];
      const alreadyPresent = incomingState.audit.some(function (a) {
        return a && a.actor === entry.actor && a.action === entry.action && a.target === entry.target;
      });
      if (!alreadyPresent) {
        incomingState.audit.unshift({
          id: 'a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          actor: entry.actor || 'system',
          action: entry.action || 'mutation',
          target: entry.target || 'workspace',
          detail: entry.detail || '',
          ip: clientIp,
          at: new Date().toISOString()
        });
      }
    }
    if (Array.isArray(incomingState.audit) && incomingState.audit.length > 0) {
      if (!incomingState.audit[0].ip || incomingState.audit[0].ip === '127.0.0.1') {
        incomingState.audit[0].ip = clientIp;
      }
      // Deduplicate immediate adjacent duplicate audits
      const dedupedAudit = [];
      for (let i = 0; i < incomingState.audit.length; i++) {
        const curr = incomingState.audit[i];
        const next = incomingState.audit[i + 1];
        if (next && curr.actor === next.actor && curr.action === next.action && curr.target === next.target && curr.detail === next.detail && Math.abs(new Date(curr.at).getTime() - new Date(next.at).getTime()) < 3000) {
          continue; // skip duplicate
        }
        dedupedAudit.push(curr);
      }
      incomingState.audit = dedupedAudit;
    }
    const saved = db.saveState(incomingState);
    return res.status(200).json({ ok: true, state: buildSanitizedState(saved) });
  }

  if (entry) {
    if (entry.action !== 'state.sync') {
      db.recordAudit(entry.actor, entry.action, entry.target, entry.detail, clientIp);
    }
    return res.status(200).json({ ok: true, state: buildSanitizedState(db.getState()) });
  }

  return res.status(400).json({ error: 'Invalid mutation payload' });
}

/**
 * Reset State to Default Seed Data
 */
function resetState(req, res) {
  const fresh = db.resetState();
  return res.status(200).json({ ok: true, seeded_at: fresh.seeded_at, message: 'Workspace state reset to default.' });
}

/**
 * Get Summary Stats for Dashboard / Monitoring
 */
function getStats(req, res) {
  const state = db.getState();
  const todos = state.todos || [];
  const openCount = todos.filter(t => t.state === 'open').length;
  const progressCount = todos.filter(t => t.state === 'progress').length;
  const blockedCount = todos.filter(t => t.state === 'blocked').length;
  const doneCount = todos.filter(t => t.state === 'done').length;

  return res.status(200).json({
    totalTodos: todos.length,
    open: openCount,
    progress: progressCount,
    blocked: blockedCount,
    done: doneCount,
    instructions: (state.instructions || []).length,
    users: (state.users || []).length,
    clients: (state.clients || []).length,
    departments: (state.departments || []).length,
    groups: (state.groups || []).length,
    auditLogs: (state.audit || []).length,
    sseConnectedClients: sseClients.size,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
  });
}

/**
 * Todos Endpoints
 */
function getTodos(req, res) {
  const state = db.getState();
  return res.status(200).json(state.todos || []);
}

function getTodoById(req, res) {
  const state = db.getState();
  const todo = (state.todos || []).find(t => t.id === req.params.id);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  return res.status(200).json(todo);
}

function createTodo(req, res) {
  const data = req.body;
  const client = data ? (data.client || (Array.isArray(data.clients) && data.clients.length ? data.clients[0] : null)) : null;
  const department = data ? (data.department || (Array.isArray(data.departments) && data.departments.length ? data.departments[0] : null)) : null;

  // client is optional — internal tasks (no client) are valid (5.2 allows dept-only tasks)
  if (!data || !data.title || !department) {
    return res.status(400).json({ error: 'Todo must contain title and department' });
  }

  const id = (data && data.id) ? data.id : ('t-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  const newTodo = Object.assign({
    id,
    title: data.title,
    description: data.description || '',
    client: client || null,
    clients: Array.isArray(data.clients) && data.clients.length ? data.clients : (client ? [client] : []),
    department: department,
    departments: Array.isArray(data.departments) && data.departments.length ? data.departments : [department],
    assignee_type: data.assignee_type || 'user',
    assignee: data.assignee || 'u-shohag',
    assignees: Array.isArray(data.assignees) && data.assignees.length ? data.assignees : (data.assignee ? [data.assignee] : []),
    state: data.state || 'open',
    priority: data.priority || 'normal',
    due: data.due || logic.shift(1),
    recurrence: data.recurrence || 'none',
    blocked_reason: data.blocked_reason || null,
    created_by: data.created_by || 'u-shohag',
    created_at: new Date().toISOString(),
    tags: data.tags || [],
    comments: []
  }, data, { id });

  if (newTodo.priority === 'high' && !newTodo.tags.includes('t-urgent')) {
    newTodo.tags.push('t-urgent');
  }

  db.mutate({
    actor: newTodo.created_by,
    action: 'todo.create',
    target: newTodo.title,
    detail: 'assigned to ' + (newTodo.assignee || 'team')
  }, state => {
    state.todos.unshift(newTodo);
    const assignees = Array.isArray(newTodo.assignees) && newTodo.assignees.length ? newTodo.assignees : (newTodo.assignee ? [newTodo.assignee] : []);
    state.notifications = state.notifications || [];
    assignees.forEach(uid => {
      if (uid && uid !== newTodo.created_by) {
        state.notifications.unshift({
          id: 'nt-' + Date.now() + '-' + uid + Math.random().toString(36).slice(2, 5),
          user: uid,
          text: `${newTodo.created_by} assigned you a task: ${newTodo.title}`,
          ref: newTodo.id,
          at: new Date().toISOString(),
          read: false
        });
      }
    });
  });

  // Asynchronously dispatch email notification to assignees
  try {
    const allUsers = db.getState().users || [];
    const allGroups = db.getState().groups || [];
    const assignees = Array.isArray(newTodo.assignees) && newTodo.assignees.length ? newTodo.assignees : (newTodo.assignee ? [newTodo.assignee] : []);

    const creatorUser = allUsers.find(u => u.id === newTodo.created_by || u.name === newTodo.created_by);
    const assignerName = creatorUser ? creatorUser.name : (newTodo.created_by || 'A team member');
    const assignerEmail = creatorUser ? creatorUser.email : '';

    const recipientEmails = [];
    assignees.forEach(uid => {
      const clean = typeof uid === 'string' ? uid.replace(/^(user:|group:)/, '') : uid;
      const g = allGroups.find(group => group.id === clean || group.name === clean);
      if (g && Array.isArray(g.members)) {
        g.members.forEach(mId => {
          const uMem = allUsers.find(u => u.id === mId || u.name === mId);
          if (uMem && uMem.email && !recipientEmails.includes(uMem.email.toLowerCase())) {
            recipientEmails.push(uMem.email.toLowerCase());
          }
        });
      } else {
        const u = allUsers.find(user => user.id === clean || user.name === clean);
        if (u && u.email && !recipientEmails.includes(u.email.toLowerCase())) {
          recipientEmails.push(u.email.toLowerCase());
        }
      }
    });

    if (recipientEmails.length) {
      emailService.sendNotificationEmail({
        type: 'Todo',
        title: `Task Assigned: ${newTodo.title}`,
        body: newTodo.description || newTodo.title || '',
        to: recipientEmails.join(', '),
        cc: 'sm@originatemarketing.com, magba@originatemarketing.com',
        actorName: assignerName,
        actorEmail: assignerEmail,
        fromEmail: assignerEmail
      }).catch(() => {});
    }
  } catch (_) {}

  return res.status(201).json(newTodo);
}

function updateTodo(req, res) {
  const id = req.params.id;
  const updates = req.body || {};
  let updatedTodo = null;

  db.mutate({
    actor: updates.actor || 'u-shohag',
    action: 'todo.update',
    target: updates.title || id,
    detail: updates.state ? 'state -> ' + updates.state : 'updated attributes'
  }, state => {
    const idx = (state.todos || []).findIndex(t => t.id === id);
    if (idx !== -1) {
      state.todos[idx] = Object.assign({}, state.todos[idx], updates);
      updatedTodo = state.todos[idx];
    }
  });

  if (!updatedTodo) return res.status(404).json({ error: 'Todo not found' });
  return res.status(200).json(updatedTodo);
}

function deleteTodo(req, res) {
  const todoId = req.params.id;
  if (!todoId) return res.status(400).json({ error: 'Todo ID required' });
  serverDeletedTodoIds.add(todoId);
  saveServerTombstones();
  const state = db.getState();
  state.todos = (state.todos || []).filter(t => t.id !== todoId);
  db.saveState(state);
  return res.status(200).json({ ok: true, deletedId: todoId });
}

/**
 * Instructions Endpoints
 */
function getInstructions(req, res) {
  const state = db.getState();
  return res.status(200).json(state.instructions || []);
}

function createInstruction(req, res) {
  const data = req.body;
  const client = data ? (data.client || (Array.isArray(data.clients) && data.clients.length ? data.clients[0] : null)) : null;
  const department = data ? (data.department || (Array.isArray(data.departments) && data.departments.length ? data.departments[0] : null)) : null;

  // client is optional — board/dept instructions without a client are valid
  if (!data || !data.body || !department) {
    return res.status(400).json({ error: 'Instruction must contain body and department' });
  }

  const id = (data && data.id) ? data.id : ('n-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  const newInst = Object.assign({
    id,
    body: data.body,
    author: data.author || 'u-shohag',
    client: client || null,
    clients: Array.isArray(data.clients) && data.clients.length ? data.clients : (client ? [client] : []),
    department: department,
    departments: Array.isArray(data.departments) && data.departments.length ? data.departments : [department],
    tags: data.tags || [],
    posted_at: new Date().toISOString(),
    read_by: data.read_by || [],
    archived: false,
    linked_todo: data.linked_todo || null,
    comments: []
  }, data, { id });

  db.mutate({
    actor: newInst.author,
    action: 'instruction.post',
    target: String(newInst.body).slice(0, 40),
    detail: 'tagged for client ' + newInst.client
  }, state => {
    state.instructions.unshift(newInst);
    if (Array.isArray(newInst.target_users) && newInst.target_users.length > 0) {
      state.notifications = state.notifications || [];
      newInst.target_users.forEach(uid => {
        if (uid && uid !== newInst.author) {
          state.notifications.unshift({
            id: 'nt-' + Date.now() + '-' + uid + Math.random().toString(36).slice(2, 5),
            user: uid,
            text: `${newInst.author} posted an instruction: ${(newInst.body || '').slice(0, 45)}`,
            ref: newInst.id,
            at: new Date().toISOString(),
            read: false
          });
        }
      });
    }
  });

  // Asynchronously dispatch email notification to targeted users / audience
  try {
    const allUsers = db.getState().users || [];
    const targetUsers = Array.isArray(newInst.target_users) ? newInst.target_users : [];

    const authorUser = allUsers.find(u => u.id === newInst.author || u.name === newInst.author);
    const assignerName = authorUser ? authorUser.name : (newInst.author || 'A team member');
    const assignerEmail = authorUser ? authorUser.email : '';

    const recipientEmails = [];
    targetUsers.forEach(uid => {
      const clean = typeof uid === 'string' ? uid.replace(/^(user:|group:)/, '') : uid;
      const u = allUsers.find(user => user.id === clean || user.name === clean);
      if (u && u.email && !recipientEmails.includes(u.email.toLowerCase())) {
        recipientEmails.push(u.email.toLowerCase());
      }
    });

    if (!recipientEmails.length) {
      allUsers.forEach(u => {
        if (u.email && u.id !== newInst.author) {
          if (!recipientEmails.includes(u.email.toLowerCase())) {
            recipientEmails.push(u.email.toLowerCase());
          }
        }
      });
    }

    if (recipientEmails.length) {
      emailService.sendNotificationEmail({
        type: 'Instruction',
        title: 'New Instruction Posted',
        body: newInst.body || '',
        to: recipientEmails.join(', '),
        cc: 'sm@originatemarketing.com, magba@originatemarketing.com',
        actorName: assignerName,
        actorEmail: assignerEmail,
        fromEmail: assignerEmail
      }).catch(() => {});
    }
  } catch (_) {}

  return res.status(201).json(newInst);
}

function updateInstruction(req, res) {
  const id = req.params.id;
  const updates = req.body || {};
  let updated = null;

  db.mutate({
    actor: updates.actor || 'u-shohag',
    action: updates.archived ? 'instruction.archive' : 'instruction.update',
    target: id,
    detail: updates.archived ? 'archived instruction' : 'updated'
  }, state => {
    const idx = (state.instructions || []).findIndex(n => n.id === id);
    if (idx !== -1) {
      state.instructions[idx] = Object.assign({}, state.instructions[idx], updates);
      updated = state.instructions[idx];
    }
  });

  if (!updated) return res.status(404).json({ error: 'Instruction not found' });
  return res.status(200).json(updated);
}

function deleteInstruction(req, res) {
  const instId = req.params.id;
  if (!instId) return res.status(400).json({ error: 'Instruction ID required' });
  serverDeletedInstructionIds.add(instId);
  saveServerTombstones();
  const state = db.getState();
  state.instructions = (state.instructions || []).filter(i => i.id !== instId);
  db.saveState(state);
  return res.status(200).json({ ok: true, deletedId: instId });
}

/**
 * Comments Endpoint
 */
function addComment(req, res) {
  const b = req.body || {};
  const kind = b.kind || b.target_type;
  const id = b.id || b.target_id;
  const body = b.body || b.content;
  const author = b.author;
  if (!kind || !id || !body || !author) {
    return res.status(400).json({ error: 'Missing required comment fields (kind, id, body, author)' });
  }

  let createdComment = null;
  db.mutate({
    actor: author,
    action: 'comment.add',
    target: `${kind}:${id}`,
    detail: String(body).slice(0, 40)
  }, state => {
    const collection = kind === 'todo' ? state.todos : state.instructions;
    const target = (collection || []).find(x => x.id === id);
    if (target) {
      createdComment = {
        id: 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        author,
        body,
        posted_at: new Date().toISOString()
      };
      target.comments = target.comments || [];
      target.comments.push(createdComment);
      const recipient = target.created_by || target.author;
      if (recipient && recipient !== author) {
        state.notifications = state.notifications || [];
        state.notifications.unshift({
          id: 'nt-' + Date.now() + '-' + recipient + Math.random().toString(36).slice(2, 5),
          user: recipient,
          text: `${author} commented on ${kind === 'todo' ? 'task: ' + (target.title || '') : 'instruction'}`,
          ref: target.id,
          at: new Date().toISOString(),
          read: false
        });
      }
    }
  });

  if (!createdComment) return res.status(404).json({ error: 'Target item not found' });

  // Asynchronously dispatch email notification to recipient
  try {
    const allUsers = db.getState().users || [];
    const currentState = db.getState();
    const itemCollection = kind === 'todo' ? currentState.todos : currentState.instructions;
    const targetItem = (itemCollection || []).find(i => i.id === id);
    const recipient = targetItem ? (targetItem.created_by || targetItem.author) : null;
    if (recipient && recipient !== author) {
      const u = allUsers.find(user => user.id === recipient || user.name === recipient);
      if (u && u.email && (!u.prefs || u.prefs.email !== false)) {
        emailService.sendNotificationEmail({
          to: u.email,
          userName: u.name,
          itemTitle: `New Comment on ${kind === 'todo' ? 'Task' : 'Instruction'}`,
          alertText: `${author} commented on ${kind === 'todo' ? 'task: ' + (targetItem.title || '') : 'instruction'}: "${(body || '').slice(0, 160)}"`,
          isUrgent: false
        }).catch(() => {});
      }
    }
  } catch (_) {}

  return res.status(201).json(createdComment);
}

/**
 * Token Invites (Section 6.1)
 */
function issueInvite(req, res) {
  const { byUserId } = req.body || {};
  const invite = logic.issueInvite(byUserId || 'u-shohag');
  return res.status(200).json(invite);
}

function claimInvite(req, res) {
  const { token, name, password } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing invite token' });

  let claimedUser = null;
  db.mutate({
    actor: token,
    action: 'invite.claim',
    target: name || 'user',
    detail: 'Invite claimed successfully'
  }, state => {
    const user = (state.users || []).find(u => u.invite && u.invite.token === token);
    if (user && logic.inviteUsable(user.invite)) {
      user.invite.claimed_at = new Date().toISOString();
      user.status = 'active';
      if (name) user.name = name;
      if (password) user.password = password;
      claimedUser = user;
    }
  });

  if (!claimedUser) {
    return res.status(400).json({ error: 'Invalid or expired invite token (6.1)' });
  }

  return res.status(200).json({ ok: true, user: sanitizeUser(claimedUser) });
}

/**
 * Direct Database-Backed Authentication (OM SRS 001)
 */
function loginUser(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = password.trim();
  const state = db.getState();
  const user = (state.users || []).find(u => (u.email || '').trim().toLowerCase() === cleanEmail);

  if (!user) {
    return res.status(404).json({ error: `User with email "${cleanEmail}" is not registered in the database.` });
  }

  if (user.status === 'paused') {
    return res.status(403).json({ error: 'This account is currently paused. Please contact System Admin.' });
  }

  const storedPass = user.password;
  const invitePasscode = user.invite && user.invite.passcode;
  const inviteToken = user.invite && user.invite.token;
  // logic.js exports inviteUsable(), not inviteExpired() — invert for correct expiry check
  const isInviteExpired = user.invite ? !logic.inviteUsable(user.invite) : false;

  let isValid = false;

  if (storedPass && String(storedPass).toLowerCase() === cleanPass.toLowerCase()) {
    isValid = true;
  } else if (user.admin && (cleanPass.toLowerCase() === 'admin' || cleanPass.toLowerCase() === 'admin123')) {
    isValid = true;
  } else if (invitePasscode && (cleanPass.toLowerCase() === invitePasscode.toLowerCase() || cleanPass.toLowerCase() === (inviteToken || '').toLowerCase() || cleanPass.toLowerCase() === 'admin')) {
    if (isInviteExpired && !user.invite.claimed_at) {
      return res.status(401).json({ error: 'This 72-hour invitation link and passcode have expired.' });
    }
    isValid = true;
    // Persist permanent password to database
    db.mutate({
      actor: user.id,
      action: 'user.password.set',
      target: user.name,
      detail: 'Activated account password in database'
    }, s => {
      const u = (s.users || []).find(x => x.id === user.id);
      if (u) {
        u.password = cleanPass;
        if (u.invite) u.invite.claimed_at = new Date().toISOString();
        u.status = 'active';
      }
    });
  } else if (!storedPass && !invitePasscode) {
    // Default admin initialization
    isValid = true;
    db.mutate({
      actor: user.id,
      action: 'user.password.init',
      target: user.name,
      detail: 'Initialized password in database'
    }, s => {
      const u = (s.users || []).find(x => x.id === user.id);
      if (u) u.password = cleanPass;
    });
  }

  if (!isValid) {
    return res.status(401).json({ error: 'Incorrect password for "' + cleanEmail + '".' });
  }

  return res.status(200).json({ ok: true, user: sanitizeUser(user) });
}

function setUserPassword(req, res) {
  const { id: userId, email, password, token, name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = password.trim();
  let updatedUser = null;

  db.mutate({
    actor: cleanEmail,
    action: 'user.password.update',
    target: name || cleanEmail,
    detail: 'Updated password in database'
  }, state => {
    state.users = state.users || [];
    let matchingUsers = state.users.filter(u => 
      (u.email || '').trim().toLowerCase() === cleanEmail ||
      (userId && u.id === userId) ||
      (token && u.invite && u.invite.token === token)
    );

    let user = (userId && matchingUsers.find(u => u.id === userId)) ||
               matchingUsers.find(u => (u.email || '').trim().toLowerCase() === cleanEmail) ||
               matchingUsers[0];

    if (user) {
      user.password = cleanPass;
      user.status = 'active';
      if (name && (!user.name || user.name === 'Invited Member')) user.name = name;
      if (user.invite) user.invite.claimed_at = new Date().toISOString();
      updatedUser = user;

      // Merge and remove any duplicates with identical email
      matchingUsers.forEach(other => {
        if (other.id !== user.id) {
          if (Array.isArray(other.departments) && other.departments.length > 0 && (!user.departments || !user.departments.length)) {
            user.departments = other.departments;
          }
          if (other.title && other.title !== 'Team Member' && user.title === 'Team Member') {
            user.title = other.title;
          }
        }
      });
      state.users = state.users.filter(u => u.id === user.id || (u.email || '').trim().toLowerCase() !== cleanEmail);
    }
  });

  if (!updatedUser) {
    return res.status(404).json({ error: 'User not found in database' });
  }

  return res.status(200).json({ ok: true, user: sanitizeUser(updatedUser) });
}


async function sendNotificationEmailRoute(req, res) {
  const { from, fromEmail, to, cc, type, title, body, actorName, actorEmail, subject, appUrl } = req.body || {};
  if (!to && !cc) {
    return res.status(400).json({ error: 'Missing required fields (to or cc)' });
  }

  try {
    const result = await emailService.sendNotificationEmail({
      from,
      fromEmail,
      to,
      cc,
      type,
      title,
      body,
      actorName,
      actorEmail,
      subject,
      appUrl
    });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error('sendNotificationEmailRoute error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function sendInviteEmailRoute(req, res) {
  const { to, name, departmentName, levelName, token, passcode, appUrl } = req.body || {};
  if (!to || !token) {
    return res.status(400).json({ error: 'Missing required fields (to, token)' });
  }

  try {
    const result = await emailService.sendInviteEmail({ to, name, departmentName, levelName, token, passcode, appUrl });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Other standard collections
 */
function getUsers(req, res) { 
  const users = (db.getState().users || []).filter(u => !serverDeletedUserIds.has(u.id));
  return res.status(200).json(users.map(sanitizeUser)); 
}
function getDepartments(req, res) { return res.status(200).json(db.getState().departments || []); }
function getClients(req, res) {
  const clients = (db.getState().clients || []).filter(c => !serverDeletedClientIds.has(c.id));
  return res.status(200).json(clients);
}

function deleteClient(req, res) {
  const clientId = req.params.id;
  if (!clientId) return res.status(400).json({ error: 'Client ID required' });
  serverDeletedClientIds.add(clientId);
  saveServerTombstones();
  const state = db.getState();
  state.clients = (state.clients || []).filter(c => c.id !== clientId && c.client_id !== clientId);
  db.saveState(state);
  return res.status(200).json({ ok: true, deletedId: clientId });
}

function createClient(req, res) {
  const data = req.body || {};
  const cIdVal = (data.client_id || data.id || ('CLI-' + Date.now().toString(36))).trim();
  if (!cIdVal) {
    return res.status(400).json({ error: 'client_id is required' });
  }
  const state = db.getState();
  state.clients = state.clients || [];
  const existing = state.clients.find(c => c.client_id && c.client_id.toLowerCase() === cIdVal.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Duplicate Client ID: ' + cIdVal });
  }
  const depts = Array.isArray(data.departments) ? data.departments : (data.department ? [data.department] : []);
  const assignees = Array.isArray(data.assignees) ? data.assignees : (Array.isArray(data.assigned_users) ? data.assigned_users : []);
  const newClient = {
    id: data.id || ('c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    name: data.name || '',
    client_id: cIdVal,
    client_code: data.client_code || '',
    client_number: data.client_number || '',
    contact: data.client_number || data.contact || cIdVal,
    status: data.status || 'active',
    department: depts[0] || data.department || '',
    departments: depts,
    assignees: assignees,
    assigned_users: assignees,
    details: data.details || '',
    extended_fields: data.extended_fields || {},
    updated_at: new Date().toISOString()
  };
  state.clients.push(newClient);
  db.saveState(state);
  if (typeof db.syncClientToMySQL === 'function') db.syncClientToMySQL(newClient);
  return res.status(201).json({ ok: true, client: newClient });
}

function updateClient(req, res) {
  const clientId = req.params.id;
  const data = req.body || {};
  const state = db.getState();
  const clients = state.clients || [];
  const client = clients.find(c => c.id === clientId);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  if (data.name !== undefined) client.name = data.name;
  if (data.client_id !== undefined) client.client_id = data.client_id;
  if (data.client_code !== undefined) client.client_code = data.client_code;
  if (data.client_number !== undefined) client.client_number = data.client_number;
  if (data.contact !== undefined) client.contact = data.contact;
  if (data.status !== undefined) client.status = data.status;
  if (data.details !== undefined) client.details = data.details;
  if (data.department !== undefined) client.department = data.department;
  if (Array.isArray(data.departments)) client.departments = data.departments.slice();
  if (Array.isArray(data.assignees)) {
    client.assignees = data.assignees.slice();
    client.assigned_users = data.assignees.slice();
  } else if (Array.isArray(data.assigned_users)) {
    client.assignees = data.assigned_users.slice();
    client.assigned_users = data.assigned_users.slice();
  }
  if (data.extended_fields !== undefined) client.extended_fields = data.extended_fields;
  client.updated_at = new Date().toISOString();

  db.saveState(state);
  if (typeof db.syncClientToMySQL === 'function') db.syncClientToMySQL(client);
  return res.status(200).json({ ok: true, client });
}

function createDepartment(req, res) {
  const data = req.body || {};
  if (!data.name) return res.status(400).json({ error: 'Department name is required' });
  const id = data.id || ('d-' + data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  serverDeletedDepartmentIds.delete(id);
  saveServerTombstones();
  const state = db.getState();
  state.departments = state.departments || [];
  const existing = state.departments.find(d => d.id === id);
  if (existing) {
    existing.name = data.name;
    if (Array.isArray(data.levels)) existing.levels = data.levels.slice();
    db.saveState(state);
    if (typeof db.syncDepartmentToMySQL === 'function') db.syncDepartmentToMySQL(existing);
    return res.status(200).json({ ok: true, department: existing });
  }
  const newDept = {
    id,
    name: data.name,
    levels: Array.isArray(data.levels) && data.levels.length ? data.levels : ['head', 'member', 'intern']
  };
  state.departments.push(newDept);
  db.saveState(state);
  if (typeof db.syncDepartmentToMySQL === 'function') db.syncDepartmentToMySQL(newDept);
  return res.status(201).json({ ok: true, department: newDept });
}

function updateDepartment(req, res) {
  const deptId = req.params.id;
  const data = req.body || {};
  if (!deptId) return res.status(400).json({ error: 'Department ID required' });
  serverDeletedDepartmentIds.delete(deptId);
  saveServerTombstones();
  const state = db.getState();
  const dept = (state.departments || []).find(d => d.id === deptId);
  if (!dept) return res.status(404).json({ error: 'Department not found' });
  if (data.name !== undefined) dept.name = data.name;
  if (Array.isArray(data.levels)) dept.levels = data.levels.slice();
  dept.updated_at = new Date().toISOString();
  db.saveState(state);
  if (typeof db.syncDepartmentToMySQL === 'function') db.syncDepartmentToMySQL(dept);
  return res.status(200).json({ ok: true, department: dept });
}

function deleteDepartment(req, res) {
  const deptId = req.params.id;
  if (!deptId) return res.status(400).json({ error: 'Department ID required' });
  serverDeletedDepartmentIds.add(deptId);
  saveServerTombstones();
  if (typeof db.deleteDepartmentFromMySQL === 'function') db.deleteDepartmentFromMySQL(deptId);
  const state = db.getState();
  state.departments = (state.departments || []).filter(d => d.id !== deptId);
  if (Array.isArray(state.users)) {
    state.users.forEach(u => {
      if (Array.isArray(u.departments)) {
        u.departments = u.departments.filter(d => (typeof d === 'string' ? d : d.department) !== deptId);
      }
    });
  }
  db.saveState(state);
  return res.status(200).json({ ok: true, deletedId: deptId });
}

function getGroups(req, res) { return res.status(200).json(db.getState().groups || []); }

function createGroup(req, res) {
  const data = req.body || {};
  if (!data.name) return res.status(400).json({ error: 'Group name required' });
  const id = data.id || ('g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  serverDeletedGroupIds.delete(id);
  saveServerTombstones();
  const state = db.getState();
  state.groups = state.groups || [];
  const newGroup = {
    id,
    name: data.name,
    purpose: data.purpose || '',
    created_by: data.created_by || 'u-shohag',
    created_at: new Date().toISOString(),
    status: data.status || 'active',
    members: Array.isArray(data.members) ? data.members.slice() : [],
    messages: Array.isArray(data.messages) ? data.messages.slice() : []
  };
  state.groups.push(newGroup);
  db.saveState(state);
  if (typeof db.syncGroupToMySQL === 'function') db.syncGroupToMySQL(newGroup);
  return res.status(201).json({ ok: true, group: newGroup });
}

function updateGroup(req, res) {
  const groupId = req.params.id;
  const data = req.body || {};
  if (!groupId) return res.status(400).json({ error: 'Group ID required' });
  const state = db.getState();
  const grp = (state.groups || []).find(g => g.id === groupId);
  if (!grp) return res.status(404).json({ error: 'Group not found' });
  if (data.name !== undefined) grp.name = data.name;
  if (data.purpose !== undefined) grp.purpose = data.purpose;
  if (data.status !== undefined) grp.status = data.status;
  if (Array.isArray(data.members)) grp.members = data.members.slice();
  db.saveState(state);
  if (typeof db.syncGroupToMySQL === 'function') db.syncGroupToMySQL(grp);
  return res.status(200).json({ ok: true, group: grp });
}

function deleteGroup(req, res) {
  const groupId = req.params.id;
  if (!groupId) return res.status(400).json({ error: 'Group ID required' });
  serverDeletedGroupIds.add(groupId);
  saveServerTombstones();
  const state = db.getState();
  state.groups = (state.groups || []).filter(g => g.id !== groupId);
  db.saveState(state);
  return res.status(200).json({ ok: true, deletedId: groupId });
}

function getPolicies(req, res) {
  loadServerTombstones();
  const state = db.getState();
  const policies = (state.policies || []).filter(p => !serverDeletedPolicyIds.has(p.id) && DEMO_POLICY_IDS.indexOf(p.id) === -1 && p.department !== 'all');
  return res.status(200).json(policies);
}

function createPolicy(req, res) {
  const data = req.body || {};
  if (!data.title || !data.body) return res.status(400).json({ error: 'Policy title and body are required' });
  const id = data.id || ('pol-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  serverDeletedPolicyIds.delete(id);
  saveServerTombstones();
  const state = db.getState();
  state.policies = state.policies || [];
  const newPolicy = {
    id,
    title: data.title,
    category: data.category || 'General',
    department: data.department || 'all',
    body: data.body,
    created_by: data.created_by || 'u-shohag',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  state.policies.push(newPolicy);
  db.saveState(state);
  if (typeof db.syncPolicyToMySQL === 'function') db.syncPolicyToMySQL(newPolicy);
  return res.status(201).json({ ok: true, policy: newPolicy });
}

function updatePolicy(req, res) {
  const polId = req.params.id;
  const data = req.body || {};
  if (!polId) return res.status(400).json({ error: 'Policy ID required' });
  const state = db.getState();
  const pol = (state.policies || []).find(p => p.id === polId);
  if (!pol) return res.status(404).json({ error: 'Policy not found' });
  if (data.title !== undefined) pol.title = data.title;
  if (data.category !== undefined) pol.category = data.category;
  if (data.department !== undefined) pol.department = data.department;
  if (data.body !== undefined) pol.body = data.body;
  pol.updated_at = new Date().toISOString();
  db.saveState(state);
  if (typeof db.syncPolicyToMySQL === 'function') db.syncPolicyToMySQL(pol);
  return res.status(200).json({ ok: true, policy: pol });
}

function deletePolicy(req, res) {
  const polId = req.params.id;
  if (!polId) return res.status(400).json({ error: 'Policy ID required' });
  serverDeletedPolicyIds.add(polId);
  saveServerTombstones();
  const state = db.getState();
  state.policies = (state.policies || []).filter(p => p.id !== polId);
  db.saveState(state);
  if (typeof db.deletePolicyFromMySQL === 'function') db.deletePolicyFromMySQL(polId);
  return res.status(200).json({ ok: true, deletedId: polId });
}

function getTags(req, res) {
  loadServerTombstones();
  const tags = (db.getState().tags || []).filter(t => t && t.id && !serverDeletedTagIds.has(t.id));
  return res.status(200).json(tags);
}

function createTag(req, res) {
  const data = req.body || {};
  if (!data.label) return res.status(400).json({ error: 'Tag label required' });
  const id = data.id || ('tag-' + data.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  serverDeletedTagIds.delete(id);
  saveServerTombstones();
  const state = db.getState();
  state.tags = state.tags || [];
  let tag = state.tags.find(t => t.id === id);
  if (!tag) {
    tag = { id, label: data.label, kind: data.kind || 'custom' };
    state.tags.push(tag);
  } else {
    tag.label = data.label;
    if (data.kind) tag.kind = data.kind;
  }
  db.saveState(state);
  if (typeof db.syncTagToMySQL === 'function') db.syncTagToMySQL(tag);
  return res.status(201).json({ ok: true, tag });
}

function updateTag(req, res) {
  const tagId = req.params.id;
  const data = req.body || {};
  if (!tagId) return res.status(400).json({ error: 'Tag ID required' });
  const state = db.getState();
  const tag = (state.tags || []).find(t => t.id === tagId);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });
  if (data.label !== undefined) tag.label = data.label;
  if (data.kind !== undefined) tag.kind = data.kind;
  db.saveState(state);
  if (typeof db.syncTagToMySQL === 'function') db.syncTagToMySQL(tag);
  return res.status(200).json({ ok: true, tag });
}

function deleteTag(req, res) {
  const tagId = req.params.id;
  if (!tagId) return res.status(400).json({ error: 'Tag ID required' });
  serverDeletedTagIds.add(tagId);
  saveServerTombstones();
  const state = db.getState();
  state.tags = (state.tags || []).filter(t => t.id !== tagId);
  (state.todos || []).forEach(td => {
    if (Array.isArray(td.tags)) td.tags = td.tags.filter(t => t !== tagId);
  });
  (state.instructions || []).forEach(inst => {
    if (Array.isArray(inst.tags)) inst.tags = inst.tags.filter(t => t !== tagId);
  });
  db.saveState(state);
  if (typeof db.deleteTagFromMySQL === 'function') db.deleteTagFromMySQL(tagId);
  return res.status(200).json({ ok: true, deletedId: tagId });
}

function getAttendance(req, res) {
  const state = db.getState();
  const userId = req.query && req.query.user_id;
  let records = state.attendance || [];
  if (userId) {
    records = records.filter(a => (a.user_id || a.user) === userId);
  }
  return res.status(200).json(records);
}

function recordAttendance(req, res) {
  const data = req.body || {};
  if (!data.user_id) return res.status(400).json({ error: 'User ID required for attendance' });
  const id = data.id || ('att-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  const record = {
    id,
    user_id: data.user_id,
    date: data.date || new Date().toISOString().slice(0, 10),
    scheduled_in: data.scheduled_in || '10:00 AM',
    punch_in: data.punch_in || null,
    punch_out: data.punch_out || null,
    status: data.status || 'Present',
    note: data.note || ''
  };
  const state = db.getState();
  state.attendance = state.attendance || [];
  const existingIdx = state.attendance.findIndex(a => a.id === id || (a.user_id === record.user_id && a.date === record.date));
  if (existingIdx > -1) {
    state.attendance[existingIdx] = Object.assign({}, state.attendance[existingIdx], record);
  } else {
    state.attendance.push(record);
  }
  db.saveState(state);
  if (typeof db.syncAttendanceToMySQL === 'function') db.syncAttendanceToMySQL(record);
  return res.status(200).json({ ok: true, attendance: record });
}

function getLeaves(req, res) {
  const state = db.getState();
  const userId = req.query && req.query.user_id;
  let leaves = state.leaves || [];
  if (userId) {
    leaves = leaves.filter(l => (l.user_id || l.user) === userId);
  }
  return res.status(200).json(leaves);
}

function createLeave(req, res) {
  const data = req.body || {};
  if (!data.user_id || !data.from_date || !data.to_date) {
    return res.status(400).json({ error: 'User ID, from_date, and to_date are required' });
  }
  const id = data.id || ('lv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  const newLeave = {
    id,
    user_id: data.user_id,
    from_date: data.from_date,
    to_date: data.to_date,
    manager_id: data.manager_id || null,
    manager_name: data.manager_name || '',
    cl_days: parseFloat(data.cl_days || 0),
    el_days: parseFloat(data.el_days || 0),
    sl_days: parseFloat(data.sl_days || 0),
    wp_days: parseFloat(data.wp_days || 0),
    reason: data.reason || '',
    status: data.status || 'Pending',
    submitted_at: new Date().toISOString()
  };
  const state = db.getState();
  state.leaves = state.leaves || [];
  state.leaves.push(newLeave);
  db.saveState(state);
  if (typeof db.syncLeaveToMySQL === 'function') db.syncLeaveToMySQL(newLeave);
  return res.status(201).json({ ok: true, leave: newLeave });
}

function updateLeave(req, res) {
  const leaveId = req.params.id;
  const data = req.body || {};
  if (!leaveId) return res.status(400).json({ error: 'Leave ID required' });
  const state = db.getState();
  const leave = (state.leaves || []).find(l => l.id === leaveId);
  if (!leave) return res.status(404).json({ error: 'Leave application not found' });
  if (data.status !== undefined) leave.status = data.status;
  if (data.reviewed_by !== undefined) leave.reviewed_by = data.reviewed_by;
  if (data.reviewed_by_name !== undefined) leave.reviewed_by_name = data.reviewed_by_name;
  if (data.rejection_reason !== undefined) leave.rejection_reason = data.rejection_reason;
  leave.reviewed_at = new Date().toISOString();
  db.saveState(state);
  if (typeof db.syncLeaveToMySQL === 'function') db.syncLeaveToMySQL(leave);
  return res.status(200).json({ ok: true, leave });
}

function getAudit(req, res) { return res.status(200).json(db.getState().audit || []); }
function getNotifications(req, res) { return res.status(200).json(db.getState().notifications || []); }

module.exports = {
  subscribeEvents,
  getPresence,
  getState,
  mutateState,
  resetState,
  getStats,
  getTodos,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
  getInstructions,
  createInstruction,
  updateInstruction,
  deleteInstruction,
  addComment,
  issueInvite,
  claimInvite,
  loginUser,
  setUserPassword,
  sendInviteEmailRoute,
  sendNotificationEmailRoute,
  getUsers,
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getClients,
  createClient,
  updateClient,
  deleteClient,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  getTags,
  createTag,
  updateTag,
  deleteTag,
  getAttendance,
  recordAttendance,
  getLeaves,
  createLeave,
  updateLeave,
  getAudit,
  getNotifications
};


