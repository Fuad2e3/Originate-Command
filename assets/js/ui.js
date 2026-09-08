/* =========================================================================
   ui.js — shared interface helpers
   Element construction, date formatting, the chips used to render tags and
   states, the modal dialog, and toasts. No view logic lives here; every
   view file builds its markup out of these.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.ui = (function () {
  'use strict';

  /* Names — of people, departments, clients — are stored values another user
     typed, so any of them can carry markup. Everywhere one is interpolated
     into an innerHTML string rather than passed as a text node, it goes
     through here first; otherwise a display name like <img onerror=...>
     executes for every viewer the name is rendered to. */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---- element construction -------------------------------------------- */
  /* This runs once per element on every render, so it is written flat: a for-in
     rather than Object.keys().forEach avoids allocating a key array and a
     closure for each element built. */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.charCodeAt(0) === 111 && k.charCodeAt(1) === 110) el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    if (children !== undefined && children !== null && children !== false) append(el, children);
    return el;
  }

  function append(el, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      var frag = (typeof document !== 'undefined' && document.createDocumentFragment) ? document.createDocumentFragment() : null;
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c === null || c === undefined || c === false) continue;
        if (Array.isArray(c)) {
          append(frag || el, c);
        } else {
          var node = c.nodeType ? c : document.createTextNode(String(c));
          if (frag) frag.appendChild(node);
          else el.appendChild(node);
        }
      }
      if (frag) el.appendChild(frag);
      return;
    }
    el.appendChild(children.nodeType ? children : document.createTextNode(String(children)));
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  function debounce(fn, wait) {
    var timer;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 150);
    };
  }

  /* ---- dates ------------------------------------------------------------ */
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /* The due-date control is a datetime-local input, so a stored due value looks
     like "2026-09-03T14:30" — a local calendar date with a time. today() used
     toISOString(), which is UTC, so east of Greenwich it named the wrong day
     for part of every morning. Both now speak the same local calendar. */
  function dayOf(date) {
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  function today() { return dayOf(new Date()); }
  function daysFromToday(offset) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return dayOf(d);
  }
  /* the calendar day a due value falls on, whether or not it carries a time */
  function dueDay(due) { return String(due || '').slice(0, 10); }

  function localNowISO() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtDate(isoDate) {
    if (!isoDate) return '—';
    var p = isoDate.slice(0, 10).split('-');
    var dStr = Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1];
    if (isoDate.length >= 16 && isoDate.indexOf('T') > -1) {
      var timePart = isoDate.slice(11, 16);
      var parts = timePart.split(':');
      var hours = Number(parts[0]);
      var mins = parts[1];
      var ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return dStr + ', ' + (hours < 10 ? '0' + hours : hours) + ':' + mins + ' ' + ampm;
    }
    return dStr;
  }

  function daysLate(dueDate) {
    if (!dueDate) return 0;
    var due = new Date(dueDate.indexOf('T') > -1 ? dueDate : dueDate + 'T12:00:00');
    var now = new Date();
    if (dueDate.indexOf('T') === -1) {
      due.setHours(12, 0, 0, 0);
      now.setHours(12, 0, 0, 0);
    }
    return Math.round((now - due) / 86400000);
  }

  function dueLabel(dueDate) {
    if (!dueDate) return '';
    var late = daysLate(dueDate);
    if (late === 0) return 'due today';
    if (late === 1) return '1 day overdue';
    if (late > 1) return late + ' days overdue';
    if (late === -1) return 'due tomorrow';
    return 'due ' + fmtDate(dueDate);
  }

  function fmtWhen(isoStamp) {
    var then = new Date(isoStamp), now = new Date();
    var mins = Math.round((now - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    if (mins < 60 * 24) return Math.round(mins / 60) + 'h ago';
    var days = Math.round(mins / 1440);
    if (days < 7) return days + 'd ago';
    return fmtDate(isoStamp);
  }

  /* ---- chips ------------------------------------------------------------ */
  /* Client identifiers are routinely stored as one composite string —
     "0583 - TFR - Tafor Niba" — because the whole line was pasted into a
     single field. On a compact one-line row only the short code belongs, so
     pull that token out rather than printing the entire line. */
  function shortCodeOf(raw) {
    var text = String(raw === null || raw === undefined ? '' : raw).trim();
    if (!text) return '';
    var parts = text.split(/\s*[-\u2013\u2014|/]\s*/).filter(function (s) { return s.length; });
    if (parts.length < 2) return text;
    /* a purely alphabetic 2-6 character token is the code */
    for (var i = 0; i < parts.length; i++) {
      if (/^[A-Za-z]{2,6}$/.test(parts[i])) return parts[i].toUpperCase();
    }
    /* no clean letter code, so take the shortest part — an account number
       beats a person's name as an identifier */
    var best = parts[0];
    for (var j = 1; j < parts.length; j++) if (parts[j].length < best.length) best = parts[j];
    return best;
  }

  function clientCode(c) {
    if (!c) return '';
    if (typeof c === 'string') {
      var obj = OC.store.client(c);
      if (!obj) return shortCodeOf(c);
      c = obj;
    }
    /* an explicitly entered Short Code always wins over anything parsed */
    var ext = c.extended_fields && c.extended_fields.short_code;
    var explicit = (ext && ext.value) ? String(ext.value).trim() : '';
    if (explicit) return explicit;
    return shortCodeOf(c.client_code || c.client_id || c.name || '');
  }

  function clientLabel(c) {
    if (!c) return 'No client';
    if (typeof c === 'string') {
      var obj = OC.store.client(c);
      if (obj) c = obj;
      else return c;
    }
    /* a client may now be saved with only a Client ID, so that is the last
       thing standing between a blank name and an unlabelled chip */
    return c.client_code || c.name || c.client_id || 'No client';
  }

  function clientChip(id) {
    var c = OC.store.client(id);
    return h('span', {
      class: 'chip client' + (c ? ' clickable' : ''),
      title: c ? 'Open ' + clientLabel(c) + ' Workspace' : 'Client',
      style: c ? 'cursor:pointer;' : '',
      onClick: c ? function (e) {
        e.stopPropagation();
        if (OC.clients && OC.clients.openClientPortal) {
          OC.clients.openClientPortal(c.id);
        } else {
          window.location.hash = '#clients/' + id;
        }
      } : null
    }, c ? clientLabel(c) : 'No client');
  }

  function deptChip(id) {
    var d = OC.store.department(id);
    return h('span', { class: 'chip dept', title: 'Department' }, d ? d.name : 'No department');
  }

  function tagChip(id) {
    var t = OC.store.tag(id);
    if (!t) return null;
    return h('span', { class: 'chip custom', title: t.kind }, t.label);
  }

  var STATE_LABEL = { open: 'Open', progress: 'In progress', done: 'Done', blocked: 'Blocked' };
  var STATE_CLASS = { open: 'state-open', progress: 'state-progress', done: 'state-done', blocked: 'state-blocked' };

  function stateChip(state) {
    return h('span', { class: 'chip state ' + STATE_CLASS[state] }, [
      h('span', { class: 'dot' }), STATE_LABEL[state]
    ]);
  }

  /* ---- person mark --------------------------------------------------------
     Initials in a small square rather than a circle: this is a drafting
     aesthetic, and a square reads as a stamp on a document. The tint is
     derived from the account id, so a person keeps the same colour
     everywhere without any colour being stored on the record. */
  var MARK_TINTS = ['blueprint', 'brass', 'success', 'signal', 'slate'];

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function mark(userId, extraClass) {
    var cleanId = (typeof userId === 'string' && userId.indexOf('user:') === 0) ? userId.slice(5) : userId;
    var user = OC.store.user(cleanId);
    var name = user ? user.name : 'Unknown';
    var hash = 0;
    for (var i = 0; i < String(cleanId).length; i++) hash = (hash * 31 + String(cleanId).charCodeAt(i)) | 0;
    var tint = MARK_TINTS[Math.abs(hash) % MARK_TINTS.length];

    if (user && user.avatar) {
      var img = h('img', {
        src: user.avatar,
        alt: name,
        class: 'mark-avatar-img'
      });
      var markEl = h('span', {
        class: 'mark-tint mark-avatar' + (extraClass ? ' ' + extraClass : ''),
        title: name, 'aria-hidden': 'true'
      }, [img]);
      img.onerror = function () {
        markEl.className = 'mark-tint tint-' + tint + (extraClass ? ' ' + extraClass : '');
        markEl.textContent = initials(name);
      };
      return markEl;
    }

    return h('span', {
      class: 'mark-tint tint-' + tint + (extraClass ? ' ' + extraClass : ''),
      title: name, 'aria-hidden': 'true'
    }, initials(name));
  }

  /* a person, shown as mark plus name */
  function person(userId, extraClass) {
    var cleanId = (typeof userId === 'string' && userId.indexOf('user:') === 0) ? userId.slice(5) : userId;
    var u = OC.store.user(cleanId);
    var name = u ? u.name : 'Unknown';
    var title = u ? u.title : '';

    return h('span', {
      class: 'person' + (u ? ' clickable' : '') + (extraClass ? ' ' + extraClass : ''),
      style: u ? 'cursor:pointer;' : '',
      title: u ? 'View profile / portal of ' + name : name,
      onClick: u ? function (e) {
        e.stopPropagation();
        if (OC.profilePortal && OC.profilePortal.openForUser) {
          OC.profilePortal.openForUser(u);
        }
      } : null
    }, [
      mark(cleanId),
      h('span', { class: 'name' }, name),
      title ? h('span', { class: 'chip role', style: 'margin-left:4px;font-size:10.5px;' }, title) : null
    ].filter(Boolean));
  }

  function personName(id) {
    if (!id) return 'Unknown';
    var cleanId = (typeof id === 'string' && id.indexOf('user:') === 0) ? id.slice(5) : id;
    var u = OC.store.user(cleanId);
    return u ? u.name : 'Unknown';
  }

  function assigneeName(item) {
    if (!item) return 'Unassigned';
    if (Array.isArray(item.assignees) && item.assignees.length > 0) {
      return item.assignees.map(function (id) {
        if (typeof id === 'string') {
          if (id.indexOf('user:') === 0) {
            var rawU = OC.store.user(id.slice(5));
            return rawU ? rawU.name : id.slice(5);
          }
          if (id.indexOf('group:') === 0) {
            var rawG = OC.store.group(id.slice(6));
            return rawG ? rawG.name : id.slice(6);
          }
        }
        var u = OC.store.user(id);
        if (u) return u.name;
        var g = OC.store.group(id);
        return g ? g.name : id;
      }).join(', ');
    }
    if (item.assignee_type === 'group') {
      var g = OC.store.group(item.assignee);
      return g ? g.name : 'Unknown group';
    }
    return personName(item.assignee);
  }

  function instructionReaders(note) {
    if (!note) return [];
    var uids = [];
    (Array.isArray(note.read_by) ? note.read_by : []).forEach(function (uid) {
      if (uid && uids.indexOf(uid) === -1) uids.push(uid);
    });
    if (note.author && uids.indexOf(note.author) === -1) uids.push(note.author);
    (note.comments || []).forEach(function (c) {
      if (c && c.author && uids.indexOf(c.author) === -1) uids.push(c.author);
    });
    if (note.reactions) {
      Object.keys(note.reactions).forEach(function (emoji) {
        (note.reactions[emoji] || []).forEach(function (uid) {
          if (uid && uids.indexOf(uid) === -1) uids.push(uid);
        });
      });
    }

    return uids.map(function (uid) {
      var u = OC.store.user(uid);
      return u ? u.name : personName(uid);
    }).filter(function (name) {
      return name && name !== 'Unknown';
    });
  }

  /* Instructions mark themselves read as soon as they are listed, which is
     what the "read by" receipts want — but it also meant every unread cue
     (the highlight, the chip, the counters, the unread-first sort) evaluated
     to false a few milliseconds after the list appeared. This remembers what
     was unread the first time this page load showed it, so the cues stay put
     for as long as the reader is looking at them and reset on the next visit. */
  var unreadOnArrival = {};

  function wasUnread(note, userId) {
    if (!note || !userId) return false;
    var key = userId + '|' + (note.id || '');
    if (!(key in unreadOnArrival)) {
      unreadOnArrival[key] = (Array.isArray(note.read_by) ? note.read_by : []).indexOf(userId) === -1;
    }
    return unreadOnArrival[key];
  }

  function markInstructionRead(note, userId) {
    if (!note || !userId) return;
    note.read_by = Array.isArray(note.read_by) ? note.read_by : [];
    if (note.read_by.indexOf(userId) === -1) {
      note.read_by.push(userId);
      setTimeout(function () {
        OC.store.mutate(null, function () {});
      }, 50);
    }
  }

  /* ---- form pieces ------------------------------------------------------ */
  /* ---- keeping the reader's place across a re-render ----------------------
     A view that rebuilds itself — because a keystroke filtered a list, or
     because data arrived from the server a second ago — throws away the scroll
     position and whatever field was being typed in. These capture where the
     person is and put them back afterwards.

     Elements are keyed by tag, class and label plus their position among the
     others sharing that key, rather than by a global index, so a row appearing
     or disappearing elsewhere does not shift the key. Anything that cannot be
     found again afterwards is simply skipped. */
  function placeKeys(root, selector) {
    var seen = {};
    var out = [];
    var nodes = root.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var id = el.id ? '#' + el.id : '';
      var name = (el.getAttribute && el.getAttribute('name')) ? ('[name=' + el.getAttribute('name') + ']') : '';
      var label = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('placeholder'))) || '';
      var base = el.tagName + id + name + '.' + (el.className || '') + '.' + label;
      seen[base] = (seen[base] || 0) + 1;
      out.push({ el: el, key: base + '#' + (seen[base] - 1) });
    }
    return out;
  }

  function capturePlace(root) {
    if (typeof document === 'undefined' || !root) return null;

    var scrolls = [];
    var pageEl = document.getElementById('page');
    if (pageEl && (pageEl.scrollTop > 0 || pageEl.scrollLeft > 0)) {
      scrolls.push({ isPageRoot: true, top: pageEl.scrollTop, left: pageEl.scrollLeft });
    }
    placeKeys(root, '*').forEach(function (rec) {
      /* a chat pins itself to the newest message; restoring the old offset
         underneath it only produces a visible jump */
      if (rec.el.hasAttribute && rec.el.hasAttribute('data-autoscroll')) return;
      if (rec.el.scrollTop > 0 || rec.el.scrollLeft > 0) {
        scrolls.push({ key: rec.key, top: rec.el.scrollTop, left: rec.el.scrollLeft });
      }
    });

    var focus = null;
    var active = document.activeElement;
    if (active && active !== document.body && root.contains(active)) {
      var match = placeKeys(root, active.tagName).filter(function (r) { return r.el === active; })[0];
      if (match) {
        focus = { key: match.key, tag: active.tagName, id: active.id || null };
        try {
          if (typeof active.selectionStart === 'number') {
            focus.start = active.selectionStart;
            focus.end = active.selectionEnd;
          }
        } catch (e) { /* a selection is not readable on every input type */ }
      }
    }

    return {
      win: typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0,
      scrolls: scrolls,
      focus: focus
    };
  }

  function restorePlace(place, root) {
    if (!place || typeof document === 'undefined' || !root) return;

    if (place.scrolls && place.scrolls.length) {
      var byKey = {};
      placeKeys(root, '*').forEach(function (rec) { byKey[rec.key] = rec.el; });
      place.scrolls.forEach(function (rec) {
        if (rec.isPageRoot) {
          var pEl = document.getElementById('page');
          if (pEl) { pEl.scrollTop = rec.top; pEl.scrollLeft = rec.left; }
          return;
        }
        var el = byKey[rec.key];
        if (el) { el.scrollTop = rec.top; el.scrollLeft = rec.left; }
      });
    }

    if (typeof window !== 'undefined' && typeof place.win === 'number') {
      window.scrollTo(0, place.win);
    }

    if (place.focus) {
      var targetEl = null;
      if (place.focus.id) {
        targetEl = document.getElementById(place.focus.id);
      }
      if (!targetEl) {
        var targetMatch = placeKeys(root, place.focus.tag).filter(function (r) {
          return r.key === place.focus.key;
        })[0];
        if (targetMatch) targetEl = targetMatch.el;
      }
      if (targetEl && targetEl.focus) {
        try { targetEl.focus({ preventScroll: true }); } catch (_) { targetEl.focus(); }
        if (typeof place.focus.start === 'number' && targetEl.setSelectionRange) {
          try { targetEl.setSelectionRange(place.focus.start, place.focus.end); } catch (e) { }
        }
      }
    }
  }

  /* run a re-render without moving the reader */
  function keepingPlace(root, fn) {
    var live = root || (typeof document !== 'undefined' ? document.getElementById('page') : null);
    var place = live ? capturePlace(live) : null;
    fn();
    var after = (live && live.isConnected) ? live
      : (typeof document !== 'undefined' ? document.getElementById('page') : null);
    if (place && after) {
      restorePlace(place, after);
      /* Also schedule a 0ms frame restore in case children resize during paint */
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          if (after.isConnected) restorePlace(place, after);
        });
      }
    }
  }

  function field(labelText, control, opts) {
    opts = opts || {};
    var label = h('label', { class: 'field' }, [
      h('span', { class: 'label' }, [labelText, opts.required ? h('span', { class: 'req' }, ' *') : null]),
      control,
      opts.hint ? h('span', { class: 'hint' }, opts.hint) : null
    ]);
    return label;
  }

  function select(options, value, attrs) {
    var el = h('select', attrs || {});
    options.forEach(function (o) {
      el.appendChild(h('option', { value: o.value, selected: o.value === value }, o.label));
    });
    if (value !== undefined && value !== null) el.value = value;
    return el;
  }

  /* ---- tag field (6.4) ---------------------------------------------------
     "Every tag field is both a searchable dropdown and a tick list; typing
     narrows the list live rather than requiring an exact match." So: a filter
     box over a scrolling tick list, plus inline creation of a new tag, which
     becomes available to everyone immediately. */
  function tagPicker(selected) {
    var chosen = (selected || []).slice();
    var search = h('input', { type: 'search', placeholder: 'narrow the list', 'aria-label': 'Filter tags' });
    var list = h('div', { class: 'ticklist', role: 'group', 'aria-label': 'Tags' });
    var newTag = h('input', { type: 'text', placeholder: 'or create a new tag' });

    function paint() {
      var q = search.value.trim().toLowerCase();
      clear(list);
      var tags = OC.store.state.tags.filter(function (t) {
        return !q || t.label.toLowerCase().indexOf(q) > -1 || t.kind.indexOf(q) > -1;
      });
      if (!tags.length) {
        list.appendChild(h('p', { class: 'ticklist-empty' }, 'No tag matches. Create one below.'));
        return;
      }
      tags.forEach(function (t) {
        var box = h('input', {
          type: 'checkbox', value: t.id, checked: chosen.indexOf(t.id) > -1,
          onChange: function (e) {
            var at = chosen.indexOf(t.id);
            if (e.target.checked && at === -1) chosen.push(t.id);
            if (!e.target.checked && at > -1) chosen.splice(at, 1);
          }
        });
        list.appendChild(h('label', { class: 'checkline' }, [
          box, t.label, h('span', { class: 'chip custom' }, t.kind)
        ]));
      });
    }
    search.addEventListener('input', paint);
    paint();

    return {
      node: h('div', { class: 'tagfield' }, [search, list, newTag]),
      /* returns the chosen tags, creating the typed one first if there is one */
      resolve: function () {
        var out = chosen.slice();
        var label = newTag.value.trim();
        if (label) {
          var existing = OC.store.state.tags.filter(function (t) {
            return t.label.toLowerCase() === label.toLowerCase();
          })[0];
          if (existing) {
            if (out.indexOf(existing.id) === -1) out.push(existing.id);
          } else {
            var made = { id: OC.store.uid('t'), label: label, kind: 'custom' };
            OC.store.state.tags.push(made);
            out.push(made.id);
          }
        }
        return out;
      }
    };
  }

  /* ---- reactions bar (react to todos & instructions) --------------------- */
  var EMOJIS = ['👍', '❤️', '🔥', '👏', '🎉', '🚀', '👀', '✅'];

  function reactionsBar(kind, item, onChange) {
    var user = OC.store.user(OC.store.session());
    if (!user || !item) return null;
    var reactions = item.reactions || {};
    var reactionKeys = Object.keys(reactions).filter(function (k) {
      return Array.isArray(reactions[k]) && reactions[k].length > 0;
    });

    var wrap = h('div', { class: 'reactions-bar' });
    var pickerPop = null;

    function toggleReact(emoji) {
      var list = (item.reactions && item.reactions[emoji]) || [];
      var had = list.indexOf(user.id) > -1;
      OC.store.mutate({
        actor: user.id, action: kind + '.react',
        target: item.title || (item.body ? item.body.slice(0, 40) : item.id),
        detail: emoji + ' (' + (had ? 'removed' : 'added') + ') by ' + user.name
      }, function () {
        OC.store.react(kind, item.id, emoji, user.id);
        if (kind === 'instruction') {
          markInstructionRead(item, user.id);
        }
      });

      // Targeted notification: Send ONLY to concerned owner/assignee, NOT everyone
      if (!had) {
        var targets = [];
        if (kind === 'todo') {
          if (item.created_by) targets.push(item.created_by);
          if (Array.isArray(item.assignees)) {
            item.assignees.forEach(function (aid) {
              if (aid.indexOf('user:') === 0) targets.push(aid.slice(5));
              else if (aid.indexOf('group:') === 0) {
                var g = OC.store.group(aid.slice(6));
                if (g && g.members) targets = targets.concat(g.members);
              } else {
                targets.push(aid);
              }
            });
          }
          if (item.assignee_type === 'user' && item.assignee) targets.push(item.assignee);
          else if (item.assignee_type === 'group' && item.assignee) {
            var g = OC.store.group(item.assignee);
            if (g && g.members) targets = targets.concat(g.members);
          }
        } else if (kind === 'instruction') {
          if (item.author) targets.push(item.author);
        }
        targets = targets.filter(function (uid, idx, arr) {
          return uid && uid !== user.id && arr.indexOf(uid) === idx;
        });
        if (targets.length) {
          var itemTitle = kind === 'todo' ? item.title : (item.body ? item.body.slice(0, 35) + '…' : 'instruction');
          OC.store.notify(targets, user.name + ' reacted ' + emoji + ' on ' + (kind === 'todo' ? 'task: "' + itemTitle + '"' : 'instruction: "' + itemTitle + '"'), item.id);
        }
      }

      if (onChange) onChange();
      else OC.store.emit();
    }

    reactionKeys.forEach(function (emoji) {
      var uids = reactions[emoji] || [];
      var isReacted = uids.indexOf(user.id) > -1;
      var names = uids.map(function (uid) {
        var u = OC.store.user(uid);
        return u ? u.name : uid;
      }).join(', ');

      var pill = h('button', {
        type: 'button',
        class: 'reaction-pill' + (isReacted ? ' active' : ''),
        title: (names ? names + ' reacted with ' : 'Reacted with ') + emoji,
        onClick: function (e) {
          e.preventDefault();
          e.stopPropagation();
          toggleReact(emoji);
        }
      }, [
        h('span', { class: 'emoji' }, emoji),
        h('span', { class: 'count' }, String(uids.length))
      ]);
      wrap.appendChild(pill);
    });

    var pickerBtn = h('button', {
      type: 'button',
      class: 'reaction-picker-btn',
      title: 'Add reaction',
      onClick: function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (pickerPop) {
          pickerPop.remove();
          pickerPop = null;
          return;
        }
        pickerPop = h('div', { class: 'reaction-picker-pop' }, EMOJIS.map(function (em) {
          return h('button', {
            type: 'button',
            class: 'reaction-emoji-btn',
            title: 'React ' + em,
            onClick: function (ev) {
              ev.preventDefault();
              ev.stopPropagation();
              toggleReact(em);
              if (pickerPop) { pickerPop.remove(); pickerPop = null; }
            }
          }, em);
        }));
        wrap.appendChild(pickerPop);

        var closeDoc = function (ev) {
          if (pickerPop && !pickerPop.contains(ev.target) && ev.target !== pickerBtn) {
            pickerPop.remove();
            pickerPop = null;
            document.removeEventListener('click', closeDoc);
          }
        };
        setTimeout(function () { document.addEventListener('click', closeDoc); }, 0);
      }
    }, [
      h('span', { class: 'icon-smile' }, '😀'),
      h('span', { class: 'btn-label' }, '+ React')
    ]);

    wrap.appendChild(pickerBtn);
    return wrap;
  }

  /* ---- @ mention autocomplete, parsing & reply helpers ------------------- */
  function extractMentionedUserIds(text) {
    if (!text) return [];
    var allUsers = (OC.store.state && OC.store.state.users) || [];
    var mentioned = [];
    if (text.toLowerCase().indexOf('@everyone') > -1) {
      allUsers.forEach(function (u) { if (u && u.id && mentioned.indexOf(u.id) === -1) mentioned.push(u.id); });
      return mentioned;
    }
    allUsers.forEach(function (u) {
      if (!u || !u.name) return;
      var pattern = '@' + u.name.toLowerCase();
      if (text.toLowerCase().indexOf(pattern) > -1) {
        if (mentioned.indexOf(u.id) === -1) mentioned.push(u.id);
      }
    });
    return mentioned;
  }

  function formatMentions(text) {
    if (!text) return text;
    var allUsers = (OC.store.state && OC.store.state.users) || [];
    var parts = [];
    var regex = /@([A-Za-z0-9\s._-]+?)(?=[.,!?\s]|$)/g;
    var lastIdx = 0;
    var match;
    while ((match = regex.exec(text)) !== null) {
      var matchedName = match[1].trim();
      var isEveryone = matchedName.toLowerCase() === 'everyone';
      var foundUser = isEveryone ? null : allUsers.find(function (u) {
        return u.name.toLowerCase() === matchedName.toLowerCase();
      });

      if (isEveryone) {
        if (match.index > lastIdx) {
          parts.push(text.slice(lastIdx, match.index));
        }
        parts.push(h('span', {
          class: 'mention-tag everyone',
          title: 'Notifies all team members in this group'
        }, [OC.icon ? OC.icon('users') : null, '@everyone']));
        lastIdx = match.index + match[0].length;
      } else if (foundUser) {
        if (match.index > lastIdx) {
          parts.push(text.slice(lastIdx, match.index));
        }
        parts.push(h('span', {
          class: 'mention-tag',
          title: foundUser.name + ' (' + (foundUser.title || (OC.can && OC.can.roleLabel ? OC.can.roleLabel(foundUser) : 'Member')) + ')'
        }, '@' + foundUser.name));
        lastIdx = match.index + match[0].length;
      }
    }
    if (lastIdx < text.length) {
      parts.push(text.slice(lastIdx));
    }
    return parts.length ? parts : text;
  }

  function attachMentionAutocomplete(inputElement, allowedUsers, onMentionSelected) {
    var pop = null;
    var activeIdx = 0;
    var filtered = [];

    function closePop() {
      if (pop) {
        pop.remove();
        pop = null;
      }
    }

    function getMentionQuery() {
      var val = inputElement.value || '';
      var selStart = inputElement.selectionStart || val.length;
      var textBefore = val.slice(0, selStart);
      var lastAt = textBefore.lastIndexOf('@');
      if (lastAt === -1) return null;
      if (lastAt > 0 && !/\s/.test(textBefore.charAt(lastAt - 1))) return null;
      var query = textBefore.slice(lastAt + 1);
      if (/\n/.test(query) || query.length > 25) return null;
      return { query: query.toLowerCase(), atPos: lastAt, selStart: selStart };
    }

    function renderPop(match) {
      var all = (allowedUsers && allowedUsers.length) ? allowedUsers.slice() : ((OC.store.state && OC.store.state.users) || []).filter(function (u) { return u.status === 'active'; });
      var list = [];
      if (!match.query || 'everyone'.indexOf(match.query) === 0) {
        list.push({
          id: 'everyone',
          name: 'everyone',
          isEveryone: true,
          title: 'Notify all members in this channel/group'
        });
      }
      all.forEach(function (u) {
        if (!match.query || u.name.toLowerCase().indexOf(match.query) > -1 || (u.email && u.email.toLowerCase().indexOf(match.query) > -1)) {
          list.push(u);
        }
      });
      filtered = list.slice(0, 7);

      if (!filtered.length) {
        closePop();
        return;
      }

      if (!pop) {
        pop = h('div', { class: 'mention-autocomplete-pop' });
        if (inputElement.parentNode) {
          inputElement.parentNode.style.position = 'relative';
          inputElement.parentNode.appendChild(pop);
        }
      }
      clear(pop);

      filtered.forEach(function (u, i) {
        var markNode = u.isEveryone
          ? h('div', { class: 'mention-everyone-badge mark-tint', style: 'width:24px;height:24px;background:var(--brand-orange);' }, OC.icon('users'))
          : mark(u.id);

        var item = h('div', {
          class: 'mention-pop-item' + (i === activeIdx ? ' active' : '') + (u.isEveryone ? ' is-everyone' : ''),
          onClick: function (e) {
            e.preventDefault();
            e.stopPropagation();
            selectUser(u, match);
          }
        }, [
          markNode,
          h('div', { class: 'mention-pop-info' }, [
            h('span', { class: 'mention-pop-name' }, u.isEveryone ? '@everyone' : u.name),
            h('span', { class: 'mention-pop-role' }, u.title || (OC.can && OC.can.roleLabel ? OC.can.roleLabel(u) : 'Member'))
          ])
        ]);
        pop.appendChild(item);
      });
    }

    function selectUser(u, match) {
      var val = inputElement.value || '';
      var before = val.slice(0, match.atPos);
      var after = val.slice(match.selStart);
      var insert = '@' + u.name + ' ';
      inputElement.value = before + insert + after;
      var newPos = before.length + insert.length;
      inputElement.focus();
      if (inputElement.setSelectionRange) {
        inputElement.setSelectionRange(newPos, newPos);
      }
      closePop();
      if (typeof onMentionSelected === 'function') onMentionSelected(u);
    }

    inputElement.addEventListener('input', function () {
      var match = getMentionQuery();
      if (match) {
        activeIdx = 0;
        renderPop(match);
      } else {
        closePop();
      }
    });

    inputElement.addEventListener('keydown', function (e) {
      if (!pop || !filtered.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % filtered.length;
        renderPop(getMentionQuery());
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + filtered.length) % filtered.length;
        renderPop(getMentionQuery());
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered[activeIdx]) {
          e.preventDefault();
          selectUser(filtered[activeIdx], getMentionQuery());
        }
      } else if (e.key === 'Escape') {
        closePop();
      }
    });

    document.addEventListener('click', function (e) {
      if (pop && !pop.contains(e.target) && e.target !== inputElement) {
        closePop();
      }
    });

    return {
      close: closePop,
      openMentionMenu: function () {
        inputElement.focus();
        if (inputElement.value && !inputElement.value.endsWith(' ')) {
          inputElement.value += ' @';
        } else {
          inputElement.value += '@';
        }
        var match = getMentionQuery();
        if (match) {
          activeIdx = 0;
          renderPop(match);
        }
      }
    };
  }

  /* ---- comment thread (5.0, Comment) ------------------------------------- */
  function commentThread(kind, item, onChange) {
    var user = OC.store.user(OC.store.session());
    if (!OC.can.canSeeComments(user, item)) return null;

    var label = 'Comment on ' + (item.title || String(item.body).slice(0, 40));
    var body = h('input', { type: 'text', placeholder: 'add a comment or type @ to mention...', 'aria-label': label });
    var count = (item.comments || []).length;
    var deptNames = (Array.isArray(item.departments) && item.departments.length)
      ? item.departments.map(function (did) { return (OC.store.department(did) || {}).name || did; }).join(', ')
      : ((OC.store.department(item.department) || {}).name || 'Department');

    var replyingBadgeWrap = h('div', { style: 'display:none;' });
    var activeReplyTarget = null;

    function setReplyContext(targetAuthor, targetComment) {
      activeReplyTarget = (targetAuthor && targetComment) ? {
        id: targetComment.id,
        author_id: targetAuthor.id || targetComment.author,
        author_name: targetAuthor.name || targetComment.author,
        body: (targetComment.body || '').slice(0, 75)
      } : null;

      clear(replyingBadgeWrap);
      if (activeReplyTarget) {
        replyingBadgeWrap.style.display = 'block';
        replyingBadgeWrap.appendChild(h('div', { class: 'reply-draft-banner' }, [
          h('div', { class: 'reply-draft-info' }, [
            h('span', { class: 'reply-draft-header' }, [
              h('span', {}, '↳ Replying to ' + activeReplyTarget.author_name)
            ]),
            h('span', { class: 'reply-draft-snippet' }, '"' + activeReplyTarget.body + '"')
          ]),
          h('button', {
            type: 'button',
            class: 'replying-cancel-btn',
            title: 'Cancel reply',
            onClick: function (e) {
              e.preventDefault();
              setReplyContext(null, null);
            }
          }, OC.icon('close'))
        ]));
      } else {
        replyingBadgeWrap.style.display = 'none';
      }
      body.focus();
    }

    /* @mention only offers people who can actually see this thread — an
       instruction or a todo is scoped to a department, and mentioning someone
       outside it would notify a person who cannot open the item to read the
       comment. */
    var mentionPool = OC.store.state.users.filter(function (u) {
      if (kind === 'todo') return OC.can.seeTodo ? OC.can.seeTodo(u, item) : true;
      return OC.can.seeInstruction ? OC.can.seeInstruction(u, item) : true;
    });
    var mentionHelper = attachMentionAutocomplete(body, mentionPool, function (mentionedUser) {});

    var bodyWrap = h('div', { class: 'thread-body' });
    var bodyBuilt = false;

    /* A thread starts closed, so everything inside it — every comment, the
       reply box, its buttons — is built the first time it is actually opened
       rather than for every row on the page. On a busy board those unopened
       threads were the bulk of the DOM and most of the cost of drawing it. */
    function buildThreadBody() {
      if (bodyBuilt) return;
      bodyBuilt = true;
      append(bodyWrap, [
        h('div', { class: 'dept-visibility-notice' }, [
          OC.icon('lock'),
          h('span', {}, 'Visible to ' + deptNames + ' team members & System Admin only.')
        ]),
        (item.comments || []).map(function (c) {
          var canEdit = OC.can && OC.can.canEditComment ? OC.can.canEditComment(user, c, item) : (user && (user.admin || c.author === user.id));
          var canDel = OC.can && OC.can.canDeleteComment ? OC.can.canDeleteComment(user, c, item) : (user && (user.admin || c.author === user.id));
          var commentAuthorUser = OC.store.user(c.author);

          var replyQuoteNode = null;
          if (c.reply_to) {
            var replyAuthor = c.reply_to.author_name || (OC.store.user(c.reply_to.author_id) ? OC.store.user(c.reply_to.author_id).name : c.reply_to.author_id);
            replyQuoteNode = h('div', {
              class: 'msg-reply-quote',
              title: 'Replying to ' + replyAuthor
            }, [
              h('span', { class: 'msg-reply-quote-author' }, [
                h('span', {}, '↳'),
                h('span', {}, replyAuthor || 'Someone')
              ]),
              h('span', { class: 'msg-reply-quote-snippet' }, c.reply_to.body || c.reply_to.text || 'Original comment')
            ]);
          }

          return h('div', { class: 'comment', id: 'comm-' + c.id }, [
            h('div', { class: 'comment-by' }, [
              person(c.author, 'strong'),
              h('span', {}, fmtWhen(c.posted_at)),
              c.edited_at ? h('span', { class: 'comment-edited-tag', style: 'font-size:9.5px;opacity:0.7;' }, '(edited)') : null,
              h('div', { class: 'comment-tools push' }, [
                h('button', {
                  class: 'btn-inline',
                  type: 'button',
                  title: 'Reply to this comment',
                  onClick: function (e) {
                    e.preventDefault();
                    setReplyContext(commentAuthorUser || { id: c.author, name: c.author }, c);
                  }
                }, 'Reply'),
                canEdit ? h('button', {
                  class: 'btn-inline',
                  type: 'button',
                  title: 'Edit comment',
                  onClick: function (e) {
                    e.preventDefault();
                    var editInput = h('textarea', {}, c.body);
                    modal({
                      title: 'Edit comment',
                      content: field('Comment', editInput, { required: true }),
                      actions: [
                        { label: 'Cancel', onClick: function (close) { close(); } },
                        {
                          label: 'Save', primary: true, onClick: function (close) {
                            var newText = editInput.value.trim();
                            if (!newText) return 'Comment cannot be empty.';
                            OC.store.mutate({
                              actor: user.id, action: kind + '.comment.edit',
                              target: item.title || (item.body ? item.body.slice(0, 40) : item.id),
                              detail: 'Edited comment'
                            }, function () {
                              OC.store.editComment(kind, item.id, c.id, newText);
                            });
                            toast('Comment updated.');
                            if (onChange) onChange();
                            else OC.store.emit();
                            close();
                          }
                        }
                      ]
                    });
                  }
                }, 'Edit') : null,
                canDel ? h('button', {
                  class: 'btn-inline danger',
                  type: 'button',
                  title: 'Delete comment',
                  onClick: function (e) {
                    e.preventDefault();
                    confirm('Delete this comment? This cannot be undone.', function () {
                      OC.store.mutate({
                        actor: user.id, action: kind + '.comment.delete',
                        target: item.title || (item.body ? item.body.slice(0, 40) : item.id),
                        detail: 'Deleted comment'
                      }, function () {
                        OC.store.deleteComment(kind, item.id, c.id);
                      });
                      toast('Comment deleted.');
                      if (onChange) onChange();
                      else OC.store.emit();
                    });
                  }
                }, 'Delete') : null
              ].filter(Boolean))
            ]),
            replyQuoteNode,
            h('div', { class: 'comment-body-text' }, formatMentions(c.body))
          ]);
        }),
        (function () {
          function submitComment() {
            var text = body.value.trim();
            if (!text) return;
            var extra = {};
            if (activeReplyTarget) {
              extra.reply_to = activeReplyTarget;
            }

            OC.store.mutate({
              actor: user ? user.id : OC.store.session(), action: kind + '.comment',
              target: item.title || (item.body ? item.body.slice(0, 40) : item.id), detail: text
            }, function () {
              OC.store.comment(kind, item.id, text, user ? user.id : OC.store.session(), extra);
              if (kind === 'instruction') {
                markInstructionRead(item, user ? user.id : OC.store.session());
              }
            });

            // Targeted notification: Send to owner, assignee, thread participants & ALL @mentioned users
            var targets = [];
            if (kind === 'todo') {
              if (item.created_by) targets.push(item.created_by);
              if (Array.isArray(item.assignees)) {
                item.assignees.forEach(function (aid) {
                  if (aid.indexOf('user:') === 0) targets.push(aid.slice(5));
                  else if (aid.indexOf('group:') === 0) {
                    var g = OC.store.group(aid.slice(6));
                    if (g && g.members) targets = targets.concat(g.members);
                  } else {
                    targets.push(aid);
                  }
                });
              }
              if (item.assignee_type === 'user' && item.assignee) targets.push(item.assignee);
              else if (item.assignee_type === 'group' && item.assignee) {
                var g = OC.store.group(item.assignee);
                if (g && g.members) targets = targets.concat(g.members);
              }
            } else if (kind === 'instruction') {
              if (item.author) targets.push(item.author);
            }
            (item.comments || []).forEach(function (c) {
              if (c.author) targets.push(c.author);
            });

            // If replying to someone, ensure they get notified
            if (activeReplyTarget && activeReplyTarget.author_id) {
              targets.push(activeReplyTarget.author_id);
            }

            // Add explicitly mentioned users
            var mentionedIds = extractMentionedUserIds(text);
            targets = targets.concat(mentionedIds);

            var curUid = user ? user.id : OC.store.session();
            var curName = user ? user.name : 'Someone';
            targets = targets.filter(function (uid, idx, arr) {
              return uid && uid !== curUid && arr.indexOf(uid) === idx;
            });

            if (targets.length) {
              var itemTitle = kind === 'todo' ? item.title : (item.body ? item.body.slice(0, 35) + '…' : 'instruction');
              OC.store.notify(targets, curName + ' commented on ' + (kind === 'todo' ? 'task: "' + itemTitle + '"' : 'instruction: "' + itemTitle + '"'), item.id);
            }

            body.value = '';
            setReplyContext(null, null);
            if (onChange) onChange();
            else OC.store.emit();
          }

          body.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitComment();
            }
          });

          return h('div', { class: 'comment-form' }, [
            replyingBadgeWrap,
            h('div', { class: 'comment-form-row' }, [
              body,
              h('button', {
                class: 'btn small primary', type: 'button', onClick: submitComment
              }, 'Post')
            ])
          ]);
        })()
      ]);
    }

    var wrap = h('details', { class: 'thread' }, [
      h('summary', {}, [
        h('span', {}, count ? count + (count === 1 ? ' comment' : ' comments') : 'Comment'),
        h('span', { class: 'dept-visibility-tag' }, deptNames + ' & Admin only')
      ]),
      bodyWrap
    ]);
    wrap.addEventListener('toggle', function () { if (wrap.open) buildThreadBody(); });
    return wrap;
  }

  /* ---- modal ------------------------------------------------------------ */
  /* ---- copy to clipboard ------------------------------------------------ */
  /* Every copy button in the app goes through here. Three things this fixes
     over calling navigator.clipboard directly at each site:
       - the promise is actually settled before claiming success, so a denied
         or rejected write no longer reports "copied" when nothing was;
       - a rejection (permission denied, or the document not focused, which is
         common while a modal is open) falls back instead of failing silently;
       - the last-resort path is a selectable text box, not prompt(), which
         blocks the page and is disabled outright in some browsers. */
  function copyText(text, okMessage) {
    var value = String(text === null || text === undefined ? '' : text);
    var ok = function () { toast(okMessage || 'Copied to clipboard.'); };
    var fallback = function () { copyByExecCommand(value, okMessage); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        navigator.clipboard.writeText(value).then(ok, fallback);
        return;
      } catch (_) { /* some browsers throw synchronously; fall through */ }
    }
    fallback();
  }

  function copyByExecCommand(value, okMessage) {
    /* a modal <dialog> makes the rest of the document inert, so the scratch
       textarea has to live inside the open dialog or there is nothing
       selectable for execCommand to copy from */
    var dialogs = document.querySelectorAll('dialog[open]');
    var host = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
    var ta = h('textarea', { readonly: true, style: 'position:fixed;top:0;left:-9999px;opacity:0;' });
    ta.value = value;
    host.appendChild(ta);
    var copied = false;
    try {
      ta.focus();
      ta.select();
      if (ta.setSelectionRange) ta.setSelectionRange(0, value.length);
      copied = document.execCommand('copy');
    } catch (_) { copied = false; }
    if (ta.parentNode) ta.parentNode.removeChild(ta);
    if (copied) { toast(okMessage || 'Copied to clipboard.'); return; }
    showCopyBox(value);
  }

  /* last resort: show the text so it can be selected and copied by hand */
  function showCopyBox(value) {
    var box = h('textarea', {
      readonly: true, rows: Math.min(10, Math.max(3, value.split('\n').length + 1)),
      style: 'width:100%;font-family:var(--font-mono);font-size:12px;line-height:1.5;'
    });
    box.value = value;
    modal({
      title: 'Copy manually',
      content: h('div', {}, [
        h('p', { class: 'muted', style: 'margin:0 0 10px;font-size:12.5px;' },
          'Automatic copying is unavailable here. Select the text below and press Ctrl+C (\u2318C on Mac).'),
        box
      ]),
      actions: [{ label: 'Done', primary: true, onClick: function (close) { close(); } }]
    });
    setTimeout(function () { try { box.focus(); box.select(); } catch (_) {} }, 50);
  }

  /* Every dialog builds its footer from the same {label} list, so the icon for
     a given action is decided here rather than at each of the thirty-odd call
     sites — one place to keep Save, Cancel and Delete looking alike wherever
     they appear. A label with no entry simply gets no icon. */
  var ACTION_ICONS = {
    'cancel': 'close', 'close': 'close', 'done': 'check',
    'save': 'save', 'save changes': 'save', 'save & close': 'save',
    'create': 'plus', 'add': 'plus', 'insert': 'link',
    'delete': 'trash', 'remove': 'trash', 'archive': 'inbox',
    'send': 'send', 'edit': 'edit', 'edit task': 'edit',
    'copy': 'copy', 'download': 'download', 'refresh': 'refresh'
  };

  function actionIconFor(label) {
    if (typeof label !== 'string') return null;
    var key = label.trim().toLowerCase();
    var name = ACTION_ICONS[key];
    if (!name) {
      /* "Create todo", "Delete client", "Save changes" and friends: match on
         the verb the label opens with rather than listing every object */
      var first = key.split(' ')[0];
      name = ACTION_ICONS[first];
    }
    return name && OC.icon ? OC.icon(name) : null;
  }

  function modal(opts) {
    opts = opts || {};
    var dlgClass = 'modal' + (opts.className ? ' ' + opts.className : '');
    var dlg = h('dialog', { class: dlgClass });
    var backdrop = null;
    var escapeHandler = null;
    var errorBox = h('div', { class: 'error', style: 'display:none;' });
    var errorText = h('span', {});
    errorBox.appendChild(OC.icon('alert'));
    errorBox.appendChild(errorText);

    function close() {
      if (escapeHandler) { document.removeEventListener('keydown', escapeHandler); escapeHandler = null; }
      if (backdrop) { backdrop.remove(); backdrop = null; }
      if (dlg.open && typeof dlg.close === 'function') dlg.close();
      dlg.remove();
    }

    var primaryButton = null;
    var actions = (opts.actions || []).map(function (a) {
      var button = h('button', {
        class: 'btn' + (a.primary ? ' primary' : ''),
        type: 'button',
        onClick: function () {
          var problem = a.onClick ? a.onClick(close) : null;
          if (problem) {
            errorText.textContent = problem;
            errorBox.style.display = 'flex';
            /* The error prints at the top of the body, but a long form is
               usually scrolled well past it by the time anyone presses the
               action — so the button read as dead while it was in fact
               refusing, in writing, off screen. Bring the reason to them. */
            if (errorBox.scrollIntoView) {
              try {
                errorBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              } catch (_) {
                errorBox.scrollIntoView();
              }
            }
          }
        }
      }, (function () {
        var ico = actionIconFor(a.label);
        return ico ? [ico, h('span', {}, a.label)] : a.label;
      })());
      if (a.primary) primaryButton = button;
      return button;
    });

    dlg.appendChild(h('div', { class: 'modal-head' }, [
      h('h2', {}, opts.title),
      h('button', { class: 'iconbtn push', type: 'button', 'aria-label': 'Close', onClick: close }, OC.icon('close'))
    ]));
    var bodyClass = 'modal-body' + (opts.bodyClass ? ' ' + opts.bodyClass : '');
    dlg.appendChild(h('div', { class: bodyClass }, [errorBox, opts.content]));
    if (actions.length) dlg.appendChild(h('div', { class: 'modal-foot' }, actions));

    /* Enter anywhere but a textarea runs the primary action. Without this a
       filled-in form plus the Enter key does nothing at all, which reads as a
       broken button. */
    dlg.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !primaryButton) return;
      var tag = e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      primaryButton.click();
    });

    /* clicking the backdrop dismisses, as people expect */
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });

    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () { dlg.remove(); if (backdrop) backdrop.remove(); });

    /* <dialog> is not everywhere. Without this fallback every modal button is
       dead on an older browser rather than merely unstyled. */
    if (typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else {
      backdrop = h('div', { class: 'modal-backdrop', onClick: close });
      document.body.appendChild(backdrop);
      dlg.setAttribute('open', '');
      if (dlg.classList && dlg.classList.add) dlg.classList.add('fallback');
      escapeHandler = function (e) { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', escapeHandler);
    }

    var first = dlg.querySelector('input,textarea,select');
    if (first) first.focus();
    return { close: close, root: dlg };
  }

  function confirm(message, onYes) {
    modal({
      title: 'Confirm',
      content: h('p', {}, message),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Confirm', primary: true, onClick: function (close) {
            close();
            if (typeof onYes === 'function') {
              setTimeout(function () {
                onYes();
              }, 20);
            }
          }
        }
      ]
    });
  }

  /* ---- custom client creation modal & picker --------------------------- */
  function newClientModal(onCreated) {
    var user = OC.store.user(OC.store.session());
    var canCreate = Boolean(user && (user.admin || (OC.can && OC.can.createClient && OC.can.createClient(user))));
    if (!canCreate) {
      if (OC.ui && typeof OC.ui.toast === 'function') {
        OC.ui.toast('Only System Admins can add clients.');
      } else if (typeof toast === 'function') {
        toast('Only System Admins can add clients.');
      }
      return;
    }

    var name = h('input', { type: 'text', placeholder: 'e.g. Acme Corp, Apex Solutions' });
    var clientId = h('input', { type: 'text', placeholder: 'e.g. 0583, CL-101' });
    var clientCode = h('input', { type: 'text', placeholder: 'e.g. TFR, ACME' });
    var clientNumber = h('input', { type: 'text', placeholder: 'e.g. 0624, 7781' });

    var canScope = Boolean(user && (user.admin || (OC.can && OC.can.headOfAny && OC.can.headOfAny(user))));
    var canAssign = !!(OC.can && OC.can.canAssignClientMembers ? OC.can.canAssignClientMembers(user) : (user && (user.admin || (OC.can && OC.can.headOfAny && OC.can.headOfAny(user)))));

    var defaultDepts = [];
    if (user && !user.admin) {
      defaultDepts = (user.departments || []).map(function (m) { return typeof m === 'string' ? m : m.department; }).filter(Boolean);
      if (!defaultDepts.length && user.department) defaultDepts = [user.department];
    }

    var assigneePicker = canAssign ? clientAssigneePicker([], defaultDepts, null) : null;
    var deptCheckboxes = canScope ? deptCheckboxGroup(defaultDepts, function (newDepts) {
      if (assigneePicker) assigneePicker.setDepartments(newDepts);
    }) : null;

    (OC.ui && OC.ui.modal ? OC.ui.modal : modal)({
      title: 'Add new client',
      content: h('div', {}, [
        field('Client ID', clientId, { required: true, hint: 'Unique client identifier or account number. This one is required.' }),
        field('Client number', clientNumber, { hint: 'The client’s own number — not a phone number (optional).' }),
        field('Client code', clientCode, { hint: 'Short ticker or abbreviation code (optional).' }),
        field('Client / Company name', name, { hint: 'Official client or company name for task assignment (optional).' }),
        canScope ? field('Assigned Department(s)', deptCheckboxes.node, { hint: 'Select the department(s) this client is assigned to.' }) : null,
        canAssign ? field('Assigned Member(s)', assigneePicker.node, { hint: 'Select the specific team members allowed to see and work on this client.' }) : null
      ].filter(Boolean)),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Add client', primary: true, onClick: function (close) {
            var currentUser = OC.store.user(OC.store.session());
            var canAddNow = Boolean(currentUser && (currentUser.admin || (OC.can && OC.can.createClient && OC.can.createClient(currentUser)) || (OC.can && OC.can.headOfAny && OC.can.headOfAny(currentUser))));
            if (!canAddNow) {
              return 'Only System Admins or Department Heads can add clients.';
            }

            var cName = name.value.trim();
            var cIdVal = clientId.value.trim();
            var cCodeVal = clientCode.value.trim();
            var cNumVal = clientNumber.value.trim();

            /* the Client ID is the one field a client cannot go without */
            if (!cIdVal) return 'Please enter a Client ID.';

            if (cName) {
              var exists = OC.store.state.clients.some(function (c) {
                return c.name && c.name.toLowerCase().trim() === cName.toLowerCase();
              });
              if (exists) return 'A client with this name already exists.';
            }

            if (cIdVal) {
              var idExists = OC.store.state.clients.some(function (c) {
                return c.client_id && c.client_id.toLowerCase().trim() === cIdVal.toLowerCase();
              });
              if (idExists) return 'Duplicate Client ID: "' + cIdVal + '" is already used by another client.';
            }

            if (cCodeVal) {
              var codeExists = OC.store.state.clients.some(function (c) {
                return c.client_code && c.client_code.toLowerCase().trim() === cCodeVal.toLowerCase();
              });
              if (codeExists) return 'Duplicate Client Code: "' + cCodeVal + '" is already used by another client.';
            }

            if (cNumVal) {
              var numExists = OC.store.state.clients.some(function (c) {
                var num = (c.client_number || c.contact || '').toLowerCase().trim();
                return num && num === cNumVal.toLowerCase();
              });
              if (numExists) return 'Duplicate Client Number: "' + cNumVal + '" is already used by another client.';
            }

            var selectedAssignees = (canAssign && assigneePicker) ? assigneePicker.getAssignees() : [];
            var selectedDepts = (canScope && deptCheckboxes) ? deptCheckboxes.getDepartments() : defaultDepts;
            var primaryDept = (canScope && deptCheckboxes) ? deptCheckboxes.getValue() : (defaultDepts.length ? defaultDepts[0] : '');
            var newClient = {
              id: OC.store.uid('c'),
              name: cName,
              client_id: cIdVal,
              client_code: cCodeVal,
              client_number: cNumVal,
              contact: cNumVal || cName || cIdVal,
              departments: selectedDepts,
              department: primaryDept,
              assignees: selectedAssignees,
              assigned_users: selectedAssignees,
              status: 'active'
            };

            OC.store.mutate({
              actor: user ? user.id : 'u-shohag',
              action: 'client.create',
              target: clientLabel(newClient),
              clientId: newClient.id,
              client: newClient,
              departments: selectedDepts,
              department: primaryDept,
              assignees: selectedAssignees,
              detail: 'Added client ' + clientLabel(newClient)
            }, function () {
              OC.store.state.clients.push(newClient);
            });

            toast('Client "' + clientLabel(newClient) + '" added.');
            if (onCreated) onCreated(newClient);
            close();
          }
        }
      ]
    });
  }

  function clientPicker(selectedValues, onChange) {
    var user = OC.store.user(OC.store.session());
    var canAdd = !!(OC.can && OC.can.createClient ? OC.can.createClient(user) : (user && user.admin));

    var chosen = [];
    (Array.isArray(selectedValues) ? selectedValues : [selectedValues]).forEach(function (val) {
      if (val && chosen.indexOf(val) === -1) chosen.push(val);
    });

    var root = h('div', { class: 'multi-picker client-multi-picker' });
    var topRow = h('div', { class: 'multi-picker-head' });
    var chipsWrap = h('div', { class: 'multi-picker-chips' });
    var searchInput = h('input', { type: 'search', placeholder: 'Search clients...', 'aria-label': 'Filter clients', style: 'flex:1;' });
    var listWrap = h('div', { class: 'multi-picker-list', role: 'group', 'aria-label': 'Clients' });
    var countWrap = h('div', { class: 'multi-picker-count' });

    /* A client book runs to hundreds. Rendering all of them put ~23 screens of
       scrolling inside a 170px box and built a DOM row for every one on every
       keystroke, so the list is capped and the search is the way through it.
       Anything already ticked is exempt from the cap and sorted to the top —
       a selection you cannot see is worse than a long list. */
    var LIST_LIMIT = 10;
    var showAll = false;

    var addBtn = canAdd ? h('button', {
      class: 'btn small',
      type: 'button',
      title: 'Add new client',
      onClick: function () {
        newClientModal(function (newClient) {
          if (chosen.indexOf(newClient.id) === -1) chosen.push(newClient.id);
          render();
          if (onChange) onChange(getClients());
        });
      }
    }, [OC.icon ? OC.icon('plus') : '+', ' New Client']) : null;

    topRow.appendChild(searchInput);
    if (addBtn) topRow.appendChild(addBtn);

    function renderChips() {
      clear(chipsWrap);
      if (!chosen.length) {
        chipsWrap.appendChild(h('span', { class: 'muted', style: 'font-size:12px;font-style:italic;' }, 'No client selected (select from list below)'));
        return;
      }
      chosen.forEach(function (cid) {
        var c = OC.store.client(cid);
        var label = c ? clientLabel(c) : cid;

        var removeBtn = h('button', {
          type: 'button',
          class: 'chip-remove',
          title: 'Remove ' + label,
          onClick: function (e) {
            e.preventDefault();
            e.stopPropagation();
            var at = chosen.indexOf(cid);
            if (at > -1) chosen.splice(at, 1);
            render();
            if (onChange) onChange(getClients());
          }
        }, OC.icon('close'));

        var chip = h('span', { class: 'multi-picker-chip client-chip' }, [
          h('span', {}, label),
          removeBtn
        ]);
        chipsWrap.appendChild(chip);
      });
    }

    function renderList() {
      clear(listWrap);
      var q = (searchInput.value || '').trim().toLowerCase();
      var pickerUser = OC.store.user(OC.store.session());
      var pool = (OC.can && OC.can.visibleClients && pickerUser)
        ? OC.can.visibleClients(pickerUser)
        : (OC.store.state.clients || []);
      var clients = pool.filter(function (c) {
        if (!q) return true;
        var full = [c.client_id, c.client_code, c.name, c.contact].filter(Boolean).join(' ').toLowerCase();
        return full.indexOf(q) > -1;
      });

      if (!clients.length) {
        listWrap.appendChild(h('p', { class: 'ticklist-empty' }, 'No clients found' + (q ? ' matching "' + q + '"' : '') + '. Click "+ New Client" above.'));
        renderCount(0, 0, q);
        return;
      }

      /* stable sort, so unticked clients keep the order they came in */
      clients.sort(function (a, b) {
        return (chosen.indexOf(a.id) > -1 ? 0 : 1) - (chosen.indexOf(b.id) > -1 ? 0 : 1);
      });

      var visible = showAll ? clients : clients.slice(0, Math.max(LIST_LIMIT, chosen.length));
      renderCount(visible.length, clients.length, q);

      visible.forEach(function (c) {
        var isChecked = chosen.indexOf(c.id) > -1;
        var display = clientLabel(c);
        var chk = h('input', {
          type: 'checkbox',
          value: c.id,
          checked: isChecked,
          onChange: function (e) {
            var at = chosen.indexOf(c.id);
            if (e.target.checked && at === -1) chosen.push(c.id);
            if (!e.target.checked && at > -1) chosen.splice(at, 1);
            /* chips only — rebuilding the list under the pointer swallows the
               click, see the note in assigneePicker */
            renderChips();
            if (onChange) onChange(getClients());
          }
        });

        var line = h('label', { class: 'multi-picker-item-line' }, [
          chk,
          h('span', { style: 'font-weight:500;' }, display),
          c.contact && c.contact !== c.name ? h('span', { class: 'muted', style: 'margin-left:auto;font-size:11px;' }, c.contact) : null
        ].filter(Boolean));
        listWrap.appendChild(line);
      });
    }

    /* says how much of the book is on screen, and offers the rest — without it
       a capped list silently hides clients the user knows exist */
    function renderCount(shownCount, totalCount, q) {
      clear(countWrap);
      if (totalCount <= LIST_LIMIT) return;
      countWrap.appendChild(h('span', {}, 'Showing ' + shownCount + ' of ' + totalCount +
        (q ? ' matches' : ' clients') + (showAll ? '' : ' — type to search')));
      countWrap.appendChild(h('button', {
        class: 'btn small', type: 'button',
        onClick: function (e) {
          e.preventDefault();
          showAll = !showAll;
          renderList();
        }
      }, showAll ? 'Show fewer' : 'Show all ' + totalCount));
    }

    function render() {
      renderChips();
      renderList();
    }

    searchInput.addEventListener('input', renderList);

    root.appendChild(chipsWrap);
    root.appendChild(topRow);
    root.appendChild(listWrap);
    root.appendChild(countWrap);

    render();

    function getClients() { return chosen.slice(); }
    function getValue() { return chosen.length ? chosen[0] : ''; }

    return {
      node: root,
      getValue: getValue,
      getClients: getClients,
      setValue: function (v) {
        chosen = (Array.isArray(v) ? v : [v]).filter(Boolean);
        render();
      },
      refresh: function () { render(); }
    };
  }

  /* ---- department multi-select picker ------------------------------------- */
  function deptPicker(selectedValues, currentUser, onChange) {
    currentUser = currentUser || OC.store.user(OC.store.session());
    var allDepts = OC.store.state.departments || [];
    var allowedDepts = (currentUser && currentUser.admin) ? allDepts
      : allDepts.filter(function (d) { return OC.can && OC.can.inDept ? OC.can.inDept(currentUser, d.id) : true; });

    var chosen = [];
    (Array.isArray(selectedValues) ? selectedValues : [selectedValues]).forEach(function (val) {
      if (val && chosen.indexOf(val) === -1) chosen.push(val);
    });

    var isFixed = !(currentUser && currentUser.admin);
    if (isFixed && !chosen.length && allowedDepts.length > 0) {
      chosen = allowedDepts.map(function (d) { return d.id; });
    }

    var root = h('div', { class: 'multi-picker dept-multi-picker' });
    var chipsWrap = h('div', { class: 'multi-picker-chips' });
    var searchInput = h('input', { type: 'search', placeholder: 'Search departments...', 'aria-label': 'Filter departments' });
    var listWrap = h('div', { class: 'multi-picker-list', role: 'group', 'aria-label': 'Departments' });

    function renderChips() {
      clear(chipsWrap);
      if (!chosen.length) {
        chipsWrap.appendChild(h('span', { class: 'muted', style: 'font-size:12px;font-style:italic;' }, 'No department selected (select below)'));
        return;
      }
      chosen.forEach(function (did) {
        var d = OC.store.department(did);
        var label = d ? d.name : did;

        var removeBtn = isFixed ? null : h('button', {
          type: 'button',
          class: 'chip-remove',
          title: 'Remove ' + label,
          onClick: function (e) {
            e.preventDefault();
            e.stopPropagation();
            var at = chosen.indexOf(did);
            if (at > -1) chosen.splice(at, 1);
            render();
            if (onChange) onChange(getDepartments());
          }
        }, OC.icon('close'));

        var chip = h('span', { class: 'multi-picker-chip dept-chip' }, [
          h('span', {}, label + (isFixed ? ' (Fixed)' : '')),
          removeBtn
        ].filter(Boolean));
        chipsWrap.appendChild(chip);
      });
    }

    function renderList() {
      clear(listWrap);
      var q = (searchInput.value || '').trim().toLowerCase();
      var depts = allowedDepts.filter(function (d) {
        return !q || d.name.toLowerCase().indexOf(q) > -1 || d.id.toLowerCase().indexOf(q) > -1;
      });

      if (!depts.length) {
        listWrap.appendChild(h('p', { class: 'ticklist-empty' }, 'No departments found matching "' + q + '"'));
        return;
      }

      depts.forEach(function (d) {
        var isChecked = chosen.indexOf(d.id) > -1;
        var chk = h('input', {
          type: 'checkbox',
          value: d.id,
          checked: isChecked,
          disabled: isFixed,
          title: isFixed ? 'Fixed to your assigned department' : '',
          onChange: function (e) {
            if (isFixed) return;
            var at = chosen.indexOf(d.id);
            if (e.target.checked && at === -1) chosen.push(d.id);
            if (!e.target.checked && at > -1) chosen.splice(at, 1);
            /* chips only — rebuilding the list under the pointer swallows the
               click, see the note in assigneePicker */
            renderChips();
            if (onChange) onChange(getDepartments());
          }
        });

        var line = h('label', { class: 'multi-picker-item-line', style: isFixed ? 'cursor:default;opacity:0.85;' : '' }, [
          chk,
          h('span', { style: 'font-weight:500;' }, d.name + (isFixed ? ' (Fixed)' : '')),
          h('span', { class: 'chip custom', style: 'margin-left:auto;font-size:10.5px;' }, d.id)
        ]);
        listWrap.appendChild(line);
      });
    }

    function render() {
      renderChips();
      renderList();
    }

    searchInput.addEventListener('input', renderList);

    root.appendChild(chipsWrap);
    root.appendChild(searchInput);
    root.appendChild(listWrap);

    render();

    function getDepartments() { return chosen.slice(); }
    function getValue() { return chosen.length ? chosen[0] : ''; }

    return {
      node: root,
      getValue: getValue,
      getDepartments: getDepartments,
      setValue: function (v) {
        chosen = (Array.isArray(v) ? v : [v]).filter(Boolean);
        render();
      },
      refresh: function () { render(); }
    };
  }

  /* ---- department checkbox group (multiple selection for client scoping etc.) ---- */
  function deptCheckboxGroup(selectedValues, onChange) {
    var chosen = [];
    (Array.isArray(selectedValues) ? selectedValues : (selectedValues ? [selectedValues] : [])).forEach(function (val) {
      if (val && chosen.indexOf(val) === -1) chosen.push(val);
    });

    var summaryText = h('div', { class: 'muted', style: 'font-size:12px;margin-top:7px;line-height:1.4;' });
    var root = h('div', { class: 'dept-checkbox-group' });

    function updateSummary() {
      if (!chosen.length) {
        summaryText.innerHTML = '<span style="color:var(--danger, #ef4444);font-weight:600;">⚠️ No department selected</span> — Only System Admin can view unassigned clients.';
      } else {
        var names = chosen.map(function (did) {
          var d = OC.store.department(did);
          return escapeHtml(d ? d.name : did);
        }).join(', ');
        summaryText.innerHTML = '<span style="color:var(--brand-orange, #f59e0b);font-weight:600;">🔒 Assigned strictly to:</span> ' + names + ' & System Admin';
      }
    }

    var listContainer = h('div', { class: 'dept-checkbox-list' });

    (OC.store.state.departments || []).forEach(function (d) {
      var isChecked = chosen.indexOf(d.id) > -1;
      var chk = h('input', {
        type: 'checkbox',
        id: 'dept_chk_' + d.id + '_' + Math.random().toString(36).slice(2, 6),
        value: d.id,
        checked: isChecked,
        style: 'cursor:pointer;width:15px;height:15px;margin:0;',
        onChange: function (e) {
          var at = chosen.indexOf(d.id);
          if (e.target.checked && at === -1) chosen.push(d.id);
          if (!e.target.checked && at > -1) chosen.splice(at, 1);
          updateSummary();
          if (onChange) onChange(chosen.slice());
        }
      });

      var label = h('label', {
        style: 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;padding:5px 6px;border-radius:4px;user-select:none;transition:background 0.15s;'
      }, [
        chk,
        h('span', { style: 'font-weight:500;' }, d.name)
      ]);
      listContainer.appendChild(label);
    });

    updateSummary();

    root.appendChild(listContainer);
    root.appendChild(summaryText);

    return {
      node: root,
      getDepartments: function () { return chosen.slice(); },
      getValue: function () { return chosen.length ? chosen[0] : ''; },
      setValue: function (arr) {
        chosen = (Array.isArray(arr) ? arr : (arr ? [arr] : [])).slice();
        updateSummary();
      }
    };
  }

  /* ---- client assignee picker (multi-select persons for client assignment) ---- */
  function clientAssigneePicker(selectedUserIds, candidateDeptIds, onChange) {
    var chosen = [];
    (Array.isArray(selectedUserIds) ? selectedUserIds : (selectedUserIds ? [selectedUserIds] : [])).forEach(function (val) {
      if (val && chosen.indexOf(val) === -1) chosen.push(val);
    });

    function normalizeDepts(depts) {
      var res = [];
      (Array.isArray(depts) ? depts : (depts ? [depts] : [])).forEach(function (did) {
        if (!did) return;
        var dObj = OC.store && OC.store.department ? OC.store.department(did) : null;
        var cid = dObj ? dObj.id : String(did);
        if (cid && res.indexOf(cid) === -1) res.push(cid);
      });
      return res;
    }

    var currentDepts = normalizeDepts(candidateDeptIds);
    var searchStr = '';

    var root = h('div', { class: 'client-assignee-picker', style: 'display:flex;flex-direction:column;gap:8px;' });
    var searchInput = h('input', {
      type: 'search',
      placeholder: 'Filter team members by name...',
      style: 'width:100%;font-size:12.5px;padding:6px 10px;',
      onInput: function (e) {
        searchStr = (e.target.value || '').toLowerCase().trim();
        renderList();
      }
    });

    var summaryText = h('div', { class: 'muted', style: 'font-size:12px;line-height:1.4;' });
    var listContainer = h('div', { class: 'client-assignee-list' });

    function getDeptNames() {
      if (!currentDepts.length) return '';
      return currentDepts.map(function (did) {
        var d = OC.store && OC.store.department ? OC.store.department(did) : null;
        return d ? d.name : did;
      }).join(', ');
    }

    function getEligibleUsers() {
      var allUsers = (OC.store.state.users || []).filter(function (u) {
        return u && u.status !== 'archived' && u.status !== 'suspended';
      });
      /* no department to scope by means no restriction, not zero
         candidates — a client left open to every department (or an admin
         with nothing yet to scope to) still needs a full roster to pick
         from, same as before departments started narrowing this list */
      if (!currentDepts.length) return allUsers;
      return allUsers.filter(function (u) {
        return currentDepts.some(function (dId) {
          if (OC.can && OC.can.inDept) {
            return OC.can.inDept(u, dId);
          }
          var uDepts = Array.isArray(u.departments) ? u.departments : [];
          if (u.department) uDepts = uDepts.concat([u.department]);
          return uDepts.some(function (m) {
            var mId = typeof m === 'string' ? m : (m && m.department);
            return mId === dId;
          });
        });
      });
    }

    function updateSummary() {
      var dName = getDeptNames();
      var deptBadge = dName ? ('<div style="font-size:11.5px;color:var(--cyan);margin-bottom:4px;font-weight:600;">Department: ' + escapeHtml(dName) + '</div>') : '';
      if (!chosen.length) {
        summaryText.innerHTML = deptBadge + '<span style="color:var(--brand-orange, #f59e0b);font-weight:600;">⚠️ No specific member assigned:</span> Accessible only by System Admin and Department Head.';
      } else {
        var names = chosen.map(function (uid) {
          var u = OC.store.user(uid);
          return escapeHtml(u ? u.name : uid);
        }).join(', ');
        summaryText.innerHTML = deptBadge + '<span style="color:var(--success, #10b981);font-weight:600;">👥 Assigned Members (' + chosen.length + '):</span> ' + names;
      }
    }

    function renderList() {
      clear(listContainer);
      var users = getEligibleUsers();
      if (searchStr) {
        users = users.filter(function (u) {
          return (u.name || '').toLowerCase().indexOf(searchStr) > -1 || (u.email || '').toLowerCase().indexOf(searchStr) > -1;
        });
      }
      if (!users.length) {
        var dName = getDeptNames();
        listContainer.appendChild(h('div', {
          class: 'muted',
          style: 'grid-column:1/-1;padding:16px 12px;text-align:center;font-size:12px;'
        }, dName ? ('No members found in ' + dName + '.') : 'No matching team members found.'));
        return;
      }
      users.forEach(function (u) {
        var isChecked = chosen.indexOf(u.id) > -1;
        var chk = h('input', {
          type: 'checkbox',
          checked: isChecked,
          style: 'cursor:pointer;width:15px;height:15px;margin:0;',
          onChange: function (e) {
            var at = chosen.indexOf(u.id);
            if (e.target.checked && at === -1) chosen.push(u.id);
            if (!e.target.checked && at > -1) chosen.splice(at, 1);
            updateSummary();
            if (onChange) onChange(chosen.slice());
          }
        });
        var role = OC.can && OC.can.roleLabel ? OC.can.roleLabel(u) : 'Member';
        var label = h('label', {
          class: 'assignee-item-line' + (isChecked ? ' is-selected' : '')
        }, [
          chk,
          mark(u.id),
          h('div', { class: 'assignee-item-text' }, [
            h('span', { class: 'assignee-item-name' }, u.name),
            h('span', { class: 'muted', style: 'font-size:11px;' }, role)
          ])
        ]);
        listContainer.appendChild(label);
      });
    }

    if (currentDepts.length) {
      var eligibleIds = getEligibleUsers().map(function (u) { return u.id; });
      chosen = chosen.filter(function (uid) { return eligibleIds.indexOf(uid) > -1; });
    }

    renderList();
    updateSummary();

    root.appendChild(searchInput);
    root.appendChild(listContainer);
    root.appendChild(summaryText);

    return {
      node: root,
      getAssignees: function () { return chosen.slice(); },
      setDepartments: function (newDepts) {
        currentDepts = normalizeDepts(newDepts);
        var eligibleIds = getEligibleUsers().map(function (u) { return u.id; });
        chosen = chosen.filter(function (uid) { return eligibleIds.indexOf(uid) > -1; });
        renderList();
        updateSummary();
        if (onChange) onChange(chosen.slice());
      },
      setAssignees: function (newArr) {
        chosen = (Array.isArray(newArr) ? newArr : []).slice();
        if (currentDepts.length) {
          var eligibleIds = getEligibleUsers().map(function (u) { return u.id; });
          chosen = chosen.filter(function (uid) { return eligibleIds.indexOf(uid) > -1; });
        }
        renderList();
        updateSummary();
      }
    };
  }

  /* ---- assignee picker (multi-select persons & groups) -------------------- */
  function assigneePicker(selectedValues, currentUser, onChange, options) {
    options = options || {};
    currentUser = currentUser || OC.store.user(OC.store.session());
    var assignablePeople = options.users ? options.users : (options.allUsers ? (OC.store.state.users || []) : (OC.can ? OC.can.assignableUsers(currentUser) : (OC.store.state.users || [])));
    var assignableGroups = options.disableGroups ? [] : (OC.can ? OC.can.assignableGroups(currentUser) : (OC.store.state.groups || []));

    var chosen = [];
    (Array.isArray(selectedValues) ? selectedValues : [selectedValues]).forEach(function (val) {
      if (!val) return;
      var str = String(val);
      if (str.indexOf(':') === -1) {
        var isGroup = assignableGroups.some(function (g) { return g.id === str; });
        str = (isGroup ? 'group:' : 'user:') + str;
      }
      if (chosen.indexOf(str) === -1) chosen.push(str);
    });

    var root = h('div', { class: 'assignee-picker' });
    var chipsWrap = h('div', { class: 'assignee-selected-chips' });
    var searchInput = h('input', { type: 'search', placeholder: 'Search team members...', 'aria-label': 'Filter assignees' });
    var listWrap = h('div', { class: 'assignee-list', role: 'group', 'aria-label': 'Assignees' });

    function renderChips() {
      clear(chipsWrap);
      if (!chosen.length) {
        chipsWrap.appendChild(h('span', { class: 'muted', style: 'font-size:12px;font-style:italic;' }, 'No person selected (click below to select)'));
        return;
      }
      chosen.forEach(function (itemVal) {
        var parts = itemVal.split(':');
        var type = parts[0];
        var id = parts[1];
        var label = '';
        var markEl = null;

        if (type === 'group') {
          var g = OC.store.group(id);
          label = g ? g.name + ' (group)' : id;
          markEl = h('span', { class: 'chip group' }, 'Group');
        } else {
          var u = OC.store.user(id);
          label = u ? u.name : id;
          markEl = mark(id);
        }

        var removeBtn = h('button', {
          type: 'button',
          class: 'chip-remove',
          title: 'Remove ' + label,
          onClick: function (e) {
            e.preventDefault();
            e.stopPropagation();
            var at = chosen.indexOf(itemVal);
            if (at > -1) chosen.splice(at, 1);
            render();
            if (onChange) onChange(getAssignees());
          }
        }, OC.icon('close'));

        var chip = h('span', { class: 'assignee-chip' }, [
          markEl,
          h('span', {}, label),
          removeBtn
        ]);
        chipsWrap.appendChild(chip);
      });
    }

    function renderList() {
      clear(listWrap);
      var q = searchInput.value.trim().toLowerCase();

      var filteredPeople = assignablePeople.filter(function (u) {
        return !q || u.name.toLowerCase().indexOf(q) > -1 || (u.email && u.email.toLowerCase().indexOf(q) > -1);
      });

      if (!filteredPeople.length) {
        listWrap.appendChild(h('p', { class: 'ticklist-empty' }, 'No team members found matching "' + q + '"'));
        return;
      }

      filteredPeople.forEach(function (u) {
        var val = 'user:' + u.id;
        var isChecked = chosen.indexOf(val) > -1;
        var chk = h('input', {
          type: 'checkbox',
          value: val,
          checked: isChecked,
          onChange: function (e) {
            var at = chosen.indexOf(val);
            if (e.target.checked && at === -1) chosen.push(val);
            if (!e.target.checked && at > -1) chosen.splice(at, 1);
            /* Only the chips are redrawn. The list must NOT be rebuilt here:
               each checkbox sits inside the <label> that wraps it, so the click
               that fired this change is still travelling, and replacing the row
               under it lands the label's activation on a detached node — which
               toggled the tick straight back off and swallowed the click. The
               browser has already set the checkbox correctly; only the chips
               above the list are out of date. */
            renderChips();
            if (onChange) onChange(getAssignees());
          }
        });

        var line = h('label', { class: 'assignee-item-line' }, [
          chk,
          mark(u.id),
          h('span', { style: 'font-weight:500;' }, u.name),
          u.title ? h('span', { class: 'chip custom', style: 'margin-left:auto;font-size:10.5px;' }, u.title) : null
        ].filter(Boolean));
        listWrap.appendChild(line);
      });
    }

    function render() {
      renderChips();
      renderList();
    }

    searchInput.addEventListener('input', renderList);

    root.appendChild(chipsWrap);
    root.appendChild(searchInput);
    root.appendChild(listWrap);

    render();

    function getAssignees() {
      return chosen.map(function (v) { return v.split(':')[1]; });
    }

    function getAssigneeTypes() {
      return chosen.map(function (v) { return v.split(':')[0]; });
    }

    function getPrimaryAssignee() {
      return chosen.length ? chosen[0].split(':')[1] : (currentUser ? currentUser.id : null);
    }

    function getPrimaryType() {
      return chosen.length ? chosen[0].split(':')[0] : 'user';
    }

    return {
      node: root,
      getAssignees: getAssignees,
      getAssigneeTypes: getAssigneeTypes,
      getPrimaryAssignee: getPrimaryAssignee,
      getPrimaryType: getPrimaryType,
      getChosenValues: function () { return chosen.slice(); },
      setChosenValues: function (arr) { chosen = (arr || []).slice(); render(); }
    };
  }

  /* ---- ultra-compact 5KB avatar compressor ------------------------------- */
  function compressAvatarImage(img) {
    if (!img || !img.width || !img.height) return '';
    // 96x96 is 2x retina sharpness for 28-54px avatars and compresses to ~2-4KB
    var targetDim = 96;
    var canvas = document.createElement('canvas');
    canvas.width = targetDim;
    canvas.height = targetDim;
    var ctx = canvas.getContext('2d');

    // Square center-crop (cover)
    var sw = img.width;
    var sh = img.height;
    var sx = 0;
    var sy = 0;
    var sDim = Math.min(sw, sh);
    if (sw > sh) {
      sx = Math.round((sw - sh) / 2);
    } else if (sh > sw) {
      sy = Math.round((sh - sw) / 2);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sDim, sDim, 0, 0, targetDim, targetDim);

    // Compress to WebP or JPEG <= 6.5KB string
    var maxStringLen = 7000;
    var qualities = [0.82, 0.72, 0.60, 0.48, 0.38];
    var bestResult = '';

    for (var i = 0; i < qualities.length; i++) {
      var q = qualities[i];
      var res = canvas.toDataURL('image/webp', q);
      if (res && res.indexOf('data:image/webp') === 0) {
        bestResult = res;
        if (res.length <= maxStringLen) break;
      } else {
        res = canvas.toDataURL('image/jpeg', q);
        bestResult = res;
        if (res.length <= maxStringLen) break;
      }
    }
    return bestResult || canvas.toDataURL('image/jpeg', 0.55);
  }

  /* ---- photo uploader component ----------------------------------------- */
  function photoUploader(currentAvatar, defaultName, onChange) {
    var avatarVal = currentAvatar || '';
    var preview = h('div', { class: 'photo-uploader-preview' });
    var sizeBadge = h('span', { class: 'chip count', style: 'font-size:11px;padding:2px 8px;font-weight:600;display:none;' });
    var urlInput;

    function renderPreview() {
      clear(preview);
      if (avatarVal) {
        var img = h('img', { src: avatarVal, alt: defaultName || 'Avatar' });
        img.onerror = function () {
          clear(preview);
          preview.textContent = initials(defaultName || 'User');
          sizeBadge.style.display = 'none';
        };
        preview.appendChild(img);
        var approxKb = Math.round(((avatarVal.length * 0.75) / 1024) * 10) / 10;
        sizeBadge.textContent = approxKb + ' KB (optimized)';
        sizeBadge.style.display = 'inline-flex';
      } else {
        preview.textContent = initials(defaultName || 'User');
        sizeBadge.style.display = 'none';
      }
    }
    renderPreview();

    var fileInput = h('input', {
      type: 'file',
      accept: 'image/png, image/jpeg, image/webp, image/gif',
      style: 'display:none;',
      onChange: function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
          toast('Image must be under 10MB.', true);
          return;
        }
        var reader = new FileReader();
        reader.onload = function (evt) {
          var img = new Image();
          img.onload = function () {
            avatarVal = compressAvatarImage(img);
            if (urlInput) urlInput.value = '';
            renderPreview();
            if (onChange) onChange(avatarVal);
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    var chooseBtn = h('button', {
      class: 'btn small primary',
      type: 'button',
      onClick: function () { fileInput.click(); }
    }, [OC.icon('plus'), 'Upload photo']);

    var removeBtn = h('button', {
      class: 'btn small',
      type: 'button',
      onClick: function () {
        avatarVal = '';
        if (urlInput) urlInput.value = '';
        if (fileInput) fileInput.value = '';
        renderPreview();
        if (onChange) onChange('');
      }
    }, 'Remove photo');

    function handleUrlInput(v) {
      v = (v || '').trim();
      if (!v) {
        avatarVal = '';
        renderPreview();
        if (onChange) onChange('');
        return;
      }
      if (v.indexOf('data:') === 0 || v.indexOf('http') === 0) {
        var testImg = new Image();
        testImg.crossOrigin = 'Anonymous';
        testImg.onload = function () {
          try {
            avatarVal = compressAvatarImage(testImg);
          } catch (_) {
            avatarVal = v;
          }
          renderPreview();
          if (onChange) onChange(avatarVal);
        };
        testImg.onerror = function () {
          avatarVal = v;
          renderPreview();
          if (onChange) onChange(avatarVal);
        };
        testImg.src = v;
      } else {
        avatarVal = v;
        renderPreview();
        if (onChange) onChange(avatarVal);
      }
    }

    urlInput = h('input', {
      type: 'url',
      placeholder: 'Or paste image/Gravatar URL...',
      value: (avatarVal && avatarVal.indexOf('data:') !== 0) ? avatarVal : '',
      style: 'font-size:12px;width:100%;margin-top:4px;',
      onInput: function (e) { handleUrlInput(e.target.value); },
      onChange: function (e) { handleUrlInput(e.target.value); }
    });

    var node = h('div', { class: 'photo-uploader' }, [
      preview,
      fileInput,
      h('div', { class: 'photo-uploader-controls' }, [
        h('div', { class: 'photo-uploader-actions' }, [chooseBtn, removeBtn, sizeBadge]),
        urlInput,
        h('span', { class: 'muted', style: 'font-size:11px;' }, 'Auto-compressed to ~3-5KB for instant database & network performance.')
      ])
    ]);

    return {
      node: node,
      getValue: function () { return avatarVal; },
      setValue: function (val) {
        avatarVal = val || '';
        if (urlInput) urlInput.value = (avatarVal && avatarVal.indexOf('data:') !== 0) ? avatarVal : '';
        renderPreview();
      }
    };
  }

  /* ---- loud notification sound synthesizer (Web Audio API) -------------- */
  var _sharedAudioCtx = null;
  function getAudioContext() {
    try {
      if (typeof window === 'undefined') return null;
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!_sharedAudioCtx) {
        _sharedAudioCtx = new AudioCtx();
      }
      if (_sharedAudioCtx.state === 'suspended') {
        _sharedAudioCtx.resume();
      }
      return _sharedAudioCtx;
    } catch (e) {
      return null;
    }
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    var unlockAudio = function () {
      var ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
    };
    ['click', 'keydown', 'touchstart'].forEach(function (evt) {
      window.addEventListener(evt, unlockAudio, { passive: true });
    });
  }

  function playNotificationSound(type) {
    try {
      var ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      var now = ctx.currentTime;
      var isAlert = (type === 'alert' || type === 'warn' || type === 'danger');

      // Create dual-tone harmonics for a crisp, punchy loud chime
      var osc1 = ctx.createOscillator();
      var osc2 = ctx.createOscillator();
      var gain = ctx.createGain();

      // Peak volume at 0.90 for high audibility
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.90, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isAlert ? 0.65 : 0.55));

      if (isAlert) {
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        osc1.frequency.exponentialRampToValueAtTime(587.33, now + 0.35);
        osc2.frequency.setValueAtTime(659.25, now);
        osc2.frequency.exponentialRampToValueAtTime(440, now + 0.35);
      } else {
        // Multi-frequency chime sequence (D5 -> A5 -> D6)
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc1.frequency.setValueAtTime(880, now + 0.12); // A5
        osc1.frequency.setValueAtTime(1174.66, now + 0.24); // D6

        osc2.frequency.setValueAtTime(293.66, now); // D4
        osc2.frequency.setValueAtTime(440, now + 0.12);
        osc2.frequency.setValueAtTime(587.33, now + 0.24);
      }

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + (isAlert ? 0.65 : 0.55));
      osc2.stop(now + (isAlert ? 0.65 : 0.55));
    } catch (e) {
      // Ignore initial browser interaction restrictions
    }
  }

  /* ---- toasts ----------------------------------------------------------- */
  function toast(message, warn) {
    playNotificationSound(warn ? 'warn' : 'chime');
    var host = document.querySelector('.toasts');
    if (!host) {
      host = h('div', { class: 'toasts' });
      document.body.appendChild(host);
    }
    var t = h('div', { class: 'toast' + (warn ? ' warn' : '') },
      [OC.icon(warn ? 'alert' : 'check'), h('span', {}, message)]);
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }

  return {
    h: h, clear: clear, append: append,
    today: today, dayOf: dayOf, daysFromToday: daysFromToday, dueDay: dueDay,
    localNowISO: localNowISO, fmtDate: fmtDate, fmtWhen: fmtWhen, daysLate: daysLate, dueLabel: dueLabel,
    clientChip: clientChip, clientLabel: clientLabel, clientCode: clientCode, deptChip: deptChip, tagChip: tagChip, stateChip: stateChip,
    personName: personName, assigneeName: assigneeName,
    initials: initials, mark: mark, person: person, photoUploader: photoUploader,
    STATE_LABEL: STATE_LABEL,
    field: field, select: select, clientPicker: clientPicker, newClientModal: newClientModal,
    capturePlace: capturePlace, restorePlace: restorePlace, keepingPlace: keepingPlace,
    assigneePicker: assigneePicker, deptPicker: deptPicker, deptCheckboxGroup: deptCheckboxGroup,
    clientAssigneePicker: clientAssigneePicker,
    tagPicker: tagPicker, reactionsBar: reactionsBar, commentThread: commentThread,
    instructionReaders: instructionReaders, markInstructionRead: markInstructionRead,
    wasUnread: wasUnread,
    formatMentions: formatMentions, extractMentionedUserIds: extractMentionedUserIds, attachMentionAutocomplete: attachMentionAutocomplete,
    modal: modal, confirm: confirm, toast: toast, debounce: debounce,
    escapeHtml: escapeHtml, copyText: copyText,
    newTodoModal: function (cb, opts) {
      if (OC.board && OC.board.newTodo) OC.board.newTodo(opts, cb);
    },
    playNotificationSound: playNotificationSound
  };
})();
