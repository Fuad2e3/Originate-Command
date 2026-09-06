/* =========================================================================
   activities.js — team activities & organizational hub (4.1, 4.2, 6.1, 6.5)
   Unified workspace combining cross-department groups, discussions,
   departments, member accounts, and pending invites onto a single page.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.activities = (function () {
  'use strict';

  var activeTab = 'departments'; /* departments | accounts | reports | history | invites | groups */
  var TABS = ['departments', 'accounts', 'reports', 'history', 'invites', 'groups'];

  /* The open tab rides in the address as #activities/<tab>, so a reload comes
     back to it instead of dropping onto Departments. */
  function syncTabToUrl() {
    if (OC.app && OC.app.setSub) OC.app.setSub(activeTab === 'departments' ? [] : [activeTab]);
  }

  function readTabFromUrl() {
    if (!OC.app || !OC.app.sub) return;
    var sub = OC.app.sub();
    activeTab = (sub[0] && TABS.indexOf(sub[0]) > -1) ? sub[0] : 'departments';
  }
  var groupSearchQuery = '';
  var groupFilterStatus = 'all'; /* all | active | archived | mine */

  var auditSearchQuery = '';
  var auditLimit = 20;

  function me() { return OC.store.user(OC.store.session()); }

  function render(host, rerender) {
    var h = OC.ui.h;
    var user = me() || (OC.store.state && OC.store.state.users && OC.store.state.users[0]) || { id: '', name: 'User', admin: false };
    /* the address decides which tab is open, so a reload or a pasted link
       lands on the same one */
    readTabFromUrl();

    var allGroups = OC.store.state.groups || [];
    var myGroups = allGroups.filter(function (g) { return (g.members || []).indexOf(user.id) > -1; });
    var activeGroups = allGroups.filter(function (g) { return g.status === 'active'; });

    var depts = OC.store.state.departments || [];
    var users = OC.store.state.users || [];
    /* Entries already written before chat stopped being logged are dropped
       here too, so the trail reads clean straight away rather than only for
       activity from now on. */
    var allAudit = (OC.store.state.audit || []).filter(function (a) {
      return !(OC.store.isChatChatter && OC.store.isChatChatter(a && a.action));
    });
    var pending = users.filter(function (u) {
      return u.status === 'invited' && u.invite && !u.invite.claimed_at && OC.can.manageInvite(user, u);
    });

    var canCreateGroup = !!(OC.can && OC.can.createGroup ? OC.can.createGroup(user) : (user && user.admin));
    var canInvite = !!(OC.can && OC.can.invite ? OC.can.invite(user) : (user && user.admin));
    var canManageDept = !!(OC.can && OC.can.manageDepartments ? OC.can.manageDepartments(user) : (user && user.admin));
    var canEditAnyAccount = users.some(function (u) { return OC.can && OC.can.editAccount && OC.can.editAccount(user, u); });

    OC.ui.clear(host);

    var content = [];

    if (activeTab === 'groups') {
      /* ---- Fullscreen Groups & Discussions Header with Corner Back Button ---- */
      var fullscreenHead = h('div', { class: 'groups-fullscreen-header' }, [
        h('button', {
          class: 'groups-back-btn',
          type: 'button',
          title: 'Return to Management workspace',
          onClick: function () {
            activeTab = 'departments';
            syncTabToUrl();
            render(host, rerender);
          }
        }, ['← Back to Management']),
        h('div', { class: 'row', style: 'align-items:center;gap:8px;' }, [
          h('span', { class: 'row', style: 'font-weight:700;font-size:14px;color:var(--ink);gap:7px;' }, [OC.icon('chat'), 'Groups & Discussions']),
          h('span', { class: 'chip group' }, allGroups.length + ' channels')
        ])
      ]);

      var groupsSection = h('div', { class: 'activities-section', id: 'activities-groups-sec', style: 'margin-bottom:8px;' });
      var groupsHost = h('div', { class: 'groups-sub-host' });
      if (OC.groups && OC.groups.render) {
        OC.groups.render(groupsHost, function () { render(host, rerender); }, true);
      }
      groupsSection.appendChild(groupsHost);
      content.push(fullscreenHead, groupsSection);
    } else {
      /* ---- Standard Management Header & Sub-Navigation ---- */
      var pageHead = h('div', { class: 'page-head' }, [
        h('h1', {}, 'Management'),
        h('p', {}, 'Centralized team collaboration & organization hub: departments, member accounts, analytics, and history logs.')
      ]);

      var tabs = [
        ['departments', 'Departments (' + depts.length + ')'],
        ['accounts', 'Team Accounts (' + users.length + ')'],
        ['reports', 'Work Reports & Analytics'],
        ['history', 'History & Audit Logs (' + allAudit.length + ')']
      ];
      if (pending.length) {
        tabs.push(['invites', 'Pending Invites (' + pending.length + ')']);
      }

      var subNavSegment = h('div', {
        class: 'segmented activities-tabs',
        role: 'group',
        'aria-label': 'Filter Management section'
      }, tabs.map(function (opt) {
        return h('button', {
          type: 'button',
          'aria-pressed': String(activeTab === opt[0]),
          onClick: function () {
            activeTab = opt[0];
            syncTabToUrl();
            render(host, rerender);
          }
        }, opt[1]);
      }));

      var subNavRow = h('div', { class: 'activities-subnav-row' }, [
        subNavSegment
      ]);

      content.push(pageHead, subNavRow);
    }

    /* ---- Section B: Departments ---- */
    if (activeTab === 'departments') {
      var deptSection = h('div', { class: 'activities-section', id: 'activities-depts-sec', style: 'margin-bottom:32px;' }, [
        h('div', { class: 'row', style: 'align-items:center;margin-bottom:12px;' }, [
          h('h2', { class: 'section-head', style: 'margin:0;' }, [
            'Departments',
            h('span', { class: 'chip count' }, depts.length + ' total')
          ]),
          canManageDept
            ? h('button', {
                class: 'btn small push', type: 'button',
                onClick: function () {
                  if (OC.people && OC.people.newDepartment) {
                    OC.people.newDepartment(function () { render(host, rerender); });
                  }
                }
              }, [OC.icon('plus'), 'New department'])
            : null
        ]),
        h('div', { class: 'dept-cards-list' }, depts.map(function (d) {
          var members = users.filter(function (u) { return OC.can && OC.can.inDept && OC.can.inDept(u, d.id); });
          return h('div', { class: 'card dept-card' }, [
            /* one header row: name, count and level chips on the left,
               management actions on the right — a full-width card has room
               for all of it on one line instead of stacking three rows */
            h('div', { class: 'dept-card-head' }, [
              h('div', { class: 'dept-card-head-left' }, [
                h('h3', { class: 'dept-card-name' }, d.name),
                h('span', { class: 'chip custom push' }, members.length + ' people'),
                h('div', { class: 'dept-card-levels' }, (function () {
                  var lvs = (Array.isArray(d.levels) && d.levels.length) ? d.levels.slice() : ['head', 'member', 'intern'];
                  if (!lvs.some(function (l) { return String(l).toLowerCase().trim() === 'intern' || String(l).trim() === 'ইন্টান'; })) {
                    lvs.push('intern');
                    if (Array.isArray(d.levels) && d.levels.indexOf('intern') === -1) {
                      d.levels.push('intern');
                      if (OC.store && typeof OC.store.save === 'function') OC.store.save();
                    }
                  }
                  return lvs.map(function (lv, i) {
                    var rc = (OC.can && OC.can.roleClass) ? OC.can.roleClass(lv) : '';
                    return h('span', { class: 'chip ' + (rc || (i === 0 ? 'role-head' : (i === 1 ? 'role-member' : 'role-intern'))) }, (i + 1) + '. ' + lv);
                  });
                })())
              ]),
              canManageDept
                ? h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;' }, [
                    h('button', {
                      class: 'btn small', type: 'button',
                      onClick: function () {
                        if (OC.people && OC.people.editDepartment) {
                          OC.people.editDepartment(d);
                        }
                      }
                    }, [OC.icon('edit'), 'Edit department']),
                    (user && user.admin)
                      ? h('button', {
                          class: 'btn small primary', type: 'button',
                          onClick: function () {
                            if (OC.people && OC.people.addPersonToDepartment) {
                              OC.people.addPersonToDepartment(d, function () { render(host, rerender); });
                            }
                          }
                        }, [OC.icon('plus'), 'Add person'])
                      : null
                  ].filter(Boolean))
                : null
            ]),
            h('div', { class: 'dept-card-members' }, members.length ? members.map(function (u) {
              var uLevel = OC.can.levelIn(u, d.id);
              var rc = (OC.can && OC.can.roleClass) ? OC.can.roleClass(uLevel) : '';
              return h('div', { class: 'dept-member-pill' }, [
                OC.ui.person(u.id),
                h('span', { class: 'chip role ' + rc }, uLevel),
                u.status === 'invited' ? h('span', { class: 'chip overdue' }, 'invited') : null,
                (OC.can && OC.can.editAccount && OC.can.editAccount(user, u))
                  ? h('button', {
                      class: 'btn small', type: 'button',
                      style: 'padding:2px 8px;font-size:11.5px;',
                      onClick: function () {
                        if (OC.profilePortal && OC.profilePortal.openForUser) {
                          OC.profilePortal.openForUser(u);
                        } else if (OC.people && OC.people.editAccount) {
                          OC.people.editAccount(u);
                        }
                      }
                    }, 'Edit')
                  : null,
                (user && user.admin)
                  ? h('button', {
                      class: 'btn small danger',
                      type: 'button',
                      style: 'padding:2px 7px;font-size:11.5px;',
                      title: 'Remove ' + u.name + ' from ' + d.name,
                      onClick: function () {
                        if (OC.people && OC.people.removePersonFromDepartment) {
                          OC.people.removePersonFromDepartment(u, d, function () { render(host, rerender); });
                        }
                      }
                    }, OC.icon('close'))
                  : null
              ].filter(Boolean));
            }) : [h('p', { class: 'muted', style: 'font-size:12.5px;margin:0;' }, 'No members yet.')])
          ]);
        }))
      ]);
      content.push(deptSection);
    }

    /* ---- Section B: Team Accounts Directory ---- */
    if (activeTab === 'all' || activeTab === 'accounts') {
      var accountsSection = h('div', { class: 'activities-section', style: 'margin-bottom:32px;' }, [
        h('div', { class: 'row', style: 'align-items:center;margin-bottom:12px;gap:8px;' }, [
          h('h2', { class: 'section-head', style: 'margin:0;' }, [
            'Team Accounts Directory',
            h('span', { class: 'chip count' }, users.length + ' accounts')
          ]),
          h('div', { class: 'row push', style: 'gap:8px;' }, [
            canInvite
              ? h('button', {
                  class: 'btn small primary', type: 'button',
                  onClick: function () {
                    if (OC.people && OC.people.invite) {
                      OC.people.invite(function () { render(host, rerender); });
                    }
                  }
                }, [OC.icon('plus'), 'Invite member'])
              : null,
            h('button', {
              class: 'btn small', type: 'button',
              onClick: function () {
                if (OC.people && OC.people.editPrefs) OC.people.editPrefs();
              }
            }, [OC.icon('bell'), 'Notification preferences'])
          ].filter(Boolean))
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
              canEditAnyAccount ? h('th', { scope: 'col', style: 'text-align:right;' }, 'Actions') : null
            ].filter(Boolean))),
            h('tbody', {}, users.map(function (u) {
              var rLbl = OC.can.roleLabel(u);
              var rc = (OC.can && OC.can.roleClass) ? OC.can.roleClass(rLbl) : '';
              return h('tr', {}, [
                h('th', { scope: 'row' }, OC.ui.person(u.id)),
                h('td', { class: 'muted' }, u.title || '—'),
                h('td', {}, h('span', { class: 'chip role ' + rc }, rLbl)),
                h('td', {}, (u.departments && u.departments.length)
                  ? u.departments.map(function (m) {
                      var mrc = (OC.can && OC.can.roleClass) ? OC.can.roleClass(m.level) : '';
                      return h('span', { class: 'chip ' + (mrc || 'custom'), style: 'margin-right:4px' },
                        (OC.store.department(m.department) || {}).name + ' · ' + m.level);
                    })
                  : (u.admin
                      ? h('span', { class: 'muted' }, 'leadership tier, every department')
                      : h('span', { class: 'muted' }, 'No department (customize in edit)'))),
                h('td', { class: 'mono' }, u.status || 'active'),
                canEditAnyAccount ? h('td', { style: 'text-align:right;' }, [
                  (OC.can && OC.can.editAccount && OC.can.editAccount(user, u))
                    ? h('button', {
                        class: 'btn small', type: 'button',
                        onClick: function () {
                          if (OC.profilePortal && OC.profilePortal.openForUser) {
                            OC.profilePortal.openForUser(u);
                          } else if (OC.people && OC.people.editAccount) {
                            OC.people.editAccount(u);
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
      content.push(accountsSection);
    }

    /* ---- Section D: Work Reports & Analytics ---- */
    if (activeTab === 'reports') {
      var reportsSection = h('div', { class: 'activities-section', id: 'activities-reports-sec', style: 'margin-bottom:32px;' }, [
        h('div', { class: 'row', style: 'align-items:center;margin-bottom:12px;' }, [
          h('h2', { class: 'section-head', style: 'margin:0;' }, 'Work Reports & Analytics')
        ])
      ]);
      var reportsHost = h('div', { class: 'reports-sub-host' });
      if (OC.reports && OC.reports.render) {
        OC.reports.render(reportsHost, function () { render(host, rerender); }, true);
      }
      reportsSection.appendChild(reportsHost);
      content.push(reportsSection);
    }

    /* ---- Section E: Pending Invites (if any) ---- */
    if (activeTab === 'invites' && pending.length) {
      var invitesSection = h('div', { class: 'activities-section', style: 'margin-bottom:32px;' }, [
        h('h2', { class: 'section-head' }, [
          'Pending Invites',
          h('span', { class: 'chip count' }, pending.length + ' awaiting')
        ]),
        h('p', { class: 'muted', style: 'font-size:13.5px;margin-bottom:12px;max-width:74ch;' },
          'Single-use links that expire 72 hours after issue. Unclaimed invites can be resent or revoked by whoever sent them or system admin.'
        )
      ]);

      var invitesGrid = h('div', { class: 'grid-2' }, pending.map(function (u) {
        var inv = u.invite;
        return h('div', { class: 'card' }, [
          h('div', { class: 'row' }, [
            h('h3', {}, u.name),
            h('span', { class: 'chip overdue push' }, 'unclaimed')
          ]),
          h('p', { class: 'muted', style: 'font-size:13px;margin:6px 0 10px;' }, 'Email: ' + u.email + ' · ' + u.title),
          h('div', { class: 'row', style: 'font-size:12.5px;align-items:center;' }, [
            h('span', { class: 'chip custom' }, 'Expires ' + OC.ui.fmtWhen(inv.expires_at)),
            h('button', {
              class: 'btn small push', type: 'button',
              onClick: function () {
                var link = location.origin + location.pathname + '#claim=' + inv.token;
                OC.ui.copyText(link, 'Invite link copied to clipboard.');
              }
            }, 'Copy link'),
            h('button', {
              class: 'btn small danger', type: 'button', style: 'margin-left:6px;',
              onClick: function () {
                OC.ui.confirm('Revoke invite for ' + u.name + '?', function () {
                  OC.store.mutate({ actor: user.id, action: 'invite.revoke', target: u.name }, function () {
                    OC.store.state.users = OC.store.state.users.filter(function (x) { return x.id !== u.id; });
                  });
                  OC.ui.toast('Invite revoked.');
                  render(host, rerender);
                });
              }
            }, 'Revoke')
          ])
        ]);
      }));

      invitesSection.appendChild(invitesGrid);
      content.push(invitesSection);
    }

    /* ---- Section F: History & Audit Logs (Dedicated History View) ---- */
    if (activeTab === 'history') {
      var allLogs = allAudit;
      var filteredAudit = allLogs.filter(function (a) {
        if (!auditSearchQuery) return true;
        var q = auditSearchQuery.toLowerCase();
        var actorName = OC.ui.personName(a.actor).toLowerCase();
        var action = (a.action || '').toLowerCase();
        var target = (a.target || '').toLowerCase();
        var detail = (a.detail || '').toLowerCase();
        var ip = (a.ip || '').toLowerCase();
        return actorName.indexOf(q) > -1 || action.indexOf(q) > -1 || target.indexOf(q) > -1 || detail.indexOf(q) > -1 || ip.indexOf(q) > -1;
      });

      var visibleAudit = auditLimit === 'all' ? filteredAudit : filteredAudit.slice(0, auditLimit);

      var historySection = h('div', { class: 'activities-section', id: 'activities-history-sec', style: 'margin-bottom:32px;' }, [
        h('div', { class: 'portal-header-box', style: 'margin-bottom:16px;' }, [
          h('div', {}, [
            h('h2', { class: 'portal-view-title', style: 'margin:0;font-size:18px;' }, [
              'System History & Audit Logs',
              h('span', { class: 'chip count', style: 'margin-left:8px;' }, filteredAudit.length + ' events')
            ]),
            h('p', { class: 'muted', style: 'font-size:13px;margin:3px 0 0;' },
              'Comprehensive historical audit trail of all system operations, task changes, client updates, and team activity.')
          ]),
          h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center;' }, [
            h('div', { class: 'segmented', role: 'group', 'aria-label': 'Limit logs' }, [
              h('button', {
                type: 'button',
                'aria-pressed': String(auditLimit !== 'all'),
                onClick: function () {
                  if (auditLimit === 'all') auditLimit = 20;
                  else auditLimit += 20;
                  render(host, rerender);
                }
              }, auditLimit === 'all' ? 'Show 20' : 'See 20+'),
              h('button', {
                type: 'button',
                'aria-pressed': String(auditLimit === 'all'),
                onClick: function () {
                  auditLimit = 'all';
                  render(host, rerender);
                }
              }, 'See All (' + filteredAudit.length + ')')
            ]),
            h('button', {
              class: 'btn small primary',
              type: 'button',
              style: 'font-weight:700;',
              onClick: function () {
                if (OC.reports && OC.reports.exportAudit) {
                  OC.reports.exportAudit(filteredAudit);
                }
              }
            }, [OC.icon('board'), 'Export History CSV'])
          ])
        ]),

        /* Search Filter */
        h('div', { class: 'row', style: 'margin-bottom:14px;' }, [
          h('input', {
            type: 'search',
            placeholder: 'Search history log by actor name, action, target, IP address...',
            value: auditSearchQuery,
            style: 'width:100%;max-width:480px;',
            onInput: function (e) {
              auditSearchQuery = e.target.value.trim();
              /* this rebuilds the page, and the box being typed in with it, so
                 the caret has to be carried across or every keystroke drops
                 focus and the next one goes nowhere */
              OC.ui.keepingPlace(host, function () { render(host, rerender); });
            }
          })
        ]),

        /* Table */
        h('div', { class: 'tablewrap' }, [
          h('table', {}, [
            h('thead', {}, h('tr', {}, [
              h('th', { scope: 'col', style: 'width:140px;' }, 'When'),
              h('th', { scope: 'col', style: 'width:180px;' }, 'Actor'),
              h('th', { scope: 'col', style: 'width:130px;' }, 'IP Address'),
              h('th', { scope: 'col', style: 'width:170px;' }, 'Action'),
              h('th', { scope: 'col' }, 'Target'),
              h('th', { scope: 'col' }, 'Detail')
            ])),
            h('tbody', {}, visibleAudit.length ? visibleAudit.map(function (a) {
              return h('tr', {}, [
                h('td', { class: 'mono', style: 'font-size:12px;' }, OC.ui.fmtWhen(a.at)),
                h('td', {}, OC.ui.person(a.actor)),
                h('td', { class: 'mono', style: 'font-size:11.5px;' }, a.ip ? h('span', { class: 'chip mono' }, a.ip) : h('span', { class: 'muted' }, '127.0.0.1')),
                h('td', {}, h('span', { class: 'chip custom', style: 'font-size:11px;font-family:var(--font-mono);' }, a.action || 'system.event')),
                h('td', { style: 'font-weight:600;' }, a.target || '—'),
                h('td', { class: 'muted', style: 'font-size:12.5px;' }, a.detail || '—')
              ]);
            }) : [
              h('tr', {}, h('td', { colspan: '6', class: 'muted', style: 'text-align:center;padding:32px;' }, 'No historical log entries matching your search.'))
            ])
          ])
        ])
      ]);

      content.push(historySection);
    }

    OC.ui.append(host, content);
  }

  return {
    render: render
  };
})();
