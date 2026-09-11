/* =========================================================================
   logic.js — Originate Command Core Business & Domain Logic (OM SRS 001)
   Provides pure functions for:
   - Seeding default workspace state (departments, users, clients, tags, todos, etc.)
   - Recurring todo instance generation (daily, weekly, monthly, quarterly)
   - Overdue escalation recipient routing (lead -> head -> leadership/admin)
   - 72-hour invite token generation & validity verification
   - Department hierarchy claims calculation
   - Outbound notification formatting (email, Discord webhooks)
   ========================================================================= */

'use strict';

/* ---- Date helpers -------------------------------------------------------- */
function makeISO(d) { return d.toISOString().slice(0, 10); }

function shift(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return makeISO(d);
}

function stamp(daysAgo, hour) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour || 10, 5, 0, 0);
  return d.toISOString();
}

/* ---- Seed data generator (Section 5.0 of OM SRS 001) -------------------- */
function seed() {
  const departments = [
    { id: 'd-admin',    name: 'Admin & HR',              levels: ['head', 'member', 'intern'] },
    { id: 'd-bizops',   name: 'Business Operations',     levels: ['head', 'member', 'intern'] },
    { id: 'd-leadgen',  name: 'Lead Generation',         levels: ['head', 'member', 'intern'] },
    { id: 'd-outreach', name: 'Outreach Operations',     levels: ['head', 'member', 'intern'] },
    { id: 'd-social',   name: 'Social Media Management', levels: ['head', 'member', 'intern'] },
    { id: 'd-web',      name: 'Development Operations',  levels: ['head', 'member', 'intern'] }
  ];

  const users = [
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

  const clients = [];
  const tags = [
    { id: 't-urgent', label: 'Urgent', color: 'red' },
    { id: 't-client', label: 'Client Facing', color: 'amber' },
    { id: 't-internal', label: 'Internal', color: 'blue' },
    { id: 't-infra', label: 'Infrastructure', color: 'purple' },
    { id: 't-copy', label: 'Copy / Creative', color: 'green' },
    { id: 't-audit', label: 'Audit Required', color: 'pink' }
  ];

  return {
    version: 1,
    departments,
    users,
    clients,
    tags,
    groups: [],
    todos: [],
    instructions: [],
    audit: [],
    notifications: [],
    attendance: [],
    leaves: [],
    extended_info_fields: [],
    card_extended_fields: [],
    portal_extended_fields: []
  };
}

/* ---- Claims Calculation (Section 3.0 & 8.1) ------------------------------ */
function claimsFor(user, departmentsById) {
  const departments = {};
  (user.departments || []).forEach(m => {
    const dept = departmentsById[m.department];
    if (!dept) return;
    const rank = dept.levels.indexOf(m.level);
    if (rank === -1) return;
    departments[m.department] = rank;
  });
  return { admin: user.admin === true, departments };
}

/* ---- Recurrence Calculations (Section 6.2) ------------------------------- */
const PERIODS = ['daily', 'weekly', 'monthly', 'quarterly'];

function addMonths(date, n) {
  const target = new Date(date.getTime());
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function nextDue(dueDate, recurrence) {
  if (!dueDate || !PERIODS.includes(recurrence)) return null;
  const d = new Date(dueDate + 'T12:00:00Z');
  if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  if (recurrence === 'monthly') return addMonths(d, 1).toISOString().slice(0, 10);
  if (recurrence === 'quarterly') return addMonths(d, 3).toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function nextInstance(todo, now) {
  if (!todo.recurrence || todo.recurrence === 'none') return null;
  const copy = Object.assign({}, todo);
  delete copy.id;
  copy.state = 'open';
  copy.blocked_reason = null;
  copy.spawned_from = todo.id;
  copy.due = nextDue(todo.due, todo.recurrence);
  copy.created_at = (now || new Date()).toISOString();
  copy.comments = [];
  return copy;
}

/* ---- Escalation routing (Section 9.4) ------------------------------------ */
function daysLate(dueDate, today) {
  if (!dueDate) return 0;
  const dueStr = String(dueDate).trim();
  const due = Date.parse(dueStr.includes('T') ? dueStr : dueStr + 'T12:00:00Z');
  const todayStr = String(today || new Date().toISOString().slice(0, 10)).trim();
  const now = Date.parse(todayStr.includes('T') ? todayStr : todayStr + 'T12:00:00Z');
  if (isNaN(due) || isNaN(now)) return 0;
  return Math.round((now - due) / 86400000);
}

function escalationRecipients(todo, people, today) {
  const late = daysLate(todo.due, today);
  if (todo.state === 'done' || late < 1) return [];

  const depts = (Array.isArray(todo.departments) && todo.departments.length) ? todo.departments : (todo.department ? [todo.department] : []);
  const rankOf = function (person) {
    let best = null;
    (person.departments || []).forEach(x => {
      if (depts.includes(x.department)) {
        const r = (x.rank != null) ? x.rank : (x.level === 'head' ? 0 : (x.level === 'intern' ? 2 : 1));
        if (best === null || r < best) best = r;
      }
    });
    return best;
  };

  let assignees = [];
  if (Array.isArray(todo.assignees) && todo.assignees.length) {
    todo.assignees.forEach(aid => {
      if (typeof aid === 'string' && aid.indexOf('user:') === 0) {
        assignees.push(aid.slice(5));
      } else if (typeof aid === 'string' && aid.indexOf('group:') === 0) {
        const gid = aid.slice(6);
        const gMembers = (todo.groupMembersMap && todo.groupMembersMap[gid]) || [];
        if (gMembers.length) assignees.push(...gMembers);
        else assignees.push(aid);
      } else {
        const gMembers = (todo.groupMembersMap && todo.groupMembersMap[aid]) || [];
        if (gMembers.length) assignees.push(...gMembers);
        else assignees.push(aid);
      }
    });
  } else if (todo.assignee_type === 'group') {
    assignees = (todo.groupMembers || []).slice();
  } else if (todo.assignee) {
    assignees = [todo.assignee];
  }

  const out = Array.from(new Set(assignees));
  const add = function (ids) {
    ids.forEach(id => { if (!out.includes(id)) out.push(id); });
  };

  if (late >= 1) add(people.filter(p => rankOf(p) === 0).map(p => p.id));
  if (late >= 2) add(people.filter(p => p.admin === true).map(p => p.id));
  return out;
}

/* ---- Single Use 72-Hour Invite Tokens (Section 6.1) ---------------------- */
const INVITE_HOURS = 72;

function generateUserId(email, existingUsers) {
  let base = 'user';
  if (email && typeof email === 'string') {
    const parts = email.trim().toLowerCase().split('@');
    if (parts[0]) {
      base = parts[0].replace(/[^a-z0-9_-]/g, '');
      if (!base) base = 'user';
    }
  }
  const candidate = 'u-' + base;
  const list = Array.isArray(existingUsers) ? existingUsers : [];
  const existingIds = new Set(list.map(u => (u && u.id) || ''));
  if (!existingIds.has(candidate)) {
    return candidate;
  }
  let counter = 2;
  while (existingIds.has(`${candidate}-${counter}`)) {
    counter++;
  }
  return `${candidate}-${counter}`;
}

function issueInvite(byUserId, meta, now) {
  let issued = now;
  if (!issued || !(issued instanceof Date)) {
    if (meta instanceof Date) {
      issued = meta;
      meta = null;
    } else {
      issued = new Date();
    }
  }
  const expires = new Date(issued.getTime() + INVITE_HOURS * 3600 * 1000);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let rand = '';
  for (let i = 0; i < 10; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const passcode = 'OC-' + rand;
  let targetId = meta ? (meta.id || '') : '';
  if (!targetId && meta && meta.email) {
    targetId = generateUserId(meta.email);
  }
  const payload = {
    by: byUserId,
    id: targetId,
    exp: expires.getTime(),
    pass: passcode,
    email: meta ? meta.email : '',
    name: meta ? meta.name : '',
    dept: meta ? meta.department : '',
    lvl: meta ? meta.level : ''
  };
  let token = 'inv-' + Math.random().toString(36).slice(2, 10);
  try {
    const rawJson = JSON.stringify(payload);
    const b64 = Buffer.from(rawJson, 'utf8').toString('base64url');
    token = 'inv-' + b64;
  } catch (_) {}

  return {
    token: token,
    passcode: passcode,
    issued_by: byUserId,
    issued_at: issued.toISOString(),
    expires_at: expires.toISOString(),
    claimed_at: null
  };
}

function inviteUsable(invite, now) {
  if (!invite) return false;
  if (invite.claimed_at) return false;
  return new Date(invite.expires_at) > (now || new Date());
}

/* ---- Outbound Message Helpers (Section 9.2, 9.3) ------------------------- */
function inviteEmail(account, baseUrl) {
  return {
    subject: 'Your Originate Command account',
    text: [
      'Hello ' + account.name + ',',
      '',
      'An account has been created for you on Originate Command.',
      'Gmail: ' + account.email,
      'Temporary 72-Hour Password: ' + (account.invite ? account.invite.passcode : 'OC-72PASS'),
      '',
      'Follow this link or enter your credentials on the login page:',
      baseUrl.replace(/\/$/, '') + '/#claim=' + (account.invite ? account.invite.token : ''),
      '',
      'Both the link and password stop working ' + INVITE_HOURS + ' hours after issuance.',
      'If you were not expecting this, ignore it and the invite will lapse.'
    ].join('\n')
  };
}

function discordPayload(instruction, clientName, authorName) {
  return {
    username: 'Originate Command',
    embeds: [{
      title: 'Instruction · ' + clientName,
      description: String(instruction.body).slice(0, 1800),
      footer: { text: 'posted by ' + authorName }
    }]
  };
}

module.exports = {
  seed,
  makeISO,
  shift,
  stamp,
  claimsFor,
  PERIODS,
  addMonths,
  nextDue,
  nextInstance,
  daysLate,
  escalationRecipients,
  generateUserId,
  issueInvite,
  inviteUsable,
  INVITE_HOURS,
  inviteEmail,
  discordPayload
};
