/* =========================================================================
   profile_portal.js — Employee Profile, Attendance & Leave Portal
   Provides a comprehensive personal HR & operations service portal:
   - Full 4-section employee credentials & profile cards
   - Real-time attendance punch-in/out & monthly log tables
   - Dynamic leave balance tracking & formal application submissions
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.profilePortal = (function () {
  'use strict';

  function h() { return OC.ui.h.apply(null, arguments); }
  function me() {
    return OC.store.user(OC.store.session()) || (OC.store.state && OC.store.state.users && OC.store.state.users[0]) || { id: '', name: 'User', admin: false };
  }

  var targetUserId = null;
  function activeUser() { return (targetUserId ? OC.store.user(targetUserId) : null) || me(); }

  function getLocalDateStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function getSavedTab() {
    try {
      if (typeof window !== 'undefined') {
        var hash = (window.location && window.location.hash) || '';
        if (hash.indexOf('attendance') !== -1) return 'attendance';
        if (hash.indexOf('leave') !== -1) return 'leave';
        if (hash.indexOf('work') !== -1) return 'work';
        var stored = sessionStorage.getItem('oc_portal_tab') || localStorage.getItem('oc_portal_tab');
        if (stored === 'attendance' || stored === 'leave' || stored === 'profile' || stored === 'work') return stored;
      }
    } catch (_) {}
    return 'profile';
  }

  function setSavedTab(tab) {
    activeTab = tab;
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('oc_portal_tab', tab);
      if (typeof localStorage !== 'undefined') localStorage.setItem('oc_portal_tab', tab);
    } catch (_) {}
  }

  var activeTab = getSavedTab(); /* 'profile' | 'attendance' | 'leave' | 'work' */
  var selectedMonth = getLocalDateStr().slice(0, 7);
  var workSearchQuery = '';
  var workStatusFilter = 'done'; /* 'done' | 'all' | 'open' */

  /* ---- Defaults generator for user profile sections ---------------------- */
  function getUserProfile(user) {
    if (!user) return {};
    var empId = user.employee_id || 'N/A';
    var org = user.org || 'N/A';
    var joined = user.joined_date || 'N/A';

    var off = user.office_details || {
      date_of_joining: joined,
      probation_end_date: 'N/A',
      scheduled_in: user.scheduled_in || '10:00 AM',
      scheduled_out: user.scheduled_out || '06:30 PM',
      office_phone: 'N/A',
      lastpass_email: 'N/A',
      workstation_pw: 'N/A',
      salary_venture: org
    };

    var per = user.personal_details || {
      dob: 'N/A',
      blood_group: 'N/A',
      personal_phone: 'N/A',
      personal_email: 'N/A',
      nid: 'N/A',
      marital_status: 'N/A'
    };

    var emg = user.emergency_contacts || {
      primary_name: 'N/A',
      primary_phone: 'N/A',
      fathers_name: 'N/A',
      mothers_name: 'N/A'
    };

    var bnk = user.bank_details || {
      bank_name: 'N/A',
      account_name: 'N/A',
      account_number: 'N/A',
      highest_degree: 'N/A'
    };

    return { empId: empId, org: org, joined: joined, office: off, personal: per, emergency: emg, bank: bnk };
  }

  /* ---- Edit Section Modal ------------------------------------------------ */
  function editSectionModal(sectionKey, title, fields, onSave) {
    var user = activeUser();
    if (!user) return;
    var prof = getUserProfile(user);
    var targetObj = (sectionKey === 'office') ? prof.office
      : (sectionKey === 'personal') ? prof.personal
      : (sectionKey === 'emergency') ? prof.emergency
      : prof.bank;

    var inputs = {};
    var formElements = fields.map(function (f) {
      if (f.element) {
        inputs[f.key] = f.element;
        return OC.ui.field(f.label, f.element, { hint: f.hint, required: f.required });
      }
      var val = targetObj[f.key] || '';
      var input = h('input', { type: f.type || 'text', value: val, placeholder: f.placeholder || '' });
      inputs[f.key] = input;
      return OC.ui.field(f.label, input, { hint: f.hint, required: f.required });
    });

    OC.ui.modal({
      title: 'Edit ' + title,
      content: h('div', { class: 'form-body', style: 'gap:12px;display:flex;flex-direction:column;' }, formElements),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Save Changes', primary: true, onClick: function (close) {
            var updated = {};
            fields.forEach(function (f) {
              var el = inputs[f.key];
              var val = el ? (el.value !== undefined ? el.value.trim() : '') : '';
              updated[f.key] = val || 'N/A';
            });

            OC.store.mutate({
              actor: me().id,
              action: 'user.update_profile_section',
              target: user.name,
              detail: 'Updated ' + title
            }, function () {
              var targetUser = OC.store.user(user.id);
              if (sectionKey === 'office') {
                if (targetUser) {
                  targetUser.office_details = updated;
                  if (updated.scheduled_in) targetUser.scheduled_in = updated.scheduled_in;
                  if (updated.scheduled_out) targetUser.scheduled_out = updated.scheduled_out;
                  if (updated.department !== undefined) {
                    if (updated.department && updated.department !== 'N/A') {
                      targetUser.departments = [{ department: updated.department, level: updated.level || 'member' }];
                    } else if (me().admin) {
                      targetUser.departments = [];
                    }
                  }
                }
                user.office_details = updated;
                if (updated.scheduled_in) user.scheduled_in = updated.scheduled_in;
                if (updated.scheduled_out) user.scheduled_out = updated.scheduled_out;
                if (targetUser) user.departments = targetUser.departments;
              } else if (sectionKey === 'personal') {
                if (targetUser) targetUser.personal_details = updated;
                user.personal_details = updated;
              } else if (sectionKey === 'emergency') {
                if (targetUser) targetUser.emergency_contacts = updated;
                user.emergency_contacts = updated;
              } else if (sectionKey === 'bank') {
                if (targetUser) targetUser.bank_details = updated;
                user.bank_details = updated;
              }
            });

            OC.ui.toast(title + ' updated successfully.');
            if (typeof onSave === 'function') onSave();
            close();
          }
        }
      ]
    });
  }

  /* ---- 1. Employee Profile Tab View -------------------------------------- */
  function renderProfileTab(user, rerender) {
    var prof = getUserProfile(user);
    var deptNames = (user.departments && user.departments.length)
      ? user.departments.map(function (m) { return (OC.store.department(m.department) || {}).name; }).join(', ')
      : (user.admin ? 'Operations & System Administration' : 'General');

    var banner = h('div', { class: 'user-profile-banner', style: 'margin-bottom:24px;' }, [
      h('div', { class: 'user-profile-banner-left' }, [
        h('div', { class: 'user-profile-avatar-wrap' }, [
          user.avatar
            ? h('img', { src: user.avatar, alt: user.name })
            : h('div', { class: 'user-profile-avatar-placeholder' }, OC.ui.initials(user.name))
        ]),
        h('div', { class: 'user-profile-info' }, [
          h('div', { class: 'user-profile-title-row' }, [
            h('span', { class: 'user-profile-name' }, user.name),
            /* the badge and join line use the raw user fields rather than
               prof.empId/prof.joined — those default to the string 'N/A' for
               display inside the Office Details card, and reusing that
               default here would read as 'Joined N/A (N/A)' instead of
               simply omitting a line nobody has filled in yet */
            user.employee_id ? h('span', { class: 'user-profile-badge' }, user.employee_id) : null
          ].filter(Boolean)),
          h('div', { class: 'user-profile-role-line' }, (user.title || 'Intern') + ' • ' + deptNames),
          user.joined_date
            ? h('div', { class: 'user-profile-meta-line' }, 'Joined ' + user.joined_date + (user.org ? ' (' + user.org + ')' : ''))
            : null
        ])
      ]),
      h('div', { class: 'user-profile-right' }, [
        h('div', { class: 'user-profile-status-badge' }, [
          h('div', { class: 'user-profile-status-label' }, 'OFFICIAL EMAIL'),
          h('div', { class: 'user-profile-status-val' }, 'Verified Portal Active')
        ]),
        h('button', {
          class: 'btn small primary',
          type: 'button',
          onClick: function () {
            if (OC.app && OC.app.openProfileModal) {
              OC.app.openProfileModal(user, rerender);
            }
          }
        }, [OC.icon('edit'), 'Edit Card'])
      ])
    ]);

    function infoRow(label, val) {
      return h('div', { class: 'portal-info-item' }, [
        h('span', { class: 'portal-info-label' }, label),
        h('span', { class: 'portal-info-val' }, val || 'N/A')
      ]);
    }

    function cardWrapper(iconKey, title, sectionKey, fields, contentNodes) {
      return h('div', { class: 'portal-credential-card' }, [
        h('div', { class: 'portal-card-header' }, [
          h('div', { class: 'portal-card-title' }, [
            h('span', { class: 'portal-card-icon' }, OC.icon(iconKey)),
            h('span', { class: 'portal-card-heading-text' }, title)
          ]),
          h('button', {
            class: 'portal-card-edit-btn',
            type: 'button',
            title: 'Edit ' + title,
            onClick: function () {
              editSectionModal(sectionKey, title, fields, rerender);
            }
          }, [OC.icon('edit'), 'Edit'])
        ]),
        h('div', { class: 'portal-card-grid' }, contentNodes)
      ]);
    }

    /* 4 Card sections matching Photo 3 */
    var loggedInUser = me();
    var isSysAdmin = Boolean(loggedInUser && loggedInUser.admin);

    var currentDept = (user.departments && user.departments[0]) ? user.departments[0].department : '';
    var currentLevel = (user.departments && user.departments[0]) ? user.departments[0].level : '';

    var deptOptions = [{ value: '', label: 'None (Independent)' }].concat(
      (OC.store.state.departments || []).map(function (d) { return { value: d.id, label: d.name }; })
    );

    var deptSelect = OC.ui.select(deptOptions, currentDept);
    var levelSelect = OC.ui.select([], '');

    function refreshLevels() {
      var d = OC.store.department(deptSelect.value);
      OC.ui.clear(levelSelect);
      if (!d) {
        levelSelect.appendChild(h('option', { value: '' }, 'N/A'));
        return;
      }
      d.levels.forEach(function (lv) {
        var opt = h('option', { value: lv }, lv);
        if (lv === currentLevel) opt.selected = true;
        levelSelect.appendChild(opt);
      });
    }
    deptSelect.addEventListener('change', refreshLevels);
    refreshLevels();

    var officeEditFields = [
      { key: 'office_phone', label: 'Office Phone', placeholder: 'e.g. 017xxxxxxxx' },
      { key: 'lastpass_email', label: 'Lastpass / Work Email', placeholder: 'work@example.com' },
      { key: 'workstation_pw', label: 'PC Password / Account', placeholder: 'Workstation credentials' }
    ];

    if (isSysAdmin) {
      officeEditFields.unshift(
        { key: 'department', label: 'Department (System Admin Only)', element: deptSelect, hint: 'Assign departmental unit' },
        { key: 'level', label: 'Department Level (System Admin Only)', element: levelSelect, hint: 'Assign departmental tier / role' },
        { key: 'scheduled_in', label: 'Scheduled In-Time (System Admin Only)', placeholder: 'e.g. 10:00 AM', hint: 'Employee standard arrival check-in time' },
        { key: 'scheduled_out', label: 'Scheduled Out-Time (System Admin Only)', placeholder: 'e.g. 06:30 PM', hint: 'Employee standard departure time' },
        { key: 'date_of_joining', label: 'Date of Joining (System Admin Only)', placeholder: 'e.g. 23-Jul-2026' },
        { key: 'probation_end_date', label: 'Probation End Date (System Admin Only)', placeholder: 'e.g. 31-Aug-2026' },
        { key: 'salary_venture', label: 'Salary Venture / Org (System Admin Only)', placeholder: 'e.g. MUNSHE IT' }
      );
    }

    var deptRowVal = (user.departments && user.departments.length)
      ? user.departments.map(function (m) {
          return (OC.store.department(m.department) || {}).name + ' · ' + m.level;
        }).join(', ')
      : (user.admin ? 'Leadership Tier · System Admin' : 'None (Independent)');

    var card1 = cardWrapper('file', 'OFFICE & IT CREDENTIALS', 'office', officeEditFields, [
      infoRow('Department & Level:', deptRowVal),
      infoRow('Scheduled In-Time:', prof.office.scheduled_in || '10:00 AM'),
      infoRow('Scheduled Out-Time:', prof.office.scheduled_out || '06:30 PM'),
      infoRow('Date of Joining:', prof.office.date_of_joining),
      infoRow('Probation End Date:', prof.office.probation_end_date),
      infoRow('Office Phone:', prof.office.office_phone),
      infoRow('Lastpass Email:', prof.office.lastpass_email),
      infoRow('PC Password:', prof.office.workstation_pw),
      infoRow('Salary Venture:', prof.office.salary_venture)
    ]);

    var card2 = cardWrapper('user', 'PERSONAL DETAILS', 'personal', [
      { key: 'dob', label: 'Date of Birth', placeholder: 'DD-Mon-YYYY' },
      { key: 'blood_group', label: 'Blood Group', placeholder: 'e.g. O+, A+' },
      { key: 'personal_phone', label: 'Personal Phone', placeholder: '01xxxxxxxxx' },
      { key: 'personal_email', label: 'Personal Email', placeholder: 'user@example.com' },
      { key: 'nid', label: 'NID Number', placeholder: 'National ID number' },
      { key: 'marital_status', label: 'Marital Status', placeholder: 'Single / Married' }
    ], [
      infoRow('Date of Birth:', prof.personal.dob),
      infoRow('Blood Group:', prof.personal.blood_group),
      infoRow('Personal Phone:', prof.personal.personal_phone),
      infoRow('Personal Email:', prof.personal.personal_email),
      infoRow('NID Number:', prof.personal.nid),
      infoRow('Marital Status:', prof.personal.marital_status)
    ]);

    var card3 = cardWrapper('bell', 'EMERGENCY CONTACTS', 'emergency', [
      { key: 'primary_name', label: 'Primary Contact & Relation', placeholder: 'e.g. Name (Relation)' },
      { key: 'primary_phone', label: 'Primary Phone', placeholder: '01xxxxxxxxx' },
      { key: 'fathers_name', label: "Father's Name", placeholder: "Father's Name" },
      { key: 'mothers_name', label: "Mother's Name", placeholder: "Mother's Name" }
    ], [
      h('div', { class: 'portal-emergency-highlight' }, [
        h('div', { class: 'portal-emergency-tag' }, 'PRIMARY EMERGENCY CONTACT'),
        h('div', { class: 'portal-emergency-name' }, prof.emergency.primary_name && prof.emergency.primary_name !== 'N/A' ? prof.emergency.primary_name : 'Not configured yet (Click Edit to configure)'),
        h('div', { class: 'portal-emergency-phone' }, prof.emergency.primary_phone && prof.emergency.primary_phone !== 'N/A' ? prof.emergency.primary_phone : 'Phone: N/A')
      ]),
      infoRow("Father's Name:", prof.emergency.fathers_name),
      infoRow("Mother's Name:", prof.emergency.mothers_name)
    ]);

    var card4 = cardWrapper('credit-card', 'BANK & COMPENSATION DETAILS', 'bank', [
      { key: 'bank_name', label: 'Bank / MFS Name', placeholder: 'e.g. NRBC Bank / bKash / Nagad' },
      { key: 'account_name', label: 'Account Name', placeholder: 'Account Holder Name' },
      { key: 'account_number', label: 'Account / Wallet Number', placeholder: 'Account / Wallet number' },
      { key: 'highest_degree', label: 'Highest Degree', placeholder: 'e.g. BSc / HSC' }
    ], [
      infoRow('Bank Name:', prof.bank.bank_name),
      infoRow('Account Name:', prof.bank.account_name),
      infoRow('Bank Account Number:', prof.bank.account_number),
      infoRow('Highest Degree:', prof.bank.highest_degree)
    ]);

    // Department Clients / Assigned Clients for Department Heads, Admins or assigned team members
    var myDeptIds = (user.departments || []).filter(function (m) {
      return m.level === 'head' || (OC.can && OC.can.isHead(user, m.department));
    }).map(function (m) { return m.department; });
    if (user.department && (OC.can && OC.can.isHead(user, user.department))) {
      myDeptIds.push(user.department);
    }
    if (user.admin) {
      (OC.store.state.departments || []).forEach(function (d) { myDeptIds.push(d.id); });
    }

    var relatedClients = (OC.store.state.clients || []).filter(function (c) {
      var cDepts = Array.isArray(c.departments) ? c.departments : (c.department ? [c.department] : []);
      var inMyDept = cDepts.some(function (dId) { return myDeptIds.indexOf(dId) !== -1; });
      var isAssigned = (Array.isArray(c.assignees) && c.assignees.indexOf(user.id) !== -1) ||
                       (Array.isArray(c.assigned_users) && c.assigned_users.indexOf(user.id) !== -1);
      return inMyDept || isAssigned;
    });

    var isHeadUser = isSysAdmin || (OC.can && OC.can.headOfAny && OC.can.headOfAny(user));
    var clientCardTitle = isHeadUser ? 'DEPARTMENT CLIENTS & ACCOUNTS' : 'ASSIGNED CLIENTS';
    var clientsSection = h('div', { class: 'portal-credential-card', style: 'margin-top:20px;grid-column:1/-1;' }, [
      h('div', { class: 'portal-card-header', style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;' }, [
        h('div', { class: 'portal-card-title', style: 'display:flex;align-items:center;gap:8px;' }, [
          h('span', { class: 'portal-card-icon' }, OC.icon('briefcase') || OC.icon('users')),
          h('span', { class: 'portal-card-heading-text' }, clientCardTitle),
          h('span', { class: 'chip count', style: 'margin-left:6px;font-size:11px;' }, relatedClients.length + ' Clients')
        ]),
        h('button', {
          class: 'btn small primary',
          type: 'button',
          style: 'font-size:11.5px;padding:3px 10px;',
          onClick: function () {
            if (OC.app && OC.app.go) OC.app.go('clients');
          }
        }, [OC.icon('right') || '→', ' Open Client Portal'])
      ]),
      relatedClients.length ? h('div', { class: 'tablewrap', style: 'margin-top:12px;overflow-x:auto;' }, [
        h('table', { style: 'width:100%;font-size:12.5px;' }, [
          h('thead', {}, h('tr', {}, [
            h('th', { style: 'width:160px;' }, 'CLIENT ID / CODE'),
            h('th', {}, 'CLIENT / COMPANY NAME'),
            h('th', { style: 'width:140px;' }, 'DEPARTMENT'),
            h('th', { style: 'width:160px;' }, 'ASSIGNED TEAM'),
            h('th', { style: 'width:90px;' }, 'STATUS'),
            h('th', { style: 'width:100px;text-align:right;' }, 'ACTION')
          ])),
          h('tbody', {}, relatedClients.map(function (c) {
            var cDepts = Array.isArray(c.departments) ? c.departments : (c.department ? [c.department] : []);
            var deptLabels = cDepts.map(function (dId) {
              var dObj = OC.store.department(dId);
              return dObj ? dObj.name : dId;
            }).join(', ') || 'Unassigned';

            var assigneesList = Array.isArray(c.assignees) ? c.assignees : (Array.isArray(c.assigned_users) ? c.assigned_users : []);
            var assigneeNodes = assigneesList.length ? assigneesList.map(function (uId) {
              var uObj = OC.store.user(uId);
              return h('span', { class: 'chip user-chip', style: 'margin-right:4px;font-size:11px;' }, uObj ? uObj.name : uId);
            }) : h('span', { class: 'muted', style: 'font-size:11.5px;' }, 'All Dept Members');

            var displayCode = c.client_code || c.client_number || c.client_id || c.id;
            var displayName = c.name || c.client_id || 'Client';

            return h('tr', { style: 'border-bottom:1px solid var(--rule, rgba(255,255,255,0.06));' }, [
              h('td', { class: 'mono', style: 'font-weight:700;color:var(--cyan, #38bdf8);' }, displayCode),
              h('td', { style: 'font-weight:600;color:var(--ink);' }, displayName),
              h('td', {}, h('span', { class: 'chip custom', style: 'font-size:11px;' }, deptLabels)),
              h('td', {}, assigneeNodes),
              h('td', {}, h('span', { class: 'chip ' + (c.status === 'active' ? 'success' : 'muted'), style: 'font-size:11px;' }, c.status || 'active')),
              h('td', { style: 'text-align:right;' }, h('button', {
                class: 'btn small',
                type: 'button',
                style: 'font-size:11px;padding:2px 8px;',
                onClick: function () {
                  if (OC.clients && OC.clients.select) OC.clients.select(c.id);
                  if (OC.app && OC.app.go) OC.app.go('clients');
                }
              }, 'View'))
            ]);
          }))
        ])
      ]) : h('div', { style: 'padding:24px 16px;text-align:center;color:var(--text-secondary);font-size:13px;' }, [
        h('p', { class: 'muted', style: 'margin:0;' }, 'No clients currently assigned to this department.')
      ])
    ]);

    return h('div', { class: 'portal-view-content' }, [
      banner,
      h('div', { class: 'portal-cards-2x2' }, [
        card1, card2, card3, card4
      ]),
      clientsSection
    ]);
  }

  function formatMonthName(ym) {
    try {
      var parts = ym.split('-');
      var y = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) - 1;
      var d = new Date(y, m, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch (e) {
      return ym;
    }
  }

  function shiftMonth(ym, delta) {
    var parts = ym.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) + delta;
    if (m < 1) { y -= 1; m = 12; }
    else if (m > 12) { y += 1; m = 1; }
    return y + '-' + (m < 10 ? '0' + m : m);
  }

  /* ---- 2. My Attendance Tab View (Photo 4) -------------------------------- */
  function renderAttendanceTab(user, rerender) {
    var allAtt = OC.store.state.attendance || [];
    var myLogs = allAtt.filter(function (a) { return a.user_id === user.id; });
    var todayStr = getLocalDateStr();
    var todayLog = myLogs.find(function (a) { return a.date === todayStr; });

    var loggedInUser = me();
    var isSysAdmin = Boolean(loggedInUser && loggedInUser.admin);
    var schedIn = (user.office_details && user.office_details.scheduled_in) || user.scheduled_in || '10:00 AM';
    var schedOut = (user.office_details && user.office_details.scheduled_out) || user.scheduled_out || '06:30 PM';

    var currentMonthStr = todayStr.slice(0, 7);
    if (!selectedMonth) selectedMonth = currentMonthStr;
    var monthTitle = formatMonthName(selectedMonth);

    // Calculate stats for the currently selected month
    var currentMonthLogs = myLogs.filter(function (a) { return a.date && a.date.indexOf(selectedMonth) === 0; });
    var daysLogged = currentMonthLogs.length;
    var lateCount = currentMonthLogs.filter(function (a) { return a.status === 'Late'; }).length;
    var fyLates = myLogs.filter(function (a) { return a.status === 'Late'; }).length;

    function openAdminScheduleModal() {
      var inInput = h('input', { type: 'text', value: schedIn, placeholder: 'e.g. 10:00 AM', style: 'font-weight:700;' });
      var outInput = h('input', { type: 'text', value: schedOut, placeholder: 'e.g. 06:30 PM', style: 'font-weight:700;' });

      OC.ui.modal({
        title: 'Set Scheduled In/Out Times (System Admin Only)',
        content: h('div', { class: 'form-body', style: 'display:flex;flex-direction:column;gap:12px;' }, [
          h('div', { class: 'callout info', style: 'font-size:12.5px;padding:10px 14px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.25);border-radius:6px;' },
            'System Admin Policy: Configure expected work hours and late thresholds for ' + user.name + '.'
          ),
          OC.ui.field('Scheduled In-Time *', inInput, { hint: 'Standard expected arrival time (e.g. 10:00 AM)' }),
          OC.ui.field('Scheduled Out-Time *', outInput, { hint: 'Standard expected departure time (e.g. 06:30 PM)' })
        ]),
        actions: [
          { label: 'Cancel', onClick: function (close) { close(); } },
          {
            label: 'Save Schedule Settings',
            primary: true,
            onClick: function (close) {
              var newIn = inInput.value.trim() || '10:00 AM';
              var newOut = outInput.value.trim() || '06:30 PM';

              OC.store.mutate({
                actor: loggedInUser.id,
                action: 'user.update_schedule',
                target: user.name,
                detail: 'Set scheduled hours: ' + newIn + ' - ' + newOut
              }, function () {
                var targetUser = OC.store.user(user.id);
                if (targetUser) {
                  targetUser.scheduled_in = newIn;
                  targetUser.scheduled_out = newOut;
                  if (!targetUser.office_details) targetUser.office_details = {};
                  targetUser.office_details.scheduled_in = newIn;
                  targetUser.office_details.scheduled_out = newOut;
                }
                user.scheduled_in = newIn;
                user.scheduled_out = newOut;
                if (!user.office_details) user.office_details = {};
                user.office_details.scheduled_in = newIn;
                user.office_details.scheduled_out = newOut;
              });

              OC.ui.toast('Scheduled In/Out times updated successfully.');
              rerender();
              close();
            }
          }
        ]
      });
    }

    function handlePunch() {
      var latestAtt = OC.store.state.attendance || [];
      var currentLog = latestAtt.find(function (a) { return a.user_id === user.id && a.date === todayStr; });
      if (currentLog && currentLog.punch_in && currentLog.punch_out) {
        OC.ui.toast('Your attendance for today is already completed and locked.', true);
        return;
      }

      var nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      selectedMonth = currentMonthStr; // Auto switch view to current active month

      OC.store.mutate({
        actor: (loggedInUser ? loggedInUser.id : user.id),
        action: 'attendance.punch',
        target: user.name,
        detail: 'Punched at ' + nowTime
      }, function () {
        var existing = (OC.store.state.attendance || []).find(function (a) { return a.user_id === user.id && a.date === todayStr; });
        if (!existing) {
          var isLate = new Date().getHours() >= 10 && new Date().getMinutes() > 15;
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
      rerender();
    }

    var isComplete = Boolean(todayLog && todayLog.punch_in && todayLog.punch_out);
    var punchBtnLabel = isComplete
      ? 'Completed (' + todayLog.punch_in + ' - ' + todayLog.punch_out + ')'
      : (!todayLog ? 'Quick Punch In' : 'Quick Punch Out (' + todayLog.punch_in + ')');

    var monthNavControls = h('div', { class: 'row', style: 'gap:8px;align-items:center;flex-wrap:wrap;' }, [
      h('button', {
        class: 'btn small',
        type: 'button',
        title: 'Previous Month',
        style: 'font-weight:600;padding:4px 10px;display:inline-flex;align-items:center;gap:4px;',
        onClick: function () {
          selectedMonth = shiftMonth(selectedMonth, -1);
          rerender();
        }
      }, [OC.icon('left'), 'Prev']),
      h('input', {
        type: 'month',
        value: selectedMonth,
        style: 'padding:4px 8px;font-size:12.5px;font-weight:700;border-radius:6px;background:var(--card-bg-alt, rgba(15,23,42,0.6));color:var(--ink, #fff);border:1px solid var(--border, rgba(56,189,248,0.25));',
        onChange: function (e) {
          if (e.target && e.target.value) {
            selectedMonth = e.target.value;
            rerender();
          }
        }
      }),
      h('button', {
        class: 'btn small',
        type: 'button',
        title: 'Next Month',
        style: 'font-weight:600;padding:4px 10px;display:inline-flex;align-items:center;gap:4px;',
        onClick: function () {
          selectedMonth = shiftMonth(selectedMonth, 1);
          rerender();
        }
      }, ['Next', OC.icon('right')]),
      (selectedMonth !== currentMonthStr)
        ? h('button', {
            class: 'btn small',
            type: 'button',
            style: 'font-size:11px;padding:3px 9px;background:rgba(56,189,248,0.15);color:var(--cyan,#38bdf8);border:1px solid rgba(56,189,248,0.3);font-weight:600;',
            onClick: function () {
              selectedMonth = currentMonthStr;
              rerender();
            }
          }, ['Today / This Month'])
        : null
    ]);

    return h('div', { class: 'portal-view-content' }, [
      h('div', { class: 'portal-header-box' }, [
        h('div', {}, [
          h('h2', { class: 'portal-view-title' }, [OC.icon('clock'), 'My Attendance Record']),
          h('p', { class: 'muted', style: 'font-size:13px;margin:2px 0 0;' },
            'Punch machine & checkin logs for ' + user.name + (user.employee_id ? ' (' + user.employee_id + ')' : '') + '. Standard Scheduled In-Time: ' + schedIn + '.'
          )
        ]),
        h('div', { class: 'row', style: 'gap:10px;align-items:center;flex-wrap:wrap;' }, [
          isSysAdmin ? h('button', {
            class: 'btn small secondary',
            type: 'button',
            style: 'font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;',
            title: 'System Admin: Set standard scheduled in/out work hours',
            onClick: openAdminScheduleModal
          }, [OC.icon('settings'), 'Set In/Out Time (Admin)']) : null,
          h('button', {
            class: 'btn primary',
            type: 'button',
            disabled: isComplete,
            style: 'font-weight:700;padding:10px 22px;' + (isComplete ? 'opacity:0.6;cursor:not-allowed;' : ''),
            onClick: handlePunch
          }, [punchBtnLabel])
        ].filter(Boolean))
      ]),

      /* 3 Metric Stat Cards matching Photo 4 */
      h('div', { class: 'portal-stats-row' }, [
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Days Logged (' + monthTitle + ')'),
          h('div', { class: 'portal-stat-value' }, daysLogged + ' Days'),
          h('div', { class: 'portal-stat-sub' }, 'In ' + selectedMonth)
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Late Count (' + monthTitle + ')'),
          h('div', { class: 'portal-stat-value' + (lateCount > 0 ? ' alert' : '') }, lateCount + ' Days'),
          h('div', { class: 'portal-stat-sub' }, 'Limit before deduction: 3 Days')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Fiscal Year Total Lates'),
          h('div', { class: 'portal-stat-value' }, fyLates + ' Days'),
          h('div', { class: 'portal-stat-sub' }, 'FY 2026-2027')
        ])
      ]),

      /* Table: Daily Attendance Logs with Month Navigator */
      h('div', { class: 'portal-table-container' }, [
        h('div', { class: 'portal-table-head', style: 'flex-wrap:wrap;gap:12px;' }, [
          h('div', { style: 'display:flex;align-items:center;gap:10px;' }, [
            h('h3', {}, 'Daily Attendance Logs (' + monthTitle + ')'),
            h('span', { class: 'chip count' }, currentMonthLogs.length + ' entries')
          ]),
          monthNavControls
        ]),
        h('div', { class: 'tablewrap' }, [
          h('table', {}, [
            h('thead', {}, h('tr', {}, [
              h('th', { scope: 'col' }, 'DATE'),
              h('th', { scope: 'col' }, 'SCHEDULED IN'),
              h('th', { scope: 'col' }, 'PUNCH IN'),
              h('th', { scope: 'col' }, 'PUNCH OUT'),
              h('th', { scope: 'col' }, 'STATUS')
            ])),
            h('tbody', {}, currentMonthLogs.length
              ? currentMonthLogs.map(function (log) {
                  var statusChipClass = (log.status === 'Present') ? 'chip success'
                    : (log.status === 'Late') ? 'chip warning'
                    : 'chip';

                  return h('tr', {}, [
                    h('td', { class: 'mono bold' }, log.date),
                    h('td', { class: 'muted mono' }, log.scheduled_in || '10:00 AM'),
                    h('td', { class: 'mono bold' }, log.punch_in || '—'),
                    h('td', { class: 'mono' }, log.punch_out || '—'),
                    h('td', {}, h('span', { class: statusChipClass }, log.status || 'Present'))
                  ]);
                })
              : [
                  h('tr', {}, [
                    h('td', { colspan: '5', style: 'text-align:center;padding:28px;color:var(--text-secondary);' },
                      'No punch logs recorded for ' + monthTitle + ' (' + selectedMonth + '). Use the month buttons above to switch months or click "Quick Punch In" for today.')
                  ])
                ]
            )
          ])
        ])
      ])
    ]);
  }

  /* ---- 3. Leave Portal Tab View (Photo 2) --------------------------------- */
  function renderLeaveTab(user, rerender) {
    var loggedInUser = me();
    var allLeaves = OC.store.state.leaves || [];
    var myLeaves = allLeaves.filter(function (l) { return l.user_id === user.id; });

    // Calculate used leaves
    var usedCL = 0, usedEL = 0, usedSL = 0, usedWP = 0;
    myLeaves.forEach(function (l) {
      if (l.status !== 'Rejected') {
        usedCL += Number(l.cl_days || 0);
        usedEL += Number(l.el_days || 0);
        usedSL += Number(l.sl_days || 0);
        usedWP += Number(l.wp_days || 0);
      }
    });

    var totalCL = 10, totalEL = 12, totalSL = 14;
    var remCL = Math.max(0, totalCL - usedCL);
    var remEL = Math.max(0, totalEL - usedEL);
    var remSL = Math.max(0, totalSL - usedSL);
    var totalRem = remCL + remEL + remSL;

    // Form inputs
    var fromInput = h('input', { type: 'date', value: getLocalDateStr() });
    var toInput = h('input', { type: 'date', value: getLocalDateStr() });

    var managerUsers = (OC.store.state.users || []).filter(function (u) { return u.admin || (u.id !== user.id); });
    if (!managerUsers.length) managerUsers = (OC.store.state.users || []).slice();
    var defaultMgrId = (managerUsers.find(function (u) { return u.admin; }) || managerUsers[0] || {}).id || 'u-shohag';

    var managerSelect = OC.ui.select(
      managerUsers.map(function (u) {
        return { value: u.id, label: u.name + ' (' + (u.title || (u.admin ? 'System Admin' : 'Lead')) + ')' };
      }),
      defaultMgrId
    );

    var clInput = h('input', { type: 'number', step: '0.5', min: '0', value: '0', style: 'font-weight:700;' });
    var elInput = h('input', { type: 'number', step: '0.5', min: '0', value: '0', style: 'font-weight:700;' });
    var slInput = h('input', { type: 'number', step: '0.5', min: '0', value: '0', style: 'font-weight:700;' });
    var wpInput = h('input', { type: 'number', step: '0.5', min: '0', value: '0', style: 'font-weight:700;' });
    var reasonInput = h('textarea', { rows: '3', placeholder: 'State clear operational reason for leave...' });

    function setQuick(input, val) {
      input.value = String(val);
    }

    function quickControls(input) {
      return h('div', { class: 'portal-quick-chips' }, [
        h('button', { type: 'button', class: 'portal-quick-btn', onClick: function () { setQuick(input, 0.5); } }, '0.5'),
        h('button', { type: 'button', class: 'portal-quick-btn', onClick: function () { setQuick(input, 1.0); } }, '1.0'),
        h('button', { type: 'button', class: 'portal-quick-btn', onClick: function () { setQuick(input, 1.5); } }, '1.5'),
        h('button', { type: 'button', class: 'portal-quick-btn clear', onClick: function () { setQuick(input, 0); } }, 'Clear')
      ]);
    }

    function submitApplication(e) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      var cl = parseFloat(clInput.value) || 0;
      var el = parseFloat(elInput.value) || 0;
      var sl = parseFloat(slInput.value) || 0;
      var wp = parseFloat(wpInput.value) || 0;
      var totalApplied = cl + el + sl + wp;

      if (totalApplied <= 0) {
        OC.ui.toast('Please specify at least 0.5 days for one leave category.', true);
        return;
      }
      if (!reasonInput.value.trim()) {
        OC.ui.toast('Please provide a reason for the leave application.', true);
        return;
      }

      var chosenMgrId = managerSelect.value || defaultMgrId;
      var mgrUser = OC.store.user(chosenMgrId);
      var appObj = {
        id: OC.store.uid('lv'),
        user_id: user.id,
        user_name: user.name,
        from_date: fromInput.value || getLocalDateStr(),
        to_date: toInput.value || getLocalDateStr(),
        manager_id: chosenMgrId,
        manager_name: mgrUser ? mgrUser.name : 'System Admin',
        cl_days: cl,
        el_days: el,
        sl_days: sl,
        wp_days: wp,
        reason: reasonInput.value.trim(),
        status: 'Pending',
        submitted_at: new Date().toISOString()
      };

      OC.store.state.leaves = OC.store.state.leaves || [];
      OC.store.mutate({
        actor: user.id,
        action: 'leave.submit',
        target: user.name,
        detail: 'Applied for ' + totalApplied + ' days leave (' + appObj.from_date + ' to ' + appObj.to_date + ')'
      }, function () {
        OC.store.state.leaves.unshift(appObj);
      });

      // Dispatch in-app notification to the assigned Reporting Lead / Manager
      if (OC.store.notify && appObj.manager_id && appObj.manager_id !== user.id) {
        OC.store.notify([appObj.manager_id], user.name + ' applied for ' + totalApplied + ' days leave (' + appObj.from_date + ' to ' + appObj.to_date + ').', '#profile');
      }

      // Reset form inputs after successful submission
      clInput.value = '0';
      elInput.value = '0';
      slInput.value = '0';
      wpInput.value = '0';
      reasonInput.value = '';

      OC.ui.toast('Leave application submitted & sent to ' + (mgrUser ? mgrUser.name : 'Manager') + ' for approval.');
      rerender();

      setTimeout(function () {
        var section = document.getElementById('my-submitted-leaves-section');
        if (section && typeof section.scrollIntoView === 'function') {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
    }

    function approveLeave(app) {
      var applicant = OC.store.user(app.user_id);
      OC.store.mutate({
        actor: (loggedInUser ? loggedInUser.id : user.id),
        action: 'leave.approve',
        target: applicant ? applicant.name : app.user_id,
        detail: 'Approved leave for ' + app.from_date + ' to ' + app.to_date
      }, function () {
        app.status = 'Approved';
        app.reviewed_by = (loggedInUser ? loggedInUser.id : user.id);
        app.reviewed_by_name = (loggedInUser ? loggedInUser.name : user.name);
        app.reviewed_at = new Date().toISOString();
      });

      if (OC.store.notify && app.user_id) {
        OC.store.notify([app.user_id], 'Your leave application for ' + app.from_date + ' to ' + app.to_date + ' has been APPROVED.', '#profile');
      }

      OC.ui.toast('Leave application approved successfully.');
      rerender();
    }

    function rejectLeave(app) {
      var applicant = OC.store.user(app.user_id);
      var reasonBox = h('textarea', { rows: '3', placeholder: 'Optional reason or feedback for rejection...' });

      OC.ui.modal({
        title: 'Reject Leave Application',
        content: h('div', { class: 'form-body', style: 'display:flex;flex-direction:column;gap:12px;' }, [
          h('p', { style: 'font-size:13.5px;margin:0;' },
            'Are you sure you want to reject the leave application from ' + (applicant ? applicant.name : 'this employee') + ' for ' + app.from_date + ' to ' + app.to_date + '?'
          ),
          OC.ui.field('Rejection Reason / Feedback (Optional)', reasonBox)
        ]),
        actions: [
          { label: 'Cancel', onClick: function (close) { close(); } },
          {
            label: 'Confirm Rejection',
            danger: true,
            onClick: function (close) {
              var rejReason = reasonBox.value.trim();
              OC.store.mutate({
                actor: (loggedInUser ? loggedInUser.id : user.id),
                action: 'leave.reject',
                target: applicant ? applicant.name : app.user_id,
                detail: 'Rejected leave for ' + app.from_date + ' to ' + app.to_date + (rejReason ? ' (' + rejReason + ')' : '')
              }, function () {
                app.status = 'Rejected';
                app.rejection_reason = rejReason;
                app.reviewed_by = (loggedInUser ? loggedInUser.id : user.id);
                app.reviewed_by_name = (loggedInUser ? loggedInUser.name : user.name);
                app.reviewed_at = new Date().toISOString();
              });

              if (OC.store.notify && app.user_id) {
                OC.store.notify([app.user_id], 'Your leave application for ' + app.from_date + ' to ' + app.to_date + ' was Rejected' + (rejReason ? ': ' + rejReason : '.'), '#profile');
              }

              OC.ui.toast('Leave application has been rejected.');
              rerender();
              close();
            }
          }
        ]
      });
    }

    /* Check for incoming leave requests where current user is the Manager or Admin */
    var currentSessionUser = loggedInUser || user;
    var incomingLeaves = allLeaves.filter(function (a) {
      return a.manager_id === currentSessionUser.id || a.manager_id === user.id || Boolean(currentSessionUser.admin) || Boolean(user.admin);
    });
    var pendingIncoming = incomingLeaves.filter(function (a) { return a.status === 'Pending'; });

    return h('div', { class: 'portal-view-content' }, [
      h('div', { class: 'portal-header-box' }, [
        h('div', {}, [
          h('h2', { class: 'portal-view-title' }, [OC.icon('send'), 'Leave Portal & Formal Applications']),
          h('p', { class: 'muted', style: 'font-size:13px;margin:2px 0 0;' },
            'Apply for leave, track real-time credit balances, and review team approval requests for ' + user.name + '.'
          )
        ])
      ]),

      /* 4 Leave Balances Badges matching Photo 2 */
      h('div', { class: 'portal-stats-row' }, [
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Casual Leave (CL)'),
          h('div', { class: 'portal-stat-value success' }, remCL + ' / ' + totalCL + ' Left'),
          h('div', { class: 'portal-stat-sub' }, 'Used: ' + usedCL + ' Days')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Earned Leave (EL)'),
          h('div', { class: 'portal-stat-value info' }, remEL + ' / ' + totalEL + ' Left'),
          h('div', { class: 'portal-stat-sub' }, 'Used: ' + usedEL + ' Days')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Sick Leave (SL)'),
          h('div', { class: 'portal-stat-value warn' }, remSL + ' / ' + totalSL + ' Left'),
          h('div', { class: 'portal-stat-sub' }, 'Used: ' + usedSL + ' Days')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Total Remaining'),
          h('div', { class: 'portal-stat-value' }, totalRem + ' Days'),
          h('div', { class: 'portal-stat-sub' }, 'Without Pay: ' + usedWP + ' Days')
        ])
      ]),

      /* Manager / Approver Section: Incoming Leave Requests */
      incomingLeaves.length > 0 ? h('div', { class: 'portal-table-container', style: 'margin-bottom:24px;border:1px solid rgba(56,189,248,0.3);background:rgba(15,23,42,0.4);' }, [
        h('div', { class: 'portal-table-head', style: 'background:rgba(56,189,248,0.08);' }, [
          h('div', { style: 'display:flex;align-items:center;gap:10px;' }, [
            h('h3', { style: 'margin:0;' }, 'Incoming Leave Requests for My Approval'),
            pendingIncoming.length > 0
              ? h('span', { class: 'chip alert', style: 'font-weight:700;' }, pendingIncoming.length + ' Pending Action')
              : h('span', { class: 'chip success' }, 'All Reviewed')
          ])
        ]),
        h('div', { class: 'tablewrap' }, [
          h('table', {}, [
            h('thead', {}, h('tr', {}, [
              h('th', { scope: 'col' }, 'EMPLOYEE'),
              h('th', { scope: 'col' }, 'SUBMITTED'),
              h('th', { scope: 'col' }, 'PERIOD (FROM - TO)'),
              h('th', { scope: 'col' }, 'DAYS BREAKDOWN'),
              h('th', { scope: 'col' }, 'REASON'),
              h('th', { scope: 'col' }, 'STATUS'),
              h('th', { scope: 'col' }, 'ACTIONS')
            ])),
            h('tbody', {}, incomingLeaves.map(function (app) {
              var applicant = OC.store.user(app.user_id);
              var stClass = (app.status === 'Approved') ? 'chip success'
                : (app.status === 'Rejected') ? 'chip alert'
                : 'chip warning';
              var breakdown = [];
              if (app.cl_days > 0) breakdown.push(app.cl_days + ' CL');
              if (app.el_days > 0) breakdown.push(app.el_days + ' EL');
              if (app.sl_days > 0) breakdown.push(app.sl_days + ' SL');
              if (app.wp_days > 0) breakdown.push(app.wp_days + ' WP');

              var actionCell = (app.status === 'Pending')
                ? h('div', { class: 'row', style: 'gap:6px;' }, [
                    h('button', {
                      class: 'btn small primary',
                      type: 'button',
                      style: 'background:#10b981;border-color:#10b981;font-weight:700;padding:4px 10px;font-size:11.5px;',
                      title: 'Approve this leave request',
                      onClick: function () { approveLeave(app); }
                    }, [OC.icon('check'), 'Accept']),
                    h('button', {
                      class: 'btn small danger',
                      type: 'button',
                      style: 'font-weight:600;padding:4px 10px;font-size:11.5px;',
                      title: 'Reject this leave request',
                      onClick: function () { rejectLeave(app); }
                    }, [OC.icon('close'), 'Reject'])
                  ])
                : h('span', { class: 'chip', style: 'font-size:11px;' },
                    (app.status === 'Approved' ? 'Approved' : 'Rejected') + (app.reviewed_by_name ? ' by ' + app.reviewed_by_name : '')
                  );

              return h('tr', {}, [
                h('td', { class: 'bold' }, applicant ? applicant.name : app.user_id),
                h('td', { class: 'mono muted' }, app.submitted_at ? app.submitted_at.slice(0, 10) : 'Today'),
                h('td', { class: 'mono bold' }, app.from_date + ' → ' + app.to_date),
                h('td', {}, breakdown.join(', ') || '1 Day'),
                h('td', { class: 'muted', style: 'max-width:220px;' }, app.reason),
                h('td', {}, h('span', { class: stClass }, app.status || 'Pending')),
                h('td', {}, actionCell)
              ]);
            }))
          ])
        ])
      ]) : null,

      /* Application Form */
      h('div', { class: 'portal-form-container' }, [
        h('h3', { class: 'portal-form-heading' }, '+ Submit Dynamic Leave Application'),
        h('form', { onSubmit: submitApplication }, [
          h('div', { class: 'portal-form-grid-3' }, [
            OC.ui.field('Leave From Date *', fromInput, { required: true }),
            OC.ui.field('Leave To Date *', toInput, { required: true }),
            OC.ui.field('Reporting Lead / Manager *', managerSelect, { required: true })
          ]),

          h('div', { style: 'margin:14px 0 8px;' }, [
            h('span', { class: 'portal-spec-title' }, 'SPECIFY DAYS PER CATEGORY (TOTAL APPLIED):'),
            h('span', { class: 'portal-spec-hint' }, 'Supports Half-Day (0.5, 1.5, 2.5) & Full-Day Values')
          ]),

          h('div', { class: 'portal-form-grid-4' }, [
            h('div', { class: 'portal-leave-alloc-box' }, [
              h('label', {}, 'Casual Leave (CL)'),
              clInput,
              quickControls(clInput)
            ]),
            h('div', { class: 'portal-leave-alloc-box' }, [
              h('label', {}, 'Earned Leave (EL)'),
              elInput,
              quickControls(elInput)
            ]),
            h('div', { class: 'portal-leave-alloc-box' }, [
              h('label', {}, 'Sick Leave (SL)'),
              slInput,
              quickControls(slInput)
            ]),
            h('div', { class: 'portal-leave-alloc-box' }, [
              h('label', {}, 'Without Pay (WP)'),
              wpInput,
              quickControls(wpInput)
            ])
          ]),

          h('div', { style: 'margin-top:14px;' }, [
            OC.ui.field('Detailed Reason for Leave *', reasonInput, { required: true })
          ]),

          h('div', { style: 'display:flex;justify-content:flex-end;margin-top:16px;' }, [
            h('button', {
              class: 'btn primary',
              type: 'button',
              onClick: submitApplication,
              style: 'background:linear-gradient(135deg, #ea580c 0%, #c2410c 100%);color:#fff;font-weight:700;padding:9px 20px;cursor:pointer;'
            }, 'Submit Application & Generate Document')
          ])
        ])
      ]),

      /* Table: My Submitted Leave Applications */
      h('div', { id: 'my-submitted-leaves-section', class: 'portal-table-container', style: 'margin-top:24px;' }, [
        h('div', { class: 'portal-table-head' }, [
          h('h3', {}, 'My Submitted Leave Applications'),
          h('span', { class: 'chip count' }, myLeaves.length + ' applications')
        ]),
        h('div', { class: 'tablewrap' }, [
          h('table', {}, [
            h('thead', {}, h('tr', {}, [
              h('th', { scope: 'col' }, 'SUBMITTED'),
              h('th', { scope: 'col' }, 'PERIOD (FROM - TO)'),
              h('th', { scope: 'col' }, 'BREAKDOWN'),
              h('th', { scope: 'col' }, 'REPORTING TO'),
              h('th', { scope: 'col' }, 'REASON'),
              h('th', { scope: 'col' }, 'STATUS')
            ])),
            h('tbody', {}, myLeaves.length
              ? myLeaves.map(function (app) {
                  var stClass = (app.status === 'Approved') ? 'chip success'
                    : (app.status === 'Rejected') ? 'chip alert'
                    : 'chip warning';
                  var breakdown = [];
                  if (app.cl_days > 0) breakdown.push(app.cl_days + ' CL');
                  if (app.el_days > 0) breakdown.push(app.el_days + ' EL');
                  if (app.sl_days > 0) breakdown.push(app.sl_days + ' SL');
                  if (app.wp_days > 0) breakdown.push(app.wp_days + ' WP');

                  return h('tr', {}, [
                    h('td', { class: 'mono' }, app.submitted_at ? app.submitted_at.slice(0, 10) : 'Today'),
                    h('td', { class: 'mono bold' }, app.from_date + ' → ' + app.to_date),
                    h('td', {}, breakdown.join(', ') || '1 Day'),
                    h('td', {}, app.manager_name || 'System Admin'),
                    h('td', { class: 'muted', style: 'max-width:200px;' }, app.reason),
                    h('td', {}, h('span', { class: stClass }, app.status || 'Pending'))
                  ]);
                })
              : [
                  h('tr', {}, [
                    h('td', { colspan: '6', style: 'text-align:center;padding:28px;color:var(--text-secondary);' },
                      'No leave applications submitted yet.')
                  ])
                ]
            )
          ])
        ])
      ])
    ]);
  }

  /* ---- 4. My Work Tab View (Lifetime Task History Grouped By Date) ------- */
  function isUserTask(t, u) {
    if (!t || !u || t.archived) return false;
    // Single assignee
    if (t.assignee === u.id || (t.assignee_type === 'user' && t.assignee === u.id)) return true;
    // Group membership
    if (OC.can && OC.can.inGroup && (OC.can.inGroup(u, t.assignee) || (t.assignee_type === 'group' && OC.can.inGroup(u, t.assignee)))) return true;
    // Multi-assignees
    if (Array.isArray(t.assignees) && t.assignees.some(function (aid) {
      if (aid === u.id) return true;
      if (typeof aid === 'string') {
        if (aid.indexOf('user:') === 0 && aid.slice(5) === u.id) return true;
        if (aid.indexOf('group:') === 0 && OC.can && OC.can.inGroup && OC.can.inGroup(u, aid.slice(6))) return true;
      }
      return OC.can && OC.can.inGroup && OC.can.inGroup(u, aid);
    })) return true;
    // Created by
    if (t.created_by === u.id) return true;
    return false;
  }

  function openWorkTaskModal(t) {
    var isDone = t.state === 'done';
    var priority = t.priority || 'normal';
    var priorityWord = priority.charAt(0).toUpperCase() + priority.slice(1);
    var clientCode = (OC.ui && OC.ui.clientCode) ? OC.ui.clientCode(t.client || (Array.isArray(t.clients) ? t.clients[0] : '')) : (t.client || '');
    var clientObj = (OC.store && OC.store.client) ? OC.store.client(t.client || (Array.isArray(t.clients) ? t.clients[0] : '')) : null;
    var clientLabel = clientObj ? (clientObj.client_id + ' - ' + (clientObj.client_code || '') + ' - ' + clientObj.name) : (clientCode || 'N/A');
    var dept = (OC.store && OC.store.department) ? OC.store.department(t.department || (Array.isArray(t.departments) ? t.departments[0] : '')) : null;
    var assigner = (OC.store && OC.store.user) ? OC.store.user(t.created_by || t.assignee) : null;

    OC.ui.modal({
      title: 'Work Task Details',
      className: 'todo-detail-modal',
      content: h('div', { class: 'todo-detail' }, [
        h('h3', { class: 'todo-detail-title' + (isDone ? ' strikethrough' : '') }, t.title),
        h('div', { class: 'todo-detail-chips', style: 'display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;' }, [
          h('span', { class: 'chip prio-chip prio-' + priority }, priorityWord + ' Priority'),
          h('span', { class: 'chip ' + (isDone ? 'success' : 'alert') }, isDone ? 'Completed' : (t.state || 'Open')),
          t.due ? h('span', { class: 'chip custom' }, 'Due: ' + (OC.ui && OC.ui.dueLabel ? OC.ui.dueLabel(t.due) : t.due)) : null,
          t.completed_at ? h('span', { class: 'chip group' }, 'Done: ' + new Date(t.completed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })) : null
        ].filter(Boolean)),
        t.description ? h('div', { style: 'margin-top:12px;' }, [
          h('div', { class: 'muted', style: 'font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;' }, 'Description'),
          h('p', { class: 'todo-detail-desc', style: 'margin-top:4px;font-size:13.5px;line-height:1.5;color:var(--ink);' }, t.description)
        ]) : null,
        h('div', { style: 'margin-top:16px;padding-top:14px;border-top:1px solid var(--rule);display:grid;grid-template-columns:1fr 1fr;gap:12px;' }, [
          h('div', {}, [
            h('div', { class: 'muted', style: 'font-size:11.5px;font-weight:600;' }, 'Client'),
            h('div', { style: 'font-size:13px;font-weight:700;color:var(--ink);margin-top:2px;' }, clientLabel)
          ]),
          dept ? h('div', {}, [
            h('div', { class: 'muted', style: 'font-size:11.5px;font-weight:600;' }, 'Department'),
            h('div', { style: 'font-size:13px;font-weight:700;color:var(--ink);margin-top:2px;' }, dept.name)
          ]) : null,
          assigner ? h('div', {}, [
            h('div', { class: 'muted', style: 'font-size:11.5px;font-weight:600;' }, 'Assigned By / Creator'),
            h('div', { style: 'font-size:13px;font-weight:700;color:var(--ink);margin-top:2px;' }, assigner.name + (assigner.title ? ' (' + assigner.title + ')' : ''))
          ]) : null,
          t.completed_at ? h('div', {}, [
            h('div', { class: 'muted', style: 'font-size:11.5px;font-weight:600;' }, 'Completed Timestamp'),
            h('div', { class: 'mono', style: 'font-size:12.5px;font-weight:700;color:var(--cyan, #38bdf8);margin-top:2px;' }, new Date(t.completed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))
          ]) : (t.updated_at ? h('div', {}, [
            h('div', { class: 'muted', style: 'font-size:11.5px;font-weight:600;' }, 'Last Updated'),
            h('div', { class: 'mono', style: 'font-size:12.5px;font-weight:700;margin-top:2px;' }, new Date(t.updated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))
          ]) : null)
        ].filter(Boolean))
      ]),
      actions: [
        { label: 'Close', primary: true, onClick: function (close) { close(); } }
      ]
    });
  }

  function renderWorkTab(user, rerender) {
    var allTasks = (OC.store.state.todos || []).filter(function (t) { return isUserTask(t, user); });
    var completedTasks = allTasks.filter(function (t) { return t.state === 'done'; });
    var openTasks = allTasks.filter(function (t) { return t.state !== 'done'; });

    // Distinct days calculation
    var distinctDays = {};
    completedTasks.forEach(function (t) {
      var d = (t.completed_at || t.updated_at || t.due || t.created_at || '').slice(0, 10);
      if (d) distinctDays[d] = true;
    });
    var distinctDaysCount = Object.keys(distinctDays).length;

    // Distinct clients calculation: tasks + departmental clients if Head/Admin + direct assignees
    var distinctClients = {};
    allTasks.forEach(function (t) {
      if (t.client) distinctClients[t.client] = true;
      if (Array.isArray(t.clients)) t.clients.forEach(function (cid) { if (cid) distinctClients[cid] = true; });
    });
    var myDeptIds = (user.departments || []).filter(function (m) {
      return (m && (m.level === 'head' || (OC.can && OC.can.isHead(user, m.department))));
    }).map(function (m) { return m.department; });
    if (user.department && (OC.can && OC.can.isHead(user, user.department))) {
      myDeptIds.push(user.department);
    }
    (OC.store.state.departments || []).forEach(function (d) {
      if (user.admin || d.head === user.id || d.head_id === user.id || d.lead === user.id || (Array.isArray(d.heads) && d.heads.indexOf(user.id) !== -1) || (OC.can && OC.can.isHead(user, d.id))) {
        if (myDeptIds.indexOf(d.id) === -1) myDeptIds.push(d.id);
      }
    });
    var myRelatedClients = (OC.store.state.clients || []).filter(function (c) {
      var cDepts = Array.isArray(c.departments) ? c.departments : (c.department ? [c.department] : []);
      var inMyDept = cDepts.some(function (dId) { return myDeptIds.indexOf(dId) !== -1; });
      var isAssigned = (Array.isArray(c.assignees) && c.assignees.indexOf(user.id) !== -1) ||
                       (Array.isArray(c.assigned_users) && c.assigned_users.indexOf(user.id) !== -1);
      if (inMyDept || isAssigned) {
        distinctClients[c.id] = true;
        return true;
      }
      return false;
    });
    var clientsCount = Object.keys(distinctClients).length;

    // Filter tasks for display
    var filteredTasks = allTasks.filter(function (t) {
      if (workStatusFilter === 'done' && t.state !== 'done') return false;
      if (workStatusFilter === 'open' && t.state === 'done') return false;

      if (workSearchQuery) {
        var q = workSearchQuery.toLowerCase();
        var cCode = (OC.ui && OC.ui.clientCode) ? OC.ui.clientCode(t.client || (Array.isArray(t.clients) ? t.clients[0] : '')) : '';
        var hay = (t.title + ' ' + (t.description || '') + ' ' + cCode + ' ' + (t.priority || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }

      return true;
    });

    // Group filtered tasks by Date
    var grouped = {};
    filteredTasks.forEach(function (t) {
      var d = (t.completed_at || t.updated_at || t.due || t.created_at || '').slice(0, 10) || 'Undated';
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(t);
    });

    var dateKeys = Object.keys(grouped).sort(function (a, b) {
      return b.localeCompare(a);
    });

    // Header controls
    var searchInput = h('input', {
      type: 'search',
      placeholder: 'Search task, client, keyword...',
      value: workSearchQuery,
      style: 'padding:5px 12px;border-radius:8px;font-size:12.5px;min-width:220px;background:var(--card-bg-alt, rgba(15,23,42,0.6));color:var(--ink, #fff);border:1px solid var(--border, rgba(56,189,248,0.25));',
      onInput: function (e) {
        workSearchQuery = (e.target && e.target.value) || '';
        rerender();
      }
    });

    var statusSegmented = h('div', { class: 'segmented', style: 'display:inline-flex;padding:2px;background:rgba(255,255,255,0.06);border-radius:9999px;' }, [
      h('button', {
        type: 'button',
        style: 'padding:4px 12px;font-size:12px;border-radius:9999px;font-weight:700;transition:all 0.15s ease;' + (workStatusFilter === 'done' ? 'background:var(--accent,#0284c7);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);' : 'background:transparent;color:var(--text-secondary);'),
        onClick: function () { workStatusFilter = 'done'; rerender(); }
      }, 'Completed (' + completedTasks.length + ')'),
      h('button', {
        type: 'button',
        style: 'padding:4px 12px;font-size:12px;border-radius:9999px;font-weight:700;transition:all 0.15s ease;' + (workStatusFilter === 'all' ? 'background:var(--accent,#0284c7);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);' : 'background:transparent;color:var(--text-secondary);'),
        onClick: function () { workStatusFilter = 'all'; rerender(); }
      }, 'All Work (' + allTasks.length + ')'),
      h('button', {
        type: 'button',
        style: 'padding:4px 12px;font-size:12px;border-radius:9999px;font-weight:700;transition:all 0.15s ease;' + (workStatusFilter === 'open' ? 'background:var(--accent,#0284c7);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);' : 'background:transparent;color:var(--text-secondary);'),
        onClick: function () { workStatusFilter = 'open'; rerender(); }
      }, 'Open (' + openTasks.length + ')')
    ]);

    function formatHeaderDate(dateStr) {
      if (!dateStr || dateStr === 'Undated') return { title: 'Undated Tasks', rel: '' };
      var parts = dateStr.split('-');
      if (parts.length !== 3) return { title: dateStr, rel: '' };
      var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var dayName = days[d.getDay()];
      var monthName = months[d.getMonth()];
      var title = dayName + ', ' + parts[2] + ' ' + monthName + ' ' + parts[0];

      var today = getLocalDateStr();
      var rel = '';
      if (dateStr === today) rel = 'Today';
      else {
        var diff = Math.round((new Date(today).getTime() - d.getTime()) / (24 * 3600 * 1000));
        if (diff === 1) rel = 'Yesterday';
        else if (diff > 1) rel = diff + ' days ago';
        else if (diff < 0) rel = Math.abs(diff) + ' days ahead';
      }
      return { title: title, rel: rel };
    }

    function formatTime(isoStr) {
      if (!isoStr) return '—';
      var d = new Date(isoStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    return h('div', { class: 'portal-view-content' }, [
      h('div', { class: 'portal-header-box' }, [
        h('div', {}, [
          h('h2', { class: 'portal-view-title' }, [OC.icon('history'), 'My Work History']),
          h('p', { class: 'muted', style: 'font-size:13px;margin:2px 0 0;' },
            'Complete lifetime task execution log for ' + user.name + '. View every task completed by date.'
          )
        ]),
        h('div', { class: 'row', style: 'gap:10px;align-items:center;flex-wrap:wrap;' }, [
          searchInput,
          statusSegmented
        ])
      ]),

      /* 4 Metric Stat Cards */
      h('div', { class: 'portal-stats-row' }, [
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Lifetime Completed'),
          h('div', { class: 'portal-stat-value' }, completedTasks.length + ' Tasks'),
          h('div', { class: 'portal-stat-sub' }, 'Across all projects')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Active Work Days'),
          h('div', { class: 'portal-stat-value' }, distinctDaysCount + ' Days'),
          h('div', { class: 'portal-stat-sub' }, 'Days with completed work')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Clients Served'),
          h('div', { class: 'portal-stat-value' }, clientsCount + ' Clients'),
          h('div', { class: 'portal-stat-sub' }, 'Total clients handled')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Current In-Progress'),
          h('div', { class: 'portal-stat-value' + (openTasks.length > 0 ? ' alert' : '') }, openTasks.length + ' Tasks'),
          h('div', { class: 'portal-stat-sub' }, 'Active pending tasks')
        ])
      ]),

      /* Department Clients Overview for Heads/Admins */
      myRelatedClients.length ? h('div', { class: 'portal-table-container', style: 'margin-bottom:18px;' }, [
        h('div', { class: 'portal-table-head', style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:rgba(255,255,255,0.02);padding:10px 16px;border-bottom:1px solid var(--rule);' }, [
          h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
            OC.icon('briefcase') || OC.icon('users'),
            h('h3', { style: 'font-size:14px;font-weight:700;margin:0;color:var(--ink);' }, 'Department & Assigned Clients'),
            h('span', { class: 'chip count', style: 'font-size:11px;font-weight:700;' }, myRelatedClients.length + ' clients')
          ]),
          h('button', {
            class: 'btn small',
            type: 'button',
            style: 'font-size:11px;padding:2px 8px;',
            onClick: function () {
              if (OC.app && OC.app.go) OC.app.go('clients');
            }
          }, 'View in Client Portal →')
        ]),
        h('div', { style: 'display:flex;gap:10px;padding:12px 16px;overflow-x:auto;flex-wrap:wrap;' }, myRelatedClients.map(function (rc) {
          var rcDepts = Array.isArray(rc.departments) ? rc.departments : (rc.department ? [rc.department] : []);
          var deptTag = rcDepts.map(function (dId) {
            var dObj = OC.store.department(dId);
            return dObj ? dObj.name : dId;
          }).join(', ');
          var rcTasks = allTasks.filter(function (t) {
            return t.client === rc.id || (Array.isArray(t.clients) && t.clients.indexOf(rc.id) !== -1);
          });
          return h('div', {
            class: 'card',
            style: 'padding:10px 14px;min-width:200px;flex:1 1 200px;cursor:pointer;transition:transform 0.15s ease;background:var(--card-bg-alt, rgba(15,23,42,0.6));border:1px solid var(--border, rgba(56,189,248,0.2));border-radius:8px;',
            onClick: function () {
              if (OC.clients && OC.clients.select) OC.clients.select(rc.id);
              if (OC.app && OC.app.go) OC.app.go('clients');
            }
          }, [
            h('div', { style: 'font-weight:700;font-size:13px;color:var(--ink);' }, rc.name || rc.client_id || 'Client'),
            h('div', { class: 'mono', style: 'font-size:11px;color:var(--cyan,#38bdf8);margin:2px 0 4px;' }, rc.client_code || rc.client_id || rc.id),
            h('div', { style: 'display:flex;align-items:center;justify-content:space-between;font-size:11px;' }, [
              h('span', { class: 'chip custom', style: 'font-size:10px;padding:1px 6px;' }, deptTag || 'Unassigned'),
              h('span', { class: 'muted' }, rcTasks.length + ' tasks')
            ])
          ]);
        }))
      ]) : null,

      /* Date Grouped Task Logs */
      dateKeys.length ? dateKeys.map(function (dKey) {
        var items = grouped[dKey];
        var info = formatHeaderDate(dKey);

        return h('div', { class: 'portal-table-container', style: 'margin-bottom:14px;' }, [
          h('div', { class: 'portal-table-head', style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:rgba(255,255,255,0.02);padding:10px 16px;border-bottom:1px solid var(--rule);' }, [
            h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
              OC.icon('calendar'),
              h('h3', { style: 'font-size:14px;font-weight:700;margin:0;color:var(--ink);' }, info.title),
              info.rel ? h('span', { class: 'chip ' + (info.rel === 'Today' ? 'success' : 'custom'), style: 'font-size:11px;padding:1px 7px;' }, info.rel) : null
            ]),
            h('span', { class: 'chip count', style: 'font-weight:700;' }, items.length + ' ' + (items.length === 1 ? 'task' : 'tasks'))
          ]),
          h('div', { class: 'tablewrap' }, [
            h('table', {}, [
              h('thead', {}, h('tr', {}, [
                h('th', { scope: 'col', style: 'width:90px;' }, 'STATUS'),
                h('th', { scope: 'col' }, 'TASK TITLE'),
                h('th', { scope: 'col', style: 'width:120px;' }, 'CLIENT'),
                h('th', { scope: 'col', style: 'width:100px;' }, 'PRIORITY'),
                h('th', { scope: 'col', style: 'width:120px;' }, 'COMPLETED AT'),
                h('th', { scope: 'col', style: 'width:90px;' }, 'ACTION')
              ])),
              h('tbody', {}, items.map(function (task) {
                var isDone = task.state === 'done';
                var prio = task.priority || 'normal';
                var clientCode = (OC.ui && OC.ui.clientCode) ? OC.ui.clientCode(task.client || (Array.isArray(task.clients) ? task.clients[0] : '')) : (task.client || '');
                var compTime = formatTime(task.completed_at || task.updated_at);

                return h('tr', {
                  style: 'cursor:pointer;',
                  onClick: function () { openWorkTaskModal(task); }
                }, [
                  h('td', {}, h('span', { class: 'chip ' + (isDone ? 'success' : 'alert'), style: 'font-size:11px;font-weight:700;' }, isDone ? 'Done' : (task.state || 'Open'))),
                  h('td', {}, [
                    h('div', { style: 'font-weight:700;color:var(--ink);' + (isDone ? 'text-decoration:line-through;opacity:0.85;' : '') }, task.title),
                    task.description ? h('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;max-width:380px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' }, task.description) : null
                  ]),
                  h('td', {}, clientCode ? (OC.ui && OC.ui.clientChip ? OC.ui.clientChip(task.client || (Array.isArray(task.clients) ? task.clients[0] : '')) : h('span', { class: 'chip client' }, clientCode)) : h('span', { class: 'muted' }, '—')),
                  h('td', {}, h('span', { class: 'chip prio-chip prio-' + prio }, prio.charAt(0).toUpperCase() + prio.slice(1))),
                  h('td', { class: 'mono', style: 'font-size:12px;font-weight:600;' }, compTime),
                  h('td', {}, h('button', {
                    class: 'btn small',
                    type: 'button',
                    style: 'font-size:11px;padding:2px 8px;',
                    onClick: function (e) {
                      e.stopPropagation();
                      openWorkTaskModal(task);
                    }
                  }, 'Details'))
                ]);
              }))
            ])
          ])
        ]);
      }) : h('div', { class: 'card', style: 'padding:36px 20px;text-align:center;' }, [
        h('div', { style: 'display:inline-flex;padding:12px;background:rgba(56,189,248,0.1);border-radius:9999px;color:var(--cyan,#38bdf8);margin-bottom:12px;' }, [OC.icon('history')]),
        h('h3', { style: 'font-size:16px;font-weight:700;margin:0 0 6px;' }, 'No Tasks Found'),
        h('p', { class: 'muted', style: 'font-size:13px;max-width:440px;margin:0 auto;' },
          workSearchQuery ? 'No tasks matched your search query "' + workSearchQuery + '". Clear search to view all.' : 'No completed tasks recorded yet. As tasks are completed, they will appear here grouped by day.'
        )
      ])
    ]);
  }

  /* ---- Main Render Entry ------------------------------------------------ */
  function render(host, rerender) {
    var user = activeUser();
    if (!user) return;

    var loggedInUser = me();
    var isManagingOther = Boolean(targetUserId && loggedInUser && targetUserId !== loggedInUser.id);

    var allLeaves = OC.store.state.leaves || [];
    var pendingForMe = allLeaves.filter(function (a) {
      return (a.manager_id === (loggedInUser ? loggedInUser.id : '') || (loggedInUser && (loggedInUser.admin || loggedInUser.role === 'admin'))) && a.status === 'Pending';
    }).length;

    var sidebarItems = [
      { id: 'profile', label: 'Employee Profile', icon: 'user' },
      { id: 'attendance', label: 'My Attendance', icon: 'clock' },
      { id: 'leave', label: 'Leave Portal', icon: 'send', badge: pendingForMe > 0 ? pendingForMe : null },
      { id: 'work', label: 'My Work', icon: 'history' }
    ];

    var sidebar = h('aside', { class: 'portal-sidebar' }, [
      h('div', { class: 'portal-sidebar-brand' }, [
        h('div', { class: 'portal-sidebar-tag' }, 'ACTIVE PORTAL'),
        h('div', { class: 'portal-sidebar-title' }, isManagingOther ? 'Team Portal' : 'Employee Portal')
      ]),
      h('nav', { class: 'portal-sidebar-nav' }, sidebarItems.map(function (item) {
        var isActive = activeTab === item.id;
        return h('button', {
          type: 'button',
          class: 'portal-nav-btn' + (isActive ? ' active' : ''),
          onClick: function () {
            setSavedTab(item.id);
            render(host, rerender);
          }
        }, [
          h('span', { class: 'portal-nav-icon' }, [OC.icon(item.icon) || '•']),
          h('span', { class: 'portal-nav-label' }, item.label),
          item.badge ? h('span', { class: 'chip alert', style: 'margin-left:auto;font-size:10px;padding:2px 6px;' }, item.badge) : null
        ]);
      })),
      h('div', { class: 'portal-sidebar-footer' }, [
        h('button', {
          class: 'btn small',
          type: 'button',
          style: 'width:100%;display:flex;align-items:center;justify-content:center;gap:6px;',
          onClick: function () {
            if (OC.app && OC.app.go) OC.app.go('management');
          }
        }, ['← Back to Management'])
      ])
    ]);

    var mainContent = (activeTab === 'attendance')
      ? renderAttendanceTab(user, function () { render(host, rerender); })
      : (activeTab === 'leave')
        ? renderLeaveTab(user, function () { render(host, rerender); })
        : (activeTab === 'work')
          ? renderWorkTab(user, function () { render(host, rerender); })
          : renderProfileTab(user, function () { render(host, rerender); });

    var topBanner = isManagingOther ? h('div', {
      class: 'callout info',
      style: 'margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);border-radius:10px;'
    }, [
      h('div', { style: 'display:flex;align-items:center;gap:10px;' }, [
        OC.icon('user'),
        h('div', {}, [
          h('div', { style: 'font-weight:700;font-size:14px;color:var(--cyan, #38bdf8);' }, 'Managing Employee Portal: ' + user.name + (user.employee_id ? ' (' + user.employee_id + ')' : '')),
          h('div', { class: 'muted', style: 'font-size:12px;' }, 'Viewing and managing details as Administrator / Team Lead.')
        ])
      ]),
      h('button', {
        class: 'btn small secondary',
        type: 'button',
        style: 'font-size:11.5px;font-weight:600;display:inline-flex;align-items:center;gap:4px;',
        onClick: function () {
          targetUserId = null;
          render(host, rerender);
        }
      }, [OC.icon('left'), 'Back to My Profile'])
    ]) : null;

    var layout = h('div', { class: 'portal-layout-container' }, [
      sidebar,
      h('main', { class: 'portal-main-area' }, [
        topBanner,
        mainContent
      ])
    ]);

    OC.ui.clear(host);
    OC.ui.append(host, [layout]);
  }

  return {
    render: render,
    setActiveTab: function (tab) { setSavedTab(tab); },
    getActiveTab: function () { return activeTab; },
    openForUser: function (userOrId, tab) {
      if (typeof userOrId === 'string') targetUserId = userOrId;
      else if (userOrId && userOrId.id) targetUserId = userOrId.id;
      else targetUserId = null;

      if (tab) {
        setSavedTab(tab);
      } else {
        activeTab = getSavedTab();
      }

      if (OC.app && OC.app.go) {
        OC.app.go('profile');
      }
    },
    renderWorkTab: renderWorkTab,
    isUserTask: isUserTask
  };
})();
