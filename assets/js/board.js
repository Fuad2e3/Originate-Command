/* =========================================================================
   board.js — the two-panel board (2.0)
   Left panel: todos (6.2). Right panel: instructions (6.3). Both are driven
   by one filter object (6.4), so a client or a department means the same
   thing on both sides. Every list is filtered through OC.can first, so a
   person is never shown an item they are not entitled to see.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.board = (function () {
  'use strict';

  /* delegate rather than cache: newTodo() and newInstruction() are called from
     the dashboard, which is the landing view, so this module's functions can
     run before its own render() ever does. Caching OC.ui.h in render() left
     those entry points throwing on a fresh load. */
  function h() { return OC.ui.h.apply(null, arguments); }

  var filters = { client: '', department: '', person: '', tag: '', from: '', to: '', q: '' };
  var grouping = 'person';       /* person | client | department */
  var mode = 'panels';           /* panels | timeline */
  var filtersOpen = false;       /* small screens only; always open above 720px */
  var showDone = false;
  var showArchived = false;
  var panel = 'todos';           /* small screens only */

  /* Both panels used to build a row for every todo and every instruction the
     person could see. Each row carries a comment thread and a reactions bar, so
     a busy workspace was minting tens of thousands of nodes on every render and
     every click paid for it. Only a screenful is built; "Show more" adds
     another. The counts in the panel heads still report the true totals. */
  var TODO_PAGE = 60, NOTE_PAGE = 40;
  var todoLimit = TODO_PAGE, noteLimit = NOTE_PAGE;

  function resetListLimits() { todoLimit = TODO_PAGE; noteLimit = NOTE_PAGE; }

  function showMoreRow(remaining, onMore) {
    return h('div', { class: 'list-more' }, [
      h('button', { class: 'btn small', type: 'button', onClick: onMore },
        [OC.icon('down'), 'Show ' + remaining + ' more'])
    ]);
  }

  function me() {
    return OC.store.user(OC.store.session()) || (OC.store.state && OC.store.state.users && OC.store.state.users[0]) || { id: '', name: 'User', admin: false };
  }

  /* extract assigned department IDs for a user */
  function userDeptIds(user) {
    if (!user) return [];
    var ids = [];
    if (user.department && ids.indexOf(user.department) === -1) ids.push(user.department);
    if (Array.isArray(user.departments)) {
      user.departments.forEach(function (m) {
        var did = (typeof m === 'string') ? m : (m && m.department);
        if (did && ids.indexOf(did) === -1) ids.push(did);
      });
    }
    if (user.invite && user.invite.department && ids.indexOf(user.invite.department) === -1) {
      ids.push(user.invite.department);
    }
    return ids;
  }

  /* the client filter only offers clients this person is allowed to see */
  function visibleClientPool() {
    var u = me();
    return (OC.can && OC.can.visibleClients && u)
      ? OC.can.visibleClients(u)
      : (OC.store.state.clients || []);
  }

  function clientLabel() {
    var c = filters.client ? OC.store.client(filters.client) : null;
    return c ? c.name : 'Combined';
  }

  /* ---- filtering -------------------------------------------------------- */
  function matches(item, isTodo) {
    if (filters.client) {
      var cHit = item.client === filters.client || (Array.isArray(item.clients) && item.clients.indexOf(filters.client) > -1);
      if (!cHit) return false;
    }
    if (filters.department) {
      if (item.department || (Array.isArray(item.departments) && item.departments.length)) {
        var dHit = item.department === filters.department || (Array.isArray(item.departments) && item.departments.indexOf(filters.department) > -1);
        if (!dHit) return false;
      }
    }
    if (filters.tag && (item.tags || []).indexOf(filters.tag) === -1) return false;

    if (filters.person) {
      if (isTodo) {
        var hit = (item.assignee_type === 'user' && item.assignee === filters.person) ||
                  (Array.isArray(item.assignees) && item.assignees.indexOf(filters.person) > -1);
        if (!hit && item.assignee_type === 'group') {
          var g = OC.store.group(item.assignee);
          hit = !!g && g.members.indexOf(filters.person) > -1;
        }
        if (!hit && Array.isArray(item.assignees)) {
          hit = item.assignees.some(function (aid) {
            var g2 = OC.store.group(aid);
            return !!g2 && g2.members.indexOf(filters.person) > -1;
          });
        }
        if (!hit) return false;
      } else if (item.author !== filters.person) {
        return false;
      }
    }

    var when = (isTodo ? (item.created_at || item.posted_at || '') : (item.posted_at || item.created_at || '')).slice(0, 10);
    if (filters.from && when && when < filters.from) return false;
    if (filters.to && when && when > filters.to) return false;

    if (filters.q) {
      var q = filters.q.toLowerCase();
      var hay = isTodo ? (item.title + ' ' + item.description) : item.body;
      if (hay.toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  }

  function visibleTodos() {
    var user = me();
    return OC.store.state.todos.filter(function (t) {
      if (!OC.can.seeTodo(user, t)) return false;
      if (t.archived && !showArchived) return false;
      if (t.state === 'done' && !showDone) return false;
      return matches(t, true);
    });
  }

  function visibleInstructions() {
    var user = me();
    return OC.store.state.instructions
      .filter(function (n) {
        if (!OC.can.seeInstruction(user, n)) return false;
        if (n.archived && !showArchived) return false;
        return matches(n, false);
      })
      .sort(function (a, b) {
        var ap = a.posted_at || '';
        var bp = b.posted_at || '';
        return bp.localeCompare(ap);
      });
  }

  /* ---- filter bar ------------------------------------------------------- */
  function optionsFor(list, blank) {
    return [{ value: '', label: blank }].concat(list.map(function (x) {
      var lbl = (x.client_id || x.client_code) && OC.ui && OC.ui.clientLabel
        ? OC.ui.clientLabel(x)
        : (x.name || x.label);
      return { value: x.id, label: lbl };
    }));
  }

  function filterBar(rerender) {
    var user = me();
    var people = OC.can.visibleUsers(user);
    var depts = user.admin ? OC.store.state.departments
      : OC.store.state.departments.filter(function (d) { return OC.can.inDept(user, d.id); });

    function set(key) {
      return function (e) { filters[key] = e.target.value; resetListLimits(); rerender(); };
    }

    /* Department filter on Notice Board */
    var deptField = (!user.admin && depts.length === 1)
      ? OC.ui.field('Department', h('div', { class: 'chip custom', style: 'padding:5px 10px;font-size:12.5px;font-weight:600;' }, depts[0].name), { hint: 'Fixed to your assigned department.' })
      : OC.ui.field('Department', OC.ui.select(optionsFor(depts, user.admin ? 'All departments' : 'My departments'), filters.department, { onChange: set('department') }));

    var active = Object.keys(filters).filter(function (k) { return filters[k]; }).length;

    var bar = h('div', { class: 'filterbar', 'data-open': String(filtersOpen) }, [
      h('div', { class: 'filterbar-head' }, [
        OC.icon('filter'),
        h('h2', {}, [OC.icon('filter'), 'Filters']),
        active ? h('span', { class: 'chip count' }, active + ' active') : h('span', { class: 'muted', style: 'font-size:12.5px' }, 'showing everything you may see'),
        h('div', { class: 'tools' }, [
          h('button', {
            class: 'btn small', type: 'button', disabled: !active, onClick: function () {
              Object.keys(filters).forEach(function (k) { filters[k] = ''; });
              rerender();
            }
          }, [OC.icon('reset'), 'Clear']),
          h('button', { class: 'btn small', type: 'button', onClick: saveFilter }, [OC.icon('flag'), 'Pin filter']),
          /* on a phone the seven fields are a screenful before any content,
             so they fold away behind this. Hidden above 720px, where they
             are always shown. */
          h('button', {
            class: 'btn small filters-toggle', type: 'button',
            'aria-expanded': String(filtersOpen),
            onClick: function () { filtersOpen = !filtersOpen; rerender(); }
          }, [OC.icon(filtersOpen ? 'up' : 'down'), filtersOpen ? 'Hide fields' : 'Show fields'])
        ])
      ]),
      h('div', { class: 'filters' }, [
      OC.ui.field('Search', h('input', { type: 'search', value: filters.q, placeholder: 'text in todos and instructions', onInput: OC.ui.debounce ? OC.ui.debounce(set('q'), 120) : set('q') })),
      OC.ui.field('Client', OC.ui.select(optionsFor(visibleClientPool(), 'All clients'), filters.client, { onChange: set('client') })),
      deptField,
      OC.ui.field('Person', OC.ui.select(optionsFor(people, 'Anyone'), filters.person, { onChange: set('person') })),
      OC.ui.field('Tag', OC.ui.select(optionsFor(OC.store.state.tags, 'Any tag'), filters.tag, { onChange: set('tag') })),
      OC.ui.field('From', h('input', { type: 'date', value: filters.from, onChange: set('from') })),
      OC.ui.field('To', h('input', { type: 'date', value: filters.to, onChange: set('to') }))
      ])
    ]);
    return bar;
  }

  function saveFilter() {
    var active = Object.keys(filters).filter(function (k) { return filters[k]; });
    if (!active.length) { OC.ui.toast('Set a filter before pinning it.', true); return; }
    var input = h('input', { type: 'text', placeholder: 'for example: everything tagged Chaim' });
    OC.ui.modal({
      title: 'Pin this filter',
      content: OC.ui.field('Name', input, { required: true, hint: 'Pinned filters sit above the board for quick access.' }),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Pin', primary: true, onClick: function (close) {
            if (!input.value.trim()) return 'Give the filter a name.';
            var snapshot = JSON.parse(JSON.stringify(filters));
            OC.store.mutate(null, function () {
              OC.store.state.saved_filters.push({
                id: OC.store.uid('sf'), name: input.value.trim(),
                owner: OC.store.session(), filters: snapshot
              });
            });
            OC.ui.toast('Filter pinned.');
            close();
          }
        }
      ]
    });
  }

  function savedBar(rerender) {
    var mine = OC.store.state.saved_filters.filter(function (f) { return f.owner === OC.store.session(); });
    if (!mine.length) return null;
    return h('div', { class: 'savedbar' }, [
      h('span', { class: 'eyebrow' }, 'Pinned'),
      mine.map(function (f) {
        return h('span', { class: 'chip client', onClick: function () { filters = JSON.parse(JSON.stringify(f.filters)); rerender(); } }, [
          f.name,
          h('button', {
            type: 'button',
            'aria-label': 'Remove pinned filter ' + f.name,
            onClick: function (e) {
              e.stopPropagation();
              OC.store.mutate(null, function () {
                OC.store.state.saved_filters = OC.store.state.saved_filters.filter(function (x) { return x.id !== f.id; });
              });
            }
          }, '×')
        ]);
      })
    ]);
  }

  /* ---- todo item -------------------------------------------------------- */
  function stateSelect(todo) {
    var user = me();
    if (!OC.can.changeState(user, todo)) {
      return OC.ui.stateChip(todo.state);
    }
    return OC.ui.select(
      Object.keys(OC.ui.STATE_LABEL).map(function (k) { return { value: k, label: OC.ui.STATE_LABEL[k] }; }),
      todo.state,
      {
        'aria-label': 'State for ' + todo.title,
        onChange: function (e) { changeState(todo, e.target.value, e.target); }
      }
    );
  }

  /* adding a month to the 31st overflows into the month after next in plain
     JavaScript — Jan 31 lands on Mar 3 — so a monthly todo on the 31st would
     skip February entirely. The day clamps to the end of a shorter month. */
  function addMonths(date, months) {
    var day = date.getDate();
    var target = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
    var lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
    target.setDate(Math.min(day, lastDay));
    return target;
  }

  function nextDue(dueDate, recurrence) {
    /* a due value may carry a time ("2026-09-03T14:30"); recur from its day.
       Without a usable date there is no next instance to compute. */
    var day = String(dueDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
    var d = new Date(day + 'T12:00:00');
    if (recurrence === 'daily') d.setDate(d.getDate() + 1);
    else if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
    else if (recurrence === 'monthly') d = addMonths(d, 1);
    else if (recurrence === 'quarterly') d = addMonths(d, 3);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function changeState(todo, next, control) {
    var user = me();
    var spawnedInstance = false;
    if (next === 'blocked') {
      var reason = h('input', { type: 'text', placeholder: 'what is blocking it' });
      OC.ui.modal({
        title: 'Blocked: one line reason',
        content: OC.ui.field('Reason', reason, { required: true, hint: 'Visible to whoever assigned the task.' }),
        actions: [
          { label: 'Cancel', onClick: function (close) { if (control) control.value = todo.state; close(); } },
          {
            label: 'Mark blocked', primary: true, onClick: function (close) {
              if (!reason.value.trim()) return 'A blocked todo needs a reason.';
              OC.store.mutate({ actor: user.id, action: 'todo.blocked', target: todo.title, detail: reason.value.trim() }, function () {
                todo.state = 'blocked';
                todo.blocked_reason = reason.value.trim();
              });
              OC.store.notify([todo.created_by], todo.title + ' was marked blocked by ' + user.name, todo.id);
              close();
            }
          }
        ]
      });
      return;
    }

    OC.store.mutate({ actor: user.id, action: 'todo.state', target: todo.title, detail: todo.state + ' → ' + next, todoId: todo.id }, function () {
      todo.state = next;
      todo.updated_at = new Date().toISOString();
      if (next === 'done') todo.completed_at = new Date().toISOString();
      if (next !== 'blocked') todo.blocked_reason = null;

      /* a recurring todo regenerates as a fresh instance on completion (6.2) */
      if (next === 'done' && todo.recurrence && todo.recurrence !== 'none' && !todo.spawned && todo.due) {
        todo.spawned = true;
        var copy = JSON.parse(JSON.stringify(todo));
        copy.id = OC.store.uid('t');
        copy.state = 'open';
        copy.spawned = false;
        copy.blocked_reason = null;
        var carriedTime = String(todo.due || '').slice(10);
        copy.due = nextDue(todo.due, todo.recurrence) + carriedTime;
        spawnedInstance = true;
        copy.created_at = new Date().toISOString();
        copy.comments = [];
        OC.store.state.todos.push(copy);
      }

      /* Targeted notification on state change (Done, Progress, etc.) to concerned creator/assignee */
      var stateTargets = [];
      if (todo.created_by && todo.created_by !== user.id) stateTargets.push(todo.created_by);
      if (todo.assignee_type === 'user' && todo.assignee && todo.assignee !== user.id) stateTargets.push(todo.assignee);
      else if (todo.assignee_type === 'group' && todo.assignee) {
        var g = OC.store.group(todo.assignee);
        if (g && g.members) stateTargets = stateTargets.concat(g.members.filter(function (id) { return id !== user.id; }));
      }
      stateTargets = stateTargets.filter(function (uid, idx, arr) { return uid && arr.indexOf(uid) === idx; });

      if (stateTargets.length) {
        var stateLabel = OC.ui.STATE_LABEL[next] || next;
        OC.store.notify(stateTargets, user.name + ' marked ' + stateLabel + ': "' + todo.title + '"', todo.id);
      }
    });

    if (next === 'done') OC.ui.toast('Marked done' + (spawnedInstance ? ', next instance created.' : '.'));
  }

  function escalationNote(todo) {
    var late = OC.ui.daysLate(todo.due);
    if (todo.state === 'done' || late < 1) return null;
    var reached = OC.can.escalationReached(todo, late);
    var chain = OC.can.escalationChain(todo);
    var steps = chain.slice(1, reached + 1).map(function (s) {
      return s.step.split(',')[0] + ' (' + s.users.map(OC.ui.personName).join(', ') + ')';
    });
    if (!steps.length) return null;
    return h('div', { class: 'escalation' }, [
      OC.icon('users'),
      h('span', {}, 'Escalated to ' + steps.join(' → ') + ' — ' + OC.ui.dueLabel(todo.due) + '.')
    ]);
  }

  function todoItem(todo) {
    var user = me();
    var late = OC.ui.daysLate(todo.due);
    var overdue = todo.state !== 'done' && late > 0;
    var cls = 'item is-' + todo.state + (overdue ? ' is-overdue' : '');

    var actions = [stateSelect(todo)];
    if (OC.can.canEditTodo(user, todo)) {
      actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { editTodo(todo); } }, [OC.icon('edit'), 'Edit']));
    }
    if (OC.can.reassign(user, todo)) {
      var isUnassigned = !todo.assignee && (!Array.isArray(todo.assignees) || !todo.assignees.length);
      actions.push(h('button', { class: 'btn small' + (isUnassigned ? ' primary' : ''), type: 'button', onClick: function () { reassignTodo(todo); } }, [OC.icon('users'), isUnassigned ? 'Assign' : 'Reassign']));
    }
    var canArchive = OC.can && OC.can.canArchiveTodo ? OC.can.canArchiveTodo(user, todo) : (user && (user.admin || todo.created_by === user.id || todo.author === user.id));
    if (canArchive && !todo.archived) {
      actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { archiveTodo(todo); } }, [OC.icon('inbox'), 'Archive']));
    }

    return h('article', { class: cls }, [
      h('div', { class: 'title' }, todo.title),
      h('div', { class: 'meta' }, [
        ((Array.isArray(todo.clients) && todo.clients.length > 1) || todo.client) && grouping !== 'client'
          ? ((Array.isArray(todo.clients) && todo.clients.length > 1)
              ? h('span', { class: 'multi-clients-wrap', style: 'display:inline-flex;gap:4px;flex-wrap:wrap;' }, todo.clients.map(OC.ui.clientChip))
              : OC.ui.clientChip(todo.client))
          : null,
        grouping !== 'person'
          ? ((Array.isArray(todo.assignees) && todo.assignees.length > 1)
              ? h('span', { class: 'multi-assignees-wrap', style: 'display:inline-flex;gap:4px;flex-wrap:wrap;align-items:center;' },
                  todo.assignees.map(function (uid) {
                    if (typeof uid === 'string') {
                      if (uid.indexOf('group:') === 0) {
                        var g = OC.store.group(uid.slice(6));
                        return h('span', { class: 'chip group' }, g ? g.name : uid.slice(6));
                      }
                      if (uid.indexOf('user:') === 0) {
                        return OC.ui.person(uid.slice(5));
                      }
                    }
                    var g2 = OC.store.group(uid);
                    if (g2) return h('span', { class: 'chip group' }, g2.name);
                    return OC.ui.person(uid);
                  })
                )
              : (todo.assignee_type === 'group'
                  ? h('span', { class: 'chip group' }, OC.ui.assigneeName(todo))
                  : OC.ui.person(todo.assignee)))
          : null,
        (todo.recurrence && todo.recurrence !== 'none') ? h('span', { class: 'chip recurring' }, todo.recurrence) : null,
        todo.archived ? h('span', { class: 'chip custom' }, 'archived') : null,
        h('span', { class: overdue ? 'chip overdue due' : 'due' }, OC.ui.dueLabel(todo.due))
      ]),
      todo.blocked_reason
        ? h('div', { class: 'blocked-note' }, [OC.icon('alert'), h('span', {}, 'Blocked: ' + todo.blocked_reason)])
        : null,
      escalationNote(todo),
      h('div', { class: 'actions' }, actions)
    ]);
  }

  function archiveTodo(todo) {
    var user = me();
    var allowed = OC.can && OC.can.canArchiveTodo ? OC.can.canArchiveTodo(user, todo) : (user && (user.admin || todo.created_by === user.id || todo.author === user.id));
    if (!allowed) {
      OC.ui.toast('Only the creator and system admin can archive this todo.');
      return;
    }
    OC.ui.confirm('Archive "' + todo.title + '"? It will be moved to archives.', function () {
      OC.store.mutate({ actor: OC.store.session(), action: 'todo.archive', target: todo.title }, function () {
        todo.archived = true;
      });
      OC.ui.toast('Archived.');
    });
  }

  function editTodo(todo, onSaved) {
    var user = me();
    var isSysAdmin = !!(user && user.admin);
    var uDepts = userDeptIds(user);
    var title = h('input', { type: 'text', value: todo.title || '' });
    var clientPicker = OC.ui.clientPicker(todo.clients || todo.client || '');

    var initialAssignees = (Array.isArray(todo.assignees) && todo.assignees.length)
      ? todo.assignees.map(function (id) {
          if (typeof id === 'string' && (id.indexOf('user:') === 0 || id.indexOf('group:') === 0)) return id;
          return (todo.assignee_type === 'group' ? 'group:' : 'user:') + id;
        })
      : (todo.assignee ? [(todo.assignee_type || 'user') + ':' + todo.assignee] : []);
    var assigneePicker = OC.ui.assigneePicker(initialAssignees, user);

    var minDue = OC.ui.localNowISO();
    var due = h('input', {
      type: 'datetime-local',
      value: (todo.due && todo.due.indexOf('T') > -1) ? todo.due.slice(0, 16) : (todo.due ? todo.due + 'T18:00' : minDue),
      min: minDue,
      step: '60'
    });
    var priority = OC.ui.select([
      { value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }
    ], todo.priority || 'normal');
    var recurrence = OC.ui.select([
      { value: 'none', label: 'One time' }, { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' },
      { value: 'quarterly', label: 'Quarterly' }
    ], todo.recurrence || 'none');

    var canReassign = OC.can.reassign(user, todo);

    var actions = [
      { label: 'Cancel', onClick: function (close) { close(); } },
      {
        label: 'Save changes', primary: true, onClick: function (close) {
          var newTitle = title.value.trim();
          if (!newTitle) return 'A todo needs a title.';
          var selectedClients = clientPicker.getClients();
          var primaryClient = clientPicker.getValue();
          var selectedDepts = todo.departments || (todo.department ? [todo.department] : []);
          var primaryDept = todo.department || (selectedDepts[0] || '');

          var assignees = assigneePicker.getAssignees();
          var assigneeTypes = assigneePicker.getAssigneeTypes();
          var primaryAssignee = assigneePicker.getPrimaryAssignee();
          var primaryType = assigneePicker.getPrimaryType();
          /* assignee stays optional here too, so a task can be handed back to
             the department without naming a replacement */
          if (!due.value) return 'A todo needs a due date.';

          OC.store.mutate({
            actor: user.id,
            action: 'todo.edit',
            target: newTitle,
            todoId: todo.id,
            detail: 'Updated todo "' + newTitle + '"'
          }, function () {
            todo.title = newTitle;
            todo.updated_at = new Date().toISOString();
            todo.client = primaryClient;
            todo.clients = selectedClients;
            todo.department = primaryDept;
            todo.departments = selectedDepts;
            if (canReassign) {
              todo.assignee_type = primaryType;
              todo.assignee = primaryAssignee;
              todo.assignees = assignees;
            }
            todo.due = due.value;
            todo.priority = priority.value;
            todo.recurrence = recurrence.value;
          });

          if (canReassign) {
            var targets = [];
            assignees.forEach(function (aid, idx) {
              var tType = assigneeTypes[idx] || 'user';
              if (tType === 'user') targets.push(aid);
              else {
                var g = OC.store.group(aid);
                if (g && g.members) targets = targets.concat(g.members);
              }
            });
            OC.store.notify(targets.filter(function (id) { return id !== user.id; }), user.name + ' assigned you: ' + todo.title, todo.id);
          }

          OC.ui.toast('Todo updated.');
          if (typeof onSaved === 'function') onSaved();
          close();
        }
      }
    ];

    var canDelete = OC.can && OC.can.canDeleteTodo ? OC.can.canDeleteTodo(user, todo) : (user && (user.admin || todo.created_by === user.id || todo.author === user.id));
    if (canDelete) {
      actions.unshift({
        label: 'Delete todo',
        onClick: function (close) {
          if (OC.can && OC.can.canDeleteTodo && !OC.can.canDeleteTodo(user, todo)) {
            OC.ui.toast('Only the creator and system admin can delete this todo.');
            return;
          }
          OC.ui.confirm('Permanently delete todo "' + todo.title + '"? This cannot be undone.', function () {
            OC.store.mutate({
              actor: user.id,
              action: 'todo.delete',
              target: todo.title,
              todoId: todo.id,
              detail: 'Deleted todo'
            }, function () {
              if (OC.store.deleteTodo) {
                OC.store.deleteTodo(todo.id);
              } else {
                if (OC.store.markTodoDeleted) OC.store.markTodoDeleted(todo.id);
                OC.store.state.todos = OC.store.state.todos.filter(function (t) { return t.id !== todo.id; });
              }
            });
            try {
              var apiUrl = (typeof OC.store.getApiUrl === 'function')
                ? OC.store.getApiUrl('/api/todos/' + encodeURIComponent(todo.id))
                : ('/api/todos/' + encodeURIComponent(todo.id));
              if (typeof fetch === 'function') {
                fetch(apiUrl, { method: 'DELETE', headers: { 'bypass-tunnel-reminder': 'true' } }).catch(function () {});
              }
            } catch (_) {}
            OC.ui.toast('Todo deleted.');
            if (typeof onSaved === 'function') onSaved();
            close();
          });
        }
      });
    }

    OC.ui.modal({
      title: 'Edit todo',
      content: h('div', {}, [
        OC.ui.field('Title', title, { required: true }),
        OC.ui.field('Client', clientPicker.node, { hint: 'Select one or multiple clients (optional).' }),
        canReassign ? OC.ui.field('Assign to', assigneePicker.node, { hint: 'Select one or multiple team members.' }) : null,
        OC.ui.field('Due date & time', due, { required: true }),
        OC.ui.field('Priority', priority),
        OC.ui.field('Recurrence', recurrence)
      ].filter(Boolean)),
      actions: actions
    });
  }

  function reassignTodo(todo, onDone) {
    var user = me();
    if (!OC.can.reassign(user, todo)) return OC.ui.toast('Only department leads and system admin can reassign.', true);
    var isUnassigned = !todo.assignee && (!Array.isArray(todo.assignees) || !todo.assignees.length);
    var initialAssignees = (Array.isArray(todo.assignees) && todo.assignees.length)
      ? todo.assignees.map(function (id) {
          if (typeof id === 'string' && (id.indexOf('user:') === 0 || id.indexOf('group:') === 0)) return id;
          return (todo.assignee_type === 'group' ? 'group:' : 'user:') + id;
        })
      : (todo.assignee ? [(todo.assignee_type || 'user') + ':' + todo.assignee] : []);
    var picker = OC.ui.assigneePicker(initialAssignees, user);

    OC.ui.modal({
      title: (isUnassigned ? 'Assign task: ' : 'Reassign todo: ') + todo.title,
      content: h('div', {}, [
        OC.ui.field('Assign to', picker.node, { required: true, hint: 'Select one or multiple team members.' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: isUnassigned ? 'Assign task' : 'Save assignment', primary: true, onClick: function (close) {
            var assignees = picker.getAssignees();
            var assigneeTypes = picker.getAssigneeTypes();
            var primaryAssignee = picker.getPrimaryAssignee();
            var primaryType = picker.getPrimaryType();

            if (!assignees.length) return 'Select at least one team member or group.';

            var prevAssigneeNames = (Array.isArray(todo.assignees) && todo.assignees.length)
              ? todo.assignees.map(function (id) {
                  var clean = typeof id === 'string' ? id.replace(/^(user:|group:)/, '') : id;
                  var u = OC.store.user(clean);
                  var g = OC.store.group(clean);
                  return u ? u.name : (g ? g.name : clean);
                }).join(', ')
              : OC.ui.assigneeName(todo);

            var actionName = isUnassigned ? 'todo.assign' : 'todo.reassign';
            var detailMsg = isUnassigned
              ? ('Assigned to ' + assignees.map(function (id, idx) {
                  var t = assigneeTypes[idx];
                  if (t === 'group') {
                    var g = OC.store.group(id);
                    return g ? g.name : id;
                  }
                  var u = OC.store.user(id);
                  return u ? u.name : id;
                }).join(', '))
              : ('Reassigned from ' + prevAssigneeNames + ' to ' + assignees.map(function (id, idx) {
                  var t = assigneeTypes[idx];
                  if (t === 'group') {
                    var g = OC.store.group(id);
                    return g ? g.name : id;
                  }
                  var u = OC.store.user(id);
                  return u ? u.name : id;
                }).join(', '));

            OC.store.mutate({
              actor: user.id,
              action: actionName,
              target: todo.title,
              todoId: todo.id,
              detail: detailMsg
            }, function () {
              todo.assignee_type = primaryType;
              todo.assignee = primaryAssignee;
              todo.assignees = assignees;
            });

            var targets = [];
            assignees.forEach(function (aid, idx) {
              var tType = assigneeTypes[idx] || 'user';
              if (tType === 'user') targets.push(aid);
              else {
                var g = OC.store.group(aid);
                if (g && g.members) targets = targets.concat(g.members);
              }
            });
            OC.store.notify(targets.filter(function (id) { return id !== user.id; }), user.name + ' assigned you: ' + todo.title, todo.id);
            OC.ui.toast(isUnassigned ? 'Task assigned.' : 'Reassigned.');
            if (typeof onDone === 'function') onDone();
            close();
          }
        }
      ]
    });
  }

  /* ---- new todo ---------------------------------------------------------- */
  function newTodo(preset, onCreated) {
    preset = preset || {};
    var user = me();
    var isSysAdmin = !!(user && user.admin);
    var uDepts = userDeptIds(user);
    var title = h('input', { type: 'text', placeholder: 'What needs doing?' });

    var lockClient = !!preset.lockClient;
    var showDepartment = !!preset.showDepartment;
    var lockDepartment = showDepartment && (!!preset.lockDepartment || (!isSysAdmin && uDepts.length > 0));

    var clientPicker = lockClient ? null : OC.ui.clientPicker(preset.clients || preset.client || '');
    var deptPicker = (showDepartment && !lockDepartment) ? OC.ui.deptPicker(preset.departments || preset.department || (user.department || ''), user) : null;

    var lockedClientIds = lockClient ? (preset.clients || (preset.client ? [preset.client] : [])) : [];
    var lockedClientNames = lockedClientIds.map(function (cid) {
      var c = OC.store.client(cid);
      return c ? (OC.ui.clientLabel ? OC.ui.clientLabel(c) : c.name) : cid;
    }).join(', ');
    var lockedDeptIds = lockDepartment
      ? (preset.departments || (preset.department ? [preset.department] : (uDepts.length ? uDepts : [])))
      : [];
    var lockedDeptNames = lockedDeptIds.map(function (did) {
      var d = OC.store.department(did);
      return d ? d.name : did;
    }).join(', ');

    var initialAssignees = [];
    if (preset.assignees && preset.assignees.length) {
      initialAssignees = preset.assignees.map(function (id) {
        if (typeof id === 'string' && (id.indexOf('user:') === 0 || id.indexOf('group:') === 0)) return id;
        return (preset.assignee_type === 'group' ? 'group:' : 'user:') + id;
      });
    } else if (preset.assignee) {
      initialAssignees = [(preset.assignee_type || 'user') + ':' + preset.assignee];
    } else {
      initialAssignees = [];
    }

    var deptMemberUsers = (showDepartment && lockDepartment)
      ? OC.store.state.users.filter(function (u) {
          return lockedDeptIds.some(function (did) { return OC.can.inDept(u, did); });
        })
      : [];
    var lockedAssignees = [];
    var lockedAssigneeList = null;
    if (deptMemberUsers.length) {
      var initialAssigneeIds = initialAssignees.map(function (v) { return v.split(':')[1]; });
      lockedAssigneeList = h('div', {
        class: 'dept-checkbox-list'
      });
      deptMemberUsers.forEach(function (u) {
        var isChecked = initialAssigneeIds.indexOf(u.id) > -1;
        if (isChecked) lockedAssignees.push(u.id);
        var chk = h('input', {
          type: 'checkbox',
          checked: isChecked,
          style: 'cursor:pointer;width:15px;height:15px;margin:0;flex:none;',
          onChange: function (e) {
            var at = lockedAssignees.indexOf(u.id);
            if (e.target.checked && at === -1) lockedAssignees.push(u.id);
            if (!e.target.checked && at > -1) lockedAssignees.splice(at, 1);
          }
        });
        lockedAssigneeList.appendChild(h('label', { style: 'display:flex;align-items:center;gap:7px;font-size:12.5px;cursor:pointer;' }, [chk, OC.ui.mark(u.id), u.name]));
      });
    }
    var assigneePicker = lockedAssigneeList ? null : OC.ui.assigneePicker(initialAssignees, user);

    var minDue = OC.ui.localNowISO();
    var due = h('input', {
      type: 'datetime-local',
      value: (preset.due && preset.due.indexOf('T') > -1) ? preset.due.slice(0, 16) : (preset.due ? preset.due + 'T18:00' : minDue),
      min: minDue,
      step: '60'
    });
    var priority = OC.ui.select([
      { value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }
    ], 'normal');
    var recurrence = OC.ui.select([
      { value: 'none', label: 'One time' }, { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' },
      { value: 'quarterly', label: 'Quarterly' }
    ], 'none');

    var assignHint = 'Select one or multiple team members.';

    var modalFields = [
      OC.ui.field('Title', title, { required: true }),
      lockClient
        ? OC.ui.field('Client', h('div', { class: 'chip custom' }, lockedClientNames || 'This client'), { hint: 'Fixed to the client this task is posted from.' })
        : OC.ui.field('Client', clientPicker.node, { hint: 'Optional — leave empty for an internal task. Select one or more, or click "+ New Client".' })
    ];

    if (showDepartment) {
      if (lockDepartment) {
        modalFields.push(OC.ui.field('Department', h('div', { class: 'chip custom' }, lockedDeptNames || 'This department'), { hint: isSysAdmin ? 'Fixed to the department this client is assigned to.' : 'Fixed to your assigned department (' + (lockedDeptNames || 'Department') + ').' }));
      } else if (deptPicker) {
        modalFields.push(OC.ui.field('Department', deptPicker.node, { required: true, hint: 'Select one or multiple departments.' }));
      }
    }

    modalFields.push(
      lockedAssigneeList
        ? OC.ui.field('Assign to', lockedAssigneeList, { hint: 'Only ' + (lockedDeptNames || 'this department') + '\u2019s own people are offered.' })
        : OC.ui.field('Assign to', assigneePicker.node, { hint: assignHint }),
      OC.ui.field('Due date & time', due, { required: true, hint: 'Past dates & times are blocked automatically.' }),
      OC.ui.field('Priority', priority),
      OC.ui.field('Recurrence', recurrence, { hint: 'A recurring task regenerates automatically on completion.' })
    );

    OC.ui.modal({
      title: 'New todo',
      content: h('div', {}, modalFields),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Create todo', primary: true, onClick: function (close) {
            if (!title.value.trim()) return 'A todo needs a title.';
            var selectedClients = lockClient ? lockedClientIds : clientPicker.getClients();
            var primaryClient = lockClient ? lockedClientIds[0] : clientPicker.getValue();
            var selectedDepts = showDepartment
              ? (lockDepartment ? lockedDeptIds : (deptPicker ? deptPicker.getDepartments() : []))
              : (preset.departments || (preset.department ? [preset.department] : []));
            var primaryDept = showDepartment
              ? (lockDepartment ? (lockedDeptIds[0] || '') : (deptPicker ? deptPicker.getValue() : ''))
              : (preset.department || (selectedDepts[0] || ''));

            if (showDepartment && (!selectedDepts.length || !primaryDept)) {
              return 'Select at least one department.';
            }

            var assignees = lockedAssigneeList ? lockedAssignees.slice() : assigneePicker.getAssignees();
            var assigneeTypes = lockedAssigneeList ? assignees.map(function () { return 'user'; }) : assigneePicker.getAssigneeTypes();
            var primaryAssignee = lockedAssigneeList ? (assignees[0] || null) : assigneePicker.getPrimaryAssignee();
            var primaryType = lockedAssigneeList ? 'user' : assigneePicker.getPrimaryType();

            /* No assignee check: a System Admin may hand a task to a department
               and leave the naming to its head, who sees it and assigns it on. */
            if (!due.value) return 'A todo needs a due date.';

            var todo = {
              id: OC.store.uid('t'),
              title: title.value.trim(),
              client: primaryClient, clients: selectedClients,
              department: primaryDept, departments: selectedDepts,
              assignee_type: primaryType, assignee: primaryAssignee,
              assignees: assignees,
              state: 'open', priority: priority.value, due: due.value,
              recurrence: recurrence.value, created_by: user.id,
              created_at: new Date().toISOString(), tags: [], comments: []
            };
            if (priority.value === 'high') todo.tags.push('t-urgent');

            OC.store.mutate({ actor: user.id, action: 'todo.create', target: todo.title, detail: 'assigned to ' + OC.ui.assigneeName(todo) }, function () {
              OC.store.state.todos.push(todo);
            });

            var directAssigneeTargets = [];
            assignees.forEach(function (aid, idx) {
              var tType = assigneeTypes[idx] || 'user';
              if (tType === 'user') directAssigneeTargets.push(aid);
              else {
                var g = OC.store.group(aid);
                if (g && g.members) directAssigneeTargets = directAssigneeTargets.concat(g.members);
              }
            });
            directAssigneeTargets = directAssigneeTargets.filter(function (id, idx, arr) {
              return id && id !== user.id && arr.indexOf(id) === idx;
            });

            if (directAssigneeTargets.length) {
              OC.store.notify(directAssigneeTargets, user.name + ' assigned you a task: ' + todo.title, todo.id);
            }

            var otherDeptAudience = OC.store.state.users.filter(function (u) {
              return u.id !== user.id && directAssigneeTargets.indexOf(u.id) === -1 && OC.can.seeTodo(u, todo);
            }).map(function (u) { return u.id; });

            if (otherDeptAudience.length) {
              OC.store.notify(otherDeptAudience, user.name + ' created a new task: ' + todo.title, todo.id);
            }
            if (typeof onCreated === 'function') onCreated(todo);
            OC.ui.toast('Todo created.');
            close();
          }
        }
      ]
    });
  }

  function copyYesterday() {
    var user = me();
    var yesterday = OC.ui.daysFromToday(-1);
    var carry = OC.store.state.todos.filter(function (t) {
      return OC.ui.dueDay(t.due) === yesterday && t.state !== 'done' && !t.archived && OC.can.seeTodo(user, t) && OC.can.changeState(user, t);
    });
    if (!carry.length) { OC.ui.toast('Nothing unfinished from yesterday to carry over.', true); return; }
    OC.ui.confirm('Carry ' + carry.length + ' unfinished todo(s) from yesterday into today?', function () {
      OC.store.mutate({ actor: user.id, action: 'todo.carry', target: carry.length + ' todos', detail: 'copied from ' + yesterday }, function () {
        carry.forEach(function (t) {
          var timePart = String(t.due || '').slice(10);   /* keep "T09:00" if it had one */
          t.due = OC.ui.today() + timePart;
        });
      });
      OC.ui.toast(carry.length + ' todo(s) moved to today.');
    });
  }

  /* ---- grouping --------------------------------------------------------- */
  function groupTodos(todos) {
    var buckets = {};
    todos.forEach(function (t) {
      var key;
      if (grouping === 'client') {
        var cid = t.client || (Array.isArray(t.clients) && t.clients.length ? t.clients[0] : '');
        key = OC.ui.clientLabel(cid);
      }
      else if (grouping === 'department') {
        var did = t.department || (Array.isArray(t.departments) && t.departments.length ? t.departments[0] : '');
        var d = OC.store.department(did);
        key = d ? d.name : 'No department';
      }
      else {
        key = OC.ui.assigneeName(t);
      }
      (buckets[key] = buckets[key] || []).push(t);
    });
    return Object.keys(buckets).sort().map(function (k) { return { key: k, items: buckets[k] }; });
  }

  function groupInstructions(notes) {
    var buckets = {};
    notes.forEach(function (n) {
      var key;
      if (grouping === 'client') {
        var cid = n.client || (Array.isArray(n.clients) && n.clients.length ? n.clients[0] : '');
        var c = cid ? OC.store.client(cid) : null;
        key = c ? (OC.ui.clientLabel ? OC.ui.clientLabel(c) : c.name) : (cid || 'No client');
      }
      else if (grouping === 'department') {
        var did = n.department || (Array.isArray(n.departments) && n.departments.length ? n.departments[0] : '');
        var d = OC.store.department(did);
        key = d ? d.name : 'No department';
      }
      else {
        var a = OC.store.user(n.author);
        key = a ? a.name : (n.author || 'Unknown');
      }
      (buckets[key] = buckets[key] || []).push(n);
    });
    return Object.keys(buckets).sort().map(function (k) { return { key: k, items: buckets[k] }; });
  }

  /* ---- instruction item -------------------------------------------------- */
  function instructionItem(note, rerender) {
    var user = me();
    var unread = OC.ui.wasUnread(note, user.id);
    if (user && user.id && OC.ui.markInstructionRead) {
      OC.ui.markInstructionRead(note, user.id);
    }
    var readers = (OC.ui && OC.ui.instructionReaders)
      ? OC.ui.instructionReaders(note)
      : (note.read_by || []).map(OC.ui.personName);

    var actions = [];
    if (OC.can && OC.can.canEditInstruction && OC.can.canEditInstruction(user, note)) {
      actions.push(h('button', {
        class: 'btn small', type: 'button', onClick: function () { editInstruction(note); }
      }, [OC.icon('edit'), 'Edit']));
    }
    if (OC.can.archiveInstruction(user, note) && !note.archived) {
      actions.push(h('button', {
        class: 'btn small', type: 'button', onClick: function () {
          if (!OC.can.archiveInstruction(user, note)) {
            OC.ui.toast('Only the creator and system admin can archive this instruction.');
            return;
          }
          OC.ui.confirm('Archive this instruction? It will remain in archives.', function () {
            OC.store.mutate({ actor: user.id, action: 'instruction.archive', target: note.body.slice(0, 48) }, function () {
              note.archived = true;
            });
          });
        }
      }, [OC.icon('inbox'), 'Archive']));
    }
    if (OC.can && OC.can.canDeleteInstruction && OC.can.canDeleteInstruction(user, note)) {
      actions.push(h('button', {
        class: 'btn small danger', type: 'button', onClick: function () { deleteInstruction(note); }
      }, [OC.icon('trash'), 'Delete']));
    }

    return h('article', { class: 'note' + (unread && !note.archived ? ' unread' : '') + (note.archived ? ' archived' : '') }, [
      h('div', { class: 'byline' }, [
        OC.ui.person(note.author, 'strong'),
        ((Array.isArray(note.clients) && note.clients.length > 1) || note.client) && grouping !== 'client'
          ? ((Array.isArray(note.clients) && note.clients.length > 1)
              ? h('span', { class: 'multi-clients-wrap', style: 'display:inline-flex;gap:4px;flex-wrap:wrap;' }, note.clients.map(OC.ui.clientChip))
              : OC.ui.clientChip(note.client))
          : null,
        h('span', {}, OC.ui.fmtWhen(note.posted_at)),
        note.archived ? h('span', { class: 'chip custom' }, 'archived') : null,
        (Array.isArray(note.target_users) && note.target_users.length)
          ? h('span', { class: 'chip custom', title: 'Target team members' }, 'For: ' + note.target_users.map(OC.ui.personName).join(', '))
          : null
      ].filter(Boolean)),
      h('div', { class: 'body' }, note.body),
      (note.tags && note.tags.length)
        ? h('div', { class: 'tags' }, (note.tags || []).map(OC.ui.tagChip))
        : null,
      h('div', { class: 'readers' }, readers.length
        ? 'Read by ' + readers.length + ': ' + readers.join(', ')
        : 'Nobody has read this yet'),
      actions.length ? h('div', { class: 'actions' }, actions) : null,
      OC.ui.reactionsBar('instruction', note),
      OC.can.commentOnInstruction(user, note) ? OC.ui.commentThread('instruction', note) : null
    ]);
  }

  function editInstruction(note, onSaved) {
    var user = me();
    var isSysAdmin = !!(user && user.admin);
    var uDepts = userDeptIds(user);
    var body = h('textarea', {}, note.body || '');
    var clientPicker = OC.ui.clientPicker(note.clients || note.client || '');
    var initialAssignees = note.assignees || note.target_users || (note.assignee ? [note.assignee] : []);
    var assigneePicker = OC.ui.assigneePicker(initialAssignees, user, null, { allUsers: true, disableGroups: true });
    var tags = OC.ui.tagPicker(note.tags || []);

    var actions = [
      { label: 'Cancel', onClick: function (close) { close(); } },
      {
        label: 'Save changes', primary: true, onClick: function (close) {
          var newBody = body.value.trim();
          if (!newBody) return 'Write the instruction text.';
          var selectedClients = clientPicker.getClients();
          var primaryClient = clientPicker.getValue();
          var selectedDepts = note.departments || (note.department ? [note.department] : []);
          var primaryDept = note.department || (selectedDepts[0] || '');

          var rawAssignees = assigneePicker.getAssignees();
          var rawTypes = assigneePicker.getAssigneeTypes();
          var targetUsers = [];
          rawAssignees.forEach(function (aid, idx) {
            var tType = rawTypes[idx] || 'user';
            if (tType === 'user') {
              if (targetUsers.indexOf(aid) === -1) targetUsers.push(aid);
            } else {
              var g = OC.store.group(aid);
              if (g && Array.isArray(g.members)) {
                g.members.forEach(function (mid) {
                  if (targetUsers.indexOf(mid) === -1) targetUsers.push(mid);
                });
              }
            }
          });

          OC.store.mutate({
            actor: user.id,
            action: 'instruction.edit',
            target: newBody.slice(0, 48),
            detail: 'Updated instruction'
          }, function () {
            note.body = newBody;
            note.client = primaryClient;
            note.clients = selectedClients;
            note.department = primaryDept;
            note.departments = selectedDepts;
            note.tags = tags.resolve();
            note.target_users = targetUsers.slice();
            note.assignees = rawAssignees.slice();
            note.assignee = rawAssignees[0] || null;
          });

          OC.ui.toast('Instruction updated.');
          if (typeof onSaved === 'function') onSaved(note);
          close();
        }
      }
    ];

    if (OC.can && OC.can.canDeleteInstruction && OC.can.canDeleteInstruction(user, note)) {
      actions.unshift({
        label: 'Delete instruction',
        onClick: function (close) {
          OC.ui.confirm('Permanently delete this instruction? This action cannot be undone.', function () {
            OC.store.mutate({
              actor: user.id,
              action: 'instruction.delete',
              target: note.body.slice(0, 48),
              instructionId: note.id,
              detail: 'Deleted instruction'
            }, function () {
              OC.store.deleteInstruction(note.id);
            });
            OC.ui.toast('Instruction deleted.');
            if (typeof onSaved === 'function') onSaved(note, 'deleted');
            close();
          });
        }
      });
    }

    OC.ui.modal({
      title: 'Edit instruction',
      content: h('div', {}, [
        OC.ui.field('Instruction', body, { required: true }),
        OC.ui.field('Client', clientPicker.node, { hint: 'Select one or multiple clients (optional).' }),
        OC.ui.field('Assign to', assigneePicker.node, { hint: 'Select one or multiple team members (optional).' }),
        OC.ui.field('Tags', tags.node)
      ].filter(Boolean)),
      actions: actions
    });
  }

  function deleteInstruction(note, onDeleted) {
    var user = me();
    if (OC.can && OC.can.canDeleteInstruction && !OC.can.canDeleteInstruction(user, note)) {
      OC.ui.toast('Only the creator and system admin can delete this instruction.');
      return;
    }
    OC.ui.confirm('Permanently delete this instruction? This action cannot be undone.', function () {
      OC.store.mutate({
        actor: OC.store.session(),
        action: 'instruction.delete',
        target: note.body.slice(0, 48),
        instructionId: note.id,
        detail: 'Deleted instruction'
      }, function () {
        OC.store.deleteInstruction(note.id);
      });
      OC.ui.toast('Instruction deleted.');
      if (typeof onDeleted === 'function') onDeleted(note);
    });
  }


  /* ---- post an instruction ----------------------------------------------- */
  function newInstruction(preset, onCreated) {
    if (typeof preset === 'function') {
      onCreated = preset;
      preset = {};
    }
    preset = preset || {};
    var user = me();
    var isSysAdmin = !!(user && user.admin);
    var uDepts = userDeptIds(user);
    var body = h('textarea', { placeholder: 'the instruction, as it was given' });

    var lockClient = !!preset.lockClient;
    var showDepartment = !!preset.showDepartment;
    var lockDepartment = showDepartment && (!!preset.lockDepartment || (!isSysAdmin && uDepts.length > 0));

    var clientPicker = lockClient ? null : OC.ui.clientPicker(preset.clients || preset.client || '');
    var initialAssignees = preset.target_users || preset.assignees || (preset.assignee ? [preset.assignee] : []);
    var assigneePicker = OC.ui.assigneePicker(initialAssignees, user, null, { allUsers: true, disableGroups: true });
    var deptPicker = (showDepartment && !lockDepartment) ? OC.ui.deptPicker(preset.departments || preset.department || (user.department || ''), user) : null;
    var tags = OC.ui.tagPicker(preset.tags || []);

    var lockedClientIds = lockClient ? (preset.clients || (preset.client ? [preset.client] : [])) : [];
    var lockedClientNames = lockedClientIds.map(function (cid) {
      var c = OC.store.client(cid);
      return c ? (OC.ui.clientLabel ? OC.ui.clientLabel(c) : c.name) : cid;
    }).join(', ');
    var lockedDeptIds = lockDepartment
      ? (preset.departments || (preset.department ? [preset.department] : (uDepts.length ? uDepts : [])))
      : [];
    var lockedDeptNames = lockedDeptIds.map(function (did) {
      var d = OC.store.department(did);
      return d ? d.name : did;
    }).join(', ');

    var modalFields = [
      OC.ui.field('Instruction', body, { required: true }),
      lockClient
        ? OC.ui.field('Client', h('div', { class: 'chip custom' }, lockedClientNames || 'This client'), { hint: 'Fixed to the client this instruction is posted from.' })
        : OC.ui.field('Client', clientPicker.node, { hint: 'Optional — leave empty for an internal/department instruction. Select one or more, or click "+ New Client".' }),
      OC.ui.field('Assign to', assigneePicker.node, { hint: 'Select one or multiple team members (optional).' })
    ];

    if (showDepartment) {
      if (lockDepartment) {
        modalFields.push(OC.ui.field('Department', h('div', { class: 'chip custom' }, lockedDeptNames || 'This department'), { hint: isSysAdmin ? 'Fixed to the department this client is assigned to.' : 'Fixed to your assigned department (' + (lockedDeptNames || 'Department') + ').' }));
      } else if (deptPicker) {
        modalFields.push(OC.ui.field('Department', deptPicker.node, { required: true, hint: 'Select one or multiple departments.' }));
      }
    }

    modalFields.push(OC.ui.field('Tags', tags.node));

    OC.ui.modal({
      title: 'Post an instruction',
      content: h('div', {}, modalFields.filter(Boolean)),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Post instruction', primary: true, onClick: function (close) {
            if (!body.value.trim()) return 'Write the instruction first.';
            var selectedClients = lockClient ? lockedClientIds : clientPicker.getClients();
            var primaryClient = lockClient ? (lockedClientIds[0] || null) : clientPicker.getValue();
            var selectedDepts = showDepartment
              ? (lockDepartment ? lockedDeptIds : (deptPicker ? deptPicker.getDepartments() : []))
              : (preset.departments || (preset.department ? [preset.department] : []));
            var primaryDept = showDepartment
              ? (lockDepartment ? (lockedDeptIds[0] || '') : (deptPicker ? deptPicker.getValue() : ''))
              : (preset.department || (selectedDepts[0] || ''));

            if (showDepartment && (!selectedDepts.length || !primaryDept)) {
              return 'Select at least one department.';
            }

            var rawAssignees = assigneePicker.getAssignees();
            var rawTypes = assigneePicker.getAssigneeTypes();
            var targetUsers = [];
            rawAssignees.forEach(function (aid, idx) {
              var tType = rawTypes[idx] || 'user';
              if (tType === 'user') {
                if (targetUsers.indexOf(aid) === -1) targetUsers.push(aid);
              } else {
                var g = OC.store.group(aid);
                if (g && Array.isArray(g.members)) {
                  g.members.forEach(function (mid) {
                    if (targetUsers.indexOf(mid) === -1) targetUsers.push(mid);
                  });
                }
              }
            });

            var note = {
              id: OC.store.uid('n'), body: body.value.trim(), author: user.id,
              client: primaryClient, clients: selectedClients,
              department: primaryDept, departments: selectedDepts,
              tags: tags.resolve(),
              posted_at: new Date().toISOString(), read_by: [user.id],
              archived: false, linked_todo: null, comments: [],
              client_only: !!preset.client_only,
              target_users: targetUsers.slice(),
              assignees: rawAssignees.slice(),
              assignee: rawAssignees[0] || null
            };

            OC.store.mutate({ actor: user.id, action: 'instruction.post', target: note.body.slice(0, 48), detail: 'tagged ' + (OC.store.client(note.client) || {}).name }, function () {
              OC.store.state.instructions.push(note);
            });

            var audience = OC.store.state.users.filter(function (u) {
              return u.id !== user.id && (
                (note.target_users && note.target_users.indexOf(u.id) > -1) ||
                OC.can.seeInstruction(u, note)
              );
            }).map(function (u) { return u.id; });
            var clientNames = (note.clients || [note.client]).map(function (cid) {
              var c = OC.store.client(cid);
              return c ? c.name : cid;
            }).filter(Boolean).join(', ');
            var label = clientNames || 'your department';
            if (audience.length) {
              OC.store.notify(audience, user.name + ' posted an instruction (' + label + '): ' + (note.body.length > 50 ? note.body.slice(0, 50) + '…' : note.body), note.id);
            }
            if (typeof onCreated === 'function') onCreated(note);
            OC.ui.toast('Instruction posted to ' + audience.length + ' people.');
            close();
          }
        }
      ]
    });
  }

  /* ---- combined client timeline (6.4) ------------------------------------
     "Filtering by client shows every instruction and todo for that client
     across every department in one combined, chronological view." Todos and
     instructions are merged on the moment each was recorded, newest first,
     and grouped by day. */
  function timeline(rerender) {
    var user = me();
    var entries = [];

    visibleTodos().forEach(function (t) {
      entries.push({ at: t.created_at, kind: 'todo', item: t });
    });
    visibleInstructions().forEach(function (n) {
      entries.push({ at: n.posted_at, kind: 'instruction', item: n });
    });
    entries.sort(function (a, b) { return b.at.localeCompare(a.at); });

    if (!entries.length) {
      return h('div', { class: 'empty' }, [OC.icon('filter'), 'Nothing recorded for these filters.']);
    }

    var wrap = h('div', {});
    var day = null;
    var current = null;

    entries.forEach(function (entry) {
      var thisDay = entry.at.slice(0, 10);
      if (thisDay !== day) {
        day = thisDay;
        wrap.appendChild(h('p', { class: 'tl-day' }, OC.ui.fmtDate(thisDay) + ' · ' + OC.ui.fmtWhen(entry.at)));
        current = h('div', { class: 'timeline' });
        wrap.appendChild(current);
      }
      current.appendChild(h('div', { class: 'tl-entry' + (entry.kind === 'todo' ? ' is-todo' : '') }, [
        h('p', { class: 'tl-kind' }, entry.kind === 'todo' ? 'Todo' : 'Instruction'),
        entry.kind === 'todo' ? todoItem(entry.item) : instructionItem(entry.item, rerender)
      ]));
    });
    return wrap;
  }

  /* ---- render ----------------------------------------------------------- */
  function render(host, rerender) {
    var user = me();
    var todos = visibleTodos();
    var notes = visibleInstructions();
    var unreadCount = notes.filter(function (n) { return OC.ui.wasUnread(n, user.id); }).length;

    if (grouping === 'department') grouping = 'person';

    function createGroupControl() {
      return h('div', { class: 'segmented', role: 'group', 'aria-label': 'Group by', title: 'Group by' },
        [['person', 'Person'], ['client', 'Client']].map(function (opt) {
          return h('button', {
            type: 'button', 'aria-pressed': String(grouping === opt[0]),
            onClick: function () { grouping = opt[0]; rerender(); }
          }, opt[1]);
        }));
    }

    var todoPanel = h('section', { class: 'panel panel--todos' }, [
      h('div', { class: 'panel-head' }, [
        h('h2', {}, [OC.icon('check'), 'Todos']),
        h('span', { class: 'chip count' }, todos.length + ' visible'),
        h('div', { class: 'tools' }, [
          createGroupControl(),
          h('button', { class: 'btn small primary', type: 'button', onClick: function () { newTodo(); } },
            [OC.icon('plus'), 'New todo'])
        ])
      ]),
      h('div', { class: 'panel-body scroll' }, todos.length
        ? (function () {
            var buckets = groupTodos(todos);
            var nodes = [];
            var shown = 0;
            for (var bi = 0; bi < buckets.length && shown < todoLimit; bi++) {
              var bucket = buckets[bi];
              var ordered = bucket.items.slice().sort(function (a, b) {
                return (a.due || '').localeCompare(b.due || '');
              });
              var slice = ordered.slice(0, todoLimit - shown);
              shown += slice.length;
              nodes.push(h('div', { class: 'stack' }, [
                h('div', { class: 'group-head' }, [bucket.key, h('span', { class: 'n push' }, bucket.items.length)]),
                slice.map(todoItem)
              ]));
            }
            if (todos.length > shown) {
              nodes.push(showMoreRow(todos.length - shown, function () {
                todoLimit += TODO_PAGE;
                rerender();
              }));
            }
            return nodes;
          })()
        : h('div', { class: 'empty' }, [OC.icon('filter'), 'No todos match these filters.']))
    ]);

    var notePanel = h('section', { class: 'panel panel--instructions' }, [
      h('div', { class: 'panel-head' }, [
        h('h2', {}, [OC.icon('inbox'), 'Instructions']),
        h('span', { class: 'chip count' }, notes.length + ' visible'),
        unreadCount ? h('span', { class: 'chip overdue' }, unreadCount + ' unread') : null,
        h('div', { class: 'tools' }, [
          createGroupControl(),
          h('button', { class: 'btn small primary', type: 'button', onClick: newInstruction },
            [OC.icon('plus'), 'Post instruction'])
        ])
      ]),
      h('div', { class: 'panel-body scroll' }, notes.length
        ? (function () {
            var buckets = groupInstructions(notes);
            var nodes = [];
            var shown = 0;
            for (var bi = 0; bi < buckets.length && shown < noteLimit; bi++) {
              var bucket = buckets[bi];
              var ordered = bucket.items.slice().sort(function (a, b) {
                var ap = a.posted_at || '';
                var bp = b.posted_at || '';
                return bp.localeCompare(ap);
              });
              var slice = ordered.slice(0, noteLimit - shown);
              shown += slice.length;
              nodes.push(h('div', { class: 'stack' }, [
                h('div', { class: 'group-head' }, [bucket.key, h('span', { class: 'n push' }, bucket.items.length)]),
                slice.map(function (n) { return instructionItem(n, rerender); })
              ]));
            }
            if (notes.length > shown) {
              nodes.push(showMoreRow(notes.length - shown, function () {
                noteLimit += NOTE_PAGE;
                rerender();
              }));
            }
            return nodes;
          })()
        : h('div', { class: 'empty' }, [OC.icon('filter'), 'No instructions match these filters.']))
    ]);

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, [OC.icon('board'), 'Board']),
        h('p', {}, 'Todos on the left, instructions on the right, both filtered by the same tags. You are seeing this as ' +
          user.name + ' (' + OC.can.roleLabel(user) + '), so the lists are scoped by section 3.0.')
      ]),
      filterBar(rerender),
      savedBar(rerender),
      h('div', { class: 'boardbar' }, [
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Board view' },
          [['panels', 'Two panels'], ['timeline', 'Client timeline']].map(function (opt) {
            return h('button', {
              type: 'button', 'aria-pressed': String(mode === opt[0]),
              onClick: function () { mode = opt[0]; rerender(); }
            }, opt[1]);
          })),
        h('label', { class: 'checkline' }, [
          h('input', { type: 'checkbox', checked: showDone, onChange: function (e) { showDone = e.target.checked; rerender(); } }),
          'Show completed'
        ]),
        h('label', { class: 'checkline' }, [
          h('input', { type: 'checkbox', checked: showArchived, onChange: function (e) { showArchived = e.target.checked; rerender(); } }),
          'Show archived'
        ]),
        h('button', { class: 'btn small push', type: 'button', onClick: copyYesterday },
          [OC.icon('reset'), 'Copy yesterday'])
      ]),
      mode === 'panels' ? (function () {
        /* Both panels are already in the DOM — this tab only decides which one
           shows on a narrow screen, which the data-panel attribute does on its
           own. Rebuilding the whole board for it threw away and rebuilt every
           row to change one attribute. */
        var tabs = h('div', { class: 'panel-tabs' });
        function showPanel(name) {
          panel = name;
          var board = tabs.parentNode && tabs.parentNode.querySelector('.board');
          if (board) board.setAttribute('data-panel', name);
          var btns = tabs.querySelectorAll('button');
          for (var i = 0; i < btns.length; i++) {
            btns[i].setAttribute('aria-pressed', String(btns[i].getAttribute('data-panel-name') === name));
          }
        }
        tabs.appendChild(h('button', { type: 'button', 'data-panel-name': 'todos',
          'aria-pressed': String(panel === 'todos'),
          onClick: function () { showPanel('todos'); } }, 'Todos'));
        tabs.appendChild(h('button', { type: 'button', 'data-panel-name': 'instructions',
          'aria-pressed': String(panel === 'instructions'),
          onClick: function () { showPanel('instructions'); } }, 'Instructions'));
        return tabs;
      })() : null,
      mode === 'panels'
        ? h('div', { class: 'board', 'data-panel': panel }, [todoPanel, notePanel])
        : h('section', { class: 'panel panel--timeline' }, [
            h('div', { class: 'panel-head' }, [
              h('h2', {}, clientLabel() + ' timeline'),
              h('span', { class: 'chip count' }, (todos.length + notes.length) + ' entries'),
              h('span', { class: 'sub' }, 'todos and instructions, every department, newest first')
            ]),
            h('div', { class: 'panel-body' }, timeline(rerender))
          ])
    ]);
  }

  return {
    render: render,
    newTodo: newTodo,
    newInstruction: newInstruction,
    editTodo: editTodo,
    editInstruction: editInstruction,
    deleteInstruction: deleteInstruction,
    changeState: changeState,
    stateSelect: stateSelect,
    reassignTodo: reassignTodo,
    archiveTodo: archiveTodo,
    todoItem: todoItem,
    instructionItem: instructionItem,
    applyFilter: function (next) { filters = JSON.parse(JSON.stringify(next)); mode = 'panels'; },
    /* a getter, because applying a pinned filter rebinds the object */
    get filters() { return filters; }
  };
})();
