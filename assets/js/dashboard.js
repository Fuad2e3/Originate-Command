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
      return false;
    }).sort(function (a, b) { return (a.due || '').localeCompare(b.due || ''); });
  }

  function isCompletedWithin24Hours(t) {
    var compIso = t.completed_at || t.updated_at || t.created_at;
    if (!compIso) return false;
    var compTime = new Date(compIso).getTime();
    if (isNaN(compTime)) return false;
    var diff = Date.now() - compTime;
    // Completed within the last 24 hours (24 * 60 * 60 * 1000 ms)
    // Allow up to 5 minutes future tolerance for minor client/server clock skew
    return diff >= -5 * 60 * 1000 && diff <= 24 * 60 * 60 * 1000;
  }

  function allMyDoneTodos(user) {
    if (!user || !OC.store.state.todos) return [];
    return OC.store.state.todos.filter(function (t) {
      if (t.archived || t.state !== 'done') return false;
      // Only show tasks completed within the last 24 hours
      if (!isCompletedWithin24Hours(t)) return false;
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
      if (t.created_by === user.id) return true;
      return false;
    }).sort(function (a, b) {
      var at = b.completed_at || b.updated_at || b.created_at || '';
      var bt = a.completed_at || a.updated_at || a.created_at || '';
      return at.localeCompare(bt);
    });
  }

  function myTodos(user) {
    var all = allMyTodos(user);
    if (showUpcoming) return all;
    // Show only Due Today & Overdue tasks by default (hide future/tomorrow tasks until their due date arrives)
    // NOTE: This filter is currently bypassed because showUpcoming defaults to true.
    return all.filter(function (t) {
      return !t.due || OC.ui.daysLate(t.due) >= 0;
    });
  }

  function myInstructions(user) {
    if (!user || !Array.isArray(OC.store.state.instructions)) return [];
    return OC.store.state.instructions
      .filter(function (n) {
        if (n.archived || !OC.can.seeInstruction(user, n)) return false;
        /* a client instruction otherwise stays inside that client's own
           Instructions tab — unless whoever posted it picked this person
           out specifically, in which case it belongs on their Dashboard too */
        if (!n.client_only) return true;
        return Array.isArray(n.target_users) && n.target_users.indexOf(user.id) > -1;
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
          } else {
            delete t.completed_at;
          }
        });
        OC.ui.toast(nextState === 'done' ? 'Task completed.' : 'Task reopened.');
        rerender();
      }
    }, [
      isDone ? (OC.icon ? OC.icon('check', 'check-icon') : '✓') : null
    ]);

    var dueNode = overdue
      ? h('span', { class: 'chip overdue due', style: 'font-size:12px;padding:2px 9px;' }, OC.ui.dueLabel(t.due))
      : (t.due ? h('span', { class: 'due muted mono', style: 'font-size:12.5px;' }, OC.ui.dueLabel(t.due)) : null);

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
        class: 'btn small secondary',
        type: 'button',
        title: 'Undo: Mark this task as open again',
        style: 'font-size:11px;padding:2px 8px;font-weight:700;display:inline-flex;align-items:center;gap:4px;margin-left:auto;color:#f87171;border-color:rgba(239,68,68,0.35);cursor:pointer;',
        onClick: function (e) {
          e.stopPropagation();
          OC.store.mutate({
            actor: user.id, action: 'todo.state', target: t.title, detail: 'open', todoId: t.id
          }, function () {
            t.state = 'open';
            t.updated_at = new Date().toISOString();
            delete t.completed_at;
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
    var todosToDisplay = showDoneTodos ? doneTodos : todos;
    var notes = myInstructions(user);
    var unread = notes.filter(function (n) { return OC.ui.wasUnread(n, user.id); });
    var overdue = allTodos.filter(function (t) { return OC.ui.daysLate(t.due) > 0; });
    var upcoming = allTodos.filter(function (t) { return OC.ui.daysLate(t.due) < 0; });


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
        if (OC.app && OC.app.go) {
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
          style: 'height:32px;display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:12px;padding:0 12px;border-radius:8px;white-space:nowrap;z-index:2;' +
            (isPunchComplete
              ? 'background:rgba(37,99,235,0.18);border:1px solid rgba(59,130,246,0.35);color:#93c5fd;cursor:default;opacity:0.95;'
              : 'background:var(--primary,#2563eb);color:#fff;border:1px solid rgba(255,255,255,0.15);box-shadow:0 2px 8px rgba(37,99,235,0.35);cursor:pointer;'),
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
          title: 'Edit Profile Details',
          onClick: function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            if (OC.app && OC.app.openProfileModal) {
              OC.app.openProfileModal(user, rerender);
            } else if (OC.profilePortal && OC.profilePortal.openForUser) {
              OC.profilePortal.openForUser(user);
            }
          }
        }, [OC.icon('edit'), 'Edit Profile'])
      ])
    ]);

    OC.ui.clear(host);
    OC.ui.append(host, [
      profileBanner,

      h('div', { class: 'stats' }, [
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'My open todos'), h('div', { class: 'v tabular' }, String(allTodos.length))]),
        h('div', { class: 'stat' + (overdue.length ? ' alert' : '') }, [
          h('span', { class: 'k' }, 'Overdue'), h('div', { class: 'v tabular' }, String(overdue.length))]),
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Unread instructions'), h('div', { class: 'v tabular' }, String(unread.length))]),
        h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Active clients'), h('div', { class: 'v tabular' }, String(clients.length))])
      ]),

      h('div', { class: 'board' }, [
        h('section', { class: 'panel' }, [
          h('div', { class: 'panel-head' }, [
            h('h2', {}, 'My todos'),
            h('span', { class: 'sub' }, showDoneTodos
              ? (doneTodos.length ? 'showing ' + doneTodos.length + ' completed tasks (last 24h) · click Undo to restore' : 'no completed tasks in last 24 hours')
              : (showUpcoming ? 'showing all open tasks' : 'due today & overdue first')),
            h('div', { class: 'tools', style: 'margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;' }, [
              h('div', { class: 'segmented', role: 'tablist', style: 'display:inline-flex;padding:2px;background:rgba(255,255,255,0.06);border-radius:9999px;' }, [
                h('button', {
                  type: 'button',
                  'aria-pressed': String(!showDoneTodos),
                  style: 'padding:4px 12px;font-size:12px;border-radius:9999px;font-weight:700;transition:all 0.15s ease;' + (!showDoneTodos ? 'background:var(--accent,#0284c7);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);' : 'background:transparent;color:var(--text-secondary);'),
                  onClick: function () {
                    if (showDoneTodos) {
                      showDoneTodos = false;
                      todoLimit = TODO_PAGE;
                      rerender();
                    }
                  }
                }, 'Open (' + allTodos.length + ')'),
                h('button', {
                  type: 'button',
                  'aria-pressed': String(showDoneTodos),
                  style: 'padding:4px 12px;font-size:12px;border-radius:9999px;font-weight:700;transition:all 0.15s ease;' + (showDoneTodos ? 'background:var(--accent,#0284c7);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);' : 'background:transparent;color:var(--text-secondary);'),
                  onClick: function () {
                    if (!showDoneTodos) {
                      showDoneTodos = true;
                      todoLimit = TODO_PAGE;
                      rerender();
                    }
                  }
                }, 'Done (' + doneTodos.length + ')')
              ]),
              (!showDoneTodos && upcoming.length) ? h('button', {
                class: 'btn small',
                type: 'button',
                onClick: function () {
                  showUpcoming = !showUpcoming;
                  todoLimit = TODO_PAGE;
                  rerender();
                }
              }, showUpcoming ? 'Today & Overdue only' : 'Upcoming (' + upcoming.length + ')') : null
            ])
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
                showDoneTodos ? 'No completed tasks in the last 24 hours.' : 'Nothing assigned to you right now.'
              ]))
        ]),

        h('section', { class: 'panel' }, [
          h('div', { class: 'panel-head' }, [
            h('h2', {}, 'My instructions'),
            h('span', { class: 'sub' }, unread.length ? unread.length + ' unread first' : 'all read')
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
                if (!n.linked_todo && OC.board && OC.board.convertToTodo) {
                  actions.push(h('button', {
                    class: 'btn small', type: 'button', onClick: function () { OC.board.convertToTodo(n); }
                  }, 'Convert to todo'));
                }
                if (OC.can && OC.can.canEditInstruction && OC.can.canEditInstruction(user, n) && OC.board && OC.board.editInstruction) {
                  actions.push(h('button', {
                    class: 'btn small', type: 'button', onClick: function () { OC.board.editInstruction(n); }
                  }, 'Edit'));
                }

                return h('article', { class: 'note' + (isUnread ? ' unread' : '') }, [
                  h('div', { class: 'byline' }, [
                    OC.ui.person(n.author || n.posted_by, 'strong'),
                    h('span', {}, OC.ui.fmtWhen(n.posted_at)),
                    isUnread ? h('span', { class: 'chip overdue' }, 'unread') : null,
                    n.linked_todo ? h('span', { class: 'chip group' }, 'todo created') : null,
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
            'Saved on the board so they do not have to be rebuilt each visit (6.4).'),
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
    isCompletedWithin24Hours: isCompletedWithin24Hours
  };
})();
