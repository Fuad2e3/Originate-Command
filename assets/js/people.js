/* =========================================================================
   people.js — accounts, departments and the audit log (3.0, 4.0, 6.1)
   The organisation as data: who is in which department at which level, the
   ordered hierarchy each department defines for itself, the invite flow, and
   the immutable audit trail. Invites are simulated here — in the specified
   build a Cloud Function sends the single-use link described in 6.1.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.people = (function () {
  'use strict';

  function me() {
    return OC.store.user(OC.store.session()) || (OC.store.state && OC.store.state.users && OC.store.state.users[0]) || { id: '', name: 'User', admin: false };
  }

  function invite(onSuccess) {
    var h = OC.ui.h;
    var user = me();
    if (!user || (!user.admin && !OC.can.headOfAny(user))) {
      OC.ui.toast('Access Denied: Only System Admin and Department Heads may send invitations (6.1).', true);
      return;
    }
    var email = h('input', { type: 'email', placeholder: 'name@originate.example' });

    var levelOptions = [
      { value: 'member', label: 'Member' },
      { value: 'intern', label: 'Intern' },
      { value: 'head', label: 'Department Head' }
    ];
    if (user && user.admin) {
      levelOptions.push({ value: 'admin', label: 'System Admin' });
    }

    var levelSelect = OC.ui.select(levelOptions, 'member');

    OC.ui.modal({
      title: 'Invite someone',
      content: h('div', {}, [
        OC.ui.field('Email', email, { required: true, hint: 'Receives a single-use 72-hour invite link and password.' }),
        OC.ui.field('Starting level', levelSelect, { required: true, hint: 'Role and permission level for this account (Department and profile can be configured later).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Send invite', primary: true, onClick: function (close) {
            var rawEmail = email.value.trim().toLowerCase();
            if (!/.+@.+\..+/.test(rawEmail)) return 'Enter a valid email address.';

            var prefix = rawEmail.split('@')[0].replace(/[._-]/g, ' ').trim();
            var derivedName = prefix.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) || 'Invited Member';
            var chosenLevel = levelSelect.value || 'member';
            var isAdmin = chosenLevel === 'admin';

            var inv = OC.store.issueInvite(user.id, {
              email: rawEmail,
              name: derivedName,
              department: '',
              level: chosenLevel
            });

            var defaultTitle = isAdmin ? 'System Admin'
              : (chosenLevel === 'head' ? 'Department Head'
              : (chosenLevel === 'lead' ? 'Team Lead'
              : (chosenLevel === 'intern' ? 'Intern' : 'Team Member')));

            var account = {
              id: OC.store.uid('u'),
              name: derivedName,
              email: rawEmail,
              title: defaultTitle,
              admin: isAdmin,
              status: 'invited',
              departments: [],
              prefs: { push: true, email: true, discord: false },
              invite: inv
            };

            OC.store.mutate({
              actor: user.id,
              action: 'user.invite',
              target: account.email,
              detail: 'Invited as ' + chosenLevel.toUpperCase() + ' (department & profile can be assigned later)'
            }, function () {
              OC.store.state.users.push(account);
            });

            dispatchInviteEmail(account, false);
            close();
            if (typeof onSuccess === 'function') {
              try { onSuccess(account); } catch (e) {}
            }
            showInviteSuccessModal(account);
          }
        }
      ]
    });
  }

  function getInviteDetails(account) {
    var base = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'http://localhost:7000';
    var path = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '/';
    var link = base + path + '#claim=' + (account.invite ? account.invite.token : '');
    var pass = account.invite ? account.invite.passcode : '';
    var deptObj = OC.store.department(account.departments && account.departments[0] ? account.departments[0].department : '');
    var deptName = deptObj ? deptObj.name : 'Originate Command';
    var levelName = (account.departments && account.departments[0] && account.departments[0].level)
      ? account.departments[0].level
      : (account.invite && account.invite.level ? account.invite.level : (account.admin ? 'Admin' : 'Member'));
    var levelCap = levelName.charAt(0).toUpperCase() + levelName.slice(1);

    var fullText = [
      'Hello ' + (account.name || 'there') + ',',
      '',
      'You have been invited to join the Originate Command portal (' + (deptObj ? deptName + ' · ' : '') + levelCap + ').',
      '',
      'Gmail: ' + account.email,
      '72-Hour Password: ' + pass,
      '72-Hour Invite Link: ' + link,
      '',
      'Security Notice: Both the link and password are valid for 72 hours.',
      'Upon your first login, this password becomes your permanent password for all future logins.',
      '',
      '© Originate Command — Owner: Abdullah Al Fuad'
    ].join('\n');

    var gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1' +
      '&to=' + encodeURIComponent(account.email) +
      '&su=' + encodeURIComponent('Invitation to join Originate Command workspace') +
      '&body=' + encodeURIComponent(fullText);

    return { link: link, pass: pass, fullText: fullText, gmailUrl: gmailUrl };
  }

  function showInviteSuccessModal(account) {
    var h = OC.ui.h;
    var details = getInviteDetails(account);

    OC.ui.modal({
      title: 'Invite Created for ' + account.name,
      content: h('div', { style: 'font-size:13.5px;' }, [
        h('p', { class: 'muted', style: 'margin-bottom:14px;' },
          'A 72-hour invite link and unique password have been generated for this account.'),
        h('div', { class: 'card', style: 'background:var(--card-bg-alt);border:1px solid var(--rule);padding:14px;margin-bottom:16px;' }, [
          h('p', { style: 'margin:0 0 6px;' }, [h('strong', {}, 'Gmail: '), account.email]),
          h('p', { style: 'margin:0 0 6px;' }, [h('strong', {}, '72-Hour Password: '), h('span', { class: 'mono', style: 'color:var(--blueprint);font-weight:700;' }, details.pass)]),
          h('p', { style: 'margin:0;word-break:break-all;font-size:12px;' }, [h('strong', {}, 'Link: '), details.link]),
        ]),
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;' }, [
          h('button', {
            class: 'btn primary',
            type: 'button',
            style: 'display:inline-flex;align-items:center;gap:6px;',
            onClick: function () {
              dispatchInviteEmail(account, true);
            }
          }, [OC.icon('send'), 'Send Email Now']),
          h('a', {
            class: 'btn',
            href: details.gmailUrl,
            target: '_blank',
            style: 'display:inline-flex;align-items:center;gap:6px;text-decoration:none;'
          }, [OC.icon('send'), 'Open in Gmail (Manual)']),
          h('button', {
            class: 'btn',
            type: 'button',
            onClick: function () {
              OC.ui.copyText(details.fullText, 'Full invite message copied to clipboard!');
            }
          }, [OC.icon('copy'), 'Copy Full Message']),
          h('button', {
            class: 'btn',
            type: 'button',
            onClick: function () {
              OC.ui.copyText(details.pass, 'Password (' + details.pass + ') copied!');
            }
          }, 'Copy Passcode'),
          h('button', {
            class: 'btn',
            type: 'button',
            onClick: function () {
              OC.ui.copyText(details.link, 'Link copied to clipboard!');
            }
          }, 'Copy Link')
        ])
      ]),
      actions: [
        { label: 'Done', primary: true, onClick: function (close) { close(); } }
      ]
    });
  }

  function getApiEndpoint(endpoint) {
    if (typeof window === 'undefined' || !window.location) return endpoint;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || window.location.port === '7000') {
      return endpoint;
    }
    var cfg = window.OC_CONFIG || window.LGS_CONFIG;
    if (cfg && cfg.API_URL && cfg.API_URL.indexOf('http') === 0) {
      return cfg.API_URL.replace(/\/+$/, '') + endpoint;
    }
    return endpoint;
  }

  function dispatchInviteEmail(account, isResend) {
    var deptObj = OC.store.department(account.departments && account.departments[0] ? account.departments[0].department : '');
    var deptName = deptObj ? deptObj.name : 'Originate Command';
    var levelName = (account.departments && account.departments[0] && account.departments[0].level)
      ? account.departments[0].level
      : (account.invite && account.invite.level ? account.invite.level : (account.admin ? 'Admin' : 'Member'));
    var base = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'http://localhost:7000';

    OC.ui.toast('Dispatching auto-email to ' + account.email + '...');

    if (typeof fetch === 'function') {
      var targetUrl = getApiEndpoint('/api/invites/send-email');
      fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'bypass-tunnel-reminder': 'true'
        },
        body: JSON.stringify({
          to: account.email,
          name: account.name,
          departmentName: deptObj ? deptObj.name : 'Development Operations',
          levelName: levelName,
          token: account.invite ? account.invite.token : '',
          passcode: account.invite ? account.invite.passcode : '',
          appUrl: base
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.ok) {
            OC.ui.toast('Auto-email successfully delivered to ' + account.email + '.');
          } else {
            OC.ui.toast('Mail notice: ' + (data.error || 'Server processed request'));
          }
        })
        .catch(function (err) {
          console.warn('Auto email dispatch warning:', err);
          OC.ui.toast('Could not connect to mail server. Use Open in Gmail button.');
        });
    }
  }

  function editPrefs() {
    var h = OC.ui.h;
    var user = me();
    var prefs = user.prefs || {};
    var push = h('input', { type: 'checkbox', checked: prefs.push });
    var email = h('input', { type: 'checkbox', checked: prefs.email });
    var discord = h('input', { type: 'checkbox', checked: prefs.discord });

    OC.ui.modal({
      title: 'Notification preferences',
      content: h('div', {}, [
        h('p', { class: 'muted', style: 'font-size:13.5px;margin-bottom:12px' },
          'Every channel is a toggle on your own profile, so nobody is forced into a channel they do not use (9.0).'),
        h('label', { class: 'checkline' }, [push, 'Browser push — anything assigned directly to me']),
        h('label', { class: 'checkline' }, [email, 'Email — the dependable fallback']),
        h('label', { class: 'checkline' }, [discord, 'Discord webhook — the team-wide instruction feed'])
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Save', primary: true, onClick: function (close) {
            OC.store.mutate({ actor: user.id, action: 'user.prefs', target: user.name }, function () {
              user.prefs = { push: push.checked, email: email.checked, discord: discord.checked };
            });
            OC.ui.toast('Preferences saved.');
            close();
          }
        }
      ]
    });
  }

  function resend(account) {
    var user = me();
    if (!user || (!user.admin && !OC.can.headOfAny(user))) {
      OC.ui.toast('Access Denied: Only System Admin and Department Heads can resend invitations.', true);
      return;
    }
    // Pass the account's existing meta so the new invite token carries correct email/name/dept
    OC.store.mutate({ actor: user.id, action: 'user.invite.resend', target: account.name,
                      detail: 'new single use link and 72-hr password' }, function () {
      account.invite = OC.store.issueInvite(user.id, {
        email: account.email,
        name: account.name,
        department: account.departments && account.departments[0] ? account.departments[0].department : '',
        level: account.departments && account.departments[0] ? account.departments[0].level : 'member'
      });
    });
    dispatchInviteEmail(account, true);
    showInviteSuccessModal(account);
  }

  function revoke(account) {
    OC.ui.confirm('Withdraw the invite for ' + account.name + '? The link stops working immediately.', function () {
      OC.store.mutate({ actor: OC.store.session(), action: 'user.invite.revoke', target: account.name }, function () {
        OC.store.state.users = OC.store.state.users.filter(function (u) { return u.id !== account.id; });
      });
      OC.ui.toast('Invite withdrawn.');
    });
  }

  function claim(account) {
    OC.ui.confirm('Simulate ' + account.name + ' following their link and completing their profile?', function () {
      var pass = account.invite ? account.invite.passcode : 'admin';
      OC.store.mutate({ actor: account.id, action: 'user.invite.claim', target: account.name }, function () {
        if (account.invite) account.invite.claimed_at = new Date().toISOString();
        account.status = 'active';
      });
      if (typeof fetch === 'function' && account.email) {
        fetch(getApiEndpoint('/api/auth/set-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: account.email, password: pass, token: account.invite ? account.invite.token : '' })
        }).catch(function () {});
      }
      OC.ui.toast(account.name + ' is now an active account in MySQL database.');
    });
  }

  function inviteRow(account) {
    var h = OC.ui.h;
    var user = me();
    var expired = OC.store.inviteExpired(account.invite);
    var actions = [];
    var details = getInviteDetails(account);

    if (OC.can.manageInvite(user, account)) {
      if (!expired) {
        actions.push(h('a', {
          class: 'btn primary small',
          href: details.gmailUrl,
          target: '_blank',
          style: 'display:inline-flex;align-items:center;gap:4px;text-decoration:none;'
        }, [OC.icon('send'), 'Open in Gmail']));

        actions.push(h('button', {
          class: 'btn small', type: 'button', onClick: function () {
            OC.ui.copyText(details.fullText, 'Full invite message copied to clipboard!');
          }
        }, 'Copy Message'));

        actions.push(h('button', {
          class: 'btn small', type: 'button', onClick: function () {
            OC.ui.copyText(details.link, 'Invite link copied to clipboard!');
          }
        }, 'Copy Link'));

        if (account.invite && account.invite.passcode) {
          actions.push(h('button', {
            class: 'btn small', type: 'button', onClick: function () {
              OC.ui.copyText(account.invite.passcode, '72-Hour Password (' + account.invite.passcode + ') copied!');
            }
          }, 'Copy Passcode'));
        }

        actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { claim(account); } }, 'Simulate claim'));
      }
      actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { resend(account); } }, 'Resend'));
      actions.push(h('button', { class: 'btn small', type: 'button', onClick: function () { revoke(account); } }, 'Revoke'));
    }
    return h('div', { class: 'card invite-card' }, [
      h('div', { class: 'row' }, [
        h('h3', {}, account.name),
        h('span', { class: 'chip ' + (expired ? 'overdue' : 'custom') + ' push' }, expired ? 'link expired' : 'awaiting claim')
      ]),
      h('p', { class: 'muted', style: 'font-size:13px;margin:4px 0 8px' }, account.email + ' · ' + account.title),
      h('div', { class: 'row' }, account.departments.map(function (m) {
        return h('span', { class: 'chip custom' }, (OC.store.department(m.department) || {}).name + ' · ' + m.level);
      })),
      account.invite && account.invite.passcode ? h('p', { style: 'font-size:12.5px;color:var(--blueprint);margin:6px 0 2px;' }, [
        '72-Hour Password: ',
        h('strong', { class: 'mono', style: 'background:var(--card-bg-alt);padding:2px 6px;border-radius:4px;' }, account.invite.passcode)
      ]) : null,
      h('p', { class: 'mono muted', style: 'font-size:10.5px;margin-top:6px' },
        'Token ' + account.invite.token + ' · expires ' + OC.ui.fmtDate(account.invite.expires_at) + ' (72 hrs)'),
      actions.length ? h('div', { class: 'row', style: 'margin-top:10px;gap:6px;flex-wrap:wrap;' }, actions) : null
    ]);
  }

  /* ---- departments are data, not schema (3.4, 4.1) ----------------------- */
  function newDepartment() {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', placeholder: 'for example: Paid Advertising' });
    var levels = h('input', { type: 'text', value: 'head, member, intern' });
    OC.ui.modal({
      title: 'New department',
      content: h('div', {}, [
        OC.ui.field('Name', name, { required: true }),
        OC.ui.field('Hierarchy, highest first', levels, { required: true,
          hint: 'Comma separated. Permissions come from a level\'s position in this list, so a department may carry levels the others do not (3.4).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Create department', primary: true, onClick: function (close) {
            if (!name.value.trim()) return 'Give the department a name.';
            var list = levels.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
            if (list.length < 2) return 'A department needs at least two levels.';
            var dept = { id: OC.store.uid('d'), name: name.value.trim(), levels: list };
            OC.store.mutate({ actor: user.id, action: 'department.create', target: dept.name,
                              detail: list.join(' → ') }, function () {
              OC.store.state.departments.push(dept);
            });
            OC.ui.toast('Department created. No development work required (4.1).');
            close();
          }
        }
      ]
    });
  }

  function editDepartment(dept) {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', value: dept.name });
    var levels = h('input', { type: 'text', value: dept.levels.join(', ') });
    var members = OC.store.state.users.filter(function (u) { return OC.can.inDept(u, dept.id); });

    var actions = [
      { label: 'Cancel', onClick: function (close) { close(); } },
      {
        label: 'Save changes', primary: true, onClick: function (close) {
          var newName = name.value.trim();
          if (!newName) return 'Department name cannot be empty.';
          var list = levels.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
          if (list.length < 2) return 'A department needs at least two levels.';
          var orphaned = OC.store.state.users.filter(function (u) {
            var lv = OC.can.levelIn(u, dept.id);
            return lv && list.indexOf(lv) === -1;
          });
          if (orphaned.length) {
            return 'Removing a level that people still hold: ' +
              orphaned.map(function (u) { return u.name; }).join(', ') + '. Move them first.';
          }
          var oldName = dept.name;
          OC.store.mutate({
            actor: user.id,
            action: 'department.update',
            target: newName,
            detail: oldName + ' → ' + newName + ' (' + list.join(' → ') + ')'
          }, function () {
            dept.name = newName;
            dept.levels = list;
          });
          OC.ui.toast('Department updated.');
          close();
        }
      }
    ];

    if (members.length === 0 && OC.store.state.departments.length > 1) {
      actions.unshift({
        label: 'Delete department', onClick: function (close) {
          OC.ui.confirm('Delete department "' + dept.name + '"? This cannot be undone.', function () {
            OC.store.mutate({ actor: user.id, action: 'department.delete', target: dept.name }, function () {
              OC.store.state.departments = OC.store.state.departments.filter(function (d) { return d.id !== dept.id; });
            });
            OC.ui.toast('Department deleted.');
            close();
          });
        }
      });
    }

    OC.ui.modal({
      title: 'Edit department: ' + dept.name,
      content: h('div', {}, [
        OC.ui.field('Department name', name, { required: true, hint: 'You can customize or rename this department at any time.' }),
        OC.ui.field('Hierarchy, highest first', levels, { required: true, hint: 'Comma-separated levels (e.g. head, member, intern).' })
      ]),
      actions: actions
    });
  }

  function addPersonToDepartment(dept, onAdded) {
    var h = OC.ui.h;
    var user = me();
    if (!user || !user.admin) {
      OC.ui.toast('Access Denied: Only System Admin may add members to departments.', true);
      return;
    }

    var allUsers = (OC.store.state.users || []).filter(function (u) { return u.status === 'active'; });
    if (!allUsers.length) allUsers = (OC.store.state.users || []).slice();

    var userOptions = allUsers.map(function (u) {
      var currentLevel = OC.can.levelIn(u, dept.id);
      var currentLabel = currentLevel ? ' (Current: ' + currentLevel + ')' : '';
      return { value: u.id, label: u.name + ' <' + u.email + '>' + currentLabel };
    });

    var userSelect = OC.ui.select(userOptions, userOptions[0] ? userOptions[0].value : '');

    var deptLevels = (Array.isArray(dept.levels) && dept.levels.length) ? dept.levels.slice() : ['head', 'member', 'intern'];
    if (!deptLevels.some(function (l) { return String(l).toLowerCase().trim() === 'intern' || String(l).trim() === 'ইন্টান'; })) {
      deptLevels.push('intern');
    }
    var levelOptions = deptLevels.map(function (lv, idx) {
      var norm = String(lv).toLowerCase().trim();
      var tagLabel = norm === 'head' ? 'Head (Department Head)' : (norm === 'intern' ? 'Intern' : 'Member (Team Member)');
      return { value: lv, label: (idx + 1) + '. ' + tagLabel };
    });

    var defaultLevel = (deptLevels.length > 1) ? deptLevels[1] : (deptLevels[0] || 'member');
    var levelSelect = OC.ui.select(levelOptions, defaultLevel);

    OC.ui.modal({
      title: 'Add Person to ' + dept.name,
      content: h('div', {}, [
        h('p', { class: 'muted', style: 'font-size:13.5px;margin-bottom:14px;' },
          'Select an employee and assign their authority level in ' + dept.name + '. Only System Admin can add members.'),
        OC.ui.field('Select Employee / Person *', userSelect, { required: true }),
        OC.ui.field('Assign Level in Department *', levelSelect, { required: true, hint: 'Rank 1 is Department Head; lower ranks are Members (3.4).' })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Add to Department', primary: true, onClick: function (close) {
            var selectedUserId = userSelect.value || (userOptions[0] ? userOptions[0].value : '');
            var selectedLevel = levelSelect.value || defaultLevel;
            var targetUser = OC.store.user(selectedUserId);
            if (!targetUser) return 'Please select a valid user.';

            OC.store.mutate({
              actor: user.id,
              action: 'department.member.assign',
              target: targetUser.name,
              detail: 'Assigned ' + targetUser.name + ' to ' + dept.name + ' as ' + selectedLevel
            }, function () {
              targetUser.departments = targetUser.departments || [];
              var existingIdx = -1;
              for (var i = 0; i < targetUser.departments.length; i++) {
                if (targetUser.departments[i].department === dept.id) {
                  existingIdx = i;
                  break;
                }
              }
              if (existingIdx > -1) {
                targetUser.departments[existingIdx].level = selectedLevel;
              } else {
                targetUser.departments.push({ department: dept.id, level: selectedLevel });
              }
            });

            OC.ui.toast('Added ' + targetUser.name + ' to ' + dept.name + ' as ' + selectedLevel + '.');
            close();
            if (typeof onAdded === 'function') onAdded();
          }
        }
      ]
    });
  }

  function removePersonFromDepartment(targetUser, dept, onRemoved) {
    var user = me();
    if (!user || !user.admin) {
      OC.ui.toast('Access Denied: Only System Admin may remove members from departments.', true);
      return;
    }
    if (!targetUser || !dept) return;

    OC.ui.confirm('Are you sure you want to remove "' + targetUser.name + '" from the "' + dept.name + '" department?', function () {
      OC.store.mutate({
        actor: user.id,
        action: 'department.member.remove',
        target: targetUser.name,
        detail: 'Removed ' + targetUser.name + ' from ' + dept.name
      }, function () {
        targetUser.departments = (targetUser.departments || []).filter(function (m) {
          var mDept = typeof m === 'string' ? m : (m && m.department);
          return mDept !== dept.id && mDept !== dept.name;
        });
      });
      OC.ui.toast('Removed ' + targetUser.name + ' from ' + dept.name + '.');
      if (typeof onRemoved === 'function') onRemoved();
    });
  }

  function editClient(client) {
    var h = OC.ui.h;
    var user = me();
    if (!user || !user.admin) {
      OC.ui.toast('Only System Admins can edit client details.');
      return;
    }
    var clientId = h('input', { type: 'text', value: client.client_id || '' });
    var clientCode = h('input', { type: 'text', value: client.client_code || '' });
    var name = h('input', { type: 'text', value: client.name || '' });
    var contact = h('input', { type: 'text', value: client.contact || client.name });
    var status = OC.ui.select([
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' }
    ], client.status || 'active');

    var currentLabel = OC.ui.clientLabel ? OC.ui.clientLabel(client) : client.name;
    var canDelete = !!(OC.can && OC.can.canDeleteClient ? OC.can.canDeleteClient(user, client) : (user && user.admin));
    var canScope = !!(user && (user.admin || (OC.can && OC.can.headOfAny && OC.can.headOfAny(user))));
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

    var deptRow = h('div', { class: 'client-dept-row' }, [
      OC.ui.field('Visible to department(s) (Dept Head & Admin)', deptCheckboxes.node, {
        hint: 'Check departments allowed to see this client. Leave unchecked for all departments (visible to everyone).'
      })
    ]);

    var assigneeRow = canAssign ? h('div', { class: 'client-assignee-row', style: 'margin-top:10px;' }, [
      OC.ui.field('Assigned Working Member(s) (Dept Head & Admin)', assigneePicker.node, {
        hint: 'Select the specific person(s) allowed to see and work on this client. If left empty, only System Admin & Dept Head can access.'
      })
    ]) : null;

    var actions = [
      { label: 'Cancel', onClick: function (close) { close(); } },
      {
        label: 'Save', primary: true, onClick: function (close) {
          var cName = name.value.trim();
          if (!cName) return 'Client name cannot be empty.';
          var cIdVal = clientId.value.trim();
          var cCodeVal = clientCode.value.trim();
          var cContact = contact.value.trim() || cName;

          var selectedDepts = canScope ? deptCheckboxes.getDepartments() : (client.departments || []);
          var selectedAssignees = (canAssign && assigneePicker) ? assigneePicker.getAssignees() : (client.assignees || []);
          var primaryDept = selectedDepts.length ? selectedDepts[0] : '';
          var deptNote = '; visible to ' + deptNames(selectedDepts) + (selectedAssignees.length ? ' (' + selectedAssignees.length + ' assigned)' : '');

          var nowIso = new Date().toISOString();
          OC.store.mutate({
            actor: user.id, action: 'client.update', target: cName,
            clientId: client.id,
            assignees: selectedAssignees,
            departments: selectedDepts,
            department: primaryDept,
            detail: 'Updated details for ' + client.name + deptNote
          }, function () {
            client.client_id = cIdVal;
            client.client_code = cCodeVal;
            client.name = cName;
            client.contact = cContact;
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
              targetClient.client_id = cIdVal;
              targetClient.client_code = cCodeVal;
              targetClient.name = cName;
              targetClient.contact = cContact;
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
          close();
        }
      }
    ];

    if (canDelete) {
      actions.unshift({
        label: 'Delete client', onClick: function (close) {
          OC.ui.confirm('Delete client "' + client.name + '"? Existing tasks will remain.', function () {
            OC.store.mutate({ actor: user.id, action: 'client.delete', target: client.name }, function () {
              OC.store.state.clients = OC.store.state.clients.filter(function (c) { return c.id !== client.id; });
            });
            OC.ui.toast('Client deleted.');
            close();
          });
        }
      });
    }

    /* Unshifted to the left of "Delete client" */
    if (canScope) {
      var btnLabel = 'Department';
      if (initialDepts.length === 1) {
        var dObj = OC.store.department(initialDepts[0]);
        btnLabel = 'Dept: ' + (dObj ? dObj.name : initialDepts[0]);
      } else if (initialDepts.length > 1) {
        btnLabel = 'Depts (' + initialDepts.length + ')';
      }
      actions.unshift({
        label: btnLabel,
        onClick: function () {
          deptRow.hidden = false;
          deptRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }

    OC.ui.modal({
      title: 'Edit client: ' + currentLabel,
      content: h('div', {}, [
        OC.ui.field('Client ID', clientId, { hint: 'Unique client identifier or account number (optional).' }),
        OC.ui.field('Client code', clientCode, { hint: 'Short ticker or abbreviation code (optional).' }),
        OC.ui.field('Client / Company name', name, { required: true }),
        OC.ui.field('Primary contact', contact, { hint: 'Contact person name.' }),
        OC.ui.field('Status', status),
        canScope ? deptRow : null,
        canAssign ? assigneeRow : null
      ]),
      actions: actions
    });
  }

  function editAccount(account) {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', value: account.name });
    var email = h('input', { type: 'email', value: account.email });
    var title = h('input', { type: 'text', value: account.title });
    var isAdmin = h('input', { type: 'checkbox', checked: account.admin });

    var currentDept = (account.departments && account.departments[0]) ? account.departments[0].department : '';
    var currentLevel = (account.departments && account.departments[0]) ? account.departments[0].level : '';

    var allowedDepts = user.admin
      ? OC.store.state.departments
      : OC.store.state.departments.filter(function (d) { return OC.can.isHead(user, d.id); });

    var deptOptions = [{ value: '', label: 'None (Independent)' }].concat(
      allowedDepts.map(function (d) { return { value: d.id, label: d.name }; })
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

    var statusSelect = OC.ui.select([
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' }
    ], account.status || 'active');

    var uploader = OC.ui.photoUploader(account.avatar, account.name);

    var actions = [
      { label: 'Cancel', onClick: function (close) { close(); } },
      {
        label: 'Open Employee Portal', onClick: function (close) {
          close();
          if (OC.profilePortal && OC.profilePortal.openForUser) {
            OC.profilePortal.openForUser(account);
          }
        }
      },
      {
        label: 'Save account', primary: true, onClick: function (close) {
          if (!name.value.trim()) return 'Name cannot be empty.';
          if (!/.+@.+\..+/.test(email.value)) return 'Enter a valid email address.';

          OC.store.mutate({
            actor: user.id, action: 'user.update', target: name.value.trim(),
            detail: 'Updated profile for ' + account.name
          }, function () {
            account.name = name.value.trim();
            account.email = email.value.trim();
            account.avatar = uploader.getValue();
            account.title = title.value.trim() || 'Team Member';
            if (account.admin) {
              account.admin = true; // System Admins are permanently protected
            } else if (user.admin) {
              account.admin = isAdmin.checked;
            }
            account.status = account.admin ? 'active' : statusSelect.value;
            if (deptSelect.value && levelSelect.value) {
              // Preserve all other department memberships — only update or insert the selected dept
              var otherDepts = (account.departments || []).filter(function (m) {
                return m.department !== deptSelect.value;
              });
              account.departments = otherDepts.concat([{ department: deptSelect.value, level: levelSelect.value }]);
            } else if (user.admin && !deptSelect.value) {
              account.departments = [];
            }
          });
          OC.ui.toast('Account updated successfully.');
          close();
        }
      }
    ];

    if (OC.can.deleteAccount(user, account)) {
      actions.unshift({
        label: 'Delete user', onClick: function (close) {
          if (!user || !user.admin) {
            OC.ui.toast('Access Denied: Only System Admin can delete user accounts.', true);
            return;
          }
          if (account.admin) {
            OC.ui.toast('Access Denied: System Admins cannot be deleted.', true);
            return;
          }
          if (user.id === account.id) {
            OC.ui.toast('Access Denied: System Admins cannot delete their own account.', true);
            return;
          }

          var confirmMsg = 'Permanently delete user "' + account.name + '"? This user will be removed and cannot log in.';

          OC.ui.confirm(confirmMsg, function () {
            OC.store.mutate({
              actor: user.id,
              action: 'user.delete',
              target: account.name,
              detail: 'Permanently deleted user account ' + account.name
            }, function () {
              OC.store.state.users = OC.store.state.users.filter(function (u) { return u.id !== account.id; });
            });
            OC.ui.toast('User account permanently deleted.');
            close();

            var host = document.querySelector('main.content') || document.querySelector('#content');
            if (host && typeof render === 'function') render(host);
          });
        }
      });
    }

    var fields = [
      OC.ui.field('Profile photo', uploader.node, { hint: 'Custom profile picture or photo URL.' }),
      OC.ui.field('Full name', name, { required: true }),
      OC.ui.field('Email address', email, { required: true }),
      OC.ui.field('Job title', title)
    ];

    if (user && user.admin) {
      fields.push(OC.ui.field('Department (System Admin Only)', deptSelect));
      fields.push(OC.ui.field('Department level (System Admin Only)', levelSelect));
    }

    if (account.admin) {
      statusSelect.disabled = true;
    }
    fields.push(OC.ui.field('Status', statusSelect));

    if (user && user.admin && account.id !== user.id) {
      if (account.admin) {
        isAdmin.disabled = true;
        fields.push(h('label', { class: 'checkline', style: 'margin-top:12px;opacity:0.85;' }, [isAdmin, ' System Admin (Protected superuser — cannot be removed)']));
      } else {
        fields.push(h('label', { class: 'checkline', style: 'margin-top:12px;' }, [isAdmin, ' Grant System Admin superuser access']));
      }
    }

    OC.ui.modal({
      title: 'Edit account: ' + account.name,
      content: h('div', {}, fields),
      actions: actions
    });
  }

  function render(host) {
    var h = OC.ui.h;
    var user = me();
    var visibleClients = (OC.can && OC.can.visibleClients)
      ? OC.can.visibleClients(user)
      : (OC.store.state.clients || []);
    // Only System Admins or the person who issued the invite can see and manage pending invites (6.1)
    var pending = OC.store.state.users.filter(function (u) {
      return u.status === 'invited' && u.invite && !u.invite.claimed_at && OC.can.manageInvite(user, u);
    });
    var canEditAny = OC.store.state.users.some(function (u) { return OC.can.editAccount(user, u); });

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, 'People and departments'),
        h('p', {}, 'Departments are data, not schema — any department can be renamed, customized, or added without development work (4.1). ' +
          'System Admin and Department Heads can edit, manage, and delete member accounts directly.')
      ]),

      h('div', { class: 'row', style: 'margin-bottom:16px' }, [
        OC.can.invite(user)
          ? h('button', { class: 'btn primary', type: 'button', onClick: invite }, [OC.icon('plus'), 'Invite someone'])
          : h('p', { class: 'muted' }, 'Invites are sent by the system admin or a department head (6.1).'),
        OC.can.createClient(user)
          ? h('button', { class: 'btn', type: 'button', onClick: function () { OC.ui.newClientModal(function () { render(host); }); } }, [OC.icon('plus'), 'Add client'])
          : null,
        h('button', { class: 'btn', type: 'button', onClick: editPrefs }, [OC.icon('bell'), 'My notification preferences']),
        OC.can.manageDepartments(user)
          ? h('button', { class: 'btn', type: 'button', onClick: newDepartment }, [OC.icon('plus'), 'New department'])
          : null
      ]),

      pending.length ? h('div', { style: 'margin-bottom:22px' }, [
        h('h2', { class: 'section-head' }, [
          'Pending invites',
          h('span', { class: 'chip count' }, pending.length + ' awaiting')
        ]),
        h('p', { class: 'muted', style: 'font-size:13.5px;margin-bottom:12px;max-width:74ch' },
          'Each link is single use and expires 72 hours after it is issued. An unclaimed invite can be resent or ' +
          'revoked by whoever sent it, or by the system admin (6.1).'),
        h('div', { class: 'grid-2' }, pending.map(inviteRow))
      ]) : null,

      h('div', { class: 'row', style: 'align-items:center;margin-top:20px;' }, [
        h('h2', { class: 'section-head', style: 'margin:0;' }, [
          'Clients & Accounts',
          h('span', { class: 'chip count' }, visibleClients.length + ' total')
        ]),
        OC.can.createClient(user)
          ? h('button', { class: 'btn small push', type: 'button', onClick: function () { OC.ui.newClientModal(function () { render(host); }); } }, [OC.icon('plus'), 'New client'])
          : null
      ]),
      visibleClients.length ? h('div', { class: 'grid-2', style: 'margin:12px 0 22px' }, visibleClients.map(function (c) {
        var clientTodos = OC.store.state.todos.filter(function (t) {
          return !t.archived && t.state !== 'done' && (t.client === c.id || (Array.isArray(t.clients) && t.clients.indexOf(c.id) > -1));
        });
        var displayTitle = OC.ui.clientLabel ? OC.ui.clientLabel(c) : c.name;
        return h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [
            h('h3', {}, displayTitle),
            h('span', { class: 'chip ' + (c.status === 'active' ? 'dept' : 'custom') + ' push' }, c.status)
          ]),
          h('p', { class: 'muted', style: 'font-size:13px;margin:6px 0 10px;' }, 'Primary contact: ' + (c.contact || c.name)),
          h('div', { class: 'row', style: 'font-size:12.5px' }, [
            h('span', { class: 'chip count' }, clientTodos.length + ' active tasks'),
            (OC.can && OC.can.canEditClient ? OC.can.canEditClient(user, c) : (user && user.admin))
              ? h('button', { class: 'btn small push', type: 'button', onClick: function () { editClient(c); } }, 'Edit client')
              : null
          ])
        ]);
      })) : h('div', { class: 'card', style: 'margin:12px 0 22px;text-align:center;padding:24px;' }, [
        h('p', { class: 'muted', style: 'margin-bottom:12px;' }, 'No clients registered yet. Only System Admins can add clients.'),
        OC.can.createClient(user)
          ? h('button', { class: 'btn primary small', type: 'button', onClick: function () { OC.ui.newClientModal(function () { render(host); }); } }, [OC.icon('plus'), 'Add your first client'])
          : null
      ]),

      h('h2', { class: 'section-head' }, [
        'Departments',
        h('span', { class: 'chip count' }, OC.store.state.departments.length + ' total')
      ]),
      h('div', { class: 'grid-2', style: 'margin-bottom:22px' }, OC.store.state.departments.map(function (d) {
        var members = OC.store.state.users.filter(function (u) { return OC.can.inDept(u, d.id); });
        return h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [
            h('h3', {}, d.name),
            h('span', { class: 'chip custom push' }, members.length + ' people')
          ]),
          h('div', { class: 'row', style: 'margin:8px 0 10px' }, (function () {
            var lvs = (Array.isArray(d.levels) && d.levels.length) ? d.levels.slice() : ['head', 'member', 'intern'];
            if (!lvs.some(function (l) { return String(l).toLowerCase().trim() === 'intern' || String(l).trim() === 'ইন্টান'; })) {
              lvs.push('intern');
            }
            return lvs.map(function (lv, i) {
              var rc = (OC.can && OC.can.roleClass) ? OC.can.roleClass(lv) : '';
              return h('span', { class: 'chip ' + (rc || (i === 0 ? 'role-head' : (i === 1 ? 'role-member' : 'role-intern'))) }, (i + 1) + '. ' + lv);
            });
          })()),
          OC.can.manageDepartments(user)
            ? h('div', { class: 'row', style: 'margin-bottom:10px;gap:8px;' }, [
                h('button', { class: 'btn small', type: 'button', onClick: function () { editDepartment(d); } }, 'Edit department'),
                (user && user.admin)
                  ? h('button', {
                      class: 'btn small primary', type: 'button',
                      style: 'background:#2563eb;border-color:#2563eb;color:#fff;font-weight:600;',
                      onClick: function () { addPersonToDepartment(d, function () { render(host); }); }
                    }, [OC.icon('plus'), 'Add person'])
                  : null
              ].filter(Boolean))
            : null,
          h('div', { class: 'stack' }, members.length ? members.map(function (u) {
            var uLevel = OC.can.levelIn(u, d.id);
            var rc = (OC.can && OC.can.roleClass) ? OC.can.roleClass(uLevel) : '';
            return h('div', { class: 'row', style: 'font-size:13.5px;align-items:center;' }, [
              OC.ui.person(u.id),
              h('span', { class: 'chip role push ' + rc }, uLevel),
              u.status === 'invited' ? h('span', { class: 'chip overdue' }, 'invited') : null,
              OC.can.editAccount(user, u)
                ? h('button', {
                    class: 'btn small',
                    type: 'button',
                    style: 'padding:2px 8px;font-size:11.5px;margin-left:6px;',
                    onClick: function () {
                      if (OC.profilePortal && OC.profilePortal.openForUser) {
                        OC.profilePortal.openForUser(u);
                      } else {
                        editAccount(u);
                      }
                    }
                  }, 'Edit')
                : null,
              (user && user.admin)
                ? h('button', {
                    class: 'btn small danger',
                    type: 'button',
                    style: 'padding:2px 7px;font-size:11.5px;margin-left:4px;',
                    title: 'Remove ' + u.name + ' from ' + d.name,
                    onClick: function () {
                      removePersonFromDepartment(u, d, function () { render(host); });
                    }
                  }, OC.icon('close'))
                : null
            ]);
          }) : [h('p', { class: 'muted', style: 'font-size:12.5px;' }, 'No members yet.')])
        ]);
      })),

      h('h2', { class: 'section-head' }, [
        'Accounts',
        h('span', { class: 'chip count' }, OC.store.state.users.length + ' people')
      ]),
      h('div', { class: 'tablewrap' }, [
        h('table', {}, [
          h('caption', {}, 'Accounts'),
          h('thead', {}, h('tr', {}, [
            h('th', { scope: 'col' }, 'Name'),
            h('th', { scope: 'col' }, 'Title'),
            h('th', { scope: 'col' }, 'Role'),
            h('th', { scope: 'col' }, 'Departments'),
            h('th', { scope: 'col' }, 'Status'),
            canEditAny ? h('th', { scope: 'col', style: 'text-align:right;' }, 'Actions') : null
          ].filter(Boolean))),
          h('tbody', {}, OC.store.state.users.map(function (u) {
            var rLbl = OC.can.roleLabel(u);
            var rc = (OC.can && OC.can.roleClass) ? OC.can.roleClass(rLbl) : '';
            return h('tr', {}, [
              h('th', { scope: 'row' }, OC.ui.person(u.id)),
              h('td', { class: 'muted' }, u.title),
              h('td', {}, h('span', { class: 'chip role ' + rc }, rLbl)),
              h('td', {}, u.departments.length
                ? u.departments.map(function (m) {
                    var mrc = (OC.can && OC.can.roleClass) ? OC.can.roleClass(m.level) : '';
                    return h('span', { class: 'chip ' + (mrc || 'custom'), style: 'margin-right:4px' },
                      (OC.store.department(m.department) || {}).name + ' · ' + m.level);
                  })
                : h('span', { class: 'muted' }, 'leadership tier, every department')),
              h('td', { class: 'mono' }, u.status),
              canEditAny ? h('td', { style: 'text-align:right;' }, [
                OC.can.editAccount(user, u)
                  ? h('button', {
                      class: 'btn small',
                      type: 'button',
                      onClick: function () {
                        if (OC.profilePortal && OC.profilePortal.openForUser) {
                          OC.profilePortal.openForUser(u);
                        } else {
                          editAccount(u);
                        }
                      }
                    }, 'Edit')
                  : null
              ]) : null
            ].filter(Boolean));
          }))
        ])
      ])
    ]);
  }

  return {
    render: render,
    invite: invite,
    newDepartment: newDepartment,
    editPrefs: editPrefs,
    editDepartment: editDepartment,
    addPersonToDepartment: addPersonToDepartment,
    removePersonFromDepartment: removePersonFromDepartment,
    editClient: editClient,
    editAccount: editAccount,
    getApiEndpoint: getApiEndpoint,
    dispatchInviteEmail: dispatchInviteEmail
  };
})();
