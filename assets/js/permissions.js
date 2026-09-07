/* =========================================================================
   permissions.js — the permission engine
   Implements section 3.0 of the specification. Authority is computed from a
   level's position in its own department's ordered hierarchy list (3.4), not
   from hardcoded role names, so a department can add levels without changing
   this file. Rank 0 is the top of a department; higher numbers are further
   down. Authority never crosses into another department (3.0) — only group
   membership (4.2) cuts across.

   In the specified build these same rules are enforced again in Firestore
   Security Rules (8.1). Here they gate the interface only, which is why the
   spec is explicit that a UI check is not a security boundary.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.can = (function () {
  'use strict';

  var S = function () { return OC.store; };

  /* ---- position in a department ---------------------------------------- */
  function levelIn(user, deptId) {
    if (!user || !deptId) return null;
    var targetDept = S().department(deptId);
    var targetId = targetDept ? targetDept.id : String(deptId).toLowerCase();
    var targetName = targetDept ? targetDept.name.toLowerCase() : String(deptId).toLowerCase();

    var userDepts = Array.isArray(user.departments) ? user.departments : [];
    if (user.department) userDepts = userDepts.concat([{ department: user.department, level: user.level || 'member' }]);
    if (user.invite && user.invite.department) userDepts = userDepts.concat([{ department: user.invite.department, level: user.invite.level || 'member' }]);

    for (var i = 0; i < userDepts.length; i++) {
      var m = userDepts[i];
      var mDept = (typeof m === 'string') ? m : (m && m.department);
      if (!mDept) continue;
      if (mDept === deptId || mDept === targetId || String(mDept).toLowerCase() === targetName || String(mDept).toLowerCase() === targetId) {
        return (m && m.level) || user.level || 'member';
      }
      var uDept = S().department(mDept);
      if (uDept && (uDept.id === targetId || uDept.name.toLowerCase() === targetName)) {
        return (m && m.level) || user.level || 'member';
      }
    }
    return null;
  }

  function rank(deptId, level) {
    if (!level) return Infinity;
    var norm = String(level).toLowerCase().trim();
    if (norm === 'head') return 0;
    if (norm === 'lead') return 1;
    var dept = S().department(deptId);
    if (!dept) {
      if (norm === 'member') return 1;
      if (norm === 'intern' || norm === 'ইন্টান') return 2;
      return Infinity;
    }
    var i = Array.isArray(dept.levels)
      ? dept.levels.map(function (l) { return String(l).toLowerCase().trim(); }).indexOf(norm)
      : -1;
    if (i !== -1) return i;
    if (norm === 'member') return 1;
    if (norm === 'intern' || norm === 'ইন্টান') return 2;
    return Infinity;
  }

  function rankOf(user, deptId) { return rank(deptId, levelIn(user, deptId)); }

  function isHead(user, deptId) {
    if (!user) return false;
    if (user.admin) return true;
    if (!deptId) return false;
    var targetDept = S().department(deptId);
    var targetId = targetDept ? targetDept.id : String(deptId).toLowerCase();
    if (targetDept && (targetDept.head === user.id || targetDept.head_id === user.id || targetDept.lead === user.id || (Array.isArray(targetDept.heads) && targetDept.heads.indexOf(user.id) !== -1))) return true;
    var r = rankOf(user, deptId);
    if (r === 0) return true;
    var userDepts = Array.isArray(user.departments) ? user.departments : [];
    for (var i = 0; i < userDepts.length; i++) {
      var m = userDepts[i];
      var mDept = (typeof m === 'string') ? m : (m && m.department);
      var mLevel = (m && m.level) || user.level || user.role;
      if ((mDept === deptId || mDept === targetId) && String(mLevel).toLowerCase().trim() === 'head') {
        return true;
      }
    }
    if (user.department && (user.department === deptId || user.department === targetId)) {
      if (String(user.level || user.role).toLowerCase().trim() === 'head') return true;
    }
    if (user.invite && user.invite.department && (user.invite.department === deptId || user.invite.department === targetId)) {
      if (String(user.invite.level || user.invite.role).toLowerCase().trim() === 'head') return true;
    }
    return false;
  }
  function isLead(user, deptId) { return rankOf(user, deptId) === 1; }
  function inDept(user, deptId) {
    if (!user || !deptId) return false;
    var targetDept = S().department(deptId);
    var targetId = targetDept ? targetDept.id : String(deptId).toLowerCase();
    var targetName = targetDept ? targetDept.name.toLowerCase() : String(deptId).toLowerCase();

    var userDepts = Array.isArray(user.departments) ? user.departments : [];
    if (user.department) userDepts = userDepts.concat([{ department: user.department, level: user.level || 'member' }]);
    if (user.invite && user.invite.department) userDepts = userDepts.concat([{ department: user.invite.department, level: user.invite.level || 'member' }]);

    return userDepts.some(function (m) {
      var mDept = (typeof m === 'string') ? m : (m && m.department);
      if (!mDept) return false;
      if (mDept === deptId || mDept === targetId) return true;
      var uDept = S().department(mDept);
      if (uDept) {
        if (uDept.id === targetId || uDept.name.toLowerCase() === targetName) return true;
      }
      if (String(mDept).toLowerCase() === targetName || String(mDept).toLowerCase() === targetId) return true;
      return false;
    });
  }

  function headOfAny(user) {
    if (!user) return false;
    if (user.admin) return true;
    var userDepts = departmentsOf(user);
    if (!userDepts.length && user.department) userDepts = [user.department];
    var allDepts = (S().state && S().state.departments) || [];
    for (var i = 0; i < allDepts.length; i++) {
      if (allDepts[i].head === user.id || allDepts[i].head_id === user.id || allDepts[i].lead === user.id) return true;
    }
    return userDepts.some(function (d) { return isHead(user, d); });
  }

  function departmentsOf(user) {
    return user ? (user.departments || []).map(function (m) { return m.department; }) : [];
  }

  /* ---- descriptive role, for display ----------------------------------- */
  function roleLabel(user) {
    if (!user) return 'Unknown';
    if (user.admin) return 'System Admin';
    if (!user.departments || !user.departments.length) {
      if (user.invite && user.invite.level) {
        var lvl = String(user.invite.level).toLowerCase().trim();
        if (lvl === 'head') return 'Department Head';
        if (lvl === 'lead') return 'Lead';
        if (lvl === 'admin') return 'System Admin';
        if (lvl === 'intern' || lvl === 'ইন্টান') return 'Intern';
        return 'Member';
      }
      return 'Member';
    }
    var best = null;
    user.departments.forEach(function (m) {
      var r = rank(m.department, m.level);
      if (!best || r < best.r) best = { r: r, level: m.level };
    });
    if (best && best.r === 0) return 'Department Head';
    /* keyed off the level's name, not its index: a department that ships only
       ['head','member'] puts "member" at index 1, so an index test labels every
       ordinary member a Team Lead. A department that does add a 'lead' level
       still reads correctly here. */
    if (best && String(best.level).toLowerCase().trim() === 'lead') return 'Team Lead';
    if (best && (String(best.level).toLowerCase().trim() === 'intern' || String(best.level).trim() === 'ইন্টান')) return 'Intern';
    return 'Member';
  }

  function roleClass(levelOrRole) {
    if (!levelOrRole) return '';
    var norm = String(levelOrRole).toLowerCase().trim();
    if (norm === 'head' || norm === 'department head') return 'role-head';
    if (norm === 'member' || norm === 'team member') return 'role-member';
    if (norm === 'intern' || norm === 'ইন্টান') return 'role-intern';
    if (norm === 'lead' || norm === 'team lead') return 'role-lead';
    if (norm === 'admin' || norm === 'system admin') return 'role-admin';
    return '';
  }

  /* ---- visibility ------------------------------------------------------ */
  function seeTodo(user, todo) {
    if (!user || !todo) return false;
    if (user.admin) return true;
    if (todo.created_by === user.id) return true;
    if (todo.assignee === user.id || (todo.assignee_type === 'user' && todo.assignee === user.id) || (Array.isArray(todo.assignees) && todo.assignees.indexOf(user.id) > -1)) return true;
    if (inGroup(user, todo.assignee) || (todo.assignee_type === 'group' && inGroup(user, todo.assignee))) return true;
    if (Array.isArray(todo.assignees) && todo.assignees.some(function (aid) {
      if (aid === user.id) return true;
      if (typeof aid === 'string') {
        if (aid.indexOf('user:') === 0 && aid.slice(5) === user.id) return true;
        if (aid.indexOf('group:') === 0 && inGroup(user, aid.slice(6))) return true;
      }
      return inGroup(user, aid);
    })) return true;
    /* A task routed to a department lands with that department's head, not
       with everyone in it. The head decides who picks it up; until they
       assign someone, the rest of the department has no business seeing it.
       Members reach a task through being assigned it (handled above), not
       through sharing a department with it. */
    if (todo.department && isHead(user, todo.department)) return true;
    if (Array.isArray(todo.departments) && todo.departments.some(function (d) { return isHead(user, d); })) return true;
    if (!todo.department && (!Array.isArray(todo.departments) || !todo.departments.length)) return true;
    return false;
  }

  function seeInstruction(user, note) {
    if (!user || !note) return false;
    if (user.admin) return true;
    if (note.author === user.id || note.posted_by === user.id) return true;
    if (Array.isArray(note.target_users) && note.target_users.indexOf(user.id) > -1) return true;
    if (Array.isArray(note.assignees) && note.assignees.indexOf(user.id) > -1) return true;
    if (note.assignee === user.id) return true;

    var depts = [];
    if (note.department) depts.push(note.department);
    if (Array.isArray(note.departments)) {
      note.departments.forEach(function (d) { if (d && depts.indexOf(d) === -1) depts.push(d); });
    }

    if (!depts.length || note.audience === 'all') return true;

    return depts.some(function (d) {
      return inDept(user, d);
    });
  }

  /* ---- assignment (3.2) ------------------------------------------------- */
  function assignTo(user, targetId) {
    if (!user) return false;
    if (user.admin) return true;
    var target = S().user(targetId);
    if (!target) return false;
    if (targetId === user.id) return true;           /* anyone may take work themselves */
    return user.departments.some(function (m) {
      var mine = rank(m.department, m.level);
      var theirs = rankOf(target, m.department);
      if (theirs === Infinity) return false;          /* not in this department */
      if (mine === 0) return true;                    /* head: anyone in department */
      return false;                                   /* members cannot assign to others */
    });
  }

  function assignableUsers(user) {
    return S().state.users.filter(function (u) { return assignTo(user, u.id); });
  }

  function inGroup(user, groupId) {
    if (!user || !groupId) return false;
    var g = S().group(groupId);
    if (!g) return false;
    return Array.isArray(g.members) && g.members.indexOf(user.id) > -1;
  }

  function assignToGroup(user, groupId) {
    if (!user) return false;
    if (user.admin || headOfAny(user)) return true;
    return inGroup(user, groupId);
  }

  function assignableGroups(user) {
    return (S().state.groups || []).filter(function (g) {
      return g.status === 'active' && assignToGroup(user, g.id);
    });
  }

  /* ---- creation and change --------------------------------------------- */
  function createGroup(user) { return !!(user && user.admin); }
  function postInstruction(user) { return !!user; }            /* 6.3, open to everyone */
  function createTodo(user) { return !!user; }                 /* but assignment is gated above */

  function changeState(user, todo) {
    if (!user || !todo) return false;
    if (user.admin) return true;
    if (todo.created_by === user.id) return true;
    if (isHead(user, todo.department)) return true;
    if (Array.isArray(todo.departments) && todo.departments.some(function (d) { return isHead(user, d); })) return true;
    if (todo.assignee_type === 'user' && (todo.assignee === user.id || (Array.isArray(todo.assignees) && todo.assignees.indexOf(user.id) > -1))) return true;
    if (todo.assignee_type === 'group' && inGroup(user, todo.assignee)) return true;
    if (Array.isArray(todo.assignees) && todo.assignees.some(function (aid) {
      if (aid === user.id) return true;
      if (typeof aid === 'string') {
        if (aid.indexOf('user:') === 0 && aid.slice(5) === user.id) return true;
        if (aid.indexOf('group:') === 0 && inGroup(user, aid.slice(6))) return true;
      }
      return inGroup(user, aid);
    })) return true;
    return todo.assignee_type === 'user' && assignTo(user, todo.assignee);
  }

  /* whether this account has authority over anyone at all besides itself.
     assignTo() lets anyone take work themselves, which must not be mistaken
     for the authority to move work between people (6.2). */
  function assignsOthers(user) {
    if (!user) return false;
    if (user.admin) return true;
    return S().state.users.some(function (t) { return t.id !== user.id && assignTo(user, t.id); });
  }

  function reassign(user, todo) {
    if (!user || !todo) return false;
    if (user.admin) return true;
    if (!assignsOthers(user)) return false;              /* members and seniors: never */
    if (isHead(user, todo.department)) return true;
    if (Array.isArray(todo.departments) && todo.departments.some(function (d) { return isHead(user, d); })) return true;
    if (todo.assignee_type === 'user') {
      return todo.assignee === user.id || assignTo(user, todo.assignee);
    }
    return assignToGroup(user, todo.assignee);
  }

  function archiveInstruction(user, note) {
    if (!user || !note) return false;
    if (user.admin) return true;
    if (note.author === user.id) return true;
    if (isHead(user, note.department)) return true;
    if (Array.isArray(note.departments) && note.departments.some(function (d) { return isHead(user, d); })) return true;
    return false;
  }

  function canEditInstruction(user, note) {
    return archiveInstruction(user, note);
  }

  function canDeleteInstruction(user, note) {
    return archiveInstruction(user, note);
  }

  function canEditComment(user, comment, item) {
    if (!user || !comment) return false;
    return user.admin || comment.author === user.id;
  }

  function canDeleteComment(user, comment, item) {
    if (!user || !comment) return false;
    if (user.admin || comment.author === user.id) return true;
    if (item) {
      if (item.department && isHead(user, item.department)) return true;
      if (Array.isArray(item.departments) && item.departments.some(function (d) { return isHead(user, d); })) return true;
    }
    return false;
  }

  function manageDepartment(user, deptId) {
    return !!user && (user.admin || isHead(user, deptId));
  }

  function isDirect(group) { return !!(group && group.dm === true); }

  function inConversation(user, group) {
    return !!(user && group && Array.isArray(group.members) && group.members.indexOf(user.id) > -1);
  }

  /* Groups: Visible and accessible STRICTLY to assigned members and System Admin.
     A direct message is the exception to the System Admin part — it is private
     to the two people in it, and an admin reading someone else's private
     messages is not something an admin badge should buy. */
  function seeGroup(user, group) {
    if (!user || !group) return false;
    if (isDirect(group)) return inConversation(user, group);
    if (user.admin) return true;
    return inConversation(user, group);
  }

  function canPostGroupMessage(user, group) {
    if (!user || !group) return false;
    if (isDirect(group)) return inConversation(user, group);
    return user.admin || inConversation(user, group);
  }

  function canReactGroupMessage(user, group) {
    return seeGroup(user, group);
  }

  /* a direct message has no name, purpose or membership to administer */
  function canEditGroup(user, group) {
    if (!user || !group || isDirect(group)) return false;
    return !!user.admin;
  }

  function canDeleteGroup(user, group) {
    if (!user || !group || isDirect(group)) return false;
    return !!user.admin;
  }

  function canEditGroupMessage(user, msg, group) {
    if (!user || !msg) return false;
    var mine = msg.author === user.id || msg.author_id === user.id;
    if (isDirect(group)) return mine;
    return user.admin || mine;
  }

  function canDeleteGroupMessage(user, msg, group) {
    if (!user || !msg) return false;
    var mine = msg.author === user.id || msg.author_id === user.id;
    /* inside a direct message only its author may remove a message */
    if (isDirect(group)) return mine;
    return user.admin || mine || (group && group.created_by === user.id);
  }

  /* Anyone signed in may write to anyone else who has an account. */
  function canDirectMessage(user, target) {
    if (!user || !target) return false;
    if (user.id === target.id) return false;
    return target.status !== 'invited' || !!user.admin;
  }

  function directMessageable(user) {
    if (!user) return [];
    return (S().state.users || []).filter(function (u) { return canDirectMessage(user, u); });
  }

  function invite(user) { return !!user && (user.admin || headOfAny(user)); }
  function createClient(user) { return !!(user && user.admin); }
  function canEditClient(user, client) { return !!(user && user.admin); }
  var editClient = canEditClient; // alias — identical logic, kept for backwards compat
  function canDeleteClient(user, client) { return !!(user && user.admin); }

  /* A client may be scoped to one or multiple departments.
     - System Admin: sees all clients across all departments.
     - Department Head: sees all clients belonging to their department(s).
     - Assigned members: if assignees are selected on the client, ONLY those selected
       members (along with Dept Head & System Admin) can see and work on the client.
     - General department members not selected/assigned cannot see or work on the client.
     - Legacy unscoped clients (no departments & no assignees): visible to all.
  */
  /* Does this person hold live work on this client? Assignment is how a task
     reaches someone, so it is also how the client behind that task should. */
  function hasTaskOnClient(user, clientId) {
    if (!user || !clientId) return false;
    var todos = (S().state && S().state.todos) || [];
    return todos.some(function (t) {
      if (!t || t.archived) return false;
      var onClient = t.client === clientId ||
        (Array.isArray(t.clients) && t.clients.indexOf(clientId) > -1);
      if (!onClient) return false;
      if (t.assignee === user.id) return true;
      if (Array.isArray(t.assignees) && t.assignees.some(function (aid) {
        if (aid === user.id) return true;
        return typeof aid === 'string' && aid.indexOf('user:') === 0 && aid.slice(5) === user.id;
      })) return true;
      if (t.department && isHead(user, t.department)) return true;
      if (Array.isArray(t.departments) && t.departments.some(function (d) { return isHead(user, d); })) return true;
      return false;
    });
  }

  function seeClient(user, client) {
    if (!user || !client) return false;
    if (user.admin) return true;

    var depts = Array.isArray(client.departments) && client.departments.length
      ? client.departments
      : (client.department ? [client.department] : []);

    var assignees = Array.isArray(client.assignees)
      ? client.assignees
      : (Array.isArray(client.assigned_users) ? client.assigned_users : null);

    // If this specific user is assigned to the client, they can see and work on it
    if (assignees && assignees.indexOf(user.id) > -1) {
      return true;
    }

    /* A head handing someone a task on this client is what puts the client in
       front of them. Without this the assignment landed but the client stayed
       shut, so the task never appeared in that person's Client Portal at all.
       Archiving the task takes the access away again. */
    if (hasTaskOnClient(user, client.id)) return true;

    if (depts.length) {
      // Department Heads of any of the client's departments see all clients in their department
      var isDeptHead = depts.some(function (deptId) { return isHead(user, deptId); });
      if (isDeptHead) return true;

      // If assignees list is defined, only assigned members (or dept head/admin) get access
      if (assignees !== null) {
        return false;
      }

      // If client has no assignees property defined yet (legacy scoped client),
      // check if user is a member of the department
      return depts.some(function (deptId) { return inDept(user, deptId); });
    }

    // Unscoped client
    if (assignees !== null) {
      return assignees.indexOf(user.id) > -1 || headOfAny(user);
    }
    return true;
  }

  function visibleClients(user) {
    if (!user) return [];
    return (S().state.clients || []).filter(function (c) { return seeClient(user, c); });
  }

  /* Who can assign members to a client: System Admin or Department Head of that client's department */
  function canAssignClientMembers(user, client) {
    if (!user) return false;
    if (user.admin) return true;
    if (!client) return false;
    var depts = Array.isArray(client.departments) && client.departments.length
      ? client.departments
      : (client.department ? [client.department] : []);
    if (!depts.length) return false;
    return depts.some(function (deptId) { return isHead(user, deptId); });
  }

  /* Eligible members who can be assigned to this client */
  function assignableClientMembers(client) {
    if (!client) return [];
    var depts = Array.isArray(client.departments) && client.departments.length
      ? client.departments
      : (client.department ? [client.department] : []);
    var allUsers = (S().state.users || []).filter(function (u) {
      return u && u.status !== 'archived' && u.status !== 'suspended';
    });
    if (!depts.length) return allUsers;
    return allUsers.filter(function (u) {
      return depts.some(function (d) { return inDept(u, d); });
    });
  }

  function canWorkOnClient(user, client) {
    return seeClient(user, client);
  }

  /* only the system admin decides which department a client belongs to */
  function assignClientDepartment(user) { return !!(user && user.admin); }

  /* an unclaimed invite may be withdrawn by whoever sent it, or by the
     system admin (6.1) */
  function manageInvite(user, account) {
    if (!user || !account || account.status !== 'invited') return false;
    return user.admin || (!!account.invite && account.invite.issued_by === user.id);
  }

  /* departments are data, not schema: the system admin may add one at any
     time and set the ordered hierarchy it uses (3.4, 4.1) */
  function manageDepartments(user) { return !!user && user.admin; }

  /* System Admin may edit any account; other persons can only see and edit their own account */
  function canEditAccount(actor, targetAccount) {
    if (!actor || !targetAccount) return false;
    if (actor.admin) return true;
    return actor.id === targetAccount.id;
  }

  function canDeleteAccount(actor, targetAccount) {
    if (!actor || !targetAccount) return false;
    if (!actor.admin) return false; // Only System Admin can delete accounts
    if (actor.id === targetAccount.id) return false; // System Admins cannot delete themselves
    if (targetAccount.admin) return false; // System Admins cannot be deleted by anyone
    return true;
  }

  /* System Admin, Department Head, or task creator may edit a todo (assignees cannot edit) */
  /* Editing a task belongs to whoever wrote it — a department head running the
     work is not the same as the person who set out what it says. Admin keeps
     it as the account of last resort. Everyone else, assignees included,
     changes state and comments rather than rewriting the task. */
  function canEditTodo(user, todo) {
    if (!user || !todo) return false;
    if (user.admin) return true;
    if (todo.created_by === user.id) return true;
    return false;
  }

  /* Comments are visible strictly to authorized viewers of the item and System Admin */
  function canSeeComments(user, item) {
    if (!user || !item) return false;
    if (user.admin) return true;
    if (item.due !== undefined || item.state !== undefined) {
      return seeTodo(user, item);
    }
    return seeInstruction(user, item);
  }

  function commentOnTodo(user, todo) { return canSeeComments(user, todo); }
  function commentOnInstruction(user, note) { return canSeeComments(user, note); }
  function seeAudit(user) { return !!user && user.admin; }

  /* people whose work this account may review in reports */
  function visibleUsers(user) {
    if (!user) return [];
    if (user.admin) return S().state.users.slice();
    var mine = departmentsOf(user);
    return S().state.users.filter(function (u) {
      if (u.id === user.id) return true;
      return u.departments.some(function (m) { return mine.indexOf(m.department) > -1; });
    });
  }

  /* ---- escalation chain (9.4) ------------------------------------------- */
  function escalationChain(todo) {
    var chain = [];
    var assignees = [];
    if (Array.isArray(todo.assignees) && todo.assignees.length) {
      todo.assignees.forEach(function (aid) {
        if (typeof aid === 'string' && aid.indexOf('user:') === 0) {
          assignees.push(aid.slice(5));
        } else if (typeof aid === 'string' && aid.indexOf('group:') === 0) {
          var gPrefixed = S().group(aid.slice(6)); // renamed from 'g' to avoid duplicate var in same scope
          if (gPrefixed && gPrefixed.members) assignees = assignees.concat(gPrefixed.members);
        } else {
          var gGeneric = S().group(aid);           // renamed from 'g'
          if (gGeneric && gGeneric.members) assignees = assignees.concat(gGeneric.members);
          else assignees.push(aid);
        }
      });
    } else if (todo.assignee_type === 'user') {
      assignees = [todo.assignee];
    } else {
      var gAssignee = S().group(todo.assignee);   // renamed from 'g'
      assignees = gAssignee ? gAssignee.members.slice() : [];
    }
    chain.push({ step: 'Assignee', users: assignees });

    var deptList = (Array.isArray(todo.departments) && todo.departments.length) ? todo.departments : (todo.department ? [todo.department] : []);
    var heads = S().state.users.filter(function (u) {
      return deptList.some(function (d) { return isHead(u, d); });
    }).map(function (u) { return u.id; });
    var leadership = S().state.users.filter(function (u) { return u.admin; }).map(function (u) { return u.id; });

    if (heads.length) chain.push({ step: 'Department head, day one', users: heads });
    chain.push({ step: 'System Admin, day two', users: leadership });
    return chain;
  }

  /* ---- foundation / policy management (strictly system admin only) ------- */
  function isSystemAdmin(user) {
    return Boolean(user && user.admin);
  }
  function canManageFoundation(user) {
    return Boolean(user && user.admin);
  }

  /* how far an overdue todo has climbed, by whole days late */
  function escalationReached(todo, daysLate) {
    if (daysLate < 1) return 0;
    return Math.min(daysLate, 2);
  }

  return {
    levelIn: levelIn, rank: rank, rankOf: rankOf,
    isHead: isHead, isLead: isLead, inDept: inDept, inGroup: inGroup,
    headOfAny: headOfAny, departmentsOf: departmentsOf, roleLabel: roleLabel, roleClass: roleClass,
    isSystemAdmin: isSystemAdmin, canManageFoundation: canManageFoundation,
    seeTodo: seeTodo, seeInstruction: seeInstruction, seeGroup: seeGroup,
    isDirect: isDirect, canDirectMessage: canDirectMessage, directMessageable: directMessageable,
    assignTo: assignTo, assignableUsers: assignableUsers,
    assignToGroup: assignToGroup, assignableGroups: assignableGroups,
    createGroup: createGroup, canEditGroup: canEditGroup, canDeleteGroup: canDeleteGroup,
    canPostGroupMessage: canPostGroupMessage, canEditGroupMessage: canEditGroupMessage, canDeleteGroupMessage: canDeleteGroupMessage,
    canReactGroupMessage: canReactGroupMessage,
    postInstruction: postInstruction, createTodo: createTodo,
    createClient: createClient, editClient: editClient, canEditClient: canEditClient, canDeleteClient: canDeleteClient,
    seeClient: seeClient, visibleClients: visibleClients, assignClientDepartment: assignClientDepartment,
    hasTaskOnClient: hasTaskOnClient,
    canAssignClientMembers: canAssignClientMembers, assignableClientMembers: assignableClientMembers, canWorkOnClient: canWorkOnClient,
    canEditTodo: canEditTodo,
    canEditInstruction: canEditInstruction, canDeleteInstruction: canDeleteInstruction,
    canEditComment: canEditComment, canDeleteComment: canDeleteComment,
    changeState: changeState, reassign: reassign, assignsOthers: assignsOthers, archiveInstruction: archiveInstruction,
    manageDepartment: manageDepartment, manageDepartments: manageDepartments,
    invite: invite, manageInvite: manageInvite, editAccount: canEditAccount, deleteAccount: canDeleteAccount, seeAudit: seeAudit,
    canSeeComments: canSeeComments, commentOnTodo: commentOnTodo, commentOnInstruction: commentOnInstruction,
    visibleUsers: visibleUsers,
    escalationChain: escalationChain, escalationReached: escalationReached
  };
})();
