/* =========================================================================
   store.js — Data layer with Manual Server Sync & LocalStorage Fallback
   Owns every entity in section 5.0 of the OM SRS 001 specification:
   - Seeds a realistic dataset on first run
   - Synchronizes with dev3 manual API server (/api/*) in real-time
   - Auto-refreshes every 2 seconds (2000ms) with network auto-reconnect
   - Fallback to localStorage for offline resilience
   - Every write goes through mutate(), which stamps the audit log (5.1)
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.store = (function () {
  'use strict';

  var KEY = 'oc-state-v2';
  var SESSION_KEY = 'oc-session-v2';
  var state = null;
  var listeners = [];
  var sseSource = null;
  /* Tombstones: IDs deleted so syncWithServer never re-adds them from stale state */
  var _deletedGroupIds = {};
  try {
    var storedDelGroups = (typeof localStorage !== 'undefined') ? localStorage.getItem('oc_deleted_groups') : null;
    if (storedDelGroups) {
      _deletedGroupIds = JSON.parse(storedDelGroups) || {};
    }
  } catch (_) {}
  var _deletedClientIds = {};
  try {
    var storedDelClients = (typeof localStorage !== 'undefined') ? localStorage.getItem('oc_deleted_clients') : null;
    if (storedDelClients) {
      _deletedClientIds = JSON.parse(storedDelClients) || {};
    }
  } catch (_) {}
  var _deletedTodoIds = {};
  try {
    var storedDelTodos = (typeof localStorage !== 'undefined') ? localStorage.getItem('oc_deleted_todos') : null;
    if (storedDelTodos) {
      _deletedTodoIds = JSON.parse(storedDelTodos) || {};
    }
  } catch (_) {}
  var _deletedInstructionIds = {};
  try {
    var storedDelIns = (typeof localStorage !== 'undefined') ? localStorage.getItem('oc_deleted_instructions') : null;
    if (storedDelIns) {
      _deletedInstructionIds = JSON.parse(storedDelIns) || {};
    }
  } catch (_) {}
  var _deletedUserIds = {};
  try {
    var storedDelUsers = (typeof localStorage !== 'undefined') ? localStorage.getItem('oc_deleted_users') : null;
    if (storedDelUsers) {
      _deletedUserIds = JSON.parse(storedDelUsers) || {};
    }
  } catch (_) {}
  var _deletedDepartmentIds = {};
  try {
    var storedDelDepts = (typeof localStorage !== 'undefined') ? localStorage.getItem('oc_deleted_departments') : null;
    if (storedDelDepts) {
      _deletedDepartmentIds = JSON.parse(storedDelDepts) || {};
    }
  } catch (_) {}
  var DEMO_POLICY_IDS = [
    'pol-web-qa', 'pol-web-git', 'pol-admin-punch', 'pol-admin-leave',
    'pol-bizops-sla', 'pol-leadgen-quality', 'pol-outreach-compliance', 'pol-social-brand',
    'pol-conduct', 'pol-confidentiality', 'pol-transparency'
  ];
  var _deletedPolicyIds = {};
  try {
    var storedDelPolicies = (typeof localStorage !== 'undefined') ? (localStorage.getItem('oc_deleted_policies') || localStorage.getItem('oc_deleted_policy_ids')) : null;
    if (storedDelPolicies) {
      _deletedPolicyIds = JSON.parse(storedDelPolicies) || {};
    }
  } catch (_) {}
  DEMO_POLICY_IDS.forEach(function (id) { _deletedPolicyIds[id] = true; });

  var _deletedTagIds = {};
  try {
    var storedDelTags = (typeof localStorage !== 'undefined') ? localStorage.getItem('oc_deleted_tags') : null;
    if (storedDelTags) {
      _deletedTagIds = JSON.parse(storedDelTags) || {};
    }
  } catch (_) {}

  /* Track recent local creations/updates to protect active edits from being clobbered by background polling */
  var _recentClientUpdates = {};
  var _recentClientCreations = {};
  var _recentTodoUpdates = {};
  var _recentTodoCreations = {};
  var _recentInstructionUpdates = {};
  var _recentInstructionCreations = {};
  var _recentUserUpdates = {};
  var _recentGroupCreations = {};
  var _recentTagUpdates = {};
  var _recentTagCreations = {};

  /* Presence: array of user IDs currently connected to the server */
  var _onlineUserIds = [];

  function getSessionId() {
    try {
      var id = localStorage.getItem(SESSION_KEY);
      if (id && state && byId(state.users, id)) return id;
    } catch (e) {}
    return 'u-shohag';
  }

  function markGroupDeleted(id) {
    if (!id) return;
    _deletedGroupIds[id] = true;
    delete _recentGroupCreations[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_groups', JSON.stringify(_deletedGroupIds));
      }
    } catch (_) {}
  }

  function trackGroupCreated(id) {
    if (!id) return;
    _recentGroupCreations[id] = Date.now();
    delete _deletedGroupIds[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_groups', JSON.stringify(_deletedGroupIds));
      }
    } catch (_) {}
  }

  function markClientDeleted(id) {
    if (!id) return;
    _deletedClientIds[id] = true;
    delete _recentClientCreations[id];
    delete _recentClientUpdates[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_clients', JSON.stringify(_deletedClientIds));
      }
    } catch (_) {}
  }

  function trackClientCreated(id) {
    if (!id) return;
    _recentClientCreations[id] = Date.now();
    delete _deletedClientIds[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_clients', JSON.stringify(_deletedClientIds));
      }
    } catch (_) {}
  }

  function markTodoDeleted(id) {
    if (!id) return;
    _deletedTodoIds[id] = true;
    delete _recentTodoCreations[id];
    delete _recentTodoUpdates[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_todos', JSON.stringify(_deletedTodoIds));
      }
    } catch (_) {}
  }

  function trackTodoCreated(id) {
    if (!id) return;
    _recentTodoCreations[id] = Date.now();
    delete _deletedTodoIds[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_todos', JSON.stringify(_deletedTodoIds));
      }
    } catch (_) {}
  }

  function markInstructionDeleted(id) {
    if (!id) return;
    _deletedInstructionIds[id] = true;
    delete _recentInstructionCreations[id];
    delete _recentInstructionUpdates[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_instructions', JSON.stringify(_deletedInstructionIds));
      }
    } catch (_) {}
  }

  function trackInstructionCreated(id) {
    if (!id) return;
    _recentInstructionCreations[id] = Date.now();
    delete _deletedInstructionIds[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_instructions', JSON.stringify(_deletedInstructionIds));
      }
    } catch (_) {}
  }

  function markUserDeleted(id) {
    if (!id) return;
    _deletedUserIds[id] = true;
    delete _recentUserUpdates[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_users', JSON.stringify(_deletedUserIds));
      }
    } catch (_) {}
  }

  function markDepartmentDeleted(id) {
    if (!id) return;
    _deletedDepartmentIds[id] = true;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_departments', JSON.stringify(_deletedDepartmentIds));
      }
    } catch (_) {}
  }

  function markPolicyDeleted(id) {
    if (!id) return;
    _deletedPolicyIds[id] = true;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_policies', JSON.stringify(_deletedPolicyIds));
        localStorage.setItem('oc_deleted_policy_ids', JSON.stringify(_deletedPolicyIds));
      }
    } catch (_) {}
  }

  function unmarkPolicyDeleted(id) {
    if (!id) return;
    delete _deletedPolicyIds[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_policies', JSON.stringify(_deletedPolicyIds));
        localStorage.setItem('oc_deleted_policy_ids', JSON.stringify(_deletedPolicyIds));
      }
    } catch (_) {}
  }

  function markTagDeleted(id) {
    if (!id) return;
    _deletedTagIds[id] = true;
    delete _recentTagCreations[id];
    delete _recentTagUpdates[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_tags', JSON.stringify(_deletedTagIds));
      }
    } catch (_) {}
  }

  function trackTagCreated(id) {
    if (!id) return;
    _recentTagCreations[id] = Date.now();
    delete _deletedTagIds[id];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('oc_deleted_tags', JSON.stringify(_deletedTagIds));
      }
    } catch (_) {}
  }

  /* ---- date helpers ---------------------------------------------------- */
  function iso(d) { return d.toISOString().slice(0, 10); }
  function shift(days) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return iso(d);
  }
  function stamp(daysAgo, hour) {
    var d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour || 10, 5, 0, 0);
    return d.toISOString();
  }

  /* ---- seed (5.0) ------------------------------------------------------ */
  function seed() {
    var departments = [
      { id: 'd-admin',    name: 'Admin & HR',              levels: ['head', 'member', 'intern'] },
      { id: 'd-bizops',   name: 'Business Operations',     levels: ['head', 'member', 'intern'] },
      { id: 'd-leadgen',  name: 'Lead Generation',         levels: ['head', 'member', 'intern'] },
      { id: 'd-outreach', name: 'Outreach Operations',     levels: ['head', 'member', 'intern'] },
      { id: 'd-social',   name: 'Social Media Management', levels: ['head', 'member', 'intern'] },
      { id: 'd-web',      name: 'Development Operations',  levels: ['head', 'member', 'intern'] }
    ];

    var users = [
      {
        id: 'u-shohag',
        name: 'Shohag Munshe',
        email: 'sm@originatemarketing.com',
        title: 'Founder & System Admin',
        admin: true,
        departments: [],
        status: 'active',
        password: null,
        prefs: { push: true, email: true, discord: true },
        invite: null
      },
      {
        id: 'u-fuad',
        name: 'Abdullah al Fuad',
        email: 'fuadkalaroa2002@gmail.com',
        title: 'System Admin',
        admin: true,
        departments: [],
        status: 'active',
        password: null,
        prefs: { push: true, email: true, discord: true },
        invite: null
      },
      {
        id: 'u-magba',
        name: 'Magba',
        email: 'magba@originatemarketing.com',
        title: 'System Admin',
        admin: true,
        departments: [],
        status: 'active',
        password: null,
        prefs: { push: true, email: true, discord: false },
        invite: null
      }
    ];

    var clients = [];
    /* No seed/demo tags — tags are managed by System Admin via Management → Tags. */
    var tags = [];

    var groups = [];
    var todos = [];
    var instructions = [];

    return {
      version: 1,
      seeded_at: new Date().toISOString(),
      departments: departments,
      users: users,
      clients: clients,
      tags: tags,
      groups: groups,
      todos: todos,
      instructions: instructions,
      policies: [],
      notifications: [],
      attendance: [],
      leaves: [],
      audit: [
        {
          id: 'a-1',
          actor: 'u-shohag',
          ip: '127.0.0.1',
          action: 'system.init',
          target: 'ORIGINATE MARKETING',
          detail: 'Clean workspace initialized for production with System Admin.',
          at: new Date().toISOString()
        }
      ],
      saved_filters: [],
      extended_info_fields: [],
      card_extended_fields: [],
      portal_extended_fields: []
    };
  }

  /* ---- persistence ----------------------------------------------------- */
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  /* ---- Manual Server API Sync & Auto-Refresh (Every 5s) ---------------- */
  function isHttp() {
    if (typeof window === 'undefined' || !window.location) return false;
    return window.location.protocol === 'http:' || window.location.protocol === 'https:' || window.location.protocol === 'file:';
  }

  var dynamicApiUrl = null;
  var lastConfigFetchTime = 0;

  function autoDiscoverApiUrl() {
    if (typeof window === 'undefined' || !window.location) return;
    var host = window.location.hostname;
    var port = window.location.port;
    if (port === '7000' || port === '7001' || port === '7002' || host === 'localhost' || host === '127.0.0.1' || window.location.protocol === 'file:') return;
    if (Date.now() - lastConfigFetchTime < 5000) return;
    lastConfigFetchTime = Date.now();

    var urlsToTry = [
      'assets/config.js?t=' + Date.now(),
      'https://raw.githubusercontent.com/Fuad2e3/Originate-Command/main/assets/config.js?t=' + Date.now()
    ];

    function tryNext(i) {
      if (i >= urlsToTry.length) return;
      fetch(urlsToTry[i], { cache: 'no-store' })
        .then(function (res) { return res.text(); })
        .then(function (text) {
          var match = text.match(/API_URL:\s*"([^"]+)"/);
          if (match && match[1] && match[1].indexOf('http') === 0) {
            var newUrl = match[1].trim();
            if (!dynamicApiUrl || dynamicApiUrl !== newUrl) {
              dynamicApiUrl = newUrl;
              window.OC_CONFIG = window.OC_CONFIG || {};
              window.OC_CONFIG.API_URL = newUrl;
              window.LGS_CONFIG = window.OC_CONFIG;
              console.log('🔄 [store] Connected to active Cloudflare Tunnel API:', newUrl);
              isSyncInProgress = false;
              syncWithServer();
            }
          }
        })
        .catch(function () {
          tryNext(i + 1);
        });
    }

    tryNext(0);
  }

  function getApiUrl(endpoint) {
    if (typeof window === 'undefined' || !window.location) return endpoint;
    var host = window.location.hostname;
    var port = window.location.port;
    // If running directly on the backend load balancer or worker ports, use relative URL
    if (port === '7000' || port === '7001' || port === '7002') {
      return endpoint;
    }
    // If running on local server directly (e.g. VS Code Live Server on port 5500), route to port 7000
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://' + host + ':7000' + endpoint;
    }
    // If opened directly from file system
    if (window.location.protocol === 'file:') {
      return 'http://127.0.0.1:7000' + endpoint;
    }
    // Prioritize configured API URL from assets/config.js (e.g. https://api.originateteam.com)
    var cfg = window.OC_CONFIG || window.LGS_CONFIG;
    if (cfg && cfg.API_URL && cfg.API_URL.indexOf('http') === 0) {
      return cfg.API_URL.replace(/\/+$/, '') + endpoint;
    }
    // If we resolved a dynamic API URL from fresh config, prioritize it
    if (dynamicApiUrl && dynamicApiUrl.indexOf('http') === 0) {
      return dynamicApiUrl.replace(/\/+$/, '') + endpoint;
    }
    return (host ? 'http://' + host + ':7000' : 'http://127.0.0.1:7000') + endpoint;
  }
  var isSyncInProgress = false;
  var isMutationInProgress = false;
  var lastLocalMutationTime = 0;

  function hasMeaningfulDataChanged(prev, next) {
    if (!prev || !next) return true;

    // 1. Todos
    var pT = prev.todos || [];
    var nT = next.todos || [];
    if (pT.length !== nT.length) return true;
    var prevTodoMap = {};
    for (var ti = 0; ti < pT.length; ti++) {
      if (pT[ti] && pT[ti].id) prevTodoMap[pT[ti].id] = pT[ti];
    }
    for (var i = 0; i < nT.length; i++) {
      var b = nT[i];
      if (!b || !b.id) continue;
      var a = prevTodoMap[b.id];
      if (!a) return true;
      if (a.state !== b.state || a.assignee !== b.assignee || a.due !== b.due || a.archived !== b.archived || a.title !== b.title
          || (a.comments || []).length !== (b.comments || []).length
          || (Array.isArray(a.tags) ? a.tags.join(',') : '') !== (Array.isArray(b.tags) ? b.tags.join(',') : '')
          || (Array.isArray(a.assignees) ? a.assignees.join(',') : '') !== (Array.isArray(b.assignees) ? b.assignees.join(',') : '')) return true;
    }

    // 2. Notifications
    var pN = prev.notifications || [];
    var nN = next.notifications || [];
    if (pN.length !== nN.length) return true;
    var prevNotifMap = {};
    for (var ni = 0; ni < pN.length; ni++) {
      if (pN[ni] && pN[ni].id) prevNotifMap[pN[ni].id] = pN[ni];
    }
    for (var j = 0; j < nN.length; j++) {
      var nb = nN[j];
      if (!nb || !nb.id) continue;
      var na = prevNotifMap[nb.id];
      if (!na || na.read !== nb.read) return true;
    }

    // 3. Instructions
    var pI = prev.instructions || [];
    var nI = next.instructions || [];
    if (pI.length !== nI.length) return true;
    var prevInstMap = {};
    for (var ii = 0; ii < pI.length; ii++) {
      if (pI[ii] && pI[ii].id) prevInstMap[pI[ii].id] = pI[ii];
    }
    for (var k = 0; k < nI.length; k++) {
      var ib = nI[k];
      if (!ib || !ib.id) continue;
      var ia = prevInstMap[ib.id];
      if (!ia) return true;
      if (ia.title !== ib.title
          || (ia.read_by || []).length !== (ib.read_by || []).length
          || (ia.comments || []).length !== (ib.comments || []).length
          || (Array.isArray(ia.tags) ? ia.tags.join(',') : '') !== (Array.isArray(ib.tags) ? ib.tags.join(',') : '')) return true;
    }

    // 4. Clients
    var pC = prev.clients || [];
    var nC = next.clients || [];
    if (pC.length !== nC.length) return true;
    var prevClientMap = {};
    for (var ci = 0; ci < pC.length; ci++) {
      if (pC[ci] && pC[ci].id) prevClientMap[pC[ci].id] = pC[ci];
    }
    for (var l = 0; l < nC.length; l++) {
      var cb = nC[l];
      if (!cb || !cb.id) continue;
      var ca = prevClientMap[cb.id];
      if (!ca || ca.status !== cb.status || ca.name !== cb.name) return true;
    }

    // 5. Users
    var pU = prev.users || [];
    var nU = next.users || [];
    if (pU.length !== nU.length) return true;
    var prevUserMap = {};
    for (var ui = 0; ui < pU.length; ui++) {
      if (pU[ui] && pU[ui].id) prevUserMap[pU[ui].id] = pU[ui];
    }
    for (var m = 0; m < nU.length; m++) {
      var ub = nU[m];
      if (!ub || !ub.id) continue;
      var ua = prevUserMap[ub.id];
      if (!ua) return true;
      if (ua.name !== ub.name || ua.title !== ub.title || ua.status !== ub.status
          || ua.admin !== ub.admin || ua.avatar !== ub.avatar
          || JSON.stringify(ua.departments || []) !== JSON.stringify(ub.departments || [])) return true;
    }

    // 6. Groups
    var pG = prev.groups || [];
    var nG = next.groups || [];
    if (pG.length !== nG.length) return true;
    var prevGroupMap = {};
    for (var gi = 0; gi < pG.length; gi++) {
      if (pG[gi] && pG[gi].id) prevGroupMap[pG[gi].id] = pG[gi];
    }
    for (var g = 0; g < nG.length; g++) {
      var gb = nG[g];
      if (!gb || !gb.id) continue;
      var ga = prevGroupMap[gb.id];
      if (!ga || ga.name !== gb.name || (ga.messages || []).length !== (gb.messages || []).length) return true;
    }

    // 7. Departments
    var pD = prev.departments || [];
    var nD = next.departments || [];
    if (pD.length !== nD.length) return true;
    var prevDeptMap = {};
    for (var di = 0; di < pD.length; di++) {
      if (pD[di] && pD[di].id) prevDeptMap[pD[di].id] = pD[di];
    }
    for (var d = 0; d < nD.length; d++) {
      var db = nD[d];
      if (!db || !db.id) continue;
      var da = prevDeptMap[db.id];
      if (!da || da.name !== db.name || (da.levels || []).join(',') !== (db.levels || []).join(',')) return true;
    }

    // 8. Tags
    var pTags = prev.tags || [];
    var nTags = next.tags || [];
    if (pTags.length !== nTags.length) return true;
    var prevTagMap = {};
    for (var tgi = 0; tgi < pTags.length; tgi++) {
      if (pTags[tgi] && pTags[tgi].id) prevTagMap[pTags[tgi].id] = pTags[tgi];
    }
    for (var tg = 0; tg < nTags.length; tg++) {
      var tgb = nTags[tg];
      if (!tgb || !tgb.id) continue;
      var tga = prevTagMap[tgb.id];
      if (!tga || tga.label !== tgb.label) return true;
    }

    // 9. Policies / Foundation
    var pP = prev.policies || [];
    var nP = next.policies || [];
    if (pP.length !== nP.length) return true;
    var prevPolMap = {};
    for (var pli = 0; pli < pP.length; pli++) {
      if (pP[pli] && pP[pli].id) prevPolMap[pP[pli].id] = pP[pli];
    }
    for (var pi = 0; pi < nP.length; pi++) {
      var pb = nP[pi];
      if (!pb || !pb.id) continue;
      var pa = prevPolMap[pb.id];
      if (!pa || pa.title !== pb.title || pa.department !== pb.department || pa.body !== pb.body) return true;
    }

    // 10. Leaves
    var pL = prev.leaves || [];
    var nL = next.leaves || [];
    if (pL.length !== nL.length) return true;
    var prevLeaveMap = {};
    for (var lvi = 0; lvi < pL.length; lvi++) {
      if (pL[lvi] && pL[lvi].id) prevLeaveMap[pL[lvi].id] = pL[lvi];
    }
    for (var lv = 0; lv < nL.length; lv++) {
      var lb = nL[lv];
      if (!lb || !lb.id) continue;
      var la = prevLeaveMap[lb.id];
      if (!la || la.status !== lb.status) return true;
    }

    // 11. Audit (exclude internal state.sync and chat chatter so periodic polling never causes false dataChanged)
    var pAudClean = (prev.audit || []).filter(function (a) {
      return a && a.action !== 'state.sync' && (typeof isChatChatter !== 'function' || !isChatChatter(a.action));
    });
    var nAudClean = (next.audit || []).filter(function (a) {
      return a && a.action !== 'state.sync' && (typeof isChatChatter !== 'function' || !isChatChatter(a.action));
    });
    if (pAudClean.length !== nAudClean.length) return true;
    if (pAudClean.length > 0 && nAudClean.length > 0 && pAudClean[0].id !== nAudClean[0].id) return true;

    return false;
  }

  function mergeAuditLogs(localAudit, serverAudit) {
    var map = {};
    var list = [];
    (serverAudit || []).concat(localAudit || []).forEach(function (a) {
      if (!a || !a.action || (typeof isChatChatter === 'function' && isChatChatter(a.action)) || a.action === 'state.sync') return;
      var key = a.id || (a.at + '|' + a.actor + '|' + a.action + '|' + (a.target || ''));
      if (!map[key]) {
        map[key] = true;
        list.push(a);
      }
    });
    list.sort(function (x, y) {
      return new Date(y.at || 0).getTime() - new Date(x.at || 0).getTime();
    });
    return list.slice(0, 1000);
  }

  function syncWithServer() {
    if (!isHttp() || typeof fetch !== 'function' || isSyncInProgress || isMutationInProgress) return;
    // Pause background polling for 3.5s after user modification to eliminate race-condition bounce
    if (Date.now() - lastLocalMutationTime < 3500) return;
    isSyncInProgress = true;

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 3500) : null;

    fetch(getApiUrl('/api/state'), {
      signal: controller ? controller.signal : undefined,
      headers: { 'bypass-tunnel-reminder': 'true' }
    })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (res.ok) {
          flushPendingMutations();
          return res.json();
        }
        throw new Error('Server returned ' + res.status);
      })
      .then(function (serverState) {
        // Also sync presence status if endpoint is accessible
        fetch(getApiUrl('/api/presence'), { headers: { 'bypass-tunnel-reminder': 'true' } })
          .then(function (r) { if (r.ok) return r.json(); })
          .then(function (d) {
            if (d && Array.isArray(d.onlineUserIds)) {
              var newSig = d.onlineUserIds.slice().sort().join(',');
              var oldSig = _onlineUserIds.slice().sort().join(',');
              var changed = newSig !== oldSig;
              _onlineUserIds = d.onlineUserIds;
              // Quietly update presence UI without wiping or re-rendering page
              if (changed && typeof OC !== 'undefined' && OC.app && typeof OC.app.updatePresenceUI === 'function') {
                OC.app.updatePresenceUI(_onlineUserIds);
              }
            }
          })
          .catch(function () {});
        isSyncInProgress = false;
        if (serverState && serverState.version === 1) {
          var needsPush = false;
          if (state && Array.isArray(state.groups) && state.groups.length > 0) {
            serverState.groups = serverState.groups || [];
            state.groups.forEach(function (lg) {
              /* Only push a local group to the server when it was RECENTLY created locally
                 (within the last 30s) and genuinely does not exist on the server yet.
                 Never resurrect an old group that the server has already deleted! */
              var wasRecentlyCreatedLocally = !!(_recentGroupCreations[lg.id] && (Date.now() - _recentGroupCreations[lg.id] < 30000));
              if (wasRecentlyCreatedLocally && !serverState.groups.some(function (sg) { return sg.id === lg.id; })
                  && !_deletedGroupIds[lg.id]) {
                serverState.groups.push(lg);
                needsPush = true;
              }
            });
          }
          /* Strip any tombstoned groups from serverState before we adopt it.
             This ensures that if another user deleted a group or if this device deleted it,
             it is stripped immediately and pushed to keep database fully synchronized. */
          if (serverState.groups) {
            var tombstoneCount = serverState.groups.filter(function (g) { return _deletedGroupIds[g.id]; }).length;
            if (tombstoneCount > 0) {
              serverState.groups = serverState.groups.filter(function (g) { return !_deletedGroupIds[g.id]; });
              needsPush = true;
            }
          }
          if (state && Array.isArray(state.attendance) && state.attendance.length > 0) {
            serverState.attendance = serverState.attendance || [];
            state.attendance.forEach(function (la) {
              var isRecent = la && la.timestamp && (Date.now() - new Date(la.timestamp).getTime() < 30000);
              if (isRecent && !serverState.attendance.some(function (sa) { return sa.id === la.id; })) {
                serverState.attendance.unshift(la);
                needsPush = true;
              }
            });
          }
          if (state && Array.isArray(state.leaves) && state.leaves.length > 0) {
            serverState.leaves = serverState.leaves || [];
            state.leaves.forEach(function (ll) {
              var isRecent = ll && ll.created_at && (Date.now() - new Date(ll.created_at).getTime() < 30000);
              if (isRecent && !serverState.leaves.some(function (sl) { return sl.id === ll.id; })) {
                serverState.leaves.unshift(ll);
                needsPush = true;
              }
            });
          }
          if (state && Array.isArray(state.users) && state.users.length > 0) {
            serverState.users = serverState.users || [];
            state.users.forEach(function (lu) {
              if (_deletedUserIds[lu.id]) return;
              var su = serverState.users.find(function (u) { return u.id === lu.id; });
              if (su) {
                var isRecentlyUpdatedLocally = !!(_recentUserUpdates[lu.id] && (Date.now() - _recentUserUpdates[lu.id] < 15000));
                if (isRecentlyUpdatedLocally) {
                  Object.assign(su, lu);
                  needsPush = true;
                } else {
                  if (lu.name && lu.name !== 'Invited Member' && (su.name === 'Invited Member' || !su.name)) su.name = lu.name;
                  if (lu.employee_id && !su.employee_id) su.employee_id = lu.employee_id;
                  if (lu.org && !su.org) su.org = lu.org;
                  if (lu.joined_date && !su.joined_date) su.joined_date = lu.joined_date;
                  if (lu.title && lu.title !== 'Team Member' && su.title === 'Team Member') su.title = lu.title;
                  if (lu.office_details && !su.office_details) su.office_details = lu.office_details;
                  if (lu.personal_details && !su.personal_details) su.personal_details = lu.personal_details;
                  if (lu.emergency_contacts && !su.emergency_contacts) su.emergency_contacts = lu.emergency_contacts;
                  if (lu.bank_details && !su.bank_details) su.bank_details = lu.bank_details;
                  if (lu.avatar && !su.avatar) su.avatar = lu.avatar;
                  if (lu.scheduled_in && !su.scheduled_in) su.scheduled_in = lu.scheduled_in;
                  if (lu.scheduled_out && !su.scheduled_out) su.scheduled_out = lu.scheduled_out;
                  if (!Array.isArray(su.departments)) {
                    su.departments = Array.isArray(lu.departments) ? lu.departments : [];
                  }
                }
              }
            });
          }
          if (serverState.users && Array.isArray(serverState.users)) {
            var tombstoneUserCount = serverState.users.filter(function (u) { return _deletedUserIds[u.id]; }).length;
            if (tombstoneUserCount > 0) {
              serverState.users = serverState.users.filter(function (u) { return !_deletedUserIds[u.id]; });
              needsPush = true;
            }
            // Keep valid users
            serverState.users = serverState.users.filter(function (u) {
              return u && u.id;
            });

            // Strict Deduplication by email on server users
            var sEmailMap = {};
            var sDeduped = [];
            serverState.users.forEach(function (u) {
              var mail = u.email ? u.email.trim().toLowerCase() : '';
              if (mail && sEmailMap[mail]) {
                var prim = sEmailMap[mail];
                if (u.status === 'active') prim.status = 'active';
                if (u.password && !prim.password) prim.password = u.password;
                if (u.admin && !prim.admin) prim.admin = true;
                if (Array.isArray(u.departments) && u.departments.length > 0 && (!prim.departments || !prim.departments.length)) {
                  prim.departments = u.departments;
                }
                if (u.name && u.name !== 'Invited Member' && (!prim.name || prim.name === 'Invited Member')) {
                  prim.name = u.name;
                }
                if (u.title && u.title !== 'Team Member' && prim.title === 'Team Member') {
                  prim.title = u.title;
                }
                if (u.avatar && !prim.avatar) prim.avatar = u.avatar;
                needsPush = true;
              } else {
                if (mail) sEmailMap[mail] = u;
                sDeduped.push(u);
              }
            });
            if (sDeduped.length !== serverState.users.length) {
              serverState.users = sDeduped;
              needsPush = true;
            }

            // Ensure system admins always retain admin status & title
            var permanentAdmins = ['u-shohag', 'u-fuad', 'u-magba'];
            serverState.users.forEach(function (u) {
              if (permanentAdmins.indexOf(u.id) > -1) {
                u.admin = true;
                u.invite = null;
                u.status = 'active';
                if (u.id === 'u-magba' && (!u.title || u.title === 'Member' || u.title === 'Team Member')) {
                  u.title = 'System Admin';
                }
              }
            });
          }
          // Merge offline-created or locally-modified clients so local edits are never clobbered by background polling
          if (state && Array.isArray(state.clients) && state.clients.length > 0) {
            serverState.clients = serverState.clients || [];
            state.clients.forEach(function (lc) {
              if (_deletedClientIds[lc.id]) return;
              var sc = serverState.clients.find(function (c) { return c.id === lc.id; });
              if (!sc) {
                var wasRecentlyCreatedLocally = !!(_recentClientCreations[lc.id] && (Date.now() - _recentClientCreations[lc.id] < 30000));
                if (wasRecentlyCreatedLocally) {
                  serverState.clients.push(lc);
                  needsPush = true;
                }
              } else {
                var isRecentlyUpdatedLocally = !!(_recentClientUpdates[lc.id] && (Date.now() - _recentClientUpdates[lc.id] < 15000));
                var lcTime = lc.updated_at ? new Date(lc.updated_at).getTime() : 0;
                var scTime = sc.updated_at ? new Date(sc.updated_at).getTime() : 0;
                var localIsNewer = isRecentlyUpdatedLocally || (lcTime > 0 && scTime > 0 && lcTime > scTime + 2000);

                if (localIsNewer) {
                  sc.assignees = Array.isArray(lc.assignees) ? lc.assignees.slice() : [];
                  sc.assigned_users = Array.isArray(lc.assigned_users) ? lc.assigned_users.slice() : (sc.assignees || []);
                  if (Array.isArray(lc.departments)) sc.departments = lc.departments.slice();
                  if (Array.isArray(lc.tags)) sc.tags = lc.tags.slice();
                  if (lc.department !== undefined) sc.department = lc.department;
                  if (lc.name) sc.name = lc.name;
                  if (lc.client_id) sc.client_id = lc.client_id;
                  if (lc.client_code) sc.client_code = lc.client_code;
                  if (lc.client_number) sc.client_number = lc.client_number;
                  if (lc.contact) sc.contact = lc.contact;
                  if (lc.status) sc.status = lc.status;
                  if (lc.details !== undefined) sc.details = lc.details;
                  if (lc.extended_fields) sc.extended_fields = lc.extended_fields;
                  if (lc.billing_type && lc.billing_type !== sc.billing_type) sc.billing_type = lc.billing_type;
                  if (lc.billing_rate !== undefined && lc.billing_rate !== sc.billing_rate) sc.billing_rate = lc.billing_rate;
                  if (lc.retainer !== undefined && lc.retainer !== sc.retainer) sc.retainer = lc.retainer;
                  if (lc.contract_start && lc.contract_start !== sc.contract_start) sc.contract_start = lc.contract_start;
                  if (lc.contract_end !== undefined && lc.contract_end !== sc.contract_end) sc.contract_end = lc.contract_end;
                  if (lc.notes !== undefined && lc.notes !== sc.notes) sc.notes = lc.notes;
                  sc.updated_at = lc.updated_at || new Date().toISOString();
                  needsPush = true;
                } else {
                  if (lc.extended_fields && (!sc.extended_fields || Object.keys(lc.extended_fields).length > Object.keys(sc.extended_fields).length)) {
                    sc.extended_fields = lc.extended_fields;
                    needsPush = true;
                  }
                  if (Array.isArray(lc.departments) && lc.departments.length > 0 && (!Array.isArray(sc.departments) || !sc.departments.length)) {
                    sc.departments = lc.departments;
                    needsPush = true;
                  }
                  if (lc.department && !sc.department) {
                    sc.department = lc.department;
                    needsPush = true;
                  }
                  if (Array.isArray(lc.assignees) && lc.assignees.length > 0 && (!Array.isArray(sc.assignees) || !sc.assignees.length)) {
                    sc.assignees = lc.assignees;
                    sc.assigned_users = lc.assignees;
                    needsPush = true;
                  }
                }
              }
            });
          }
          // Strip any tombstoned clients from serverState
          if (serverState.clients) {
            var tombstoneClientCount = serverState.clients.filter(function (c) { return _deletedClientIds[c.id]; }).length;
            if (tombstoneClientCount > 0) {
              serverState.clients = serverState.clients.filter(function (c) { return !_deletedClientIds[c.id]; });
              needsPush = true;
            }
          }
          // Merge offline-created or locally-modified todos so local edits are never clobbered by background polling
          if (state && Array.isArray(state.todos) && state.todos.length > 0) {
            serverState.todos = serverState.todos || [];
            state.todos.forEach(function (lt) {
              if (_deletedTodoIds[lt.id]) return;
              var st = serverState.todos.find(function (t) { return t.id === lt.id; });
              if (!st) {
                var wasRecentlyCreatedLocally = !!(_recentTodoCreations[lt.id] && (Date.now() - _recentTodoCreations[lt.id] < 30000));
                if (wasRecentlyCreatedLocally) {
                  serverState.todos.push(lt);
                  needsPush = true;
                }
              } else {
                var isRecentlyUpdatedLocally = !!(_recentTodoUpdates[lt.id] && (Date.now() - _recentTodoUpdates[lt.id] < 15000));
                var ltTime = lt.updated_at ? new Date(lt.updated_at).getTime() : 0;
                var stTime = st.updated_at ? new Date(st.updated_at).getTime() : 0;
                var localIsNewer = isRecentlyUpdatedLocally || (ltTime > 0 && stTime > 0 && ltTime > stTime + 2000);

                if (localIsNewer) {
                  Object.assign(st, lt);
                  needsPush = true;
                }
              }
            });
          }
          // Strip any tombstoned todos from serverState
          if (serverState.todos) {
            var tombstoneTodoCount = serverState.todos.filter(function (t) { return _deletedTodoIds[t.id]; }).length;
            if (tombstoneTodoCount > 0) {
              serverState.todos = serverState.todos.filter(function (t) { return !_deletedTodoIds[t.id]; });
              needsPush = true;
            }
          }
          // Merge offline-created or locally-modified instructions so local edits are never clobbered
          if (state && Array.isArray(state.instructions) && state.instructions.length > 0) {
            serverState.instructions = serverState.instructions || [];
            state.instructions.forEach(function (li) {
              if (_deletedInstructionIds[li.id]) return;
              var si = serverState.instructions.find(function (i) { return i.id === li.id; });
              if (!si) {
                var wasRecentlyCreatedLocally = !!(_recentInstructionCreations[li.id] && (Date.now() - _recentInstructionCreations[li.id] < 30000));
                if (wasRecentlyCreatedLocally) {
                  serverState.instructions.push(li);
                  needsPush = true;
                }
              } else {
                var isRecentlyUpdatedLocally = !!(_recentInstructionUpdates[li.id] && (Date.now() - _recentInstructionUpdates[li.id] < 15000));
                var liTime = li.updated_at ? new Date(li.updated_at).getTime() : 0;
                var siTime = si.updated_at ? new Date(si.updated_at).getTime() : 0;
                var localIsNewer = isRecentlyUpdatedLocally || (liTime > 0 && siTime > 0 && liTime > siTime + 2000);

                if (localIsNewer) {
                  Object.assign(si, li);
                  needsPush = true;
                }
              }
            });
          }
          // Strip any tombstoned instructions from serverState
          if (serverState.instructions) {
            var tombstoneInsCount = serverState.instructions.filter(function (i) { return _deletedInstructionIds[i.id]; }).length;
            if (tombstoneInsCount > 0) {
              serverState.instructions = serverState.instructions.filter(function (i) { return !_deletedInstructionIds[i.id]; });
              needsPush = true;
            }
          }
          // Strip any tombstoned departments from serverState
          if (serverState.departments) {
            var tombstoneDeptCount = serverState.departments.filter(function (d) { return _deletedDepartmentIds[d.id]; }).length;
            if (tombstoneDeptCount > 0) {
              serverState.departments = serverState.departments.filter(function (d) { return !_deletedDepartmentIds[d.id]; });
              needsPush = true;
            }
          }
          // Merge locally created or updated departments
          if (state && Array.isArray(state.departments) && state.departments.length > 0) {
            serverState.departments = serverState.departments || [];
            state.departments.forEach(function (ld) {
              if (!ld || !ld.id || _deletedDepartmentIds[ld.id]) return;
              var sd = serverState.departments.find(function (d) { return d.id === ld.id; });
              if (!sd) {
                serverState.departments.push(ld);
                needsPush = true;
              } else {
                if (ld.name && ld.name !== sd.name) {
                  sd.name = ld.name;
                  needsPush = true;
                }
                if (Array.isArray(ld.levels) && ld.levels.length > 0 && JSON.stringify(ld.levels) !== JSON.stringify(sd.levels)) {
                  sd.levels = ld.levels;
                  needsPush = true;
                }
              }
            });
          }
          // Strip any demo/seed policies and tombstoned policies from serverState
          if (Array.isArray(serverState.policies)) {
            var polBefore = serverState.policies.length;
            serverState.policies = serverState.policies.filter(function (p) {
              return p && p.id && !_deletedPolicyIds[p.id] && DEMO_POLICY_IDS.indexOf(p.id) === -1 && p.department !== 'all';
            });
            if (serverState.policies.length !== polBefore) {
              needsPush = true;
            }
          }
          // Merge offline-created or locally-modified policies and strip tombstoned/demo policies
          if (state && Array.isArray(state.policies) && state.policies.length > 0) {
            serverState.policies = serverState.policies || [];
            state.policies.forEach(function (lp) {
              if (!lp || !lp.id || _deletedPolicyIds[lp.id] || DEMO_POLICY_IDS.indexOf(lp.id) > -1 || lp.department === 'all') return;
              var sp = serverState.policies.find(function (p) { return p.id === lp.id; });
              if (!sp) {
                serverState.policies.push(lp);
                needsPush = true;
              } else {
                var lpTime = lp.updated_at ? new Date(lp.updated_at).getTime() : 0;
                var spTime = sp.updated_at ? new Date(sp.updated_at).getTime() : 0;
                if (lpTime > 0 && spTime > 0 && lpTime > spTime + 2000) {
                  Object.assign(sp, lp);
                  needsPush = true;
                }
              }
            });
          }
          // Merge tags — admin-created tags on server flow to all other users
          serverState.tags = serverState.tags || [];
          var LEGACY_TAG_IDS = ['t-policy','t-correction','t-notice','t-standing','t-onboarding','t-urgent'];
          if (state && Array.isArray(state.tags)) {
            state.tags.forEach(function (lt) {
              if (!lt || !lt.id || _deletedTagIds[lt.id] || LEGACY_TAG_IDS.indexOf(lt.id) > -1) return;
              var st = serverState.tags.find(function (t) { return t.id === lt.id; });
              if (!st) {
                /* Local tag not on server yet — push up if recently created */
                if (_recentTagCreations[lt.id]) {
                  serverState.tags.push(lt);
                  needsPush = true;
                }
              } else {
                var isRecentTag = !!(_recentTagUpdates[lt.id] && (Date.now() - _recentTagUpdates[lt.id] < 30000));
                if (isRecentTag || (lt.label && lt.label !== st.label)) {
                  /* Renamed locally — update server copy */
                  st.label = lt.label;
                  needsPush = true;
                }
              }
            });
          }
          /* Strip legacy seed tags and tombstoned tags from server response */
          if (Array.isArray(serverState.tags)) {
            var tagCountBefore = serverState.tags.length;
            serverState.tags = serverState.tags.filter(function (t) {
              return t && t.id && LEGACY_TAG_IDS.indexOf(t.id) === -1 && !_deletedTagIds[t.id];
            });
            if (serverState.tags.length < tagCountBefore) {
              needsPush = true;
            }
          }

          // Merge offline-queued notifications and synchronize read state
          if (state && Array.isArray(state.notifications) && state.notifications.length > 0) {
            serverState.notifications = serverState.notifications || [];
            var nowTime = Date.now();
            state.notifications.forEach(function (ln) {
              var sn = serverState.notifications.find(function (n) { return n.id === ln.id; });
              if (!sn) {
                // Only merge notifications created recently (within last 1 hour) to avoid resurrecting stale ones
                var ageMs = nowTime - new Date(ln.at || 0).getTime();
                if (ageMs >= 0 && ageMs < 3600000) {
                  serverState.notifications.unshift(ln);
                  needsPush = true;
                }
              } else if (ln.read && !sn.read) {
                sn.read = true;
                needsPush = true;
              }
            });
            // Cap to at most 50 recent notifications
            if (serverState.notifications.length > 50) {
              serverState.notifications = serverState.notifications.slice(0, 50);
            }
          }

          if (serverState && Array.isArray(serverState.departments)) {
            serverState.departments.forEach(function (d) {
              if (!Array.isArray(d.levels)) {
                d.levels = ['head', 'member', 'intern'];
                needsPush = true;
              } else if (d.levels.indexOf('intern') === -1) {
                d.levels.push('intern');
                needsPush = true;
              }
            });
          }

          if (serverState) {
            serverState.extended_info_fields = serverState.extended_info_fields || state.extended_info_fields || [];
            serverState.card_extended_fields = serverState.card_extended_fields || state.card_extended_fields || [];
            serverState.portal_extended_fields = serverState.portal_extended_fields || state.portal_extended_fields || [];
          }

          if (serverState) {
            serverState.audit = mergeAuditLogs(state ? state.audit : [], serverState.audit);
          }

          var dataChanged = hasMeaningfulDataChanged(state, serverState);
          var rawDiff = JSON.stringify(state) !== JSON.stringify(serverState);
          if (rawDiff) {
            state = serverState;
            write();
          }
          if (dataChanged) {
            emit();
          }
          if (needsPush) {
            pushMutationToServer({ actor: 'system', action: 'state.sync', target: 'workspace' });
          }
          if (OC.backend && OC.backend.setServerStatus) {
            OC.backend.setServerStatus(true);
          }
          initSSE();
        }
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        isSyncInProgress = false;
        if (OC.backend && OC.backend.setServerStatus) {
          OC.backend.setServerStatus(false);
        }
        autoDiscoverApiUrl();
      });
  }

  var _pendingMutations = [];
  try {
    var rawPending = localStorage.getItem('oc_pending_mutations');
    if (rawPending) _pendingMutations = JSON.parse(rawPending);
    if (!Array.isArray(_pendingMutations)) _pendingMutations = [];
  } catch (_) { _pendingMutations = []; }

  function savePendingMutations() {
    try {
      localStorage.setItem('oc_pending_mutations', JSON.stringify(_pendingMutations));
    } catch (_) {}
  }

  function queuePendingMutation(entry) {
    if (!entry) return;
    _pendingMutations.push({
      entry: entry,
      queuedAt: Date.now()
    });
    if (_pendingMutations.length > 100) {
      _pendingMutations = _pendingMutations.slice(-100);
    }
    savePendingMutations();
  }

  function flushPendingMutations() {
    if (_pendingMutations.length === 0 || !isHttp() || typeof fetch !== 'function' || isMutationInProgress) return;
    var item = _pendingMutations[0];
    if (!item || !item.entry) {
      _pendingMutations.shift();
      savePendingMutations();
      return;
    }

    fetch(getApiUrl('/api/mutate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
      body: JSON.stringify({ entry: item.entry, state: state })
    })
      .then(function (res) {
        if (res.ok) {
          _pendingMutations.shift();
          savePendingMutations();
          if (_pendingMutations.length > 0) {
            setTimeout(flushPendingMutations, 300);
          }
        }
      })
      .catch(function () {});
  }

  function pushMutationToServer(entry) {
    if (!isHttp() || typeof fetch !== 'function') return;

    isMutationInProgress = true;
    lastLocalMutationTime = Date.now();

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 4500) : null;

    fetch(getApiUrl('/api/mutate'), {
      method: 'POST',
      signal: controller ? controller.signal : undefined,
      headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
      body: JSON.stringify({ entry: entry, state: state })
    })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        isMutationInProgress = false;
        if (!res.ok) {
          console.warn('[store] Server mutation response error HTTP ' + res.status);
          queuePendingMutation(entry);
          return res.json().then(function (err) {
            console.warn('[store] Mutation error details:', err);
          }).catch(function () {});
        }
        return res.json();
      })
      .then(function (data) {
        isMutationInProgress = false;
        if (data && data.state && data.state.version === 1) {
          // Preserve active local modifications from being clobbered by server echo
          if (state && Array.isArray(state.todos)) {
            data.state.todos = data.state.todos || [];
            state.todos.forEach(function (lt) {
              if (_deletedTodoIds[lt.id]) return;
              var st = data.state.todos.find(function (t) { return t.id === lt.id; });
              if (!st) {
                data.state.todos.push(lt);
              } else {
                var isRecent = !!(_recentTodoUpdates[lt.id] && (Date.now() - _recentTodoUpdates[lt.id] < 30000));
                var ltTime = lt.updated_at ? new Date(lt.updated_at).getTime() : 0;
                var stTime = st.updated_at ? new Date(st.updated_at).getTime() : 0;
                if (isRecent || (ltTime > 0 && ltTime >= stTime)) Object.assign(st, lt);
              }
            });
            data.state.todos = data.state.todos.filter(function (t) { return !_deletedTodoIds[t.id]; });
          }
          if (state && Array.isArray(state.clients)) {
            data.state.clients = data.state.clients || [];
            state.clients.forEach(function (lc) {
              if (_deletedClientIds[lc.id]) return;
              var sc = data.state.clients.find(function (c) { return c.id === lc.id; });
              if (!sc) {
                var wasRecentlyCreated = !!(_recentClientCreations[lc.id] && (Date.now() - _recentClientCreations[lc.id] < 30000));
                if (wasRecentlyCreated) data.state.clients.push(lc);
              } else {
                var isRecent = !!(_recentClientUpdates[lc.id] && (Date.now() - _recentClientUpdates[lc.id] < 30000));
                var lcTime = lc.updated_at ? new Date(lc.updated_at).getTime() : 0;
                var scTime = sc.updated_at ? new Date(sc.updated_at).getTime() : 0;
                if (isRecent || (lcTime > 0 && lcTime >= scTime)) {
                  Object.assign(sc, lc);
                }
              }
            });
            data.state.clients = data.state.clients.filter(function (c) { return !_deletedClientIds[c.id]; });
          }
          if (state && Array.isArray(state.instructions)) {
            data.state.instructions = data.state.instructions || [];
            state.instructions.forEach(function (li) {
              if (_deletedInstructionIds[li.id]) return;
              var si = data.state.instructions.find(function (i) { return i.id === li.id; });
              if (!si) {
                data.state.instructions.push(li);
              } else {
                var isRecentIns = !!(_recentInstructionUpdates[li.id] && (Date.now() - _recentInstructionUpdates[li.id] < 30000));
                var liTime = li.updated_at ? new Date(li.updated_at).getTime() : 0;
                var siTime = si.updated_at ? new Date(si.updated_at).getTime() : 0;
                if (isRecentIns || (liTime > 0 && liTime >= siTime)) Object.assign(si, li);
              }
            });
            data.state.instructions = data.state.instructions.filter(function (i) { return !_deletedInstructionIds[i.id]; });
          }
          if (state && Array.isArray(state.groups)) {
            data.state.groups = data.state.groups || [];
            data.state.groups = data.state.groups.filter(function (g) { return !_deletedGroupIds[g.id]; });
          }
          if (state && Array.isArray(state.policies)) {
            data.state.policies = data.state.policies || [];
            data.state.policies = data.state.policies.filter(function (p) {
              return p && p.id && !_deletedPolicyIds[p.id] && DEMO_POLICY_IDS.indexOf(p.id) === -1 && p.department !== 'all';
            });
          }
          /* Preserve and merge local tags into server response — prevents tags from
             being wiped when the server echoes back state after a mutate call */
          if (state && Array.isArray(state.tags)) {
            data.state.tags = data.state.tags || [];
            var LEGACY_TAG_IDS = ['t-policy','t-correction','t-notice','t-standing','t-onboarding','t-urgent'];
            /* Strip legacy seed tags and tombstoned tags from server response */
            data.state.tags = data.state.tags.filter(function (t) {
              return t && t.id && LEGACY_TAG_IDS.indexOf(t.id) === -1 && !_deletedTagIds[t.id];
            });
            /* Merge local tags not yet on server */
            state.tags.forEach(function (lt) {
              if (!lt || !lt.id || _deletedTagIds[lt.id] || LEGACY_TAG_IDS.indexOf(lt.id) > -1) return;
              var st = data.state.tags.find(function (t) { return t.id === lt.id; });
              if (!st) {
                var wasRecentlyCreated = !!(_recentTagCreations[lt.id] && (Date.now() - _recentTagCreations[lt.id] < 30000));
                if (wasRecentlyCreated) data.state.tags.push(lt);
              } else {
                var isRecentTag = !!(_recentTagUpdates[lt.id] && (Date.now() - _recentTagUpdates[lt.id] < 30000));
                if (isRecentTag || (lt.label && lt.label !== st.label)) {
                  st.label = lt.label;
                }
              }
            });
          }
          if (state && Array.isArray(state.users)) {
            data.state.users = data.state.users || [];
            state.users.forEach(function (lu) {
              if (_deletedUserIds[lu.id]) return;
              var su = data.state.users.find(function (u) { return u.id === lu.id; });
              if (su) {
                var isRecent = !!(_recentUserUpdates[lu.id] && (Date.now() - _recentUserUpdates[lu.id] < 30000));
                if (isRecent) {
                  Object.assign(su, lu);
                } else {
                  if (lu.name && lu.name !== 'Invited Member' && (su.name === 'Invited Member' || !su.name)) su.name = lu.name;
                  if (lu.employee_id && !su.employee_id) su.employee_id = lu.employee_id;
                  if (lu.org && !su.org) su.org = lu.org;
                  if (lu.joined_date && !su.joined_date) su.joined_date = lu.joined_date;
                  if (lu.avatar && !su.avatar) su.avatar = lu.avatar;
                  if (lu.title && lu.title !== 'Team Member' && su.title === 'Team Member') su.title = lu.title;
                  if (Array.isArray(lu.departments) && lu.departments.length > 0 && (!Array.isArray(su.departments) || su.departments.length === 0)) {
                    su.departments = lu.departments;
                  }
                }
              }
            });
            data.state.users = data.state.users.filter(function (u) { return !_deletedUserIds[u.id]; });
          }
          if (data && data.state) {
            data.state.audit = mergeAuditLogs(state ? state.audit : [], data.state.audit);
          }
          var dataChanged = hasMeaningfulDataChanged(state, data.state);
          var rawDiff = JSON.stringify(state) !== JSON.stringify(data.state);
          if (rawDiff) {
            state = data.state;
            write();
          }
          if (dataChanged) {
            emit();
          }
        }
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        isMutationInProgress = false;
        console.warn('[store] Network failure pushing mutation:', err ? err.message : 'timeout');
        queuePendingMutation(entry);
        autoDiscoverApiUrl();
      });
  }

  function initSSE() {
    if (sseSource || !isHttp() || typeof EventSource !== 'function') return;

    try {
      var uid = getSessionId();
      var sseUrl = getApiUrl('/api/events') + (uid ? '?userId=' + encodeURIComponent(uid) : '');
      sseSource = new EventSource(sseUrl);
      sseSource.onmessage = function (event) {
        try {
          var data = JSON.parse(event.data);
          if (data.type === 'presence' && Array.isArray(data.onlineUserIds)) {
            var newSig = data.onlineUserIds.slice().sort().join(',');
            var oldSig = _onlineUserIds.slice().sort().join(',');
            var changed = newSig !== oldSig;
            _onlineUserIds = data.onlineUserIds;
            // Quietly update presence UI without wiping or re-rendering page
            if (changed && typeof OC !== 'undefined' && OC.app && typeof OC.app.updatePresenceUI === 'function') {
              OC.app.updatePresenceUI(_onlineUserIds);
            }
            return;
          }
          if (data.type === 'mutate' || data.type === 'reset' || data.type === 'state_saved') {
            // If this client just modified something locally, ignore server echo to prevent bounce
            if (isMutationInProgress || (Date.now() - lastLocalMutationTime < 3500)) return;
            syncWithServer();
          }
        } catch (_) {}
      };
      sseSource.onerror = function () {};
    } catch (_) {}
  }

  /* Live background auto-refresh (every 3.5s).
     SSE provides instant 0ms push updates across devices, while this 3.5s poll
     ensures a quiet connection without collision or bounce. */
  if (typeof setInterval === 'function' && isHttp()) {
    var syncTimer = setInterval(function () {
      if (isMutationInProgress || (Date.now() - lastLocalMutationTime < 3500)) return;
      syncWithServer();
    }, 3500);
    if (syncTimer && typeof syncTimer.unref === 'function') {
      syncTimer.unref();
    }
  }

  // 🌐 Instant auto-sync when network reconnects
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', function () {
      syncWithServer();
    });
  }

  /* coming back to the tab should catch up immediately rather than waiting out
     the next tick */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) syncWithServer();
    });
  }

  function load() {
    var defaultSeed = seed(); // single seed() call — reused for both reset and seedUsers check
    state = read();
    if (!state || state.version !== 1 || (state.departments && state.departments.some(function (d) { return d.name === 'Web Development'; }))) {
      state = defaultSeed;
      write();
    }
    // Purge old/stale legacy notifications (one-time reset across all clients on VPS shift)
    var NOTIF_CLEANUP_VER = 'oc_notif_clean_v2026_09_10_vps_shift';
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('oc_notif_clean_tag') !== NOTIF_CLEANUP_VER) {
        if (state && Array.isArray(state.notifications)) {
          state.notifications = [];
          write();
        }
        localStorage.setItem('oc_notif_clean_tag', NOTIF_CLEANUP_VER);
      }
    } catch (_) {}

    // One-time: purge old demo/seed tags (Policy, Correction, Notice, etc.) from cached localStorage
    var SEED_TAG_CLEAN_VER = 'oc_tag_clean_v2026_09_11';
    var SEED_TAG_IDS = ['t-policy', 't-correction', 't-notice', 't-standing', 't-onboarding', 't-urgent'];
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('oc_seed_tag_clean') !== SEED_TAG_CLEAN_VER) {
        if (state && Array.isArray(state.tags)) {
          var before = state.tags.length;
          state.tags = state.tags.filter(function (t) { return t && t.id && SEED_TAG_IDS.indexOf(t.id) === -1 && !_deletedTagIds[t.id]; });
          if (state.tags.length !== before) write();
        }
        localStorage.setItem('oc_seed_tag_clean', SEED_TAG_CLEAN_VER);
      }
    } catch (_) {}

    // One-time & continuous: purge old demo/seed foundation policies from cached localStorage
    var SEED_POLICY_CLEAN_VER = 'oc_policy_clean_v2026_09_11_force_clean_all_demo';
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('oc_seed_policy_clean') !== SEED_POLICY_CLEAN_VER) {
        if (state && Array.isArray(state.policies)) {
          var pBefore = state.policies.length;
          state.policies = state.policies.filter(function (p) {
            return p && p.id && DEMO_POLICY_IDS.indexOf(p.id) === -1 && !_deletedPolicyIds[p.id] && p.department !== 'all';
          });
          state._policies_seeded = true;
          if (state.policies.length !== pBefore) write();
        }
        localStorage.setItem('oc_seed_policy_clean', SEED_POLICY_CLEAN_VER);
      }
    } catch (_) {}
    // Strictly enforce permanent System Admin status for Shohag, Fuad, and Magba
    var SEED_ADMIN_CLEAN_VER = 'oc_admin_clean_v2026_09_11_magba_admin';
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('oc_admin_clean_tag') !== SEED_ADMIN_CLEAN_VER) {
        if (state && Array.isArray(state.users)) {
          var adminIds = ['u-shohag', 'u-fuad', 'u-magba'];
          var hasAdminChange = false;
          state.users.forEach(function (u) {
            if (adminIds.indexOf(u.id) > -1) {
              u.admin = true;
              u.invite = null;
              u.status = 'active';
              if (u.id === 'u-magba' && (!u.title || u.title === 'Member' || u.title === 'Team Member')) {
                u.title = 'System Admin';
              }
              hasAdminChange = true;
            }
          });
          if (hasAdminChange) write();
        }
        localStorage.setItem('oc_admin_clean_tag', SEED_ADMIN_CLEAN_VER);
      }
    } catch (_) {}

    // Strictly enforce 7 days retention for all notifications
    if (state && Array.isArray(state.notifications) && state.notifications.length > 0) {
      var maxNotifAge = Date.now() - (7 * 86400000);
      var sevenDayNotifs = state.notifications.filter(function (n) {
        if (!n) return false;
        var t = new Date(n.at || 0).getTime();
        return !t || t >= maxNotifAge;
      });
      if (sevenDayNotifs.length !== state.notifications.length) {
        state.notifications = sevenDayNotifs;
        write();
      }
    }
    if (state && Array.isArray(state.clients)) {
      var unDel = state.clients.filter(function (c) { return !_deletedClientIds[c.id]; });
      if (unDel.length !== state.clients.length) {
        state.clients = unDel;
        write();
      }
    }
    if (state && Array.isArray(state.policies)) {
      var unDelPolicies = state.policies.filter(function (p) {
        return p && p.id && !_deletedPolicyIds[p.id] && DEMO_POLICY_IDS.indexOf(p.id) === -1 && p.department !== 'all';
      });
      if (unDelPolicies.length !== state.policies.length) {
        state.policies = unDelPolicies;
        write();
      }
    }
    // Clean legacy removed users, test artifacts, orphan records, and ensure clean system admins are present
    if (state && Array.isArray(state.users)) {
      var seedUsers = defaultSeed.users; // reuse the already-computed seed — no second seed() call
      var modified = false;
      // Keep valid users
      var filtered = state.users.filter(function (u) {
        return u && u.id;
      });
      if (filtered.length !== state.users.length) {
        state.users = filtered;
        modified = true;
      }
      seedUsers.forEach(function (su) {
        var existing = state.users.find(function (u) {
          return u.id === su.id || (u.email && su.email && u.email.trim().toLowerCase() === su.email.trim().toLowerCase());
        });
        if (!existing) {
          state.users.push(su);
          modified = true;
        } else {
          if (su.status === 'active' && existing.status !== 'active') {
            existing.status = 'active';
            if (existing.invite) existing.invite.claimed_at = existing.invite.claimed_at || new Date().toISOString();
            modified = true;
          }
          if (su.password && !existing.password) {
            existing.password = su.password;
            modified = true;
          }
          // Ensure system admin superuser flag integrity without wiping custom avatar
          if (su.admin) {
            if (!existing.admin) {
              existing.admin = true;
              modified = true;
            }
            if (existing.invite) {
              existing.invite = null;
              modified = true;
            }
            if (su.title && (!existing.title || existing.title === 'Member' || existing.title === 'Team Member')) {
              existing.title = su.title;
              modified = true;
            }
          }
        }
      });
      // Complete Deduplication: Merge multiple accounts with identical email into ONE account
      var emailMap = {};
      var dedupedUsers = [];
      state.users.forEach(function (u) {
        var mail = u.email ? u.email.trim().toLowerCase() : '';
        if (mail && emailMap[mail]) {
          var primary = emailMap[mail];
          // Merge properties into primary
          if (u.status === 'active') primary.status = 'active';
          if (u.password && !primary.password) primary.password = u.password;
          if (u.admin && !primary.admin) primary.admin = true;
          if (Array.isArray(u.departments) && u.departments.length > 0 && (!primary.departments || !primary.departments.length)) {
            primary.departments = u.departments;
          }
          if (u.name && u.name !== 'Invited Member' && (!primary.name || primary.name === 'Invited Member')) {
            primary.name = u.name;
          }
          if (u.title && u.title !== 'Team Member' && primary.title === 'Team Member') {
            primary.title = u.title;
          }
          if (u.avatar && !primary.avatar) primary.avatar = u.avatar;
          if (u.invite && !primary.invite) primary.invite = u.invite;
          modified = true;
        } else {
          if (mail) emailMap[mail] = u;
          dedupedUsers.push(u);
        }
      });
      if (dedupedUsers.length !== state.users.length) {
        state.users = dedupedUsers;
        modified = true;
      }
      if (state && Array.isArray(state.audit)) {
        var dedupedAudit = [];
        for (var ai = 0; ai < state.audit.length; ai++) {
          var currA = state.audit[ai];
          if (!currA) continue;
          if (isChatChatter(currA.action)) {
            modified = true;
            continue; // strip chat / SMS messages from audit trail
          }
          if (!currA.ip) currA.ip = '127.0.0.1';
          var nextA = state.audit[ai + 1];
          if (nextA && currA.actor === nextA.actor && currA.action === nextA.action && currA.target === nextA.target && currA.detail === nextA.detail && Math.abs(new Date(currA.at).getTime() - new Date(nextA.at).getTime()) < 3000) {
            modified = true;
            continue; // skip duplicate adjacent log
          }
          dedupedAudit.push(currA);
        }
        state.audit = dedupedAudit;
      }
      if (state) {
        if (!Array.isArray(state.attendance)) { state.attendance = []; modified = true; }
        if (!Array.isArray(state.leaves)) { state.leaves = []; modified = true; }
        if (!Array.isArray(state.policies)) { state.policies = []; modified = true; }
        if (!Array.isArray(state.extended_info_fields)) { state.extended_info_fields = []; modified = true; }
        if (!Array.isArray(state.card_extended_fields)) { state.card_extended_fields = []; modified = true; }
        if (!Array.isArray(state.portal_extended_fields)) { state.portal_extended_fields = []; modified = true; }
        if (Array.isArray(state.departments)) {
          state.departments.forEach(function (d) {
            if (Array.isArray(d.levels) && d.levels.indexOf('intern') === -1) {
              d.levels.push('intern');
              modified = true;
            }
          });
        }
      }
      if (modified) write();
    }
    autoDiscoverApiUrl();
    syncWithServer();
    initSSE(); // start SSE immediately in parallel with first sync poll — don't wait for fetch to succeed
    fetchClientIp();
    return state;
  }

  /* ---- client IP resolution -------------------------------------------- */
  var currentClientIp = '127.0.0.1';
  function fetchClientIp() {
    if (typeof fetch !== 'function') return;
    try {
      fetch('https://api.ipify.org?format=json')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.ip) {
            currentClientIp = data.ip;
          }
        })
        .catch(function () {
          if (typeof window !== 'undefined' && window.location && window.location.hostname) {
            currentClientIp = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
          }
        });
    } catch (_) {}
  }
  fetchClientIp();

  function reset() {
    state = seed();
    write();
    emit();

    if (isHttp() && typeof fetch === 'function') {
      fetch('/api/reset', { method: 'POST' }).catch(function () {});
    }
  }

  /* ---- change notification --------------------------------------------- */
  function onChange(fn) {
    listeners.push(fn);
    return function () {
      var idx = listeners.indexOf(fn);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }
  function emit() { listeners.forEach(function (fn) { fn(); }); }

  function mutate(entry, fn) {
    if (entry && entry.action === 'user.delete') {
      var actorUser = byId(state.users, entry.actor) || byId(state.users, getSessionId());
      var targetUser = (state.users || []).find(function (u) {
        return u.name === entry.target || u.id === entry.target;
      });

      if (!actorUser || !actorUser.admin) {
        if (typeof OC !== 'undefined' && OC.ui && OC.ui.toast) {
          OC.ui.toast('Access Denied: Only System Admin can delete user accounts.', true);
        }
        return false;
      }
      if (actorUser && targetUser && actorUser.id === targetUser.id) {
        if (typeof OC !== 'undefined' && OC.ui && OC.ui.toast) {
          OC.ui.toast('Access Denied: System Admins cannot delete their own account.', true);
        }
        return false;
      }
      if (targetUser && targetUser.admin) {
        if (typeof OC !== 'undefined' && OC.ui && OC.ui.toast) {
          OC.ui.toast('Access Denied: System Admins cannot be deleted.', true);
        }
        return false;
      }
    }
    if (entry && entry.action === 'group.delete') {
      var actorUser = byId(state.users, entry.actor) || byId(state.users, getSessionId());
      if (!actorUser || !actorUser.admin) {
        if (typeof OC !== 'undefined' && OC.ui && OC.ui.toast) {
          OC.ui.toast('Access Denied: Only System Admin can delete groups.', true);
        }
        return false;
      }
    }
    if (entry && (entry.action === 'client.create' || entry.action === 'client.add')) {
      var actorUser = byId(state.users, entry.actor) || byId(state.users, getSessionId());
      if (!actorUser || !actorUser.admin) {
        if (typeof OC !== 'undefined' && OC.ui && OC.ui.toast) {
          OC.ui.toast('Access Denied: Only System Admin can add clients.', true);
        }
        return false;
      }
    }
    lastLocalMutationTime = Date.now();
    if (typeof fn === 'function') {
      fn();
    }
    if (entry) {
      if (entry.clientId) {
        _recentClientUpdates[entry.clientId] = Date.now();
      }
      if (entry.todoId) {
        _recentTodoUpdates[entry.todoId] = Date.now();
      }
      if (entry.instructionId) {
        _recentInstructionUpdates[entry.instructionId] = Date.now();
      }
      if (entry.userId) {
        _recentUserUpdates[entry.userId] = Date.now();
      }
      if (entry.tagId) {
        _recentTagUpdates[entry.tagId] = Date.now();
      }

      if (entry.action) {
        if (entry.action.indexOf('client.') === 0) {
          var targetKey = entry.clientId || entry.target;
          if (targetKey) {
            var cl = (state.clients || []).find(function (c) {
              return c.id === targetKey || c.client_id === targetKey || c.client_code === targetKey || c.client_number === targetKey || c.name === targetKey;
            });
            if (cl) {
              _recentClientUpdates[cl.id] = Date.now();
              if (entry.action === 'client.delete') markClientDeleted(cl.id);
            }
          }
          if (entry.clientId) {
            _recentClientUpdates[entry.clientId] = Date.now();
            if (entry.action === 'client.delete') markClientDeleted(entry.clientId);
            if (entry.action === 'client.create' || entry.action === 'client.add') trackClientCreated(entry.clientId);
          }
          if (entry.action === 'client.delete') {
            if (state && Array.isArray(state.clients)) {
              state.clients = state.clients.filter(function (c) {
                return !_deletedClientIds[c.id] && c.id !== entry.clientId && c.id !== entry.target && c.name !== entry.target && c.client_id !== entry.target;
              });
            }
          }
        }
        if (entry.action.indexOf('group.') === 0) {
          if (entry.groupId) {
            if (entry.action === 'group.create') trackGroupCreated(entry.groupId);
            if (entry.action === 'group.delete') markGroupDeleted(entry.groupId);
          }
          if (entry.action === 'group.delete' && entry.target) {
            var grp = (state.groups || []).find(function (g) { return g.name === entry.target || g.id === entry.target; });
            if (grp) markGroupDeleted(grp.id);
          }
        }
        if (entry.action.indexOf('todo.') === 0) {
          if (entry.todoId) _recentTodoUpdates[entry.todoId] = Date.now();
          if (entry.action === 'todo.delete' && entry.todoId) _deletedTodoIds[entry.todoId] = true;
          if (entry.target) {
            var td = byIdOrTitle(state.todos, entry.target);
            if (td) {
              _recentTodoUpdates[td.id] = Date.now();
              if (entry.action === 'todo.delete') _deletedTodoIds[td.id] = true;
            }
          }
        }
        if (entry.action.indexOf('instruction.') === 0) {
          if (entry.instructionId) _recentInstructionUpdates[entry.instructionId] = Date.now();
          if (entry.action === 'instruction.delete' && entry.instructionId) _deletedInstructionIds[entry.instructionId] = true;
        }
        if (entry.action.indexOf('department.') === 0) {
          if (entry.action === 'department.delete') {
            var targetDeptId = entry.departmentId;
            if (!targetDeptId && entry.target) {
              var foundDept = (state.departments || []).find(function (d) { return d.name === entry.target || d.id === entry.target; });
              if (foundDept) targetDeptId = foundDept.id;
            }
            if (targetDeptId) {
              _deletedDepartmentIds[targetDeptId] = true;
              try { localStorage.setItem('oc_deleted_departments', JSON.stringify(_deletedDepartmentIds)); } catch (_) {}
            }
          } else if (entry.action === 'department.create' && entry.departmentId) {
            delete _deletedDepartmentIds[entry.departmentId];
            try { localStorage.setItem('oc_deleted_departments', JSON.stringify(_deletedDepartmentIds)); } catch (_) {}
          }
        }
        if (entry.action.indexOf('user.') === 0 || entry.action.indexOf('account.') === 0 || entry.action.indexOf('department.member.') === 0) {
          var uTargetId = entry.userId || entry.user_id;
          if (!uTargetId && entry.target) {
            var foundU = (state.users || []).find(function (u) { return u.name === entry.target || u.id === entry.target || u.email === entry.target; });
            if (foundU) uTargetId = foundU.id;
          }
          if (!uTargetId && entry.actor) uTargetId = entry.actor;
          if (uTargetId) _recentUserUpdates[uTargetId] = Date.now();
          if (entry.action === 'user.delete') {
            var tu = (state.users || []).find(function (u) { return u.name === entry.target || u.id === entry.target; });
            if (tu) _deletedUserIds[tu.id] = true;
          }
        }
        if (entry.action.indexOf('foundation.') === 0 || entry.action.indexOf('policy.') === 0) {
          if (entry.action === 'foundation.delete' || entry.action === 'policy.delete') {
            if (entry.policyId) markPolicyDeleted(entry.policyId);
            if (entry.target) {
              var pol = (state.policies || []).find(function (p) { return p.title === entry.target || p.id === entry.target; });
              if (pol) markPolicyDeleted(pol.id);
            }
          } else if (entry.action === 'foundation.create' && entry.policyId) {
            unmarkPolicyDeleted(entry.policyId);
          }
        }
        if (entry.action.indexOf('tag.') === 0) {
          var tId = entry.tagId || (entry.tag && entry.tag.id);
          if (!tId && entry.target) {
            var foundTag = (state.tags || []).find(function (t) { return t.label === entry.target || t.id === entry.target; });
            if (foundTag) tId = foundTag.id;
          }
          if (tId) {
            if (entry.action === 'tag.delete') {
              markTagDeleted(tId);
              if (state && Array.isArray(state.tags)) {
                state.tags = state.tags.filter(function (t) { return t.id !== tId && !_deletedTagIds[t.id]; });
              }
            } else if (entry.action === 'tag.create') {
              trackTagCreated(tId);
            } else if (entry.action === 'tag.update' || entry.action === 'tag.rename') {
              _recentTagUpdates[tId] = Date.now();
              if (state && Array.isArray(state.tags)) {
                var tgtTag = state.tags.find(function (t) { return t.id === tId; });
                if (tgtTag && (entry.label || (entry.tag && entry.tag.label))) {
                  tgtTag.label = entry.label || entry.tag.label;
                }
              }
            }
          }
        }
      }

      var clientIp = entry.ip || currentClientIp || '127.0.0.1';
      state.audit = state.audit || [];
      var isDup = false;
      if (state.audit.length > 0) {
        var top = state.audit[0];
        if (top.actor === entry.actor && top.action === entry.action && top.target === entry.target && top.detail === (entry.detail || '') && (Date.now() - new Date(top.at).getTime()) < 3000) {
          isDup = true;
        }
      }
      if (!isDup && !isChatChatter(entry.action)) {
        state.audit.unshift({
          id: 'a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          actor: entry.actor, action: entry.action, target: entry.target,
          detail: entry.detail || '', ip: clientIp, at: new Date().toISOString()
        });
        if (state.audit.length > 1000) {
          state.audit = state.audit.slice(0, 1000);
        }
      }
    }
    write();
    emit();
    pushMutationToServer(entry);
  }

  /* Chat traffic is not an audit event. A message or SMS is already kept in
     its own channel or direct message thread, so logging it in the audit trail
     only duplicated it — and the trail is capped at 500 entries, so a busy day
     of chat quietly evicted the client and task history the log exists for.
     Any messages/SMS sent from Messages or Groups are excluded from the audit log.
     Channel/group create, edit, and delete still log: those change the workspace,
     not a conversation. */
  function isChatChatter(action) {
    if (typeof action !== 'string') return false;
    var act = action.toLowerCase();
    return act.indexOf('group.message') === 0 ||
           act.indexOf('group.sms') === 0 ||
           act.indexOf('message') === 0 ||
           act.indexOf('sms') === 0 ||
           act.indexOf('chat') === 0 ||
           act.indexOf('dm.') === 0;
  }

  function uid(prefix) {
    // 8 random chars (~2.8 trillion combinations) — much lower collision risk than 4 chars
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function generateUserId(email) {
    var base = 'user';
    if (email && typeof email === 'string') {
      var parts = email.trim().toLowerCase().split('@');
      if (parts[0]) {
        base = parts[0].replace(/[^a-z0-9_-]/g, '');
        if (!base) base = 'user';
      }
    }
    var candidate = 'u-' + base;
    var existingUsers = (state && Array.isArray(state.users)) ? state.users : [];
    var existingIds = {};
    for (var i = 0; i < existingUsers.length; i++) {
      if (existingUsers[i] && existingUsers[i].id) {
        existingIds[existingUsers[i].id] = true;
      }
    }
    if (!existingIds[candidate]) {
      return candidate;
    }
    var counter = 2;
    while (existingIds[candidate + '-' + counter]) {
      counter++;
    }
    return candidate + '-' + counter;
  }

  /* ---- lookups --------------------------------------------------------- */
  function byId(list, id) {
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function byIdOrName(list, key) {
    if (!list || !key) return null;
    var clean = String(key).trim().toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (item.id === key) return item;
      if (item.name && item.name.toLowerCase() === clean) return item;
      if (item.id && item.id.toLowerCase() === clean) return item;
    }
    return null;
  }

  function byIdOrTitle(list, key) {
    if (!list || !key) return null;
    var clean = String(key).trim().toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (item.id === key) return item;
      if (item.title && item.title.toLowerCase() === clean) return item;
      if (item.name && item.name.toLowerCase() === clean) return item;
    }
    return null;
  }

  var api = {
    load: load,
    reset: reset,
    sync: syncWithServer,
    save: write,
    onChange: onChange,
    emit: emit,
    mutate: mutate,
    uid: uid,
    generateUserId: generateUserId,
    isChatChatter: isChatChatter,
    get state() { return state; },

    user: function (id) { return byId(state.users, id); },
    userByEmail: function (email) {
      if (!email || !state.users) return null;
      var clean = String(email).trim().toLowerCase();
      for (var i = 0; i < state.users.length; i++) {
        if (String(state.users[i].email).trim().toLowerCase() === clean) return state.users[i];
      }
      return null;
    },
    department: function (id) { return byIdOrName(state.departments, id); },
    client: function (id) { return byIdOrName(state.clients, id); },
    group: function (id) { return byIdOrName(state.groups, id); },
    tag: function (id) { return byId(state.tags, id); },
    todo: function (id) { return byId(state.todos, id); },
    instruction: function (id) { return byId(state.instructions, id); },

    /* the signed-in account, held separately from the data itself */
    session: function () {
      return getSessionId();
    },
    setSession: function (id) {
      try { localStorage.setItem(SESSION_KEY, id); } catch (e) {}
      if (sseSource) {
        try { sseSource.close(); } catch (_) {}
        sseSource = null;
        initSSE();
      }
      emit();
    },

    /* a single use link and password that expires 72 hours after it is issued (6.1) */
    issueInvite: function (byUserId, meta) {
      var expires = new Date();
      expires.setHours(expires.getHours() + 72);
      var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      var rand = '';
      for (var i = 0; i < 10; i++) {
        rand += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      var passcode = 'OC-' + rand;
      var payload = {
        by: byUserId,
        id: meta ? (meta.id || '') : '',
        exp: expires.getTime(),
        pass: passcode,
        email: meta ? meta.email : '',
        name: meta ? meta.name : '',
        dept: meta ? meta.department : '',
        lvl: meta ? meta.level : ''
      };
      var token = 'inv-' + Math.random().toString(36).slice(2, 8);
      try {
        var rawJson = JSON.stringify(payload);
        var b64 = btoa(unescape(encodeURIComponent(rawJson))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        token = 'inv-' + b64;
      } catch (e) {}

      return {
        token: token,
        passcode: passcode,
        issued_by: byUserId,
        issued_at: new Date().toISOString(),
        expires_at: expires.toISOString(),
        claimed_at: null
      };
    },

    inviteExpired: function (invite) {
      return !!invite && !invite.claimed_at && new Date(invite.expires_at) < new Date();
    },

    comment: function (kind, id, body, authorId, extra) {
      var host = kind === 'todo' ? api.todo(id) : api.instruction(id);
      if (!host) return null;
      var entry = {
        id: api.uid('c'), author: authorId, body: body,
        posted_at: new Date().toISOString()
      };
      if (extra && extra.reply_to) entry.reply_to = extra.reply_to;
      host.comments = host.comments || [];
      host.comments.push(entry);
      return entry;
    },

    editComment: function (kind, id, commentId, body) {
      var host = kind === 'todo' ? api.todo(id) : api.instruction(id);
      if (!host || !host.comments) return null;
      var target = null;
      for (var i = 0; i < host.comments.length; i++) {
        if (host.comments[i].id === commentId) {
          target = host.comments[i];
          break;
        }
      }
      if (!target) return null;
      target.body = body;
      target.edited_at = new Date().toISOString();
      return target;
    },

    deleteComment: function (kind, id, commentId) {
      var host = kind === 'todo' ? api.todo(id) : api.instruction(id);
      if (!host || !host.comments) return;
      host.comments = host.comments.filter(function (c) { return c.id !== commentId; });
      return host.comments;
    },

    deleteInstruction: function (id) {
      if (!id) return;
      markInstructionDeleted(id);
      if (state.instructions) {
        state.instructions = state.instructions.filter(function (n) { return n.id !== id; });
      }
      try {
        var apiUrl = (typeof api.getApiUrl === 'function')
          ? api.getApiUrl('/api/instructions/' + encodeURIComponent(id))
          : ('/api/instructions/' + encodeURIComponent(id));
        if (typeof fetch === 'function') {
          fetch(apiUrl, { method: 'DELETE', headers: { 'bypass-tunnel-reminder': 'true' } }).catch(function () {});
        }
      } catch (_) {}
    },

    deleteTodo: function (id) {
      if (!id) return;
      markTodoDeleted(id);
      if (state.todos) {
        state.todos = state.todos.filter(function (t) { return t.id !== id; });
      }
      try {
        var apiUrl = (typeof api.getApiUrl === 'function')
          ? api.getApiUrl('/api/todos/' + encodeURIComponent(id))
          : ('/api/todos/' + encodeURIComponent(id));
        if (typeof fetch === 'function') {
          fetch(apiUrl, { method: 'DELETE', headers: { 'bypass-tunnel-reminder': 'true' } }).catch(function () {});
        }
      } catch (_) {}
    },

    deleteClient: function (id) {
      if (!id) return;
      markClientDeleted(id);
      if (state.clients) {
        state.clients = state.clients.filter(function (c) { return c.id !== id; });
      }
      try {
        var apiUrl = (typeof api.getApiUrl === 'function')
          ? api.getApiUrl('/api/clients/' + encodeURIComponent(id))
          : ('/api/clients/' + encodeURIComponent(id));
        if (typeof fetch === 'function') {
          fetch(apiUrl, { method: 'DELETE', headers: { 'bypass-tunnel-reminder': 'true' } }).catch(function () {});
        }
      } catch (_) {}
    },

    deleteGroup: function (id) {
      if (!id) return;
      /* Mark as deleted so syncWithServer never re-pushes this group
         back to the server from stale local state. */
      markGroupDeleted(id);
      if (state.groups) {
        state.groups = state.groups.filter(function (g) { return g.id !== id; });
      }
      try {
        var apiUrl = (typeof api.getApiUrl === 'function')
          ? api.getApiUrl('/api/groups/' + encodeURIComponent(id))
          : ('/api/groups/' + encodeURIComponent(id));
        if (typeof fetch === 'function') {
          fetch(apiUrl, { method: 'DELETE', headers: { 'bypass-tunnel-reminder': 'true' } }).catch(function () {});
        }
      } catch (_) {}
    },

    addGroupMessage: function (groupId, text, authorId, extra) {
      var group = api.group(groupId);
      if (!group) return null;
      var msg = {
        id: api.uid('gm'),
        author: authorId,
        text: text,
        created_at: new Date().toISOString(),
        reactions: {}
      };
      if (extra && typeof extra === 'object') {
        if (extra.media) msg.media = extra.media;
        if (extra.poll) msg.poll = extra.poll;
        if (extra.reply_to) msg.reply_to = extra.reply_to;
      }
      group.messages = group.messages || [];
      group.messages.push(msg);
      return msg;
    },

    voteGroupPoll: function (groupId, messageId, optionId, userId) {
      var group = api.group(groupId);
      if (!group || !group.messages) return null;
      var msg = null;
      for (var i = 0; i < group.messages.length; i++) {
        if (group.messages[i].id === messageId) {
          msg = group.messages[i];
          break;
        }
      }
      if (!msg || !msg.poll || !msg.poll.options) return null;
      var poll = msg.poll;
      poll.options.forEach(function (opt) {
        opt.voters = opt.voters || [];
        var idx = opt.voters.indexOf(userId);
        if (opt.id === optionId) {
          if (idx > -1) {
            opt.voters.splice(idx, 1);
          } else {
            opt.voters.push(userId);
          }
        } else if (!poll.multi) {
          // If single-choice poll, remove vote from other options
          if (idx > -1) {
            opt.voters.splice(idx, 1);
          }
        }
      });
      return poll;
    },

    editGroupMessage: function (groupId, messageId, newText) {
      var group = api.group(groupId);
      if (!group || !group.messages) return null;
      var msg = null;
      for (var i = 0; i < group.messages.length; i++) {
        if (group.messages[i].id === messageId) {
          msg = group.messages[i];
          break;
        }
      }
      if (!msg) return null;
      msg.text = newText;
      msg.edited_at = new Date().toISOString();
      return msg;
    },

    deleteGroupMessage: function (groupId, messageId) {
      var group = api.group(groupId);
      if (!group || !group.messages) return;
      group.messages = group.messages.filter(function (m) { return m.id !== messageId; });
      return group.messages;
    },

    reactGroupMessage: function (groupId, messageId, emoji, userId) {
      var group = api.group(groupId);
      if (!group || !group.messages) return null;
      var msg = null;
      for (var i = 0; i < group.messages.length; i++) {
        if (group.messages[i].id === messageId) {
          msg = group.messages[i];
          break;
        }
      }
      if (!msg) return null;
      msg.reactions = msg.reactions || {};
      var list = (msg.reactions[emoji] || []).slice();
      var idx = list.indexOf(userId);
      if (idx > -1) {
        list.splice(idx, 1);
        if (list.length === 0) delete msg.reactions[emoji];
        else msg.reactions[emoji] = list;
      } else {
        list.push(userId);
        msg.reactions[emoji] = list;
      }
      return msg.reactions;
    },

    react: function (kind, id, emoji, userId) {
      var host = kind === 'todo' ? api.todo(id) : api.instruction(id);
      if (!host) return null;
      host.reactions = host.reactions || {};
      var list = (host.reactions[emoji] || []).slice();
      var idx = list.indexOf(userId);
      if (idx > -1) {
        list.splice(idx, 1);
        if (list.length === 0) {
          delete host.reactions[emoji];
        } else {
          host.reactions[emoji] = list;
        }
      } else {
        list.push(userId);
        host.reactions[emoji] = list;
      }
      return host.reactions;
    },

    /* A direct message is a conversation between exactly two people. It reuses
       the group record — same messages, replies, reactions, media — but carries
       dm:true so it never appears among the channels, and its membership is the
       two participants and nobody else. The pair key is order-independent, so
       whichever of the two opens it first, both land in the same conversation. */
    dmKey: function (a, b) {
      return [String(a), String(b)].sort().join('~');
    },

    findDirect: function (a, b) {
      if (!a || !b || a === b) return null;
      var key = api.dmKey(a, b);
      return (state.groups || []).find(function (g) {
        return g.dm === true && g.dm_key === key;
      }) || null;
    },

    openDirect: function (a, b) {
      if (!a || !b || a === b) return null;
      var existing = api.findDirect(a, b);
      if (existing) return existing;
      var convo = {
        id: api.uid('dm'),
        dm: true,
        dm_key: api.dmKey(a, b),
        name: 'Direct message',
        purpose: '',
        status: 'active',
        created_by: a,
        created_at: new Date().toISOString(),
        members: [a, b],
        messages: []
      };
      state.groups = state.groups || [];
      state.groups.push(convo);
      trackGroupCreated(convo.id);
      write();
      return convo;
    },

    trackGroupCreated: trackGroupCreated,
    markGroupDeleted: markGroupDeleted,
    trackClientCreated: trackClientCreated,
    markClientDeleted: markClientDeleted,
    trackTodoCreated: trackTodoCreated,
    markTodoDeleted: markTodoDeleted,
    trackInstructionCreated: trackInstructionCreated,
    markInstructionDeleted: markInstructionDeleted,
    markDepartmentDeleted: markDepartmentDeleted,
    markPolicyDeleted: markPolicyDeleted,
    unmarkPolicyDeleted: unmarkPolicyDeleted,
    markUserDeleted: markUserDeleted,

    /* Returns array of user IDs currently connected (online) via SSE */
    onlineUserIds: function () { return _onlineUserIds.slice(); },

    notify: function (userIds, text, ref) {
      if (!userIds) return;
      if (!Array.isArray(userIds)) userIds = [userIds];
      var currentSession = api.session();
      // Ensure sender never notifies themselves during multi-user broadcasts
      if (userIds.length > 1 && currentSession) {
        userIds = userIds.filter(function (uid_) { return uid_ && uid_ !== currentSession; });
      }
      if (!userIds.length) return;
      var msg = (typeof text === 'object' && text !== null)
        ? (text.title ? (text.title + ' — ' + (text.body || '')) : (text.body || JSON.stringify(text)))
        : String(text || '');
      var at = new Date().toISOString();
      state.notifications = state.notifications || [];
      userIds.forEach(function (uid_) {
        state.notifications.unshift({
          id: 'nt-' + Date.now() + '-' + uid_ + Math.random().toString(36).slice(2, 7),
          user: uid_, text: msg, ref: ref || null, at: at, read: false
        });
      });
      write();
      emit();
      pushMutationToServer({ actor: 'system', action: 'notification.send', target: msg, detail: 'notified ' + userIds.length + ' users' });
    },

    clearNotifications: function (userId) {
      if (!state) return;
      var targetUser = userId || api.session();
      state.notifications = (state.notifications || []).filter(function (n) {
        return targetUser ? n.user !== targetUser : false;
      });
      write();
      emit();
      pushMutationToServer({
        actor: targetUser || 'system',
        action: 'notifications.clear',
        target: targetUser || 'all',
        detail: 'Cleared personal notifications'
      });
    },

    markTagDeleted: markTagDeleted,
    trackTagCreated: trackTagCreated
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', flushPendingMutations);
  }

  return api;
})();
