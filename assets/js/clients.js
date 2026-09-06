/* =========================================================================
   clients.js — client directory & dedicated workspace portal (5.2)
   Comprehensive Client Portal:
   - Full clickable client cards (no clutter buttons)
   - Dedicated workspace view with Back navigation
   - Report & Analytics with day/month/year completion graphics
   - Client Todos & Instructions
   - Rich Markdown Workspace Text Editor with instant formatting & DB persistence
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.clients = (function () {
  'use strict';

  var searchQuery = '';
  var filterStatus = 'all'; /* all | active | paused */
  var activePortalClientId = null;
  var activePortalTab = 'details'; /* report | todos | instructions | details */

  var PORTAL_TABS = ['details', 'todos', 'instructions', 'report'];

  /* Extended client info: a large, fixed set of CRM/intake fields a client
     may carry (lead-gen intake through deal & operations details). Stored
     per client as client.extended_fields[key] = { value, visible } — value
     is what's typed in; visible decides whether it shows on the Details
     tab's summary card, independent of one another (a field can be filled
     in but kept off the summary). "department" here is the contact
     person's own department at their company (e.g. "Marketing"), not this
     app's internal department scoping — keyed distinctly to avoid any
     confusion with client.department. */
  var CLIENT_EXTENDED_FIELDS = [
    { key: 'crm_id', label: 'CRM ID' },
    { key: 'unique_id', label: 'Unique ID' },
    { key: 'year', label: 'Year' },
    { key: 'quarter', label: 'Q' },
    { key: 'entry_date', label: 'Entry Date', type: 'date' },
    { key: 'sales_team', label: 'Sales Team' },
    { key: 'source', label: 'Source' },
    { key: 'channel', label: 'Channel' },
    { key: 'approach', label: 'Approach' },
    { key: 'client_name_field', label: 'Client Name' },
    { key: 'account_name', label: 'Account Name' },
    { key: 'account_id', label: 'Account ID' },
    { key: 'projects_brief', label: 'Projects Brief' },
    { key: 'onboard_date', label: 'Onboard Date', type: 'date' },
    { key: 'official_client_id', label: 'Official Client ID' },
    { key: 'short_code', label: 'Short Code' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'title', label: 'Title' },
    { key: 'seniority_level', label: 'Seniority Level' },
    { key: 'contact_department', label: 'Department' },
    { key: 'linkedin_location', label: 'LinkedIn Location' },
    { key: 'country', label: 'Country' },
    { key: 'business_email', label: 'Business Email' },
    { key: 'personal_email', label: 'Personal Email' },
    { key: 'direct_number', label: 'Direct Number' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'twitter', label: 'Twitter' },
    { key: 'offer_details', label: 'Offer Details' },
    { key: 'contract_details', label: 'Contract Details' },
    { key: 'google_drive', label: 'Google Drive' },
    { key: 'invoice_details', label: 'Invoice Details' },
    { key: 'team_sheet', label: 'Team Sheet' },
    { key: 'contact_channel_1', label: 'Contact Channel - I' },
    { key: 'contact_channel_2', label: 'Contact Channel - II' }
  ];

  /* The open workspace and its tab live in the address as #clients/<id>/<tab>,
     so a reload comes back to the workspace instead of the client list. */
  function syncPortalToUrl() {
    if (!OC.app || !OC.app.setSub) return;
    OC.app.setSub(activePortalClientId ? [activePortalClientId, activePortalTab] : []);
  }

  function readPortalFromUrl() {
    if (!OC.app || !OC.app.sub) return;
    var sub = OC.app.sub();
    activePortalClientId = sub[0] || null;
    if (sub[1] && PORTAL_TABS.indexOf(sub[1]) > -1) activePortalTab = sub[1];
  }
  var activeTimeframe = 'month'; /* day | month | year | all */
  var activeCustomDate = null; /* 'YYYY-MM-DD' picked via the date field; only meaningful when activeTimeframe === 'day' */
  var todoFilterState = 'all'; /* all | open | progress | done | blocked */
  var isDetailsEditing = false; /* view mode vs edit mode in Details tab */

  function me() {
    return OC.store.user(OC.store.session()) || (OC.store.state && OC.store.state.users && OC.store.state.users[0]) || { id: '', name: 'User', admin: false };
  }

  /* clientLabel() falls back through code → name → ID, so a client saved with
     only a Client ID is titled by that ID. A "Client ID: …" chip beside such a
     title just prints the heading a second time, which is what this guards:
     a detail chip earns its place only when it says something the title
     doesn't already say. */
  function saysSameAs(value, title) {
    return String(value || '').trim().toLowerCase() === String(title || '').trim().toLowerCase();
  }

  function getClientDisplayInfo(c) {
    if (!c) return { name: 'Unknown', subBadge: '', code: '' };
    var rawId = (c.client_id || '').trim();
    var rawName = (c.name || '').trim();
    var code = (c.client_code || '').trim();

    // Prefer Client ID over Name as requested ("name na . Client ID thakba.")
    var displayTitle = rawId || rawName || code || 'Client #' + (c.id || '').slice(-4);

    return {
      name: displayTitle,
      code: code,
      subBadge: ''
    };
  }

  function getLocalDateStr(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function openManageAssigneesModal(client, onDone) {
    var user = me();
    var canScope = !!(OC.can && OC.can.assignClientDepartment
      ? OC.can.assignClientDepartment(user) : (user && (user.admin || (OC.can && OC.can.headOfAny && OC.can.headOfAny(user)))));

    var initialDepts = Array.isArray(client.departments) && client.departments.length
      ? client.departments
      : (client.department ? [client.department] : []);

    // If client has no department explicitly saved, but current user is a Department Head, scope to Department Head's department
    if (!initialDepts.length && user && !user.admin) {
      var uDepts = (user.departments || []).map(function (m) { return typeof m === 'string' ? m : m.department; }).filter(Boolean);
      if (!uDepts.length && user.department) uDepts = [user.department];
      if (uDepts.length) {
        initialDepts = uDepts;
      }
    }

    var currentAssignees = Array.isArray(client.assignees) ? client.assignees.slice() : (Array.isArray(client.assigned_users) ? client.assigned_users.slice() : []);

    var picker = OC.ui.clientAssigneePicker(currentAssignees, initialDepts, null);
    var deptCheckboxes = canScope ? OC.ui.deptCheckboxGroup(initialDepts, function (newDepts) {
      if (picker && picker.setDepartments) picker.setDepartments(newDepts);
    }) : null;

    var currentLabel = OC.ui.clientLabel ? OC.ui.clientLabel(client) : (client.name || client.client_id);

    var modalFields = [];
    if (canScope && deptCheckboxes) {
      modalFields.push(OC.ui.field('1. Visible to department(s)', deptCheckboxes.node, {
        hint: 'Check departments allowed to see this client. Selecting department(s) filters eligible team members below.'
      }));
    }
    modalFields.push(OC.ui.field(canScope ? '2. Assigned Working Member(s)' : 'Assigned Working Member(s)', picker.node, {
      hint: 'Select the specific person(s) allowed to see and work on this client.'
    }));

    (OC.ui && OC.ui.modal ? OC.ui.modal : modal)({
      title: 'Assign Member & Scoping — ' + currentLabel,
      content: OC.ui.h('div', {}, modalFields),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Save Assignment', primary: true, onClick: function (close) {
            var selectedDepts = canScope && deptCheckboxes ? deptCheckboxes.getDepartments() : initialDepts;
            var primaryDept = selectedDepts.length ? selectedDepts[0] : '';
            var selected = picker.getAssignees();

            var nowIso = new Date().toISOString();
            OC.store.mutate({
              actor: user.id,
              action: 'client.assign',
              target: currentLabel,
              clientId: client.id,
              assignees: selected,
              departments: selectedDepts,
              department: primaryDept,
              detail: 'Updated assigned working members (' + selected.length + ' members) for ' + currentLabel
            }, function () {
              client.assignees = selected;
              client.assigned_users = selected;
              client.updated_at = nowIso;
              if (canScope) {
                client.departments = selectedDepts;
                client.department = primaryDept;
              }
              var targetClient = (OC.store.state.clients || []).find(function (c) { return c.id === client.id; });
              if (targetClient) {
                targetClient.assignees = selected;
                targetClient.assigned_users = selected;
                targetClient.updated_at = nowIso;
                if (canScope) {
                  targetClient.departments = selectedDepts;
                  targetClient.department = primaryDept;
                }
              }
            });
            OC.ui.toast('Client team & department assignment updated.');
            if (onDone) onDone();
            close();
          }
        }
      ]
    });
  }

  function editClient(client, onDone) {
    var h = OC.ui.h;
    var user = me();
    if (!user || !user.admin) {
      OC.ui.toast('Only System Admins can edit client details.');
      return;
    }
    var name = h('input', { type: 'text', value: client.name || '' });
    var clientId = h('input', { type: 'text', value: client.client_id || '' });
    var clientCode = h('input', { type: 'text', value: client.client_code || '' });
    var clientNumber = h('input', { type: 'text', value: client.client_number || client.contact || '' });
    var status = OC.ui.select([
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' }
    ], client.status || 'active');

    var currentLabel = OC.ui.clientLabel ? OC.ui.clientLabel(client) : client.name;

    var canDelete = !!(OC.can && OC.can.canDeleteClient ? OC.can.canDeleteClient(user, client) : (user && user.admin));
    var canScope = !!(OC.can && OC.can.assignClientDepartment
      ? OC.can.assignClientDepartment(user) : (user && (user.admin || (OC.can && OC.can.headOfAny && OC.can.headOfAny(user)))));
    var canAssign = !!(OC.can && OC.can.canAssignClientMembers
      ? OC.can.canAssignClientMembers(user, client) : (user && (user.admin || (OC.can && OC.can.headOfAny && OC.can.headOfAny(user)))));

    var initialDepts = Array.isArray(client.departments) && client.departments.length
      ? client.departments
      : (client.department ? [client.department] : []);
    var initialAssignees = Array.isArray(client.assignees) ? client.assignees : (Array.isArray(client.assigned_users) ? client.assigned_users : []);

    var assigneePicker = canAssign ? OC.ui.clientAssigneePicker(initialAssignees, initialDepts, null) : null;
    var deptCheckboxes = OC.ui.deptCheckboxGroup(initialDepts, function (newDepts) {
      if (assigneePicker) assigneePicker.setDepartments(newDepts);
    });

    function deptNames(ids) {
      if (!ids || !ids.length) return 'all departments';
      return ids.map(function (id) {
        var d = OC.store.department(id);
        return d ? d.name : id;
      }).join(', ');
    }

    /* The department picker is visible in the modal for scoping */
    var deptRow = h('div', { class: 'client-dept-row' }, [
      OC.ui.field('6. Visible to department(s) (Dept Head & Admin)', deptCheckboxes.node, {
        hint: 'Check departments allowed to see this client. Leave unchecked for all departments (visible to everyone).'
      })
    ]);

    var assigneeRow = canAssign ? h('div', { class: 'client-assignee-row', style: 'margin-top:10px;' }, [
      OC.ui.field('7. Assigned Working Member(s) (Dept Head & Admin)', assigneePicker.node, {
        hint: 'Select the specific person(s) allowed to see and work on this client. If left empty, only System Admin & Dept Head can access.'
      })
    ]) : null;

    var actions = [
      { label: 'Cancel', onClick: function (close) { close(); } },
      {
        label: 'Save', primary: true, onClick: function (close) {
          var cName = name.value.trim();
          var cIdVal = clientId.value.trim();
          var cCodeVal = clientCode.value.trim();
          var cNumVal = clientNumber.value.trim();

          /* the Client ID is the one field a client cannot go without */
          if (!cIdVal) return 'A client needs a Client ID.';

          if (cName) {
            var nameExists = OC.store.state.clients.some(function (c) {
              return c.id !== client.id && c.name && c.name.toLowerCase().trim() === cName.toLowerCase();
            });
            if (nameExists) return 'A client with this name already exists.';
          }

          if (cIdVal) {
            var idExists = OC.store.state.clients.some(function (c) {
              return c.id !== client.id && c.client_id && c.client_id.toLowerCase().trim() === cIdVal.toLowerCase();
            });
            if (idExists) return 'Duplicate Client ID: "' + cIdVal + '" is already used by another client.';
          }

          if (cCodeVal) {
            var codeExists = OC.store.state.clients.some(function (c) {
              return c.id !== client.id && c.client_code && c.client_code.toLowerCase().trim() === cCodeVal.toLowerCase();
            });
            if (codeExists) return 'Duplicate Client Code: "' + cCodeVal + '" is already used by another client.';
          }

          if (cNumVal) {
            var numExists = OC.store.state.clients.some(function (c) {
              var num = (c.client_number || c.contact || '').toLowerCase().trim();
              return c.id !== client.id && num && num === cNumVal.toLowerCase();
            });
            if (numExists) return 'Duplicate Client Number: "' + cNumVal + '" is already used by another client.';
          }

          var selectedDepts = canScope ? deptCheckboxes.getDepartments() : (client.departments || []);
          var selectedAssignees = (canAssign && assigneePicker) ? assigneePicker.getAssignees() : (client.assignees || []);
          var primaryDept = selectedDepts.length ? selectedDepts[0] : '';
          var deptNote = '; visible to ' + deptNames(selectedDepts) + (selectedAssignees.length ? ' (' + selectedAssignees.length + ' assigned)' : '');

          var auditLabel = cCodeVal || cName || cIdVal;
          var nowIso = new Date().toISOString();
          OC.store.mutate({
            actor: user.id, action: 'client.update', target: auditLabel,
            clientId: client.id,
            assignees: selectedAssignees,
            departments: selectedDepts,
            department: primaryDept,
            detail: 'Updated details for ' + currentLabel + deptNote
          }, function () {
            client.name = cName;
            client.client_id = cIdVal;
            client.client_code = cCodeVal;
            client.client_number = cNumVal;
            client.contact = cNumVal || cName || cIdVal;
            client.status = status.value;
            client.updated_at = nowIso;
            if (canScope) {
              client.departments = selectedDepts;
              client.department = primaryDept;
            }
            if (canAssign) {
              client.assignees = selectedAssignees;
              client.assigned_users = selectedAssignees;
            }
            var targetClient = (OC.store.state.clients || []).find(function (c) { return c.id === client.id; });
            if (targetClient) {
              targetClient.name = cName;
              targetClient.client_id = cIdVal;
              targetClient.client_code = cCodeVal;
              targetClient.client_number = cNumVal;
              targetClient.contact = cNumVal || cName || cIdVal;
              targetClient.status = status.value;
              targetClient.updated_at = nowIso;
              if (canScope) {
                targetClient.departments = selectedDepts;
                targetClient.department = primaryDept;
              }
              if (canAssign) {
                targetClient.assignees = selectedAssignees;
                targetClient.assigned_users = selectedAssignees;
              }
            }
          });
          OC.ui.toast('Client updated.');
          if (onDone) onDone();
          close();
        }
      }
    ];

    if (canDelete) {
      actions.unshift({
        label: 'Delete client',
        onClick: function (closeModal) {
          closeModal();
          setTimeout(function () {
            OC.ui.confirm('Permanently delete client "' + currentLabel + '"? Existing tasks will remain.', function () {
              OC.store.mutate({ actor: user.id, action: 'client.delete', target: currentLabel }, function () {
                OC.store.state.clients = (OC.store.state.clients || []).filter(function (c) { return c.id !== client.id; });
              });
              OC.ui.toast('Client "' + currentLabel + '" deleted.');
              activePortalClientId = null;
              syncPortalToUrl();
              // Always navigate to the list after deletion — never call onDone which may re-render the deleted client's portal
              var host = document.getElementById('page');
              if (host) render(host);
            });
          }, 50);
        }
      });
    }

    OC.ui.modal({
      title: 'Edit client: ' + currentLabel,
      content: h('div', {}, [
        OC.ui.field('1. Client ID', clientId, { required: true, hint: 'Unique client identifier or account number. This one is required.' }),
        OC.ui.field('2. Client number', clientNumber, { hint: 'The client\u2019s own number \u2014 not a phone number (optional).' }),
        OC.ui.field('3. Client code', clientCode, { hint: 'Short ticker or abbreviation code (optional).' }),
        OC.ui.field('4. Client / Company name', name, { hint: 'Official client or company name (optional).' }),
        OC.ui.field('5. Status', status),
        canScope ? deptRow : null,
        canAssign ? assigneeRow : null
      ]),
      actions: actions
    });
  }

  /* ---- Extended client info (CRM intake fields) ------------------------- */
  function editClientExtendedFields(client, onDone) {
    var h = OC.ui.h;
    var user = me();
    if (!user || !user.admin) {
      OC.ui.toast('Only System Admins can edit extended client fields.');
      return;
    }
    var existing = client.extended_fields || {};
    var currentLabel = OC.ui.clientLabel ? OC.ui.clientLabel(client) : (client.name || client.client_id);

    var rows = CLIENT_EXTENDED_FIELDS.map(function (f) {
      var saved = existing[f.key] || {};
      var checkbox = h('input', { type: 'checkbox', checked: !!saved.visible });
      var input = h('input', { type: f.type || 'text', value: saved.value || '', placeholder: f.label });
      var row = h('div', { class: 'client-field-row' }, [
        h('label', { class: 'client-field-row-check', title: 'Show on the Details summary' }, [checkbox]),
        h('span', { class: 'client-field-row-label' }, f.label),
        input
      ]);
      return { key: f.key, checkbox: checkbox, input: input, row: row };
    });

    OC.ui.modal({
      title: 'Edit extended info: ' + currentLabel,
      className: 'client-fields-modal',
      content: h('div', {}, [
        h('p', { class: 'muted', style: 'font-size:12.5px;margin:0 0 14px;' },
          'Fill in whatever applies. The checkbox decides whether a field shows on the Details summary — a field can be filled in and still kept off it.'),
        h('div', { class: 'client-field-rows' }, rows.map(function (r) { return r.row; }))
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Save', primary: true, onClick: function (close) {
            var next = {};
            rows.forEach(function (r) {
              var val = r.input.value.trim();
              var visible = r.checkbox.checked;
              if (val || visible) next[r.key] = { value: val, visible: visible };
            });
            var nowIso = new Date().toISOString();
            OC.store.mutate({
              actor: user.id, action: 'client.update', target: currentLabel,
              clientId: client.id,
              extended_fields: next,
              detail: 'Updated extended info for ' + currentLabel
            }, function () {
              client.extended_fields = next;
              client.updated_at = nowIso;
              var targetClient = (OC.store.state.clients || []).find(function (c) { return c.id === client.id; });
              if (targetClient) {
                targetClient.extended_fields = next;
                targetClient.updated_at = nowIso;
              }
            });
            OC.ui.toast('Extended info saved.');
            if (onDone) onDone();
            close();
          }
        }
      ]
    });
  }

  /* ---- Markdown Simple Formatter Helper ---- */
  /* Only these schemes may reach an href. The text has already had & < > escaped
     by the time a link is built, but that leaves "javascript:" untouched, so the
     scheme is checked explicitly and anything else renders as plain text. */
  function safeHref(url) {
    var raw = String(url || '').trim();
    if (!raw) return null;
    var lower = raw.toLowerCase();
    if (lower.indexOf('mailto:') === 0) return raw;
    if (lower.indexOf('http://') === 0 || lower.indexOf('https://') === 0) return raw;
    /* a bare host such as example.com is treated as https */
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$|\?|#)/i.test(raw)) return 'https://' + raw;
    return null;                       /* javascript:, data:, file:, anything else */
  }

  /* quotes are not touched by the & < > escaping, so an href or style value
     still has to have them removed before it goes inside an attribute */
  function attrSafe(value) {
    return String(value || '').replace(/"/g, '%22').replace(/'/g, '%27');
  }

  /* a fixed palette — a colour name never reaches CSS unless it is on this list.
     The editor's colour picker is built from this same list, so the swatches on
     offer and the names the renderer accepts can never drift apart. */
  var MD_COLOR_SWATCHES = [
    { name: 'red', label: 'Red', css: 'var(--signal)' },
    { name: 'blue', label: 'Blue', css: 'var(--blueprint)' },
    { name: 'green', label: 'Green', css: 'var(--success)' },
    { name: 'orange', label: 'Orange', css: 'var(--brand-orange)' },
    { name: 'purple', label: 'Purple', css: 'var(--purple)' },
    { name: 'yellow', label: 'Yellow', css: 'var(--brass)' },
    { name: 'grey', label: 'Grey', css: 'var(--text-secondary)' }
  ];

  var MD_COLORS = (function () {
    var map = {};
    for (var i = 0; i < MD_COLOR_SWATCHES.length; i++) {
      map[MD_COLOR_SWATCHES[i].name] = MD_COLOR_SWATCHES[i].css;
    }
    map.gray = map.grey;   /* the American spelling still renders; it just isn't offered */
    return map;
  })();

  /* inline formatting shared by every block type, so a link works in a bullet
     or a heading and not only in a plain paragraph */
  function renderInline(text) {
    return String(text)
      /* {blue}coloured text{/} */
      .replace(/\{([a-z]+)\}([\s\S]*?)\{\/\}/gi, function (whole, name, body) {
        var css = MD_COLORS[String(name).toLowerCase()];
        return css ? '<span style="color:' + css + ';font-weight:600;">' + body + '</span>' : whole;
      })
      /* [visible text](https://the-hidden-target) */
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (whole, label, url) {
        var href = safeHref(url);
        if (!href) return label;       /* refused scheme: keep the words, drop the link */
        return '<a class="md-link" href="' + attrSafe(href) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
      })
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  function renderMarkdownPreview(rawText) {
    if (!rawText) return '<p class="muted">No details or notes added yet. Use the editor to add customized notes, specifications, or contracts.</p>';

    /* Escaping used to run once, up front, over the whole text — which turned
       every "> quote" line's leading > into &gt; before the block parser
       below ever got to look at it, so "> " could never match and Quote
       silently fell through to an ordinary paragraph, forever, even after
       Save. Block markers (##, - , > , …) are ASCII punctuation the parser
       needs to see raw; only each line's actual content is escaped, right
       where it is pulled out for rendering. */
    function esc(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    var lines = String(rawText).split('\n');
    var html = [];
    var inList = false;

    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (trimmed.indexOf('### ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h3>' + renderInline(esc(trimmed.slice(4))) + '</h3>');
      } else if (trimmed.indexOf('## ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h2>' + renderInline(esc(trimmed.slice(3))) + '</h2>');
      } else if (trimmed.indexOf('# ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<h2>' + renderInline(esc(trimmed.slice(2))) + '</h2>');
      } else if (trimmed.indexOf('- [ ] ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<div style="display:flex;align-items:center;gap:6px;margin:4px 0;"><input type="checkbox" disabled /> <span>' + renderInline(esc(trimmed.slice(6))) + '</span></div>');
      } else if (trimmed.indexOf('- [x] ') === 0 || trimmed.indexOf('- [X] ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<div style="display:flex;align-items:center;gap:6px;margin:4px 0;"><input type="checkbox" checked disabled /> <span style="text-decoration:line-through;color:var(--text-secondary);">' + renderInline(esc(trimmed.slice(6))) + '</span></div>');
      } else if (trimmed.indexOf('- ') === 0 || trimmed.indexOf('* ') === 0) {
        if (!inList) { html.push('<ul>'); inList = true; }
        html.push('<li>' + renderInline(esc(trimmed.slice(2))) + '</li>');
      } else if (trimmed.indexOf('> ') === 0) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<blockquote>' + renderInline(esc(trimmed.slice(2))) + '</blockquote>');
      } else if (!trimmed) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<br/>');
      } else {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push('<p style="margin:4px 0;">' + renderInline(esc(line)) + '</p>');
      }
    });

    if (inList) html.push('</ul>');
    return html.join('');
  }

  /* Detect whether a stored string is HTML (produced by the new WYSIWYG
     editor) or plain markdown (produced by the old textarea editor).
     We look for a leading HTML tag — any string that begins with a real
     HTML open-tag is treated as HTML; everything else falls back to the
     markdown renderer so old client notes display correctly. */
  function isHtmlContent(s) {
    return /^\s*<[a-zA-Z]/.test(s);
  }

  /* Single entry-point for the view mode: routes to the right renderer
     depending on whether the stored content is HTML or old markdown. */
  function renderClientDetailsHtml(raw) {
    if (!raw || !raw.trim()) {
      return '<p class="muted">No details or notes added yet. Use the editor to add customized notes, specifications, or contracts.</p>';
    }
    return isHtmlContent(raw) ? raw : renderMarkdownPreview(raw);
  }

  /* ---- Dedicated Client Portal View -------------------------------------- */
  function renderClientPortal(host, client, onBack) {
    var h = OC.ui.h;
    var user = me();
    var clientName = client.client_id || client.name || client.client_code || (OC.ui.clientLabel ? OC.ui.clientLabel(client) : 'Client');
    var canCreate = !!(OC.can && OC.can.createClient ? OC.can.createClient(user) : (user && user.admin));
    var canEdit = !!(OC.can && OC.can.canEditClient ? OC.can.canEditClient(user, client) : (user && user.admin));

    var clientTodos = OC.store.state.todos.filter(function (t) {
      return t.client === client.id || (Array.isArray(t.clients) && t.clients.indexOf(client.id) > -1);
    });

    var clientInstructions = OC.store.state.instructions.filter(function (ins) {
      if (!ins || ins.archived) return false;
      var matches = ins.client === client.id ||
        (Array.isArray(ins.clients) && ins.clients.indexOf(client.id) > -1) ||
        (client.client_code && Array.isArray(ins.tags) && ins.tags.indexOf(client.client_code) > -1);
      return matches && (OC.can && OC.can.seeInstruction ? OC.can.seeInstruction(user, ins) : true);
    });

    var openTaskCount = clientTodos.filter(function (t) { return !t.archived && t.state !== 'done'; }).length;

    /* 1. Top Executive Hero Banner */
    var canAssign = !!(OC.can && OC.can.canAssignClientMembers ? OC.can.canAssignClientMembers(user, client) : (user && (user.admin || (OC.can && OC.can.headOfAny && OC.can.headOfAny(user)))));
    var clientAssignees = Array.isArray(client.assignees) ? client.assignees : (Array.isArray(client.assigned_users) ? client.assigned_users : []);

    var initials = (client.client_code || client.name || client.client_id || 'CL').slice(0, 3).toUpperCase();
    var heroBanner = h('div', { class: 'user-profile-banner' }, [
      h('div', { class: 'user-profile-banner-left' }, [
        h('div', { class: 'user-profile-avatar-wrap' }, [
          h('div', { class: 'user-profile-avatar-placeholder', style: 'background:linear-gradient(135deg, #0284c7 0%, #0f172a 100%);font-size:18px;letter-spacing:1px;' }, initials)
        ]),
        h('div', { class: 'user-profile-info' }, [
          h('div', { class: 'user-profile-title-row' }, [
            h('h2', { class: 'user-profile-name' }, clientName)
          ])
        ])
      ]),
      h('div', { class: 'user-profile-right', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;' }, [
        h('span', { class: 'user-profile-badge', style: 'margin:0;padding:3px 10px;font-size:11px;' }, client.status === 'active' ? 'ACTIVE CLIENT' : 'PAUSED'),
        canAssign ? h('button', {
          class: 'btn small secondary',
          type: 'button',
          style: 'font-weight:600;display:inline-flex;align-items:center;gap:6px;',
          onClick: function () {
            openManageAssigneesModal(client, function () {
              var freshClient = OC.store.client(client.id) || client;
              renderClientPortal(host, freshClient, onBack);
            });
          }
        }, [
          OC.icon('user'),
          clientAssignees.length ? ('Assign Member (' + clientAssignees.length + ')') : 'Assign Member'
        ]) : null,
        canEdit ? h('button', {
          class: 'btn small primary',
          type: 'button',
          id: 'client-portal-edit-client-btn',
          style: 'font-weight:700;display:inline-flex;align-items:center;gap:6px;',
          onClick: function () {
            editClient(client, function () {
              var freshClient = OC.store.client(client.id) || client;
              renderClientPortal(host, freshClient, onBack);
            });
          }
        }, [OC.icon('edit'), 'Edit Client']) : null
      ].filter(Boolean))
    ]);

    /* 1b. Extended Info Card (Photo 1 directly below Photo 2 heroBanner) */
    var extFields = client.extended_fields || {};
    var visibleExtFields = CLIENT_EXTENDED_FIELDS.filter(function (f) {
      var saved = extFields[f.key];
      return saved && saved.visible && saved.value;
    });
    var filledExtFieldCount = CLIENT_EXTENDED_FIELDS.filter(function (f) {
      return extFields[f.key] && extFields[f.key].value;
    }).length;

    var extInfoCard = h('div', { class: 'portal-credential-card', style: 'padding:16px 20px;margin-bottom:18px;' }, [
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;' }, [
        h('div', {}, [
          h('h3', { style: 'margin:0;font-size:15px;display:flex;align-items:center;gap:8px;' }, [
            OC.icon('file'),
            'Extended Info',
            filledExtFieldCount ? h('span', { class: 'chip custom', style: 'font-size:10.5px;' }, filledExtFieldCount + ' filled') : null
          ].filter(Boolean)),
          h('p', { class: 'muted', style: 'font-size:12px;margin:2px 0 0;' },
            'CRM/intake fields for ' + clientName + '. Only the fields checked visible show here.')
        ]),
        canEdit ? h('button', {
          class: 'btn small secondary',
          type: 'button',
          id: 'client-portal-edit-extended-btn',
          style: 'font-weight:600;display:inline-flex;align-items:center;gap:6px;',
          onClick: function () {
            editClientExtendedFields(client, function () {
              var freshClient = OC.store.client(client.id) || client;
              renderClientPortal(host, freshClient, onBack);
            });
          }
        }, [OC.icon('edit'), 'Edit']) : null
      ]),
      visibleExtFields.length
        ? h('div', { class: 'client-extended-info-grid' }, visibleExtFields.map(function (f) {
            return h('div', { class: 'client-extended-info-item' }, [
              h('span', { class: 'k' }, f.label),
              h('span', { class: 'v' }, extFields[f.key].value)
            ]);
          }))
        : h('p', { class: 'muted', style: 'font-size:13px;margin:0;' },
            filledExtFieldCount
              ? 'Some fields are filled in but none are marked visible. Click Edit to show them here.'
              : 'No extended info added yet.')
    ]);

    /* 2. Sidebar Navigation Items */
    var sidebarItems = [
      { id: 'details', label: 'Details & Workspace', icon: 'edit' },
      { id: 'todos', label: 'Todos & Tasks', icon: 'check', badge: openTaskCount > 0 ? openTaskCount : null },
      { id: 'instructions', label: 'Instructions', icon: 'file', badge: clientInstructions.length > 0 ? clientInstructions.length : null },
      { id: 'report', label: 'Report & Analytics', icon: 'stats' }
    ];

    var sidebar = h('aside', { class: 'portal-sidebar' }, [
      h('div', { class: 'portal-sidebar-brand' }, [
        h('div', { class: 'portal-sidebar-tag' }, 'CLIENT PORTAL'),
        h('div', { class: 'portal-sidebar-title' }, 'Workspace Menu')
      ]),
      h('nav', { class: 'portal-sidebar-nav' }, sidebarItems.map(function (item) {
        var isActive = activePortalTab === item.id;
        return h('button', {
          type: 'button',
          class: 'portal-nav-btn' + (isActive ? ' active' : ''),
          onClick: function () {
            activePortalTab = item.id;
            syncPortalToUrl();
            renderClientPortal(host, client, onBack);
          }
        }, [
          h('span', { class: 'portal-nav-icon' }, OC.icon(item.icon)),
          h('span', { class: 'portal-nav-label' }, item.label),
          item.badge ? h('span', { class: 'chip count', style: 'margin-left:auto;font-size:10.5px;padding:2px 7px;' }, String(item.badge)) : null
        ]);
      })),
      h('div', { class: 'portal-sidebar-footer' }, [
        h('button', {
          class: 'btn small secondary',
          type: 'button',
          style: 'width:100%;display:flex;align-items:center;justify-content:center;gap:6px;font-weight:600;',
          onClick: function () {
            isDetailsEditing = false; // reset so next client doesn't open in edit mode
            if (onBack) onBack();
          }
        }, ['← Back to Clients'])
      ])
    ]);

    /* 3. Main Area Container */
    var mainArea = h('main', { class: 'portal-main-area' });

    /* TAB 1: REPORT & ANALYTICS */
    if (activePortalTab === 'report') {
      var now = new Date();
      /* 'T00:00:00' (no timezone designator) makes the engine parse the
         picked date as local midnight instead of UTC midnight, so the day
         selected in the field is the day actually shown. */
      var isSameDay = function (dateStr, refDate) {
        if (!dateStr) return false;
        var d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
        return !isNaN(d.getTime()) &&
               d.getFullYear() === refDate.getFullYear() &&
               d.getMonth() === refDate.getMonth() &&
               d.getDate() === refDate.getDate();
      };
      var isSameMonth = function (dateStr, refDate) {
        if (!dateStr) return false;
        var d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
        return !isNaN(d.getTime()) &&
               d.getFullYear() === refDate.getFullYear() &&
               d.getMonth() === refDate.getMonth();
      };
      var isSameYear = function (dateStr, refDate) {
        if (!dateStr) return false;
        var d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
        return !isNaN(d.getTime()) &&
               d.getFullYear() === refDate.getFullYear();
      };

      var filteredTodos = clientTodos.filter(function (t) {
        if (activeTimeframe === 'all') return true;
        if (activeTimeframe === 'day') {
          return isSameDay(t.due, dayRef) ||
                 isSameDay(t.completed_at, dayRef) ||
                 isSameDay(t.updated_at, dayRef) ||
                 isSameDay(t.created_at, dayRef);
        } else if (activeTimeframe === 'month') {
          return isSameMonth(t.due, now) ||
                 isSameMonth(t.completed_at, now) ||
                 isSameMonth(t.updated_at, now) ||
                 isSameMonth(t.created_at, now);
        } else if (activeTimeframe === 'year') {
          return isSameYear(t.due, now) ||
                 isSameYear(t.completed_at, now) ||
                 isSameYear(t.updated_at, now) ||
                 isSameYear(t.created_at, now);
        }
        return true;
      });

      var totalT = filteredTodos.length;
      var doneT = filteredTodos.filter(function (t) { return t.state === 'done'; }).length;
      var progT = filteredTodos.filter(function (t) { return t.state === 'progress'; }).length;
      var openT = filteredTodos.filter(function (t) { return t.state === 'open'; }).length;
      var blockedT = filteredTodos.filter(function (t) { return t.state === 'blocked'; }).length;
      var rate = totalT > 0 ? Math.round((doneT / totalT) * 100) : 0;

      var donePct = totalT > 0 ? Math.min(100, (doneT / totalT) * 100) : 0;
      var progPct = totalT > 0 ? Math.min(100, (progT / totalT) * 100) : 0;
      var openPct = totalT > 0 ? Math.min(100, (openT / totalT) * 100) : 0;
      var blockPct = totalT > 0 ? Math.min(100, (blockedT / totalT) * 100) : 0;

      /* When a specific day is picked via the date field, show that date in
         the KPI/graph headers instead of the generic "DAY" label so it's
         clear which day's work is being reported. */
      var periodLabel = (activeTimeframe === 'day' && activeCustomDate)
        ? dayRef.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : activeTimeframe.toUpperCase();

      var reportContent = h('div', { class: 'portal-view-content' }, [
        h('div', { class: 'portal-header-box' }, [
          h('div', {}, [
            h('h2', { class: 'portal-view-title' }, [OC.icon('stats'), 'Task Completion Analytics & Reports']),
            h('p', { class: 'muted', style: 'font-size:13px;margin:2px 0 0;' },
              'Review completion velocity, active task breakdowns, and SLA performance metrics for ' + clientName + '.')
          ]),
          h('div', { class: 'row', style: 'align-items:center;gap:10px;flex-wrap:wrap;min-width:0;' }, [
            h('div', { class: 'segmented', role: 'group', 'aria-label': 'Select timeframe' }, [
              ['day', 'Today', 'calendar'],
              ['month', 'This Month', 'calendar'],
              ['year', 'This Year', 'stats'],
              ['all', 'All Time', 'globe']
            ].map(function (opt) {
              return h('button', {
                type: 'button',
                'aria-pressed': String(activeTimeframe === opt[0] && !(opt[0] === 'day' && activeCustomDate)),
                onClick: function () {
                  activeCustomDate = null;
                  activeTimeframe = opt[0];
                  renderClientPortal(host, client, onBack);
                }
              }, [OC.icon(opt[2]), opt[1]]);
            })),
            h('label', { class: 'field', style: 'margin:0;display:flex;align-items:center;gap:8px;' }, [
              h('span', { class: 'label', style: 'margin:0;' }, 'Pick a day'),
              h('input', {
                type: 'date',
                value: activeCustomDate || '',
                max: getLocalDateStr(),
                onChange: function (e) {
                  activeCustomDate = e.target.value || null;
                  activeTimeframe = 'day';
                  renderClientPortal(host, client, onBack);
                }
              })
            ])
          ])
        ]),

        /* 4 KPI Cards */
        h('div', { class: 'stats' }, [
          h('div', { class: 'stat' }, [
            h('span', { class: 'k' }, 'Total Tasks (' + periodLabel + ')'),
            h('div', { class: 'v tabular' }, String(totalT))
          ]),
          h('div', { class: 'stat' }, [
            h('span', { class: 'k' }, 'Completion Rate'),
            h('div', { class: 'v tabular' }, rate + '%')
          ]),
          h('div', { class: 'stat' }, [
            h('span', { class: 'k' }, 'In Progress'),
            h('div', { class: 'v tabular' }, String(progT))
          ]),
          h('div', { class: 'stat' }, [
            h('span', { class: 'k' }, 'Pending / Blocked'),
            h('div', { class: 'v tabular' }, String(openT + blockedT))
          ])
        ]),

        /* Visual Velocity Graphic Card */
        h('div', { class: 'portal-credential-card', style: 'padding:20px;' }, [
          h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;' }, [
            h('div', { style: 'font-weight:700;font-size:14.5px;color:var(--ink);' }, 'Task Progress Breakdown (' + periodLabel + ')'),
            h('span', { class: 'chip count' }, totalT + ' Total Tracked')
          ]),
          h('div', { class: 'client-velocity-bar-wrap', style: 'margin:16px 0 14px;' }, [
            h('div', { class: 'client-velocity-segment', style: 'width:' + donePct + '%;background:var(--state-done);', title: 'Done: ' + doneT + ' (' + Math.round(donePct) + '%)' }),
            h('div', { class: 'client-velocity-segment', style: 'width:' + progPct + '%;background:var(--state-progress);', title: 'In Progress: ' + progT + ' (' + Math.round(progPct) + '%)' }),
            h('div', { class: 'client-velocity-segment', style: 'width:' + openPct + '%;background:var(--state-open);', title: 'Open: ' + openT + ' (' + Math.round(openPct) + '%)' }),
            h('div', { class: 'client-velocity-segment', style: 'width:' + blockPct + '%;background:var(--state-blocked);', title: 'Blocked: ' + blockedT + ' (' + Math.round(blockPct) + '%)' })
          ]),
          h('div', { class: 'client-graphic-legend', style: 'font-size:12.5px;gap:20px;' }, [
            h('span', {}, [h('span', { class: 'client-legend-dot', style: 'background:var(--state-done);' }), 'Completed: ' + doneT + ' (' + Math.round(donePct) + '%)']),
            h('span', {}, [h('span', { class: 'client-legend-dot', style: 'background:var(--state-progress);' }), 'In Progress: ' + progT + ' (' + Math.round(progPct) + '%)']),
            h('span', {}, [h('span', { class: 'client-legend-dot', style: 'background:var(--state-open);' }), 'Open: ' + openT + ' (' + Math.round(openPct) + '%)']),
            h('span', {}, [h('span', { class: 'client-legend-dot', style: 'background:var(--state-blocked);' }), 'Blocked: ' + blockedT + ' (' + Math.round(blockPct) + '%)'])
          ])
        ])
      ]);
      mainArea.appendChild(reportContent);
    }

    /* TAB 2: TODOS */
    if (activePortalTab === 'todos') {
      var filteredList = clientTodos.filter(function (t) {
        if (todoFilterState === 'open') return t.state === 'open';
        if (todoFilterState === 'progress') return t.state === 'progress';
        if (todoFilterState === 'done') return t.state === 'done';
        if (todoFilterState === 'blocked') return t.state === 'blocked';
        return true;
      });

      var todosContent = h('div', { class: 'portal-view-content' }, [
        h('div', { class: 'portal-header-box' }, [
          h('div', {}, [
            h('h2', { class: 'portal-view-title' }, ['Client Tasks & Workload (' + clientTodos.length + ')']),
            h('p', { class: 'muted', style: 'font-size:13px;margin:2px 0 0;' },
              'Manage and track all deliverables and assigned tasks for ' + clientName + '.')
          ]),
          h('button', {
            class: 'btn primary small',
            type: 'button',
            style: 'font-weight:700;',
            onClick: function () {
              if (OC.board && OC.board.newTodo) {
                /* same fixed-client, fixed-department treatment as
                   "Post Client Instruction" — a task for a scoped client has
                   no business landing on a department it does not belong to */
                var taskDepts = Array.isArray(client.departments) && client.departments.length
                  ? client.departments
                  : (client.department ? [client.department] : []);
                OC.board.newTodo({
                  client: client.id,
                  lockClient: true,
                  lockDepartment: taskDepts.length > 0,
                  departments: taskDepts
                }, function () {
                  renderClientPortal(host, client, onBack);
                });
              } else if (OC.ui && OC.ui.newTodoModal) {
                OC.ui.newTodoModal(function () { renderClientPortal(host, client, onBack); }, { defaultClient: client.id });
              }
            }
          }, ['+ Add Task for ' + clientName])
        ]),

        h('div', { class: 'row', style: 'margin-bottom:14px;justify-content:space-between;align-items:center;' }, [
          h('div', { class: 'segmented', role: 'group', 'aria-label': 'Filter tasks' }, [
            ['all', 'All (' + clientTodos.length + ')'],
            ['open', 'Open (' + clientTodos.filter(function (t) { return t.state === 'open'; }).length + ')'],
            ['progress', 'In Progress (' + clientTodos.filter(function (t) { return t.state === 'progress'; }).length + ')'],
            ['done', 'Done (' + clientTodos.filter(function (t) { return t.state === 'done'; }).length + ')'],
            ['blocked', 'Blocked (' + clientTodos.filter(function (t) { return t.state === 'blocked'; }).length + ')']
          ].map(function (opt) {
            return h('button', {
              type: 'button',
              'aria-pressed': String(todoFilterState === opt[0]),
              onClick: function () {
                todoFilterState = opt[0];
                renderClientPortal(host, client, onBack);
              }
            }, opt[1]);
          }))
        ]),

        filteredList.length ? h('div', { style: 'display:flex;flex-direction:column;gap:10px;' }, filteredList.map(function (t) {
          var assignees = (Array.isArray(t.assignees) && t.assignees.length) ? t.assignees : (t.assigned_to ? [t.assigned_to] : []);
          return h('div', { class: 'client-todo-item-row' }, [
            h('div', { class: 'client-todo-left' }, [
              h('input', {
                type: 'checkbox',
                checked: t.state === 'done',
                style: 'width:18px;height:18px;cursor:pointer;flex-shrink:0;',
                onChange: function () {
                  var nextState = (t.state === 'done') ? 'open' : 'done';
                  OC.store.mutate({ actor: user.id, action: 'todo.state', target: t.title, detail: nextState, todoId: t.id }, function () {
                    t.state = nextState;
                    t.updated_at = new Date().toISOString();
                    if (nextState === 'done') t.completed_at = new Date().toISOString();
                  });
                  renderClientPortal(host, client, onBack);
                }
              }),
              h('div', {
                class: 'client-todo-info',
                style: 'cursor:pointer;',
                title: 'Click to view / edit task',
                onClick: function () {
                  if (OC.board && OC.board.editTodo) {
                    OC.board.editTodo(t, function () { renderClientPortal(host, client, onBack); });
                  }
                }
              }, [
                h('span', { class: 'client-todo-title' + (t.state === 'done' ? ' is-done' : ''), style: t.state === 'done' ? 'text-decoration:line-through;color:var(--text-secondary);' : '' }, t.title),
                h('div', { class: 'client-todo-meta' }, [
                  h('span', { class: 'chip ' + (t.state === 'done' ? 'state-done' : 'state-open') }, t.state || 'open'),
                  t.priority ? h('span', { class: 'chip ' + (t.priority === 'urgent' ? 'signal' : 'custom') }, t.priority) : null,
                  t.due ? h('span', { class: 'muted', style: 'font-size:11.5px;' }, 'Due: ' + OC.ui.fmtDate(t.due)) : null
                ].filter(Boolean))
              ])
            ]),
            h('div', { class: 'row', style: 'gap:6px;align-items:center;flex-shrink:0;' }, assignees.map(function (uId) {
              return OC.ui.person(uId);
            }))
          ]);
        })) : h('div', { class: 'portal-credential-card', style: 'padding:36px;text-align:center;' }, [
          h('p', { class: 'muted', style: 'margin:0;font-size:14px;' }, 'No tasks found matching current filter for this client.')
        ])
      ]);
      mainArea.appendChild(todosContent);
    }

    /* TAB 3: INSTRUCTIONS */
    if (activePortalTab === 'instructions') {
      var insContent = h('div', { class: 'portal-view-content' }, [
        h('div', { class: 'portal-header-box' }, [
          h('div', {}, [
            h('h2', { class: 'portal-view-title' }, [OC.icon('file'), 'Client Instructions (' + clientInstructions.length + ')']),
            h('p', { class: 'muted', style: 'font-size:13px;margin:2px 0 0;' },
              'Specific workflow directives, briefs, and team guidelines for ' + clientName + '.')
          ]),
          h('button', {
            class: 'btn primary small',
            type: 'button',
            style: 'font-weight:700;',
            onClick: function () {
              if (OC.board && OC.board.newInstruction) {
                /* client, departments and tags all live in the preset object —
                   newInstruction(preset, onCreated), preset first. Passing the
                   callback first (as this used to) makes the function's own
                   callback-only shorthand mistake this preset for the
                   callback and silently drop it, so the instruction posted
                   with no client at all. */
                var clientDepts = Array.isArray(client.departments) && client.departments.length
                  ? client.departments
                  : (client.department ? [client.department] : []);
                OC.board.newInstruction({
                  client: client.id,
                  client_only: true,
                  tags: client.client_code ? [client.client_code] : [],
                  lockClient: true,
                  /* only lock the department when this client actually
                     belongs to one — a client open to every department has
                     none to lock to */
                  lockDepartment: clientDepts.length > 0,
                  departments: clientDepts
                }, function () {
                  renderClientPortal(host, client, onBack);
                });
              }
            }
          }, ['+ Post Client Instruction'])
        ]),

        clientInstructions.length ? h('div', { style: 'display:flex;flex-direction:column;gap:12px;' }, clientInstructions.map(function (ins) {
          var canEdit = OC.can && OC.can.canEditInstruction ? OC.can.canEditInstruction(user, ins) : (user && (user.admin || ins.author === user.id));
          var canDelete = OC.can && OC.can.canDeleteInstruction ? OC.can.canDeleteInstruction(user, ins) : (user && (user.admin || ins.author === user.id));
          var itemActions = [];

          if (canEdit && OC.board && OC.board.editInstruction) {
            itemActions.push(h('button', {
              class: 'btn small',
              type: 'button',
              style: 'font-size:11.5px;padding:3px 8px;',
              onClick: function () {
                OC.board.editInstruction(ins, function () {
                  renderClientPortal(host, client, onBack);
                });
              }
            }, [OC.icon('edit'), 'Edit']));
          }
          if (canDelete && OC.board && OC.board.deleteInstruction) {
            itemActions.push(h('button', {
              class: 'btn small danger',
              type: 'button',
              style: 'font-size:11.5px;padding:3px 8px;',
              onClick: function () {
                OC.board.deleteInstruction(ins, function () {
                  renderClientPortal(host, client, onBack);
                });
              }
            }, [OC.icon('trash'), 'Delete']));
          }

          return h('div', { class: 'client-instruction-item-card' }, [
            h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;' }, [
              h('div', { class: 'row', style: 'gap:8px;align-items:center;' }, [
                OC.ui.person(ins.author, 'strong'),
                ins.department ? OC.ui.deptChip(ins.department) : null,
                ins.target_type ? h('span', { class: 'chip custom' }, 'Target: ' + ins.target_type) : null,
                (Array.isArray(ins.target_users) && ins.target_users.length)
                  ? h('span', { class: 'chip custom' }, 'For: ' + ins.target_users.map(OC.ui.personName).join(', '))
                  : null
              ].filter(Boolean)),
              h('div', { class: 'row', style: 'gap:8px;align-items:center;' }, [
                h('span', { class: 'muted', style: 'font-size:11.5px;' }, OC.ui.fmtWhen(ins.posted_at || ins.created_at)),
                itemActions.length ? h('div', { class: 'row', style: 'gap:4px;' }, itemActions) : null
              ].filter(Boolean))
            ]),
            h('p', { style: 'font-size:14px;color:var(--text);margin:6px 0 10px;line-height:1.6;white-space:pre-wrap;' }, ins.body),
            OC.ui && OC.ui.reactionsBar ? OC.ui.reactionsBar('instruction', ins) : null,
            (OC.can && OC.can.commentOnInstruction && OC.can.commentOnInstruction(user, ins) && OC.ui && OC.ui.commentThread)
              ? OC.ui.commentThread('instruction', ins)
              : null
          ]);
        })) : h('div', { class: 'portal-credential-card', style: 'padding:36px;text-align:center;' }, [
          h('p', { class: 'muted', style: 'margin:0;font-size:14px;' }, 'No specific instructions logged for this client yet.')
        ])
      ]);
      mainArea.appendChild(insContent);
    }
    /* TAB 4: DETAILS & WORKSPACE NOTES */
    if (activePortalTab === 'details') {
      var detailsContent;
      var rawNotes = (client.details || client.notes || '').trim();
      var hasDetails = Boolean(rawNotes);
      if (!isDetailsEditing) {
        /* VIEW MODE: Direct clean text rendering with preserved lines & continuous Edit button */
        detailsContent = h('div', { class: 'portal-view-content' }, [
          h('div', { class: 'portal-header-box' }, [
            h('div', {}, [
              h('h2', { class: 'portal-view-title' }, [OC.icon('edit'), 'Details & Documentation']),
              h('p', { class: 'muted', style: 'font-size:13px;margin:2px 0 0;' },
                'Custom specifications, contracts, and notes for ' + clientName + '.')
            ]),
            h('button', {
              class: 'btn primary small',
              type: 'button',
              style: 'font-weight:700;display:inline-flex;align-items:center;gap:6px;',
              onClick: function () {
                isDetailsEditing = true;
                renderClientPortal(host, client, onBack);
              }
            }, [OC.icon('edit'), 'Edit Details'])
          ]),
          h('div', { class: 'portal-credential-card', style: 'padding:22px 26px;' }, [
            hasDetails
              ? h('div', {
                  class: 'client-details-text-view',
                  html: renderClientDetailsHtml(client.details || client.notes)
                })
              : h('div', { style: 'text-align:center;padding:36px 20px;' }, [
                  h('p', { class: 'muted', style: 'font-size:14px;margin-bottom:14px;' }, 'No customized details or documentation added for this client yet.'),
                  h('button', {
                    class: 'btn primary small',
                    type: 'button',
                    onClick: function () {
                      isDetailsEditing = true;
                      renderClientPortal(host, client, onBack);
                    }
                  }, ['+ Write Details'])
                ])
          ])
        ]);
      } else {
        /* ── EDIT MODE: WYSIWYG contenteditable editor ──────────────────────
           The editor IS the rendered view — no textarea, no raw markdown, no
           separate preview box.  Select text, click Bold → it goes bold.
           Data is stored as HTML; old markdown strings are converted on first
           load so existing client notes migrate transparently.             */

        var editorDiv = document.createElement('div');
        editorDiv.className = 'client-wysiwyg-editor';
        editorDiv.contentEditable = 'true';
        editorDiv.setAttribute('aria-label', 'Client Notes');
        editorDiv.setAttribute('spellcheck', 'true');
        editorDiv.setAttribute('data-placeholder', 'Write any client notes, requirements, specifications, contracts, or details here…');

        /* Populate: if the stored value is old markdown convert it to HTML
           so the editor opens in formatted form even for legacy clients. */
        var storedRaw = (client.details || client.notes || '').trim();
        editorDiv.innerHTML = storedRaw
          ? (isHtmlContent(storedRaw) ? storedRaw : renderMarkdownPreview(storedRaw))
          : '';

        /* ── toolbar helpers ──────────────────────────────────────────────── */

        /* Keep focus+selection inside the editor when a button is pressed.
           Without this, mousedown on a button blurs the editor and the
           selection is gone before execCommand ever fires. */
        function noBlur(e) { e.preventDefault(); }

        function cmd(command, value) {
          editorDiv.focus();
          document.execCommand(command, false, value || null);
        }

        /* Wrap the current selection in a <span style="color:…">.  If the
           selection is already wrapped in a colour span the colour is swapped
           instead of nested. */
        function applyColor(cssValue) {
          editorDiv.focus();
          document.execCommand('styleWithCSS', false, true);
          document.execCommand('foreColor', false, cssValue);
          document.execCommand('styleWithCSS', false, false);
        }

        /* Insert a checklist item at the cursor / replacing the selection. */
        function insertChecklist() {
          editorDiv.focus();
          var sel = window.getSelection();
          if (!sel || !sel.rangeCount) return;
          var range = sel.getRangeAt(0);
          range.deleteContents();
          var label = document.createElement('label');
          label.style.cssText = 'display:flex;align-items:center;gap:6px;margin:4px 0;cursor:pointer;';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          var span = document.createElement('span');
          span.textContent = 'Task item';
          label.appendChild(cb); label.appendChild(span);
          range.insertNode(label);
          /* move caret inside the span */
          range.setStart(span, 0); range.collapse(true);
          sel.removeAllRanges(); sel.addRange(range);
        }

        /* Insert a link around the selection (or a placeholder). A native
           window.prompt() would do this in one line, but it's a blocking OS
           dialog that's inconsistent with the rest of the app's own modal
           system — and prompt()/confirm() are disabled outright in some
           mobile and installed-PWA contexts, which would make this button
           silently do nothing there. Uses the same modal the rest of the
           app builds links, departments, etc. through. */
        function insertLink() {
          editorDiv.focus();
          var sel = window.getSelection();
          var label = (sel && sel.toString().trim()) || 'link text';
          /* the selection is lost once focus moves to the modal's input, so
             the Range is saved now and re-applied right before execCommand */
          var savedRange = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;

          var urlInput = OC.ui.h('input', { type: 'text', value: 'https://' });
          OC.ui.modal({
            title: 'Insert link',
            content: OC.ui.field('URL', urlInput, { required: true }),
            actions: [
              { label: 'Cancel', onClick: function (close) { close(); } },
              {
                label: 'Insert', primary: true, onClick: function (close) {
                  var url = urlInput.value.trim();
                  if (!url) return 'Enter a URL.';
                  /* a modal <dialog> makes the rest of the document inert
                     while showModal() is active, so editorDiv.focus() (and
                     therefore execCommand) is a no-op until the dialog is
                     actually closed — close it first, then write back. */
                  close();
                  editorDiv.focus();
                  if (savedRange) {
                    var s = window.getSelection();
                    s.removeAllRanges();
                    s.addRange(savedRange);
                  }
                  document.execCommand('insertHTML', false,
                    '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="md-link">' + label + '</a>');
                }
              }
            ]
          });
        }

        /* ── colour picker ────────────────────────────────────────────────── */
        var colorSwatch = h('span', { class: 'md-color-swatch' });
        var colorMenu   = h('div',  { class: 'md-color-menu', hidden: true });
        var colorBtn;

        function closeColorMenu() {
          colorMenu.hidden = true;
          if (colorBtn) colorBtn.setAttribute('aria-expanded', 'false');
          document.removeEventListener('mousedown', onDocDownForColor, true);
          document.removeEventListener('keydown',   onEscForColor,     true);
        }
        function onDocDownForColor(e) {
          if (!colorMenu.contains(e.target) && !(colorBtn && colorBtn.contains(e.target)))
            closeColorMenu();
        }
        function onEscForColor(e) {
          if (e.key === 'Escape') { closeColorMenu(); editorDiv.focus(); }
        }
        function toggleColorMenu() {
          if (colorMenu.hidden) {
            colorMenu.hidden = false;
            if (colorBtn) colorBtn.setAttribute('aria-expanded', 'true');
            document.addEventListener('mousedown', onDocDownForColor, true);
            document.addEventListener('keydown',   onEscForColor,     true);
          } else {
            closeColorMenu();
          }
        }

        MD_COLOR_SWATCHES.forEach(function (c) {
          colorMenu.appendChild(h('button', {
            class: 'md-color-option',
            type: 'button',
            title: 'Colour text ' + c.label,
            onMousedown: noBlur,
            onClick: function () {
              colorSwatch.style.background = c.css;
              closeColorMenu();
              /* execCommand foreColor needs a concrete hex/rgb value;
                 resolve the CSS variable to its computed colour first. */
              var tmp = document.createElement('span');
              tmp.style.color = c.css;
              document.body.appendChild(tmp);
              var computed = window.getComputedStyle(tmp).color;
              document.body.removeChild(tmp);
              applyColor(computed);
            }
          }, [
            h('span', { class: 'md-color-swatch', style: 'background:' + c.css + ';' }),
            c.label
          ]));
        });

        colorBtn = h('button', {
          class: 'client-editor-tool-btn', type: 'button',
          title: 'Colour selected text',
          'aria-haspopup': 'true', 'aria-expanded': 'false',
          onMousedown: noBlur,
          onClick: function () { toggleColorMenu(); }
        }, [colorSwatch, 'Colour', h('span', { class: 'md-color-caret', 'aria-hidden': 'true' }, '\u25be')]);

        colorMenu.addEventListener('mousedown', noBlur);

        /* ── toolbar ──────────────────────────────────────────────────────── */
        var toolbar = h('div', { class: 'client-editor-toolbar' }, [
          h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Bold',      onMousedown: noBlur, onClick: function () { cmd('bold'); } }, 'Bold'),
          h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Italic',    onMousedown: noBlur, onClick: function () { cmd('italic'); } }, 'Italic'),
          h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Heading 2', onMousedown: noBlur, onClick: function () { cmd('formatBlock', 'h2'); } }, 'H2'),
          h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Heading 3', onMousedown: noBlur, onClick: function () { cmd('formatBlock', 'h3'); } }, 'H3'),
          h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Bullet List', onMousedown: noBlur, onClick: function () { cmd('insertUnorderedList'); } }, 'List'),
          h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Checklist', onMousedown: noBlur, onClick: function () { insertChecklist(); } }, 'Checklist'),
          h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Code',      onMousedown: noBlur, onClick: function () {
            var sel = window.getSelection();
            var txt = sel ? sel.toString() : '';
            document.execCommand('insertHTML', false, '<code>' + (txt || 'code') + '</code>');
          } }, 'Code'),
          h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Quote',     onMousedown: noBlur, onClick: function () { cmd('formatBlock', 'blockquote'); } }, 'Quote'),
          h('button', {
            class: 'client-editor-tool-btn', type: 'button', title: 'Insert link',
            onMousedown: noBlur,
            onClick: function () { insertLink(); }
          }, [OC.icon('link'), 'Link']),
          h('div', { class: 'md-color-picker' }, [colorBtn, colorMenu]),
          h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Clear all text',
            onMousedown: noBlur,
            onClick: function () {
              OC.ui.confirm('Clear all content?', function () { editorDiv.innerHTML = ''; editorDiv.focus(); });
            }
          }, [OC.icon('trash'), 'Clear']),
        ]);

        detailsContent = h('div', { class: 'portal-view-content' }, [
          h('div', { class: 'portal-header-box' }, [
            h('div', {}, [
              h('h2', { class: 'portal-view-title' }, [OC.icon('edit'), 'Edit Client Details']),
              h('p', { class: 'muted', style: 'font-size:13px;margin:2px 0 0;' },
                'Write notes for ' + clientName + ' and click “Save Details” when finished.')
            ]),
            h('div', { class: 'row', style: 'gap:8px;' }, [
              h('button', {
                class: 'btn small secondary',
                type: 'button',
                onClick: function () {
                  isDetailsEditing = false;
                  renderClientPortal(host, client, onBack);
                }
              }, 'Cancel'),
              h('button', {
                class: 'btn primary small',
                type: 'button',
                style: 'font-weight:700;',
                onClick: function () {
                  var val = editorDiv.innerHTML;
                  OC.store.mutate({
                    actor: user.id, action: 'client.details.update', target: clientName,
                    detail: 'Updated documentation notes for ' + clientName
                  }, function () {
                    client.details = val;
                    client.notes   = val;
                    var target = (OC.store.state.clients || []).find(function (c) { return c.id === client.id; });
                    if (target) { target.details = val; target.notes = val; }
                  });
                  OC.ui.toast('Client details saved successfully.');
                  isDetailsEditing = false;
                  renderClientPortal(host, client, onBack);
                }
              }, [OC.icon('save'), 'Save Details'])
            ])
          ]),
          h('div', { class: 'portal-credential-card', style: 'padding:16px 20px;display:flex;flex-direction:column;gap:12px;' }, [
            toolbar,
            editorDiv
          ])
        ]);
      }

      mainArea.appendChild(detailsContent);
    }

    /* 4. Assemble Whole Page Layout */
    var layoutContainer = h('div', { class: 'portal-layout-container' }, [
      sidebar,
      mainArea
    ]);

    var rootWrap = h('div', { class: 'client-portal-container' }, [
      heroBanner,
      extInfoCard,
      layoutContainer
    ]);

    OC.ui.clear(host);
    host.appendChild(rootWrap);
  }

  function render(host) {
    var h = OC.ui.h;
    var user = me();
    /* the address is the source of truth for which workspace is open, so a
       reload, a back button, or a pasted link all land in the same place */
    readPortalFromUrl();
    var clients = (OC.can && OC.can.visibleClients)
      ? OC.can.visibleClients(user)
      : (OC.store.state.clients || []);
    var canCreate = !!(OC.can && OC.can.createClient ? OC.can.createClient(user) : (user && user.admin));

    var activeClient = activePortalClientId ? OC.store.client(activePortalClientId) : null;
    /* a client scoped away from this person must not stay open behind them, so
       a workspace they can no longer see drops back to the list */
    if (activeClient && OC.can && OC.can.seeClient && !OC.can.seeClient(user, activeClient)) {
      activeClient = null;
      activePortalClientId = null;
      syncPortalToUrl();
    }
    if (activeClient) {
      renderClientPortal(host, activeClient, function () {
        activePortalClientId = null;
        syncPortalToUrl();
        render(host);
      });
      return;
    } else {
      activePortalClientId = null;
    }

    var totalClients = clients.length;
    var activeClients = clients.filter(function (c) { return c.status === 'active'; }).length;
    var pausedClients = clients.filter(function (c) { return c.status === 'paused'; }).length;

    var filtered = clients.filter(function (c) {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (!searchQuery) return true;
      var q = searchQuery.toLowerCase();
      var full = [c.name, c.client_id, c.client_code, c.client_number, c.contact].filter(Boolean).join(' ').toLowerCase();
      return full.indexOf(q) > -1;
    });

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, 'Clients Portal'),
        h('p', {}, 'Manage official client accounts, Client IDs, ticker codes, contact numbers, and assigned task workloads across all departments.')
      ]),

      /* Top summary stats */
      h('div', { class: 'stats' }, [
        h('div', { class: 'stat' }, [
          h('span', { class: 'k' }, 'Total Clients'),
          h('div', { class: 'v tabular' }, String(totalClients))
        ]),
        h('div', { class: 'stat' }, [
          h('span', { class: 'k' }, 'Active Clients'),
          h('div', { class: 'v tabular' }, String(activeClients))
        ]),
        h('div', { class: 'stat' }, [
          h('span', { class: 'k' }, 'Paused Clients'),
          h('div', { class: 'v tabular' }, String(pausedClients))
        ]),
        h('div', { class: 'stat' }, [
          h('span', { class: 'k' }, 'Active Client Tasks'),
          h('div', { class: 'v tabular' }, String(
            OC.store.state.todos.filter(function (t) {
              return !t.archived && t.state !== 'done' && (t.client || (Array.isArray(t.clients) && t.clients.length));
            }).length
          ))
        ])
      ]),

      /* Action row & Search filters */
      h('div', { class: 'row', style: 'margin-bottom:16px;gap:10px;flex-wrap:wrap;align-items:center;' }, [
        canCreate
          ? h('button', {
              class: 'btn primary', type: 'button',
              onClick: function () {
                OC.ui.newClientModal(function () { render(host); });
              }
            }, [OC.icon('plus'), 'New client'])
          : null,
        h('div', { style: 'flex:1;min-width:220px;' }, [
          h('input', {
            type: 'search',
            placeholder: 'Search by client name, ID, code, number...',
            value: searchQuery,
            style: 'width:100%;',
            onInput: function (e) {
              searchQuery = e.target.value;
              /* carry the caret across the rebuild, see the note in activities.js */
              OC.ui.keepingPlace(host, function () { render(host); });
            }
          })
        ]),
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Filter by status' }, [
          ['all', 'All (' + totalClients + ')'],
          ['active', 'Active (' + activeClients + ')'],
          ['paused', 'Paused (' + pausedClients + ')']
        ].map(function (opt) {
          return h('button', {
            type: 'button',
            'aria-pressed': String(filterStatus === opt[0]),
            onClick: function () {
              filterStatus = opt[0];
              render(host);
            }
          }, opt[1]);
        }))
      ]),

      /* Clients Grid (Strictly 2 per line, Clean & Uncluttered) */
      filtered.length
        ? h('div', { class: 'clients-grid-two' }, filtered.map(function (c) {
            var info = getClientDisplayInfo(c);

            // Avatar badge text
            var avatarText = (info.code || info.name || 'CL').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
            if (info.code && info.code.length <= 4) avatarText = info.code.toUpperCase();

            return h('div', {
              class: 'card client-item-card',
              title: 'Click to open ' + info.name + ' workspace portal',
              onClick: function () {
                activePortalClientId = c.id;
                isDetailsEditing = false;
                syncPortalToUrl();
                render(host);
              }
            }, [
              /* Header */
              h('div', { class: 'client-card-head' }, [
                h('div', { class: 'client-avatar-badge' }, avatarText),
                h('div', { class: 'client-head-info' }, [
                  h('h3', { class: 'client-card-title' }, info.name)
                ]),
                h('span', { class: 'client-status-indicator ' + (c.status === 'active' ? 'is-active' : 'is-paused') }, [
                  h('span', { class: 'client-status-dot' }),
                  c.status === 'active' ? 'Active' : 'Paused'
                ])
              ]),

              /* Footer CTA */
              h('div', { class: 'client-card-footer' }, [
                h('span', { class: 'client-card-cta' }, [
                  'Open Client Portal',
                  h('span', { style: 'font-size:14px;' }, '→')
                ])
              ])
            ]);
          }))
        : h('div', { class: 'card', style: 'margin:12px 0 24px;text-align:center;padding:32px;' }, [
            h('p', { class: 'muted', style: 'margin-bottom:14px;font-size:14px;' },
              searchQuery || filterStatus !== 'all'
                ? 'No clients found matching current search/filter.'
                : 'No clients registered yet. Create your first client to start organizing work.'
            ),
            canCreate
              ? h('button', {
                  class: 'btn primary', type: 'button',
                  onClick: function () {
                    OC.ui.newClientModal(function () { render(host); });
                  }
                }, [OC.icon('plus'), 'Add new client'])
              : null
          ])
    ]);
  }

  function openClientPortal(clientId) {
    activePortalClientId = clientId;
    syncPortalToUrl();
    if (OC.app && OC.app.go) {
      OC.app.go('clients');
    }
    var host = document.getElementById('page');
    if (host) render(host);
  }

  return {
    render: render,
    editClient: editClient,
    openClientPortal: openClientPortal,
    /* the same sanitising markdown renderer the client notes editor writes
       with, so other surfaces can render the identical syntax the same way */
    renderMarkdown: renderMarkdownPreview
  };
})();
