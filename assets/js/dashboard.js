/* =========================================================================
   dashboard.js — the personal dashboard (6.7)
   What one account sees on arrival: their open todos grouped by client with
   the oldest due date first, the instructions addressed to them with unread
   surfaced, the clients they currently hold work for, and their groups.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.dashboard = (function () {
  'use strict';

  function me() { return OC.store.user(OC.store.session()); }

  var showUpcoming = true;
  var showDoneTodos = false;

  /* The instruction panel already stops at 12; the todo panel did not, so a
     person with hundreds of open tasks paid for all of them on every render. */
  var TODO_PAGE = 40;
  var todoLimit = TODO_PAGE;

  /* Assignee / author filter — null means show all */
  var todoFilterUser = null;   /* user id string or null */
  var noteFilterUser = null;   /* user id string or null */
  var openAssigneePopover = null; /* 'todos' | 'notes' | null */

  /* Returns todos that belong on THIS user's own dashboard panel:
     - Tasks directly assigned to them (user or group membership)
     - Department Head: also sees tasks routed to their department(s)
     - System Admin: also sees unassigned tasks waiting for routing
     Deliberately excludes tasks where the user is merely the creator but
     not the assignee — those live on the board, not the personal dashboard. */
  function allMyTodos(user) {
    if (!user || !OC.store.state.todos) return [];
    return OC.store.state.todos.filter(function (t) {
      if (t.archived || t.state === 'done') return false;
      // Check single-assignee fields
      if (t.assignee === user.id || (t.assignee_type === 'user' && t.assignee === user.id)) return true;
      if (OC.can.inGroup(user, t.assignee) || (t.assignee_type === 'group' && OC.can.inGroup(user, t.assignee))) return true;
      // Check multi-assignee array (handles raw ids, user:uid, group:gid prefixes)
      if (Array.isArray(t.assignees) && t.assignees.some(function (aid) {
        if (aid === user.id) return true;
        if (typeof aid === 'string') {
          if (aid.indexOf('user:') === 0 && aid.slice(5) === user.id) return true;
          if (aid.indexOf('group:') === 0 && OC.can.inGroup(user, aid.slice(6))) return true;
        }
        return OC.can.inGroup(user, aid);
      })) return true;
      // Department Head sees tasks routed to their department(s)
      if (t.department && OC.can.isHead(user, t.department)) return true;
      if (Array.isArray(t.departments) && t.departments.some(function (d) { return OC.can.isHead(user, d); })) return true;
      // Creator sees it on their dashboard ONLY if no one is assigned yet
      if ((t.created_by === user.id || t.author === user.id) && (!t.assignee && (!Array.isArray(t.assignees) || !t.assignees.length))) return true;
      // System Admin sees unassigned tasks waiting for assignment/routing
      if (user.admin && (!t.assignee && (!Array.isArray(t.assignees) || !t.assignees.length))) return true;
      return false;
    }).sort(function (a, b) {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return (a.due || '').localeCompare(b.due || '');
    });
  }

  function isCompletedToday(t) {
    if (!t) return false;
    var compIso = t.completed_at || (t.state === 'done' ? (t.updated_at && t.updated_at !== t.created_at ? t.updated_at : null) : null);
    if (!compIso && t.completed_at) compIso = t.completed_at;
    if (!compIso) return false;
    var d = new Date(compIso);
    if (isNaN(d.getTime())) return false;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var compDay = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    var todayDay = (OC.ui && typeof OC.ui.today === 'function') ? OC.ui.today() : (function () {
      var now = new Date();
      return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    })();
    return compDay === todayDay;
  }
  var isCompletedWithin24Hours = isCompletedToday; // backward-compatibility alias

  /* Completed todos that belong on THIS user's dashboard (same scoping rules
     as allMyTodos but for state === 'done' items). */
  function allMyDoneTodos(user) {
    if (!user || !OC.store.state.todos) return [];
    return OC.store.state.todos.filter(function (t) {
      if (t.archived || t.state !== 'done') return false;
      // Check single-assignee fields
      if (t.assignee === user.id || (t.assignee_type === 'user' && t.assignee === user.id)) return true;
      if (OC.can.inGroup(user, t.assignee) || (t.assignee_type === 'group' && OC.can.inGroup(user, t.assignee))) return true;
      // Check multi-assignee array (handles raw ids, user:uid, group:gid prefixes)
      if (Array.isArray(t.assignees) && t.assignees.some(function (aid) {
        if (aid === user.id) return true;
        if (typeof aid === 'string') {
          if (aid.indexOf('user:') === 0 && aid.slice(5) === user.id) return true;
          if (aid.indexOf('group:') === 0 && OC.can.inGroup(user, aid.slice(6))) return true;
        }
        return OC.can.inGroup(user, aid);
      })) return true;
      // Department Head sees completed tasks in their department
      if (t.department && OC.can.isHead(user, t.department)) return true;
      if (Array.isArray(t.departments) && t.departments.some(function (d) { return OC.can.isHead(user, d); })) return true;
      // Creator sees completed todo on dashboard ONLY if they were also the sole person (no assignee)
      if ((t.created_by === user.id || t.author === user.id) && (!t.assignee && (!Array.isArray(t.assignees) || !t.assignees.length))) return true;
      if (t.completed_by === user.id) return true;
      if (user.admin) return true;
      return false;
    }).sort(function (a, b) {
      var at = b.completed_at || b.updated_at || b.created_at || '';
      var bt = a.completed_at || a.updated_at || a.created_at || '';
      return at.localeCompare(bt);
    });
  }

  function myTodos(user) {
    // All pending and open tasks are always shown regardless of due date or age
    return allMyTodos(user);
  }

  /* Instructions addressed to this user on their personal dashboard:
     - Instructions that target them explicitly (target_users)
     - Instructions scoped to their department(s) — they are a member
     - Department Head: all instructions routed to their department(s)
     - System Admin: all instructions
     client_only instructions only appear here if this user is explicitly
     targeted; otherwise they live in the Client Portal. */
  function myInstructions(user) {
    if (!user || !Array.isArray(OC.store.state.instructions)) return [];
    return OC.store.state.instructions
      .filter(function (n) {
        if (n.archived) return false;
        if (!OC.can.seeInstruction(user, n)) return false;
        /* a client instruction stays inside that client's own
           Instructions tab — unless the user is specifically targeted */
        if (n.client_only) {
          return Array.isArray(n.target_users) && n.target_users.indexOf(user.id) > -1;
        }
        return true;
      })
      .sort(function (a, b) {
        /* the arrival snapshot, not read_by — otherwise the list reshuffles
           under the reader the instant the items mark themselves read */
        var au = OC.ui.wasUnread(a, user.id) ? 0 : 1;
        var bu = OC.ui.wasUnread(b, user.id) ? 0 : 1;
        if (au !== bu) return au - bu;                       /* unread first */
        return (b.posted_at || '').localeCompare(a.posted_at || '');
      });
  }

  /* ---- Department overview (Department Head only) ----------------------- */
  /* All open todos inside the head's department(s) — not just their own */
  function deptTodos(user) {
    if (!user || !OC.store.state.todos) return [];
    if (!OC.can.headOfAny(user)) return [];
    var myDepts = (user.departments || []).map(function (m) {
      return typeof m === 'string' ? m : m.department;
    }).filter(Boolean);
    if (!myDepts.length && user.department) myDepts = [user.department];
    return OC.store.state.todos.filter(function (t) {
      if (t.archived || t.state === 'done') return false;
      var tDepts = [];
      if (t.department) tDepts.push(t.department);
      if (Array.isArray(t.departments)) t.departments.forEach(function (d) { if (d && tDepts.indexOf(d) === -1) tDepts.push(d); });
      // Belong to one of head's departments
      if (!tDepts.length) return false;
      return tDepts.some(function (d) { return myDepts.indexOf(d) > -1 || myDepts.some(function (md) {
        var dept = OC.store.department(d);
        var myDept = OC.store.department(md);
        return (dept && myDept && dept.id === myDept.id) ||
               String(d).toLowerCase() === String(md).toLowerCase();
      }); });
    }).sort(function (a, b) {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return (a.due || '').localeCompare(b.due || '');
    });
  }

  /* All instructions visible to the head's department(s) */
  function deptInstructions(user) {
    if (!user || !Array.isArray(OC.store.state.instructions)) return [];
    if (!OC.can.headOfAny(user)) return [];
    var myDepts = (user.departments || []).map(function (m) {
      return typeof m === 'string' ? m : m.department;
    }).filter(Boolean);
    if (!myDepts.length && user.department) myDepts = [user.department];
    return OC.store.state.instructions.filter(function (n) {
      if (n.archived || n.client_only) return false;
      var nDepts = [];
      if (n.department) nDepts.push(n.department);
      if (Array.isArray(n.departments)) n.departments.forEach(function (d) { if (d && nDepts.indexOf(d) === -1) nDepts.push(d); });
      if (!nDepts.length || n.audience === 'all') return true;
      return nDepts.some(function (d) { return myDepts.indexOf(d) > -1 || myDepts.some(function (md) {
        var dept = OC.store.department(d);
        var myDept = OC.store.department(md);
        return (dept && myDept && dept.id === myDept.id) ||
               String(d).toLowerCase() === String(md).toLowerCase();
      }); });
    }).sort(function (a, b) {
      return (b.posted_at || '').localeCompare(a.posted_at || '');
    });
  }

  function dashboardTodoRow(t, user, rerender) {
    var h = OC.ui.h;
    var isDone = t.state === 'done';
    var late = OC.ui.daysLate(t.due) > 0;
    var overdue = !isDone && late;

    /* only the short code belongs on a one-line row — the full
       "0583 - TFR - Tafor Niba" identifier is too long to sit inline */
    var clientCode = OC.ui.clientCode(t.client || (Array.isArray(t.clients) ? t.clients[0] : ''));

    // Assigner (the person who assigned the task / creator)
    var assignerId = t.created_by || (t.assignee || (Array.isArray(t.assignees) ? t.assignees[0] : ''));
    var assignerUser = OC.store.user(assignerId);
    var assignerText = assignerUser ? assignerUser.name : (assignerId || '');
    var assignerTitle = assignerUser ? assignerUser.title : '';

    /* priority reads as the colour of the box rather than another chip
       competing for room on the row; the title still names it for anyone
       who cannot rely on colour alone */
    var priority = t.priority || 'normal';
    var priorityLabel = priorityWord(priority);

    var checkbox = h('button', {
      type: 'button',
      class: 'todo-check-btn prio-' + priority + (isDone ? ' checked' : ''),
      title: priorityLabel + ' priority',
      'aria-label': (isDone ? 'Mark as incomplete' : 'Mark as completed') + ' — ' + priorityLabel + ' priority',
      onClick: function (e) {
        e.stopPropagation();
        var nextState = isDone ? 'open' : 'done';
        OC.store.mutate({
          actor: user.id, action: 'todo.state', target: t.title, detail: nextState, todoId: t.id
        }, function () {
          t.state = nextState;
          t.updated_at = new Date().toISOString();
          if (nextState === 'done') {
            t.completed_at = new Date().toISOString();
            t.completed_by = user.id;
          } else {
            delete t.completed_at;
            delete t.completed_by;
          }
        });
        OC.ui.toast(nextState === 'done' ? 'Task completed.' : 'Task undone! Restored to open todos.');
        rerender();
      }
    }, [
      isDone ? (OC.icon ? OC.icon('check', 'check-icon') : '✓') : null
    ]);

    var late = OC.ui.daysLate(t.due);
    var overdue = !isDone && late > 0;
    var dueNode;
    if (overdue) {
      dueNode = h('span', { class: 'chip overdue due', style: 'font-size:12px;padding:2px 9px;' }, OC.ui.dueLabel(t.due));
    } else if (t.due) {
      dueNode = h('span', { class: 'due muted mono', style: 'font-size:12.5px;' }, OC.ui.dueLabel(t.due));
    } else {
      dueNode = null;
    }

    /* the avatar alone identifies the person; their name lives in the
       tooltip so the row keeps its width for the task itself */
    var assigneeNode = assignerUser
      ? h('span', {
          class: 'dashboard-assignee-mark',
          title: 'Assigned by ' + assignerText + (assignerTitle ? ' (' + assignerTitle + ')' : ''),
          'aria-label': 'Assigned by ' + assignerText
        }, OC.ui.mark(assignerUser.id))
      : (assignerText ? h('span', { class: 'dashboard-assignee-text' }, assignerText) : null);

    /* The row truncates the title to stay on one line, so there has to be a
       way to read the whole thing — and the row already looked clickable
       (cursor:pointer) without doing anything. The accessible control is the
       title rather than the article, because the article wraps a real button
       (the checkbox) and role="button" must not contain one. A mouse click
       anywhere on the row bubbles to the same handler. */
    function openDetail() { todoDetailModal(t, user, rerender); }

    var titleNode = h('span', {
      class: 'dashboard-todo-title' + (isDone ? ' strikethrough' : ''),
      role: 'button',
      tabindex: '0',
      title: t.title,
      'aria-label': 'Open task: ' + t.title,
      onKeydown: function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();
        openDetail();
      }
    }, t.title);

    var mainRow = h('div', { class: 'dashboard-todo-main-row' }, [
      checkbox,
      clientCode ? h('span', {
        class: 'dashboard-client-name',
        style: 'cursor:pointer;',
        title: 'Open ' + clientCode + ' workspace portal',
        onClick: function (e) {
          e.stopPropagation();
          var primaryCid = t.client || (Array.isArray(t.clients) ? t.clients[0] : null);
          if (primaryCid) {
            if (OC.clients && OC.clients.openClientPortal) {
              OC.clients.openClientPortal(primaryCid);
            } else {
              window.location.hash = '#clients/' + primaryCid;
            }
          }
        }
      }, clientCode) : null,
      titleNode,
      dueNode,
      assigneeNode,
      isDone ? h('button', {
        class: 'btn small secondary undo-btn',
        type: 'button',
        title: 'Undo: Mark this task as open again',
        style: 'font-size:11px;padding:3px 10px;font-weight:700;display:inline-flex;align-items:center;gap:5px;margin-left:auto;color:#f87171;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);border-radius:6px;cursor:pointer;',
        onClick: function (e) {
          e.stopPropagation();
          OC.store.mutate({
            actor: user.id, action: 'todo.state', target: t.title, detail: 'open', todoId: t.id
          }, function () {
            t.state = 'open';
            t.updated_at = new Date().toISOString();
            delete t.completed_at;
            delete t.completed_by;
          });
          OC.ui.toast('Task undone! Restored to open todos.');
          rerender();
        }
      }, [
        OC.icon('reset'),
        'Undo'
      ]) : null
    ].filter(Boolean));

    return h('article', {
      class: 'dashboard-todo-row' + (isDone ? ' is-done' : '') + (overdue ? ' is-overdue' : ''),
      'data-id': t.id,
      style: 'cursor:pointer;',
      onClick: openDetail
    }, [mainRow]);
  }

  /* the full task, for when the one-line row could not show all of it */
  function todoDetailModal(t, user, rerender) {
    var h = OC.ui.h;
    var priority = t.priority || 'normal';
    var isDone = t.state === 'done';
    var overdue = !isDone && OC.ui.daysLate(t.due) > 0;

    var clientId = t.client || (Array.isArray(t.clients) ? t.clients[0] : '');
    var dept = OC.store.department(t.department || (Array.isArray(t.departments) ? t.departments[0] : ''));
    var assignerId = t.created_by || (t.assignee || (Array.isArray(t.assignees) ? t.assignees[0] : ''));
    var assignerUser = OC.store.user(assignerId);

    function line(label, value) {
      if (!value) return null;
      return h('div', { class: 'todo-detail-line' }, [
        h('span', { class: 'todo-detail-label' }, label),
        h('div', { class: 'todo-detail-value' }, value)
      ]);
    }

    var actions = [{ label: 'Close', onClick: function (close) { close(); } }];
    if (isDone) {
      actions.unshift({
        label: 'Undo / Reopen task',
        primary: true,
        onClick: function (close) {
          OC.store.mutate({
            actor: user.id, action: 'todo.state', target: t.title, detail: 'open', todoId: t.id
          }, function () {
            t.state = 'open';
            t.updated_at = new Date().toISOString();
            delete t.completed_at;
            delete t.completed_by;
          });
          OC.ui.toast('Task undone! Restored to open todos.');
          close();
          rerender();
        }
      });
    }
    if (OC.can && OC.can.canEditTodo && OC.can.canEditTodo(user, t) && OC.board && OC.board.editTodo) {
      actions.push({
        label: 'Edit task', primary: true,
        onClick: function (close) { close(); OC.board.editTodo(t); }
      });
    }

    OC.ui.modal({
      title: 'Task details',
      className: 'todo-detail-modal',
      content: h('div', { class: 'todo-detail' }, [
        /* the title wraps here in full — this is the whole point of the popup */
        h('h3', { class: 'todo-detail-title' + (isDone ? ' strikethrough' : '') }, t.title),
        h('div', { class: 'todo-detail-chips' }, [
          h('span', { class: 'chip prio-chip prio-' + priority }, priorityWord(priority) + ' priority'),
          h('span', { class: 'chip' }, isDone ? 'Done' : (t.state || 'open')),
          t.due ? h('span', { class: overdue ? 'chip overdue' : 'chip custom' }, OC.ui.dueLabel(t.due)) : null,
          (t.recurrence && t.recurrence !== 'none') ? h('span', { class: 'chip recurring' }, t.recurrence) : null,
          t.archived ? h('span', { class: 'chip custom' }, 'archived') : null
        ].filter(Boolean)),
        t.description ? line('Description', h('p', { class: 'todo-detail-desc' }, t.description)) : null,
        clientId ? line('Client', OC.ui.clientLabel(clientId)) : null,
        dept ? line('Department', dept.name) : null,
        assignerUser
          ? line('Assigned by', h('span', { class: 'todo-detail-person' }, [
              OC.ui.mark(assignerUser.id),
              h('span', {}, assignerUser.name + (assignerUser.title ? ' — ' + assignerUser.title : ''))
            ]))
          : null,
        t.blocked_reason ? line('Blocked', t.blocked_reason) : null
      ].filter(Boolean)),
      actions: actions
    });
  }

  function priorityWord(p) {
    var v = String(p || 'normal');
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  function render(host, rerender) {
    var h = OC.ui.h;
    var user = me() || (OC.store.state && OC.store.state.users && OC.store.state.users[0]) || { id: '', name: 'User', admin: false };
    var allTodos = allMyTodos(user);
    var todos = myTodos(user);
    var doneTodos = allMyDoneTodos(user);

    /* ---- Assignee filter helper ----------------------------------------- */
    function todoMatchesUserFilter(t, uid) {
      if (!uid) return true;
      if (t.assignee === uid) return true;
      if (Array.isArray(t.assignees) && t.assignees.some(function (aid) {
        if (aid === uid) return true;
        if (typeof aid === 'string' && aid.indexOf('user:') === 0 && aid.slice(5) === uid) return true;
        return false;
      })) return true;
      if (t.created_by === uid) return true;
      return false;
    }
    function noteMatchesUserFilter(n, uid) {
      if (!uid) return true;
      if (n.author === uid || n.posted_by === uid) return true;
      if (Array.isArray(n.target_users) && n.target_users.indexOf(uid) > -1) return true;
      if (n.assignee === uid) return true;
      return false;
    }

    /* Collect unique assignees appearing in todo list */
    function todoAssigneeIds(list) {
      var seen = {};
      var ids = [];
      list.forEach(function (t) {
        function add(uid) {
          if (!uid || uid === user.id) return;
          var rawId = (typeof uid === 'string' && uid.indexOf('user:') === 0) ? uid.slice(5) : uid;
          if (!seen[rawId] && OC.store.user(rawId)) { seen[rawId] = true; ids.push(rawId); }
        }
        if (t.assignee) add(t.assignee);
        if (Array.isArray(t.assignees)) t.assignees.forEach(add);
        if (t.created_by) add(t.created_by);
      });
      return ids;
    }
    function noteAuthorIds(list) {
      var seen = {};
      var ids = [];
      list.forEach(function (n) {
        function add(uid) {
          if (!uid || uid === user.id) return;
          if (!seen[uid] && OC.store.user(uid)) { seen[uid] = true; ids.push(uid); }
        }
        if (n.author) add(n.author);
        if (n.posted_by) add(n.posted_by);
        if (Array.isArray(n.target_users)) n.target_users.forEach(add);
      });
      return ids;
    }

    var filteredTodos    = todoFilterUser ? todos.filter(function (t) { return todoMatchesUserFilter(t, todoFilterUser); }) : todos;
    var filteredDone     = todoFilterUser ? doneTodos.filter(function (t) { return todoMatchesUserFilter(t, todoFilterUser); }) : doneTodos;
    var filteredNotes    = noteFilterUser ? myInstructions(user).filter(function (n) { return noteMatchesUserFilter(n, noteFilterUser); }) : null;

    var todosToDisplay = showDoneTodos ? filteredDone : filteredTodos;
    var notes = filteredNotes !== null ? filteredNotes : myInstructions(user);
    var unread = notes.filter(function (n) { return OC.ui.wasUnread(n, user.id); });
    var overdue = allTodos.filter(function (t) { return OC.ui.daysLate(t.due) > 0; });
    var upcoming = allTodos.filter(function (t) { return OC.ui.daysLate(t.due) < 0; });

    /* Collect user ids to show as filter pills */
    var todoAids = todoAssigneeIds(allTodos);
    var noteAids = noteAuthorIds(myInstructions(user));

    /* ---- Interactive Assignee Filter Bar with Popover List ---------------- */
    function renderAssigneeFilterBar(cfg) {
      var aids = cfg.aids || [];
      if (!aids.length) return null;

      var activeUid = cfg.activeUid;
      var panelKey = cfg.panelKey; /* 'todos' | 'notes' */
      var isMenuOpen = openAssigneePopover === panelKey;

      var pills = [];

      /* Clear / All button when filter is active */
      if (activeUid) {
        pills.push(h('button', {
          class: 'btn small secondary dashboard-filter-clear',
          type: 'button',
          title: 'Clear filter — show all',
          style: 'font-size:10px;padding:2px 8px;display:inline-flex;align-items:center;gap:4px;',
          onClick: function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            cfg.onSelect(null);
          }
        }, [OC.icon('close'), 'All']));
      }

      /* Compact [ 👥 ▾ ] toggle button matching Photo 2 */
      var activeUser = activeUid ? OC.store.user(activeUid) : null;
      var moreBtnTitle = activeUser
        ? ('Filtered by: ' + activeUser.name + ' (click to change)')
        : ('Filter by person (' + aids.length + ' assignees)');

      pills.push(h('button', {
        class: 'dashboard-assignee-more-btn' + (isMenuOpen ? ' is-open' : '') + (activeUid ? ' active' : ''),
        type: 'button',
        title: moreBtnTitle,
        onClick: function (e) {
          if (e && e.stopPropagation) e.stopPropagation();
          openAssigneePopover = isMenuOpen ? null : panelKey;
          rerender();
        }
      }, [
        OC.icon('users'),
        h('span', { class: 'dashboard-assignee-caret' }, '▾')
      ]));

      /* Popover list if menu is open */
      if (isMenuOpen) {
        var searchInput = h('input', {
          class: 'dashboard-assignee-search-input',
          type: 'text',
          placeholder: 'Search person...',
          onClick: function (e) { if (e && e.stopPropagation) e.stopPropagation(); },
          onInput: function (e) {
            var q = (e.target.value || '').toLowerCase().trim();
            var popEl = document.getElementById('dashboard-popover-' + panelKey);
            if (!popEl) return;
            var items = popEl.querySelectorAll('.dashboard-assignee-item');
            var matched = 0;
            for (var i = 0; i < items.length; i++) {
              var s = items[i].getAttribute('data-search') || '';
              var ok = !q || s.indexOf(q) > -1;
              items[i].style.display = ok ? 'flex' : 'none';
              if (ok) matched++;
            }
            var emptyEl = popEl.querySelector('.dashboard-assignee-empty');
            if (emptyEl) emptyEl.style.display = matched === 0 ? 'block' : 'none';
          },
          onKeyDown: function (e) {
            if (e.key === 'Enter') {
              var popEl = document.getElementById('dashboard-popover-' + panelKey);
              if (!popEl) return;
              var firstItem = popEl.querySelector('.dashboard-assignee-item:not([style*="display: none"])');
              if (firstItem) firstItem.click();
            }
          }
        });

        var popoverHead = h('div', { class: 'dashboard-assignee-popover-head' }, [
          h('span', {}, [OC.icon('users'), ' ' + (cfg.title || 'Filter by person') + ' (' + aids.length + ')']),
          h('button', {
            class: 'dashboard-assignee-popover-close',
            type: 'button',
            title: 'Close list',
            onClick: function (e) {
              if (e && e.stopPropagation) e.stopPropagation();
              openAssigneePopover = null;
              rerender();
            }
          }, [OC.icon('close')])
        ]);

        var searchWrap = (aids.length >= 2) ? h('div', { class: 'dashboard-assignee-search-wrap' }, [
          OC.icon('search'),
          searchInput
        ]) : null;

        var allOption = h('div', {
          class: 'dashboard-assignee-item' + (!activeUid ? ' active' : ''),
          'data-search': 'all everyone assignees show all',
          onClick: function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            openAssigneePopover = null;
            cfg.onSelect(null);
          }
        }, [
          h('div', {
            style: 'width:28px;height:28px;border-radius:50%;background:rgba(56,189,248,0.15);display:flex;align-items:center;justify-content:center;color:#38bdf8;font-size:13px;'
          }, [OC.icon('users')]),
          h('div', { class: 'dashboard-assignee-item-info' }, [
            h('span', { class: 'dashboard-assignee-item-name' }, 'All assignees'),
            h('span', { class: 'dashboard-assignee-item-role' }, 'Show all items without filter')
          ]),
          h('div', { class: 'dashboard-assignee-item-meta' }, [
            cfg.totalCount !== undefined ? h('span', { class: 'dashboard-assignee-item-badge' }, String(cfg.totalCount)) : null,
            !activeUid ? h('span', { class: 'dashboard-assignee-item-check' }, [OC.icon('check')]) : null
          ].filter(Boolean))
        ]);

        var assigneeItems = aids.map(function (uid) {
          var u = OC.store.user(uid);
          if (!u) return null;
          var isActive = activeUid === uid;
          var count = cfg.getCount ? cfg.getCount(uid) : null;
          var dept = u.department ? OC.store.department(u.department) : null;
          var roleText = u.title || (dept ? dept.name : (u.role || ''));

          return h('div', {
            class: 'dashboard-assignee-item' + (isActive ? ' active' : ''),
            'data-search': (u.name + ' ' + (u.title || '') + ' ' + (dept ? dept.name : '')).toLowerCase(),
            onClick: function (e) {
              if (e && e.stopPropagation) e.stopPropagation();
              openAssigneePopover = null;
              cfg.onSelect(isActive ? null : uid);
            }
          }, [
            OC.ui.mark(uid),
            h('div', { class: 'dashboard-assignee-item-info' }, [
              h('span', { class: 'dashboard-assignee-item-name' }, u.name),
              roleText ? h('span', { class: 'dashboard-assignee-item-role' }, roleText) : null
            ].filter(Boolean)),
            h('div', { class: 'dashboard-assignee-item-meta' }, [
              count !== null ? h('span', { class: 'dashboard-assignee-item-badge' }, count + ' ' + (cfg.itemUnit || 'tasks')) : null,
              isActive ? h('span', { class: 'dashboard-assignee-item-check' }, [OC.icon('check')]) : null
            ].filter(Boolean))
          ]);
        }).filter(Boolean);

        var emptyNotice = h('div', {
          class: 'dashboard-assignee-empty',
          style: 'display:none;'
        }, 'No matching assignees found');

        var listWrap = h('div', { class: 'dashboard-assignee-list' }, [
          allOption,
          assigneeItems,
          emptyNotice
        ]);

        var popover = h('div', {
          id: 'dashboard-popover-' + panelKey,
          class: 'dashboard-assignee-popover'
        }, [
          popoverHead,
          searchWrap,
          listWrap
        ].filter(Boolean));

        pills.push(popover);

        /* Auto-focus search input */
        setTimeout(function () {
          if (typeof document === 'undefined' || !document.querySelector) return;
          var inp = document.querySelector('#dashboard-popover-' + panelKey + ' .dashboard-assignee-search-input');
          if (inp && inp.focus) inp.focus();
        }, 30);

        /* Click outside / Escape key handler */
        setTimeout(function () {
          if (typeof document === 'undefined' || !document.addEventListener) return;
          function cleanup() {
            if (document.removeEventListener) {
              document.removeEventListener('click', handleDocClick, true);
              document.removeEventListener('keydown', handleEsc, true);
            }
          }
          function handleDocClick(e) {
            var pop = document.getElementById ? document.getElementById('dashboard-popover-' + panelKey) : null;
            var btn = document.querySelector ? document.querySelector('.dashboard-assignee-more-btn.is-open') : null;
            if (!pop) {
              cleanup();
              return;
            }
            if ((pop.contains && pop.contains(e.target)) || (btn && btn.contains && btn.contains(e.target))) {
              return;
            }
            cleanup();
            openAssigneePopover = null;
            rerender();
          }
          function handleEsc(e) {
            if (e.key === 'Escape') {
              cleanup();
              openAssigneePopover = null;
              rerender();
            }
          }
          document.addEventListener('click', handleDocClick, true);
          document.addEventListener('keydown', handleEsc, true);
        }, 10);
      }

      return h('div', {
        class: 'dashboard-filter-pills' + (isMenuOpen ? ' has-popover' : '')
      }, pills);
    }

    var clientIds = {};
    allTodos.forEach(function (t) {
      if (t.client) clientIds[t.client] = true;
      if (Array.isArray(t.clients)) t.clients.forEach(function (cid) { if (cid) clientIds[cid] = true; });
    });
    notes.forEach(function (n) {
      if ((n.read_by || []).indexOf(user.id) === -1) {
        if (n.client) clientIds[n.client] = true;
        if (Array.isArray(n.clients)) n.clients.forEach(function (cid) { if (cid) clientIds[cid] = true; });
      }
    });
    var clients = Object.keys(clientIds).map(OC.store.client).filter(function (c) {
      /* a client scoped to another department stays off this list even when a
         task happens to reference it */
      return !!c && (!OC.can.seeClient || OC.can.seeClient(user, c));
    });

    var empId = user.employee_id || '';
    var orgName = user.org || '';
    var joinedDate = user.joined_date || '';
    var deptNames = (user.departments && user.departments.length)
      ? user.departments.map(function (m) { return (OC.store.department(m.department) || {}).name; }).join(', ')
      : '';
    
    var roleLine = user.title || (user.admin ? 'System Admin' : OC.can.roleLabel(user));
    if (deptNames) {
      roleLine += ' • ' + deptNames;
    } else if (user.admin) {
      roleLine += ' • Operations';
    }
    
    /* only claim a join date/org when the account actually carries one —
       'Joined N/A (N/A)' read as broken rather than simply unset */
    var joinLine = joinedDate
      ? ('Joined ' + joinedDate + (orgName ? ' (' + orgName + ')' : ''))
      : '';

    var todayStr = new Date().toISOString().split('T')[0];
    var attendanceList = OC.store.state.attendance || [];
    var todayLog = attendanceList.find(function (a) { return a.user_id === user.id && a.date === todayStr; });
    var isPunchComplete = Boolean(todayLog && todayLog.punch_in && todayLog.punch_out);
    var schedIn = user.scheduled_in || (user.office_details && user.office_details.scheduled_in) || '09:00 AM';

    var punchBtnLabel = isPunchComplete
      ? 'Completed (' + todayLog.punch_in + ' - ' + todayLog.punch_out + ')'
      : (!todayLog ? 'Quick Punch In' : 'Quick Punch Out (' + todayLog.punch_in + ')');

    function handleDashboardPunch(e) {
      if (e && e.stopPropagation) e.stopPropagation();
      var latestAtt = OC.store.state.attendance || [];
      var currentLog = latestAtt.find(function (a) { return a.user_id === user.id && a.date === todayStr; });
      if (currentLog && currentLog.punch_in && currentLog.punch_out) {
        OC.ui.toast('Your attendance for today is already completed and locked.', true);
        return;
      }

      var nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      OC.store.mutate({
        actor: user.id,
        action: 'attendance.punch',
        target: user.name,
        detail: 'Punched at ' + nowTime
      }, function () {
        var existing = (OC.store.state.attendance || []).find(function (a) { return a.user_id === user.id && a.date === todayStr; });
        if (!existing) {
            // Use the user's own scheduled_in time for late detection, not a hardcoded 10:15
            var schedParts = (schedIn || '09:00 AM').match(/(\d+):(\d+)\s*(AM|PM)?/i);
            var schedHour = schedParts ? parseInt(schedParts[1], 10) : 9;
            var schedMin = schedParts ? parseInt(schedParts[2], 10) : 0;
            if (schedParts && /PM/i.test(schedParts[3] || '') && schedHour !== 12) schedHour += 12;
            if (schedParts && /AM/i.test(schedParts[3] || '') && schedHour === 12) schedHour = 0;
            var nowH = new Date().getHours();
            var nowM = new Date().getMinutes();
            var isLate = (nowH > schedHour) || (nowH === schedHour && nowM > schedMin + 15);
          OC.store.state.attendance.unshift({
            id: OC.store.uid('att'),
            user_id: user.id,
            date: todayStr,
            scheduled_in: schedIn,
            punch_in: nowTime,
            punch_out: null,
            status: isLate ? 'Late' : 'Present',
            note: 'Auto Quick Punch In'
          });
          OC.ui.toast('Punch In recorded with date ' + todayStr + ' at ' + nowTime + '.');
        } else if (!existing.punch_out) {
          existing.punch_out = nowTime;
          OC.ui.toast('Punch Out recorded with date ' + todayStr + ' at ' + nowTime + '.');
        }
      });
      if (typeof rerender === 'function') {
        rerender();
      } else {
        render(host, rerender);
      }
    }

    var profileBanner = h('div', {
      class: 'user-profile-banner',
      role: 'button',
      tabIndex: 0,
      title: 'Click to open Employee Portal, Attendance, Leave Management & Profile Details',
      onClick: function () {
        if (OC.profilePortal && OC.profilePortal.openForUser) {
          OC.profilePortal.openForUser(user, 'profile');
        } else if (OC.app && OC.app.go) {
          OC.app.go('profile');
        } else if (OC.app && OC.app.openProfileModal) {
          OC.app.openProfileModal(user, rerender);
        }
      }
    }, [
      h('div', { class: 'user-profile-banner-left' }, [
        h('div', { class: 'user-profile-avatar-wrap' }, [
          user.avatar
            ? h('img', { src: user.avatar, alt: user.name })
            : h('div', { class: 'user-profile-avatar-placeholder' }, OC.ui.initials(user.name))
        ]),
        h('div', { class: 'user-profile-info' }, [
          h('div', { class: 'user-profile-title-row' }, [
            h('span', { class: 'user-profile-name' }, user.name),
            empId ? h('span', { class: 'user-profile-badge' }, empId) : null
          ].filter(Boolean)),
          h('div', { class: 'user-profile-role-line' }, roleLine),
          joinLine ? h('div', { class: 'user-profile-meta-line' }, joinLine) : null
        ])
      ]),
      h('div', { class: 'user-profile-right', style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
        h('button', {
          class: 'btn' + (isPunchComplete ? ' completed-punch' : ' primary'),
          type: 'button',
          id: 'dashboard-attendance-punch-btn',
          disabled: isPunchComplete,
          title: isPunchComplete ? 'Attendance completed for today' : 'Click to punch attendance directly from Dashboard',
          style: 'height:32px;display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:12px;padding:0 12px;border-radius:8px;white-space:nowrap;z-index:2;cursor:' + (isPunchComplete ? 'default;' : 'pointer;'),
          onClick: handleDashboardPunch
        }, [isPunchComplete ? OC.icon('check') : OC.icon('clock'), punchBtnLabel]),
        h('button', {
          class: 'user-profile-action-btn',
          type: 'button',
          id: 'dashboard-my-attendance-btn',
          title: 'Open My Attendance in Employee Portal',
          onClick: function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            if (OC.profilePortal && OC.profilePortal.openForUser) {
              OC.profilePortal.openForUser(user, 'attendance');
            } else if (OC.app && OC.app.go) {
              OC.app.go('profile');
            }
          }
        }, [OC.icon('clock'), 'My Attendance']),
        h('button', {
          class: 'user-profile-action-btn',
          type: 'button',
          id: 'dashboard-my-work-btn',
          title: 'Open My Work History in Employee Portal',
          onClick: function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            if (OC.profilePortal && OC.profilePortal.openForUser) {
              OC.profilePortal.openForUser(user, 'work');
            } else if (OC.app && OC.app.go) {
              OC.app.go('profile');
            }
          }
        }, [OC.icon('history'), 'My Work']),
        h('button', {
          class: 'user-profile-action-btn user-profile-edit-hint',
          type: 'button',
          id: 'dashboard-edit-profile-btn',
          title: 'Open Employee Portal to view profile details',
          onClick: function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            if (OC.profilePortal && OC.profilePortal.openForUser) {
              OC.profilePortal.openForUser(user, 'profile');
            } else if (OC.app && OC.app.go) {
              OC.app.go('profile');
            } else if (OC.app && OC.app.openProfileModal) {
              OC.app.openProfileModal(user, rerender);
            }
          }
        }, [OC.icon('user'), 'Profile'])
      ])
    ]);

    OC.ui.clear(host);
    OC.ui.append(host, [
      profileBanner,

      h('div', { class: 'stats', style: 'grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));' }, [
        h('div', {
          class: 'stat' + (!showDoneTodos ? ' active' : ''),
          id: 'dashboard-stat-open-btn',
          role: 'button',
          tabIndex: 0,
          title: 'Click to view open & pending tasks',
          style: 'cursor:pointer;transition:transform 0.15s ease, border-color 0.15s ease;' + (!showDoneTodos ? 'border-color:var(--accent,#0284c7);' : ''),
          onClick: function () {
            showDoneTodos = false;
            todoLimit = TODO_PAGE;
            rerender();
          }
        }, [h('span', { class: 'k' }, 'My open todos'), h('div', { class: 'v tabular' }, String(allTodos.length))]),
        h('div', { class: 'stat' + (overdue.length ? ' alert' : '') }, [
          h('span', { class: 'k' }, 'Overdue'), h('div', { class: 'v tabular' }, String(overdue.length))]),
        h('div', {
          class: 'stat' + (showDoneTodos ? ' active' : ''),
          id: 'dashboard-stat-done-btn',
          role: 'button',
          tabIndex: 0,
          title: showDoneTodos ? 'Viewing Done tasks (click to switch to Open)' : 'Click to view completed tasks (Done)',
          style: 'cursor:pointer;transition:transform 0.15s ease, border-color 0.15s ease;' + (showDoneTodos ? 'border-color:#10b981;box-shadow:0 0 12px rgba(16,185,129,0.3);' : ''),
          onClick: function () {
            showDoneTodos = !showDoneTodos;
            todoLimit = TODO_PAGE;
            rerender();
          }
        }, [
          h('span', { class: 'k' }, 'Done tasks'),
          h('div', { class: 'v tabular', style: 'color:#4ade80;' }, String(doneTodos.length))
        ]),
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Unread instructions'), h('div', { class: 'v tabular' }, String(unread.length))]),
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Active clients'), h('div', { class: 'v tabular' }, String(clients.length))])
      ]),

      h('div', { class: 'board' }, [
        h('section', { class: 'panel' + (openAssigneePopover === 'todos' ? ' has-assignee-popover' : '') }, [
          h('div', { class: 'panel-head' }, [
            h('h2', {}, [OC.icon(showDoneTodos ? 'check' : 'board'), showDoneTodos ? 'Done tasks' : 'My todos']),
            h('span', { class: 'sub' }, showDoneTodos
              ? (filteredDone.length ? 'showing ' + filteredDone.length + ' completed tasks' : 'no completed tasks')
              : (filteredTodos.length ? 'showing ' + filteredTodos.length + ' task' + (filteredTodos.length !== 1 ? 's' : '') : 'no pending tasks')),
            /* Assignee filter pills with dropdown list */
            renderAssigneeFilterBar({
              aids: todoAids,
              activeUid: todoFilterUser,
              panelKey: 'todos',
              title: 'Filter by assignee',
              itemUnit: 'tasks',
              totalCount: showDoneTodos ? filteredDone.length : filteredTodos.length,
              getCount: function (uid) {
                var list = showDoneTodos ? doneTodos : todos;
                return list.filter(function (t) { return todoMatchesUserFilter(t, uid); }).length;
              },
              onSelect: function (uid) {
                todoFilterUser = uid;
                todoLimit = TODO_PAGE;
                rerender();
              }
            }),
            showDoneTodos ? h('div', { class: 'tools', style: 'margin-left:auto;' }, [
              h('button', {
                type: 'button',
                id: 'dashboard-back-open-btn',
                class: 'btn small secondary',
                style: 'display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 12px;font-weight:600;border-radius:6px;cursor:pointer;',
                onClick: function () {
                  showDoneTodos = false;
                  todoLimit = TODO_PAGE;
                  rerender();
                }
              }, [OC.icon('arrow-left'), 'Back to Open (' + filteredTodos.length + ')'])
            ]) : null
          ]),
          h('div', { class: 'panel-body', style: 'padding:12px;' }, todosToDisplay.length
            ? (function () {
                var rows = todosToDisplay.slice(0, todoLimit).map(function (t) {
                  return dashboardTodoRow(t, user, rerender);
                });
                if (todosToDisplay.length > todoLimit) {
                  rows.push(h('div', { class: 'list-more' }, [
                    h('button', { class: 'btn small', type: 'button', onClick: function () {
                      todoLimit += TODO_PAGE;
                      rerender();
                    } }, [OC.icon('down'), 'Show ' + (todosToDisplay.length - todoLimit) + ' more'])
                  ]));
                }
                return rows;
              })()
            : h('div', { class: 'empty' }, [
                OC.icon(showDoneTodos ? 'check' : 'check'),
                showDoneTodos ? 'No completed tasks found.' : (todoFilterUser ? 'No tasks for this person.' : 'Nothing assigned to you right now.')
              ]))
        ]),

        h('section', { class: 'panel' + (openAssigneePopover === 'notes' ? ' has-assignee-popover' : '') }, [
          h('div', { class: 'panel-head' }, [
            h('h2', {}, [OC.icon('inbox'), 'My instructions']),
            h('span', { class: 'sub' }, unread.length ? unread.length + ' unread first' : (notes.length ? notes.length + ' instruction' + (notes.length !== 1 ? 's' : '') : 'all read')),
            /* Author / target filter pills with dropdown list */
            renderAssigneeFilterBar({
              aids: noteAids,
              activeUid: noteFilterUser,
              panelKey: 'notes',
              title: 'Filter by person',
              itemUnit: 'instructions',
              totalCount: notes.length,
              getCount: function (uid) {
                return myInstructions(user).filter(function (n) { return noteMatchesUserFilter(n, uid); }).length;
              },
              onSelect: function (uid) {
                noteFilterUser = uid;
                rerender();
              }
            })
          ]),
          h('div', { class: 'panel-body' }, notes.length
            ? notes.slice(0, 12).map(function (n) {
                var isUnread = OC.ui.wasUnread(n, user.id);
                if (user && user.id && OC.ui.markInstructionRead) {
                  OC.ui.markInstructionRead(n, user.id);
                }
                var readers = (OC.ui && OC.ui.instructionReaders)
                  ? OC.ui.instructionReaders(n)
                  : (n.read_by || []).map(OC.ui.personName);

                var actions = [];
                if (OC.can && OC.can.canEditInstruction && OC.can.canEditInstruction(user, n) && OC.board && OC.board.editInstruction) {
                  actions.push(h('button', {
                    class: 'btn small', type: 'button', onClick: function () { OC.board.editInstruction(n); }
                  }, [OC.icon('edit'), 'Edit']));
                }

                return h('article', { class: 'note' + (isUnread ? ' unread' : '') }, [
                  h('div', { class: 'byline' }, [
                    OC.ui.person(n.author || n.posted_by, 'strong'),
                    h('span', {}, OC.ui.fmtWhen(n.posted_at)),
                    isUnread ? h('span', { class: 'chip overdue' }, 'unread') : null,
                    (Array.isArray(n.target_users) && n.target_users.length)
                      ? h('span', { class: 'chip custom' }, 'For: ' + n.target_users.map(OC.ui.personName).join(', '))
                      : null
                  ].filter(Boolean)),
                  h('div', { class: 'body' }, n.body),
                  h('div', { class: 'tags' }, [
                    (Array.isArray(n.clients) && n.clients.length > 1)
                      ? h('span', { class: 'multi-clients-wrap', style: 'display:inline-flex;gap:4px;flex-wrap:wrap;' }, n.clients.map(OC.ui.clientChip))
                      : OC.ui.clientChip(n.client),
                    (Array.isArray(n.departments) && n.departments.length > 1)
                      ? h('span', { class: 'multi-depts-wrap', style: 'display:inline-flex;gap:4px;flex-wrap:wrap;' }, n.departments.map(OC.ui.deptChip))
                      : OC.ui.deptChip(n.department),
                    (n.tags || []).map(OC.ui.tagChip)
                  ]),
                  h('div', { class: 'readers' }, readers.length
                    ? 'Read by ' + readers.length + ': ' + readers.join(', ')
                    : 'Nobody has read this yet'),
                  actions.length ? h('div', { class: 'actions', style: 'margin-top:8px;' }, actions) : null,
                  OC.ui.reactionsBar('instruction', n),
                  OC.can.canSeeComments(user, n) ? OC.ui.commentThread('instruction', n) : null
                ]);
              })
            : h('div', { class: 'empty' }, [OC.icon('inbox'), 'No instructions are addressed to you.']))
        ])
      ]),

      (function () {
        var filters = OC.store.state.saved_filters || [];
        var pinned = filters.filter(function (f) { return f.owner === user.id; });
        if (!pinned.length) return null;
        return h('div', { class: 'card', style: 'margin-top:18px' }, [
          h('h3', {}, 'Pinned filters'),
          h('p', { class: 'muted', style: 'font-size:13px;margin:4px 0 10px' },
            'Saved on the board for quick access.'),
          h('div', { class: 'row' }, pinned.map(function (f) {
            return h('button', {
              class: 'chip client', type: 'button', style: 'cursor:pointer',
              onClick: function () { OC.board.applyFilter(f.filters); OC.app.go('board'); }
            }, f.name);
          }))
        ]);
      })()
    ].filter(Boolean));
  }

  return {
    render: render,
    dashboardTodoRow: dashboardTodoRow,
    allMyTodos: allMyTodos,
    allMyDoneTodos: allMyDoneTodos,
    deptTodos: deptTodos,
    deptInstructions: deptInstructions,
    isCompletedToday: isCompletedToday,
    isCompletedWithin24Hours: isCompletedWithin24Hours
  };
})();
