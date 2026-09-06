/* =========================================================================
   Originate Command · Foundation
   Standing operational principles, department standards, and core policies
   for the workspace, categorized and filterable by department and keyword.
   ========================================================================= */

window.OC = window.OC || {};

OC.policy = (function () {
  'use strict';

  var selectedDept = 'all_rules'; // 'all_rules', 'all' (company-wide), or department id ('d-web', etc.)
  var searchQuery = '';
  var lastHost = null;

  var SEED_POLICIES = [
    {
      id: 'pol-conduct',
      title: 'Code of Conduct & Workplace Respect',
      category: 'General Conduct',
      department: 'all',
      body: 'All team members are expected to maintain professional integrity, mutual respect, and constructive communication across all channels. Harassment, discrimination, or abusive conduct of any form is strictly prohibited.',
      created_by: 'u-shohag',
      created_at: '2026-01-01T08:00:00.000Z'
    },
    {
      id: 'pol-confidentiality',
      title: 'Data Privacy & Client Confidentiality',
      category: 'Information Security',
      department: 'all',
      body: 'Client data, system credentials, API tokens, internal databases, and business operational materials are strictly confidential. Never store credentials in unencrypted or shared spaces, and never disclose client details without explicit authorization.',
      created_by: 'u-shohag',
      created_at: '2026-01-01T08:00:00.000Z'
    },
    {
      id: 'pol-transparency',
      title: 'Daily Communication & Status Transparency',
      category: 'Workspace Operations',
      department: 'all',
      body: 'Every team member must report daily progress via the Unified Board or group channels, log work hours accurately, and promptly raise blockers or timeline risks.',
      created_by: 'u-fuad',
      created_at: '2026-01-01T08:00:00.000Z'
    },
    {
      id: 'pol-web-qa',
      title: 'Code Quality & Automated Verification',
      category: 'Engineering Standards',
      department: 'd-web',
      body: 'All new features and bug fixes must include automated test coverage and pass the full test suite with zero failures before deployment. Unverified code must never reach production.',
      created_by: 'u-fuad',
      created_at: '2026-01-02T09:00:00.000Z'
    },
    {
      id: 'pol-web-git',
      title: 'Git Workflow & Deployment Protocol',
      category: 'Engineering Standards',
      department: 'd-web',
      body: 'Commit frequently with atomic, descriptive messages. Pull requests must be reviewed, and production rollouts verified healthy immediately post-deployment.',
      created_by: 'u-fuad',
      created_at: '2026-01-02T09:00:00.000Z'
    },
    {
      id: 'pol-admin-punch',
      title: 'Daily Attendance & Punch Time Policy',
      category: 'HR & Attendance',
      department: 'd-admin',
      body: 'Team members must punch in when beginning work shifts and punch out when taking breaks or concluding shifts. Late punch-ins require brief managerial notification.',
      created_by: 'u-shohag',
      created_at: '2026-01-03T09:00:00.000Z'
    },
    {
      id: 'pol-admin-leave',
      title: 'Formal Leave Application Guidelines',
      category: 'HR & Attendance',
      department: 'd-admin',
      body: 'Planned leaves should be submitted through the Employee Portal at least 48 hours in advance for managerial approval. Emergency leaves must be reported as soon as possible.',
      created_by: 'u-shohag',
      created_at: '2026-01-03T09:00:00.000Z'
    },
    {
      id: 'pol-bizops-sla',
      title: 'Client SLA & Incident Response Protocol',
      category: 'Client Operations',
      department: 'd-bizops',
      body: 'All incoming client inquiries during active business hours must be acknowledged within 30 minutes, with resolution timelines communicated proactively.',
      created_by: 'u-shohag',
      created_at: '2026-01-04T09:00:00.000Z'
    },
    {
      id: 'pol-leadgen-quality',
      title: 'Lead Data Verification Standard',
      category: 'Quality Control',
      department: 'd-leadgen',
      body: 'Every generated lead must be verified for active contact details, domain validity, and targeted ICP criteria before being handed off to outreach teams.',
      created_by: 'u-shohag',
      created_at: '2026-01-04T09:00:00.000Z'
    },
    {
      id: 'pol-outreach-compliance',
      title: 'Outreach Compliance & Frequency',
      category: 'Compliance',
      department: 'd-outreach',
      body: 'Outreach campaigns must comply with CAN-SPAM and anti-spam regulations. Opt-out requests must be honored immediately with global exclusion lists updated.',
      created_by: 'u-shohag',
      created_at: '2026-01-05T09:00:00.000Z'
    },
    {
      id: 'pol-social-brand',
      title: 'Brand Identity & Content Review Policy',
      category: 'Branding & Social',
      department: 'd-social',
      body: 'All public social media posts, visual assets, and public statements must strictly align with brand guidelines and undergo lead review before publication.',
      created_by: 'u-shohag',
      created_at: '2026-01-05T09:00:00.000Z'
    }
  ];

  function me() {
    return (OC.store && OC.store.user && OC.store.user(OC.store.session && OC.store.session())) ||
      (OC.store && OC.store.state && OC.store.state.users && OC.store.state.users[0]) ||
      { id: '', name: 'User', admin: false };
  }

  function getPolicies() {
    if (OC.store && OC.store.state) {
      if (!Array.isArray(OC.store.state.policies) || OC.store.state.policies.length === 0) {
        OC.store.state.policies = SEED_POLICIES.map(function (p) {
          return Object.assign({}, p);
        });
        if (typeof OC.store.save === 'function') OC.store.save();
      } else {
        // Ensure baseline seed policies are always included
        var existingIds = {};
        OC.store.state.policies.forEach(function (p) { existingIds[p.id] = true; });
        SEED_POLICIES.forEach(function (sp) {
          if (!existingIds[sp.id]) {
            OC.store.state.policies.push(Object.assign({}, sp));
            existingIds[sp.id] = true;
          }
        });
      }
      return OC.store.state.policies;
    }
    return SEED_POLICIES.map(function (p) { return Object.assign({}, p); });
  }

  function deptName(deptId) {
    if (!deptId || deptId === 'all') return 'Company-wide';
    if (OC.store && OC.store.department) {
      var d = OC.store.department(deptId);
      if (d && d.name) return d.name;
    }
    return deptId;
  }

  function openPolicyModal(existingRule) {
    var h = OC.ui.h;
    var user = me();
    var canManage = Boolean(user && (user.admin || (OC.can && OC.can.isSystemAdmin && OC.can.isSystemAdmin(user))));
    if (!canManage) {
      if (OC.ui && typeof OC.ui.toast === 'function') {
        OC.ui.toast('Only System Admins can add or edit foundation rules.');
      }
      return;
    }
    var isEdit = Boolean(existingRule);
    var depts = (OC.store && OC.store.state && OC.store.state.departments) || [];

    var titleInput = h('input', {
      type: 'text',
      placeholder: 'e.g. Code Review & Verification Standard',
      value: existingRule ? existingRule.title : '',
      style: 'width:100%;'
    });

    var deptSelect = h('select', { style: 'width:100%;' }, [
      h('option', { value: 'all' }, 'Company-wide (All Departments)')
    ].concat(depts.map(function (d) {
      return h('option', { value: d.id }, d.name);
    })));

    if (existingRule && existingRule.department) {
      deptSelect.value = existingRule.department;
    } else if (selectedDept && selectedDept !== 'all_rules') {
      deptSelect.value = selectedDept;
    }

    var categoryInput = h('input', {
      type: 'text',
      placeholder: 'e.g. Engineering Standards, Security, HR & Attendance',
      value: existingRule ? (existingRule.category || '') : '',
      style: 'width:100%;'
    });

    var bodyInput = h('textarea', {
      rows: 6,
      placeholder: 'Enter clear, actionable guidelines and standing policy rules for the team...',
      style: 'width:100%;resize:vertical;font-family:inherit;'
    }, existingRule ? existingRule.body : '');

    var form = h('div', { style: 'display:flex;flex-direction:column;gap:14px;' }, [
      OC.ui.field('Rule Title', titleInput),
      OC.ui.field('Department', deptSelect),
      OC.ui.field('Category / Tag', categoryInput),
      OC.ui.field('Rule Content & Guidelines', bodyInput)
    ]);

    OC.ui.modal({
      title: isEdit ? 'Edit Foundation Rule' : 'New Foundation Rule',
      content: form,
      actions: [
        {
          label: 'Cancel',
          onClick: function (close) { close(); }
        },
        {
          label: isEdit ? 'Save Changes' : 'Create Rule',
          primary: true,
          onClick: function (close) {
            var title = titleInput.value.trim();
            var body = bodyInput.value.trim();
            var cat = categoryInput.value.trim() || 'General';
            var dept = deptSelect.value || 'all';

            if (!title) return 'Please enter a rule title.';
            if (!body) return 'Please enter the rule content.';

            var policies = getPolicies();
            if (isEdit) {
              existingRule.title = title;
              existingRule.department = dept;
              existingRule.category = cat;
              existingRule.body = body;
              existingRule.updated_at = new Date().toISOString();

              if (OC.store && typeof OC.store.mutate === 'function') {
                OC.store.mutate({
                  actor: user.id,
                  action: 'foundation.update',
                  target: title,
                  detail: 'Updated foundation rule for ' + deptName(dept)
                });
              } else {
                if (OC.store && typeof OC.store.save === 'function') OC.store.save();
                if (OC.store && typeof OC.store.emit === 'function') OC.store.emit();
              }
              OC.ui.toast('Foundation rule updated.');
            } else {
              var newId = (OC.store && typeof OC.store.uid === 'function') ? OC.store.uid('pol') : ('pol-' + Date.now());
              var newRule = {
                id: newId,
                title: title,
                department: dept,
                category: cat,
                body: body,
                created_by: user.id || 'u-user',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              policies.unshift(newRule);

              if (OC.store && typeof OC.store.mutate === 'function') {
                OC.store.mutate({
                  actor: user.id,
                  action: 'foundation.create',
                  target: title,
                  detail: 'Created new foundation rule for ' + deptName(dept)
                });
              } else {
                if (OC.store && typeof OC.store.save === 'function') OC.store.save();
                if (OC.store && typeof OC.store.emit === 'function') OC.store.emit();
              }
              OC.ui.toast('New foundation rule added.');
            }

            close();
            if (lastHost) render(lastHost);
          }
        }
      ]
    });
  }

  function confirmDelete(rule) {
    var user = me();
    var canManage = Boolean(user && (user.admin || (OC.can && OC.can.isSystemAdmin && OC.can.isSystemAdmin(user))));
    if (!canManage) {
      if (OC.ui && typeof OC.ui.toast === 'function') {
        OC.ui.toast('Only System Admins can delete foundation rules.');
      }
      return;
    }
    OC.ui.confirm('Are you sure you want to delete the foundation rule "' + rule.title + '"?', function () {
      var policies = getPolicies();
      var idx = -1;
      for (var i = 0; i < policies.length; i++) {
        if (policies[i].id === rule.id) {
          idx = i;
          break;
        }
      }
      if (idx > -1) {
        policies.splice(idx, 1);
        if (OC.store && typeof OC.store.mutate === 'function') {
          OC.store.mutate({
            actor: user.id,
            action: 'foundation.delete',
            target: rule.title,
            detail: 'Deleted foundation rule: ' + rule.title
          });
        } else {
          if (OC.store && typeof OC.store.save === 'function') OC.store.save();
          if (OC.store && typeof OC.store.emit === 'function') OC.store.emit();
        }
        OC.ui.toast('Rule deleted.');
        if (lastHost) render(lastHost);
      }
    });
  }

  function render(host) {
    lastHost = host;
    var h = OC.ui.h;
    var user = me();
    var canManage = Boolean(user && (user.admin || (OC.can && OC.can.isSystemAdmin && OC.can.isSystemAdmin(user))));
    var allPolicies = getPolicies();
    var depts = (OC.store && OC.store.state && OC.store.state.departments) || [];

    // Filter rules based on selected department and search query
    var visiblePolicies = allPolicies.filter(function (rule) {
      // 1. Department filter
      if (selectedDept === 'all') {
        if (rule.department && rule.department !== 'all') return false;
      } else if (selectedDept !== 'all_rules') {
        if (rule.department !== selectedDept) return false;
      }

      // 2. Search query filter
      var cleanQ = searchQuery ? searchQuery.toLowerCase().trim() : '';
      if (cleanQ) {
        var dName = deptName(rule.department).toLowerCase();
        var t = (rule.title || '').toLowerCase();
        var b = (rule.body || '').toLowerCase();
        var c = (rule.category || '').toLowerCase();
        if (t.indexOf(cleanQ) === -1 && b.indexOf(cleanQ) === -1 && c.indexOf(cleanQ) === -1 && dName.indexOf(cleanQ) === -1) {
          return false;
        }
      }

      return true;
    });

    // Department tabs data
    var deptTabs = [
      { id: 'all_rules', name: 'All Foundation Rules', count: allPolicies.length },
      { id: 'all', name: 'Company-wide', count: allPolicies.filter(function (r) { return !r.department || r.department === 'all'; }).length }
    ].concat(depts.map(function (d) {
      return {
        id: d.id,
        name: d.name,
        count: allPolicies.filter(function (r) { return r.department === d.id; }).length
      };
    }));

    // Search Box
    var searchInput = h('input', {
      type: 'search',
      placeholder: 'Search foundation rules by title, keyword, department...',
      value: searchQuery,
      'aria-label': 'Search foundation rules',
      style: 'width:100%;padding-left:34px;height:36px;border-radius:8px;',
      onInput: function (e) {
        searchQuery = e.target.value;
        OC.ui.keepingPlace(host, function () { render(host); });
      }
    });

    var searchWrapper = h('div', {
      style: 'position:relative;flex:1;min-width:280px;max-width:560px;'
    }, [
      h('span', {
        style: 'position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--text-dim,#888);display:flex;align-items:center;'
      }, [OC.icon('search')]),
      searchInput,
      searchQuery ? h('button', {
        class: 'iconbtn',
        type: 'button',
        title: 'Clear search',
        style: 'position:absolute;right:6px;top:50%;transform:translateY(-50%);padding:3px;',
        onClick: function () {
          searchQuery = '';
          render(host);
        }
      }, [OC.icon('close')]) : null
    ]);

    // Department Pills
    var deptFilterBar = h('div', {
      class: 'segmented foundation-dept-pills',
      role: 'group',
      'aria-label': 'Filter by department',
      style: 'max-width:100%;overflow-x:auto;display:inline-flex;gap:4px;padding:4px;'
    }, deptTabs.map(function (tab) {
      var isActive = (selectedDept === tab.id);
      return h('button', {
        type: 'button',
        'aria-pressed': String(isActive),
        onClick: function () {
          selectedDept = tab.id;
          render(host);
        },
        style: 'display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:0 12px;height:32px;'
      }, [
        h('span', {}, tab.name),
        h('span', {
          style: 'padding:1px 6px;border-radius:9999px;font-size:10.5px;font-weight:700;' +
            (isActive ? 'background:rgba(255,255,255,0.25);color:#fff;' : 'background:rgba(255,255,255,0.08);color:var(--text-dim,#94A3B8);')
        }, String(tab.count))
      ]);
    }));

    // Stats indicator
    var statsText = 'Showing ' + visiblePolicies.length + ' of ' + allPolicies.length + ' foundation rules';
    if (selectedDept !== 'all_rules') {
      statsText += ' · Department: ' + deptName(selectedDept);
    }
    var trimmedSearch = searchQuery ? searchQuery.trim() : '';
    if (trimmedSearch) {
      statsText += ' · Filtered by "' + trimmedSearch + '"';
    }

    var statsRow = h('div', {
      style: 'display:flex;align-items:center;justify-content:space-between;margin:4px 0 14px 0;font-size:12.5px;color:var(--text-dim,#94a3b8);'
    }, [
      h('span', {}, statsText),
      (trimmedSearch || selectedDept !== 'all_rules') ? h('button', {
        class: 'btn small ghost',
        type: 'button',
        style: 'font-size:11.5px;padding:2px 8px;',
        onClick: function () {
          searchQuery = '';
          selectedDept = 'all_rules';
          render(host);
        }
      }, 'Reset filters') : null
    ]);

    // Cards Container
    var cardsContainer;
    if (!visiblePolicies.length) {
      cardsContainer = h('div', { class: 'empty', style: 'padding:48px 24px;text-align:center;' }, [
        OC.icon('file'),
        h('div', { style: 'font-weight:600;font-size:15px;margin-top:10px;' }, 'No foundation rules found'),
        h('div', { style: 'font-size:13px;color:var(--text-dim,#94a3b8);margin-top:4px;' },
          trimmedSearch
            ? 'No rules match your search query "' + trimmedSearch + '". Try refining your keywords.'
            : ('No foundation rules have been created for ' + deptName(selectedDept) + ' yet.'))
      ]);
    } else {
      cardsContainer = h('div', {
        class: 'foundation-grid',
        style: 'display:grid;grid-template-columns:repeat(auto-fill, minmax(340px, 1fr));gap:16px;'
      }, visiblePolicies.map(function (rule) {
        var isCompany = (!rule.department || rule.department === 'all');
        var deptChip = isCompany
          ? h('span', {
              class: 'chip dept',
              style: 'background:rgba(59, 130, 246, 0.16);color:#60a5fa;border:1px solid rgba(59, 130, 246, 0.3);font-weight:600;'
            }, 'Company-wide')
          : OC.ui.deptChip(rule.department);

        var catBadge = h('span', {
          class: 'chip custom',
          style: 'font-size:11px;font-weight:600;background:rgba(255,255,255,0.06);'
        }, rule.category || 'General');

        var actionBtns = canManage ? h('div', { class: 'foundation-rule-actions', style: 'display:flex;align-items:center;gap:4px;margin-left:auto;' }, [
          h('button', {
            class: 'iconbtn',
            type: 'button',
            title: 'Edit Rule',
            style: 'padding:4px;',
            onClick: function () { openPolicyModal(rule); }
          }, [OC.icon('edit')]),
          h('button', {
            class: 'iconbtn',
            type: 'button',
            title: 'Delete Rule',
            style: 'padding:4px;color:var(--danger,#ef4444);',
            onClick: function () { confirmDelete(rule); }
          }, [OC.icon('trash')])
        ]) : null;

        var headerRow = h('div', {
          style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;'
        }, [
          deptChip,
          catBadge,
          actionBtns
        ]);

        var titleEl = h('h3', {
          style: 'margin:8px 0 6px 0;font-size:15.5px;font-weight:700;color:var(--ink,#fff);line-height:1.35;'
        }, rule.title);

        var bodyEl = h('div', {
          style: 'font-size:13.5px;line-height:1.6;color:var(--text,#cbd5e1);white-space:pre-wrap;flex:1;'
        }, rule.body);

        var authorName = OC.ui.personName ? OC.ui.personName(rule.created_by) : (rule.created_by || 'Admin');
        var timeLabel = OC.ui.fmtWhen ? OC.ui.fmtWhen(rule.created_at) : '';

        var footerRow = h('div', {
          style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;border-top:1px solid var(--rule, rgba(255,255,255,0.08));font-size:12px;color:var(--text-dim,#94a3b8);margin-top:auto;'
        }, [
          h('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
            OC.ui.mark ? OC.ui.mark(rule.created_by) : null,
            h('span', {}, authorName)
          ]),
          timeLabel ? h('span', { class: 'mono', style: 'font-size:11px;' }, timeLabel) : null
        ]);

        return h('div', {
          class: 'card foundation-card',
          style: 'display:flex;flex-direction:column;gap:10px;padding:16px 18px;border-radius:10px;'
        }, [
          headerRow,
          titleEl,
          bodyEl,
          footerRow
        ]);
      }));
    }

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head', style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;' }, [
        h('div', { style: 'flex:1;min-width:240px;' }, [
          h('h1', {}, 'Foundation'),
          h('p', {}, 'Standing operational principles, department standards, and core policies for the team. You are seeing this as ' +
            user.name + ' (' + (OC.can && OC.can.roleLabel ? OC.can.roleLabel(user) : (user.admin ? 'System Admin' : 'Member')) + ').')
        ]),
        canManage ? h('div', { class: 'page-head-actions' }, [
          h('button', {
            class: 'btn primary',
            type: 'button',
            id: 'foundation-new-rule-btn',
            style: 'display:inline-flex;align-items:center;gap:6px;font-weight:700;',
            onClick: function () { openPolicyModal(); }
          }, [OC.icon('plus'), 'New foundation rule'])
        ]) : null
      ]),

      h('div', { class: 'foundation-toolbar', style: 'display:flex;flex-direction:column;gap:14px;margin-bottom:16px;' }, [
        h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;' }, [
          searchWrapper
        ]),
        h('div', { style: 'display:flex;flex-direction:column;gap:6px;' }, [
          h('div', { style: 'font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-dim,#94a3b8);' }, 'Department Filter:'),
          deptFilterBar
        ])
      ]),

      statsRow,
      cardsContainer
    ]);
  }

  return {
    render: render,
    getPolicies: getPolicies,
    setDepartmentFilter: function (dept) {
      selectedDept = dept;
    },
    getDepartmentFilter: function () {
      return selectedDept;
    },
    setSearchQuery: function (query) {
      searchQuery = query;
    },
    getSearchQuery: function () {
      return searchQuery;
    },
    openPolicyModal: openPolicyModal,
    SEED_POLICIES: SEED_POLICIES
  };
})();
