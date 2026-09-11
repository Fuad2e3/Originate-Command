/* =========================================================================
   Originate Command · Foundation
   Standing operational principles, department standards, and core policies
   for the workspace, categorized and filterable by department and keyword.
   ========================================================================= */

window.OC = window.OC || {};

OC.policy = (function () {
  'use strict';

  var selectedDept = 'all_rules'; // 'all_rules' or department id ('d-web', etc.)
  var selectedCategory = 'all_categories'; // 'all_categories' or category name
  var searchQuery = '';
  var lastHost = null;

  /* No seed/demo policies — Foundation starts clean. All rules are created
     by the System Admin through the UI and persisted in the workspace store. */
  var SEED_POLICIES = [];

  function me() {
    return (OC.store && OC.store.user && OC.store.user(OC.store.session && OC.store.session())) ||
      (OC.store && OC.store.state && OC.store.state.users && OC.store.state.users[0]) ||
      { id: '', name: 'User', admin: false };
  }

  function getPolicies() {
    if (OC.store && OC.store.state) {
      if (!Array.isArray(OC.store.state.policies) || (!OC.store.state._policies_seeded && OC.store.state.policies.length === 0)) {
        OC.store.state.policies = SEED_POLICIES.map(function (p) {
          return Object.assign({}, p);
        });
        OC.store.state._policies_seeded = true;
        if (typeof OC.store.save === 'function') OC.store.save();
      } else {
        OC.store.state._policies_seeded = true;
        // Strip legacy company-wide policies
        OC.store.state.policies = OC.store.state.policies.filter(function (p) {
          return p && p.department && p.department !== 'all' && p.id !== 'pol-conduct' && p.id !== 'pol-confidentiality' && p.id !== 'pol-transparency';
        });
      }
      return OC.store.state.policies;
    }
    return SEED_POLICIES.map(function (p) { return Object.assign({}, p); });
  }

  function deptName(deptId) {
    if (!deptId || deptId === 'all') return 'Department';
    if (OC.store && OC.store.department) {
      var d = OC.store.department(deptId);
      if (d && d.name) return d.name;
    }
    return deptId;
  }

  /* ---- Rich text & Markdown rendering helpers for Foundation Rules ---- */
  function safeHref(raw) {
    if (!raw) return null;
    var lower = String(raw).trim().toLowerCase();
    if (lower.indexOf('javascript:') === 0 || lower.indexOf('data:') === 0 || lower.indexOf('vbscript:') === 0) return null;
    if (lower.indexOf('mailto:') === 0) return raw;
    if (lower.indexOf('http://') === 0 || lower.indexOf('https://') === 0) return raw;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$|\?|#)/i.test(raw)) return 'https://' + raw;
    return null;
  }

  function attrSafe(value) {
    return String(value || '').replace(/"/g, '%22').replace(/'/g, '%27');
  }

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
    map.gray = map.grey;
    return map;
  })();

  function renderInline(text) {
    return String(text)
      .replace(/\{([a-z]+)\}([\s\S]*?)\{\/\}/gi, function (whole, name, body) {
        var css = MD_COLORS[String(name).toLowerCase()];
        return css ? '<span style="color:' + css + ';font-weight:600;">' + body + '</span>' : whole;
      })
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (whole, label, url) {
        var href = safeHref(url);
        if (!href) return label;
        return '<a class="md-link" href="' + attrSafe(href) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
      })
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  function renderMarkdownPreview(rawText) {
    if (!rawText) return '<p class="muted">No guidelines or content added yet.</p>';

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

  function isHtmlContent(s) {
    return /^\s*<[a-zA-Z]/.test(s);
  }

  function renderRuleBodyHtml(raw) {
    if (!raw || !raw.trim()) {
      return '<p class="muted">No guidelines or content added yet.</p>';
    }
    return isHtmlContent(raw) ? raw : renderMarkdownPreview(raw);
  }

  function stripHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
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

    var deptSelect = h('select', { style: 'width:100%;' }, depts.map(function (d) {
      return h('option', { value: d.id }, d.name);
    }));

    if (existingRule && existingRule.department && existingRule.department !== 'all') {
      deptSelect.value = existingRule.department;
    } else if (selectedDept && selectedDept !== 'all_rules' && selectedDept !== 'all') {
      deptSelect.value = selectedDept;
    } else if (depts[0]) {
      deptSelect.value = depts[0].id;
    }

    /* WYSIWYG Editor */
    var editorDiv = document.createElement('div');
    editorDiv.className = 'client-wysiwyg-editor';
    editorDiv.contentEditable = 'true';
    editorDiv.setAttribute('aria-label', 'Rule Content & Guidelines');
    editorDiv.setAttribute('spellcheck', 'true');
    editorDiv.setAttribute('data-placeholder', 'Write any policy rules, requirements, specifications, checklists, or guidelines here…');
    editorDiv.style.cssText = 'min-height:160px;max-height:260px;overflow-y:auto;';

    var storedRaw = (existingRule ? existingRule.body : '').trim();
    editorDiv.innerHTML = storedRaw
      ? (isHtmlContent(storedRaw) ? storedRaw : renderMarkdownPreview(storedRaw))
      : '';

    function noBlur(e) { e.preventDefault(); }

    function cmd(command, value) {
      editorDiv.focus();
      document.execCommand(command, false, value || null);
    }

    function applyColor(cssValue) {
      editorDiv.focus();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, cssValue);
      document.execCommand('styleWithCSS', false, false);
    }

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
      span.textContent = 'Rule guideline / checklist item';
      label.appendChild(cb);
      label.appendChild(span);
      range.insertNode(label);
      range.setStart(span, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function insertLink() {
      editorDiv.focus();
      var sel = window.getSelection();
      var label = (sel && sel.toString().trim()) || 'link text';
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

    /* Colour picker popover */
    var colorSwatch = h('span', { class: 'md-color-swatch' });
    var colorMenu = h('div', { class: 'md-color-menu', hidden: true });
    var colorBtn;

    function closeColorMenu() {
      colorMenu.hidden = true;
      if (colorBtn) colorBtn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onDocDownForColor, true);
      document.removeEventListener('keydown', onEscForColor, true);
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
        document.addEventListener('keydown', onEscForColor, true);
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

    /* Toolbar matching Client Portal (Photo 2) */
    var toolbar = h('div', { class: 'client-editor-toolbar' }, [
      h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Bold', onMousedown: noBlur, onClick: function () { cmd('bold'); } }, 'Bold'),
      h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Italic', onMousedown: noBlur, onClick: function () { cmd('italic'); } }, 'Italic'),
      h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Heading 2', onMousedown: noBlur, onClick: function () { cmd('formatBlock', 'h2'); } }, 'H2'),
      h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Heading 3', onMousedown: noBlur, onClick: function () { cmd('formatBlock', 'h3'); } }, 'H3'),
      h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Bullet List', onMousedown: noBlur, onClick: function () { cmd('insertUnorderedList'); } }, 'List'),
      h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Checklist', onMousedown: noBlur, onClick: function () { insertChecklist(); } }, 'Checklist'),
      h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Code', onMousedown: noBlur, onClick: function () {
        var sel = window.getSelection();
        var txt = sel ? sel.toString() : '';
        document.execCommand('insertHTML', false, '<code>' + (txt || 'code') + '</code>');
      } }, 'Code'),
      h('button', { class: 'client-editor-tool-btn', type: 'button', title: 'Quote', onMousedown: noBlur, onClick: function () { cmd('formatBlock', 'blockquote'); } }, 'Quote'),
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
      }, [OC.icon('trash'), 'Clear'])
    ]);

    var editorCard = h('div', {
      class: 'portal-credential-card client-rich-editor-wrap',
      style: 'padding:14px 16px;display:flex;flex-direction:column;gap:12px;border-radius:10px;'
    }, [
      toolbar,
      editorDiv
    ]);

    var form = h('div', { style: 'display:flex;flex-direction:column;gap:14px;' }, [
      OC.ui.field('Rule Title', titleInput),
      OC.ui.field('Department', deptSelect),
      OC.ui.field('Rule Content & Guidelines', editorCard)
    ]);

    OC.ui.modal({
      title: isEdit ? 'Edit Foundation Rule' : 'New Foundation Rule',
      className: 'modal-policy-editor modal-wide',
      content: form,
      actions: [
        {
          label: 'Cancel',
          onClick: function (close) { close(); }
        },
        {
          label: isEdit ? 'Save Changes' : 'Done',
          primary: true,
          onClick: function (close) {
            var title = titleInput.value.trim();
            var body = editorDiv.innerHTML.trim();
            var textContent = (editorDiv.innerText || editorDiv.textContent || '').trim();
            var cat = (existingRule && existingRule.category) ? existingRule.category : 'General';
            var dept = deptSelect.value || 'all';

            if (!title) return 'Please enter a rule title.';
            if (!textContent && !editorDiv.querySelector('img, a, input, hr')) {
              return 'Please enter the rule content.';
            }

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
                  policyId: existingRule.id,
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
                  policyId: newId,
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
    setTimeout(function () {
      if (titleInput && typeof titleInput.focus === 'function') titleInput.focus();
    }, 60);
  }

  function viewRuleDetailModal(rule) {
    if (!rule) return;
    var h = OC.ui.h;
    var user = me();
    var canManage = Boolean(user && (user.admin || (OC.can && OC.can.isSystemAdmin && OC.can.isSystemAdmin(user))));

    var isCompany = (!rule.department || rule.department === 'all');
    var deptChip = isCompany
      ? h('span', {
          class: 'chip dept',
          style: 'background:rgba(59, 130, 246, 0.16);color:#60a5fa;border:1px solid rgba(59, 130, 246, 0.3);font-weight:600;'
        }, 'Company-wide')
      : OC.ui.deptChip(rule.department);

    var catBadge = (rule.category && rule.category !== 'General') ? h('span', {
      class: 'chip custom',
      style: 'font-size:11.5px;font-weight:600;background:rgba(255,255,255,0.08);color:var(--ink,#fff);border:1px solid rgba(255,255,255,0.12);padding:2px 8px;border-radius:6px;'
    }, rule.category) : null;

    var authorName = OC.ui.personName ? OC.ui.personName(rule.created_by) : (rule.created_by || 'Admin');
    var timeLabel = OC.ui.fmtWhen ? OC.ui.fmtWhen(rule.created_at) : '';

    var metaRow = h('div', {
      style: 'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-bottom:12px;border-bottom:1px solid var(--rule, rgba(255,255,255,0.08));'
    }, [
      h('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
        deptChip,
        catBadge
      ].filter(Boolean)),
      h('div', { style: 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-dim,#94a3b8);' }, [
        OC.ui.mark ? OC.ui.mark(rule.created_by) : null,
        h('span', { style: 'font-weight:500;' }, authorName),
        timeLabel ? h('span', { class: 'mono', style: 'font-size:11px;margin-left:4px;' }, '• ' + timeLabel) : null
      ])
    ]);

    var contentBox = h('div', {
      class: 'foundation-rule-full-body client-details-text-view',
      style: 'font-size:14.5px;line-height:1.75;color:var(--ink,#f8fafc);max-height:60vh;overflow-y:auto;padding:16px 20px;background:var(--card-bg-alt);border:1px solid var(--rule, rgba(255,255,255,0.08));border-radius:8px;word-break:break-word;',
      html: renderRuleBodyHtml(rule.body)
    });

    var modalContent = h('div', {
      class: 'foundation-modal-detail-wrapper',
      style: 'display:flex;flex-direction:column;gap:14px;min-width:320px;'
    }, [metaRow, contentBox]);

    var actions = [];
    if (canManage) {
      actions.push({
        label: 'Edit Rule',
        primary: true,
        onClick: function (close) {
          close();
          openPolicyModal(rule);
        }
      });
      actions.push({
        label: 'Delete Rule',
        onClick: function (close) {
          close();
          confirmDelete(rule);
        }
      });
    }
    actions.push({
      label: 'Close',
      primary: !canManage,
      onClick: function (close) {
        close();
      }
    });

    OC.ui.modal({
      title: rule.title || 'Foundation Rule',
      className: 'modal-policy-editor modal-wide',
      content: modalContent,
      actions: actions
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
            policyId: rule.id,
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

    // Filter rules based on selected department, selected category, and search query (Title and Category)
    var visiblePolicies = allPolicies.filter(function (rule) {
      // 1. Department filter
      if (selectedDept === 'all') {
        if (rule.department && rule.department !== 'all') return false;
      } else if (selectedDept !== 'all_rules') {
        if (rule.department !== selectedDept) return false;
      }

      // 2. Category filter dropdown
      if (selectedCategory && selectedCategory !== 'all_categories') {
        if ((rule.category || '').toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
      }

      // 3. Search query filter: search by Title and Category
      var cleanQ = searchQuery ? searchQuery.toLowerCase().trim() : '';
      if (cleanQ) {
        var t = (rule.title || '').toLowerCase();
        var c = (rule.category || '').toLowerCase();
        if (t.indexOf(cleanQ) === -1 && c.indexOf(cleanQ) === -1) {
          return false;
        }
      }

      return true;
    });

    // Unique categories list
    var categories = [];
    var catMap = {};
    allPolicies.forEach(function (p) {
      var cat = p.category || 'General';
      if (!catMap[cat]) {
        catMap[cat] = true;
        categories.push(cat);
      }
    });
    categories.sort();

    // Department tabs data
    var deptTabs = [
      { id: 'all_rules', name: 'All Foundation Rules', count: allPolicies.length }
    ].concat(depts.map(function (d) {
      return {
        id: d.id,
        name: d.name,
        count: allPolicies.filter(function (r) { return r.department === d.id; }).length
      };
    }));

    // Search Box (searches Title, Content and Category)
    var searchInput = h('input', {
      type: 'search',
      placeholder: 'Search rules by title or keyword...',
      value: searchQuery,
      'aria-label': 'Search foundation rules',
      style: 'width:100%;padding-left:34px;height:36px;border-radius:8px;',
      onInput: function (e) {
        searchQuery = e.target.value;
        OC.ui.keepingPlace(host, function () { render(host); });
      }
    });

    var searchWrapper = h('div', {
      style: 'position:relative;flex:1;min-width:240px;max-width:540px;'
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

    // Category selection is handled seamlessly via search (by title or category)

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
    if (selectedCategory && selectedCategory !== 'all_categories') {
      statsText += ' · Category: ' + selectedCategory;
    }
    var trimmedSearch = searchQuery ? searchQuery.trim() : '';
    if (trimmedSearch) {
      statsText += ' · Search: "' + trimmedSearch + '"';
    }

    var hasFilters = Boolean(trimmedSearch || selectedDept !== 'all_rules' || (selectedCategory && selectedCategory !== 'all_categories'));
    var statsRow = h('div', {
      style: 'display:flex;align-items:center;justify-content:space-between;margin:4px 0 14px 0;font-size:12.5px;color:var(--text-dim,#94a3b8);'
    }, [
      h('span', {}, statsText),
      hasFilters ? h('button', {
        class: 'btn small ghost',
        type: 'button',
        style: 'font-size:11.5px;padding:2px 8px;',
        onClick: function () {
          searchQuery = '';
          selectedDept = 'all_rules';
          selectedCategory = 'all_categories';
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
            ? 'No rules match title or category "' + trimmedSearch + '". Try refining your search.'
            : ('No foundation rules found for the selected filters.'))
      ]);
    } else {
      cardsContainer = h('div', {
        class: 'foundation-grid',
        style: 'display:grid;grid-template-columns:1fr;gap:12px;'
      }, visiblePolicies.map(function (rule) {
        // System admin action buttons on card (Edit & Delete)
        var actionBtns = canManage ? h('div', {
          class: 'foundation-rule-actions',
          style: 'position:absolute;top:50%;transform:translateY(-50%);right:16px;display:flex;align-items:center;gap:6px;z-index:2;'
        }, [
          h('button', {
            class: 'iconbtn',
            type: 'button',
            title: 'Edit Rule',
            style: 'padding:6px;',
            onClick: function (e) {
              if (e && e.stopPropagation) e.stopPropagation();
              openPolicyModal(rule);
            }
          }, [OC.icon('edit')]),
          h('button', {
            class: 'iconbtn',
            type: 'button',
            title: 'Delete Rule',
            style: 'padding:6px;color:var(--danger,#ef4444);',
            onClick: function (e) {
              if (e && e.stopPropagation) e.stopPropagation();
              confirmDelete(rule);
            }
          }, [OC.icon('trash')])
        ]) : null;

        // Card displays ONLY the title (per requirement: "just tital lakha thakba")
        var titleEl = h('h3', {
          class: 'foundation-card-title',
          style: 'margin:0;font-size:15.5px;font-weight:600;color:var(--ink,#fff);line-height:1.45;word-break:break-word;padding-right:' + (canManage ? '84px' : '0') + ';'
        }, rule.title);

        var plainBody = isHtmlContent(rule.body || '') ? stripHtml(rule.body || '') : (rule.body || '');
        var firstLine = plainBody.split('\n')[0].trim();
        var previewEl = h('div', {
          class: 'foundation-rule-preview',
          style: 'display:none;'
        }, firstLine || plainBody || '');

        return h('div', {
          class: 'card foundation-card',
          role: 'button',
          tabIndex: 0,
          title: 'Click to view full rule',
          style: 'display:flex;align-items:center;min-height:60px;padding:16px 20px;border-radius:10px;cursor:pointer;position:relative;transition:transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;',
          onClick: function () {
            viewRuleDetailModal(rule);
          },
          onKeyDown: function (e) {
            if (e && (e.key === 'Enter' || e.key === ' ')) {
              if (e.preventDefault) e.preventDefault();
              viewRuleDetailModal(rule);
            }
          }
        }, [
          titleEl,
          actionBtns,
          previewEl
        ].filter(Boolean));
      }));
    }

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head', style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;' }, [
        h('div', { style: 'flex:1;min-width:240px;' }, [
          h('h1', {}, [OC.icon('flag'), 'Foundation']),
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
        h('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;' }, [
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
    setCategoryFilter: function (cat) {
      selectedCategory = cat;
    },
    getCategoryFilter: function () {
      return selectedCategory;
    },
    setSearchQuery: function (query) {
      searchQuery = query;
    },
    getSearchQuery: function () {
      return searchQuery;
    },
    openPolicyModal: openPolicyModal,
    viewRuleDetailModal: viewRuleDetailModal,
    SEED_POLICIES: SEED_POLICIES
  };
})();
