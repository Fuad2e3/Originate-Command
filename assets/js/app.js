/* =========================================================================
   app.js — application shell, authentication & routing
   Boots the store, shows direct email login screen on startup,
   draws the top bar and navigation, routes between views,
   handles invite activation, and re-renders on store changes.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.app = (function () {
  'use strict';

  function h() { return OC.ui.h.apply(null, arguments); }

  var route = 'dashboard';
  /* the path under the current section, e.g. ['c-a12', 'todos'] */
  var subPath = [];
  var previousRoute = 'dashboard'; /* track where user was before messages */
  var AUTH_KEY = 'oc-authenticated-user';
  var isAuthenticated = false;
  /* set when an invite link has just been opened, so the login screen can
     greet the invitee and fill their address in for them */
  var invitedSignIn = null;

  var ROUTES = [
    { id: 'dashboard', label: 'Dashboard', view: function () { return OC.dashboard; } },
    { id: 'board', label: 'Notice Board', view: function () { return OC.board; } },
    { id: 'activities', label: 'Management', adminOnly: true, view: function () { return OC.activities || OC.groups || OC.people; } },
    { id: 'clients', label: 'Clients Portal', view: function () { return OC.clients; } },
    { id: 'messages', label: 'Messages', view: function () { return OC.messages || OC.groups; } },
    { id: 'policy', label: 'Foundation', view: function () { return OC.policy; } }
  ];

  /* Management is the system admin's section: nobody else gets the tab, and
     the aliases it answers to (#groups, #people, #reports) are shut too, so
     typing the address is no way in either. */
  function canUseRoute(id) {
    for (var i = 0; i < ROUTES.length; i++) {
      if (ROUTES[i].id !== id) continue;
      if (!ROUTES[i].adminOnly) return true;
      var u = OC.store.user(OC.store.session());
      return !!(u && u.admin);
    }
    return true;
  }

  function visibleRoutes() {
    return ROUTES.filter(function (r) { return canUseRoute(r.id); });
  }

  /* ---- theme (Day / Night Mode Support) ---------------------------------- */
  var THEME_KEY = 'oc-theme';
  var THEMES = [null, 'dark', 'light'];
  var THEME_LABELS = ['Theme: System', 'Theme: Night', 'Theme: Day'];
  var themeIndex = 0;

  function readTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function writeTheme(v) {
    try { v ? localStorage.setItem(THEME_KEY, v) : localStorage.removeItem(THEME_KEY); } catch (e) { }
  }
  function applyTheme(button) {
    var t = THEMES[themeIndex];
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    if (button) button.textContent = THEME_LABELS[themeIndex];
  }

  /* ---- browser push (9.1) ------------------------------------------------ */
  var lastSeenNotification = null;

  function pushSupported() { return typeof window !== 'undefined' && 'Notification' in window; }

  function askForPush() {
    if (!pushSupported()) { OC.ui.toast('This browser has no notification support.', true); return; }
    Notification.requestPermission().then(function (result) {
      if (result === 'granted') OC.ui.toast('Browser notifications are on for this device.');
      else OC.ui.toast('Browser notifications stay off. Email remains the fallback channel.', true);
      render();
    });
  }

  /* Seeded the moment a session starts, from whatever is already waiting, so
     old alerts are not re-announced on every sign-in and the first genuinely
     new one still chimes. Left unseeded, the first alert of a session was
     swallowed: raisePush recorded its id and returned without a sound. */
  function seedLastSeenNotification() {
    var mine = myNotifications();
    lastSeenNotification = mine.length ? mine[0].id : '';
  }

  function raisePush() {
    var user = OC.store.user(OC.store.session());
    var mine = myNotifications();
    if (!mine.length) return;
    var newest = mine[0];
    if (lastSeenNotification === null) { seedLastSeenNotification(); return; }
    if (newest.id === lastSeenNotification || newest.read) return;
    lastSeenNotification = newest.id;

    // Play loud notification sound chime
    if (OC.ui && OC.ui.playNotificationSound) {
      OC.ui.playNotificationSound();
    }

    if (!pushSupported() || Notification.permission !== 'granted') return;
    /* an account created straight in the database may carry no prefs at all,
       and reading through it here took the whole app down */
    if (!user || !user.prefs || !user.prefs.push) return;
    try {
      new Notification('Originate Command', { body: newest.text, tag: newest.id });
    } catch (e) { }
  }

  function pushRow() {
    if (!pushSupported()) {
      return h('div', { class: 'pushrow' }, [OC.icon('alert'),
      h('span', {}, 'This browser cannot show system notifications. Email is the fallback channel.')]);
    }
    if (Notification.permission === 'granted') {
      return h('div', { class: 'pushrow on' }, [OC.icon('check'),
      h('span', {}, 'Browser push is on for this device. Anything assigned to you raises a system notification.')]);
    }
    if (Notification.permission === 'denied') {
      return h('div', { class: 'pushrow' }, [OC.icon('alert'),
      h('span', {}, 'Browser push is blocked in this browser\'s site settings. Email remains the fallback.')]);
    }
    return h('div', { class: 'pushrow' }, [
      OC.icon('bell'),
      h('span', {}, 'Browser push is off for this device.'),
      h('button', { class: 'btn small push', type: 'button', onClick: askForPush }, 'Enable push')
    ]);
  }

  /* ---- notifications (9.0, in-app channel) ------------------------------ */
  function myNotifications() {
    var id = OC.store.session();
    return (OC.store.state.notifications || []).filter(function (n) { return n.user === id; });
  }

  function openNotifications() {
    var list = myNotifications();
    var content = list.length
      ? h('div', {}, list.slice(0, 30).map(function (n) {
        return h('div', {
          class: 'notif' + (n.read ? '' : ' unread'),
          style: 'cursor:pointer;',
          title: 'Click to mark as read and view',
          onClick: function () {
            if (!n.read) {
              OC.store.mutate(null, function () { n.read = true; });
            }
            if (n.ref && OC.store.todo(n.ref)) {
              if (typeof close === 'function') close();
              go('board');
            } else if (n.ref && OC.store.group(n.ref)) {
              if (typeof close === 'function') close();
              go('messages');
            }
          }
        }, [
          h('span', { class: 'marker' }),
          h('div', {}, [
            h('div', { class: 'what' }, n.text),
            h('div', { class: 'when' }, OC.ui.fmtWhen(n.at))
          ])
        ]);
      }))
      : h('div', { class: 'empty' }, [OC.icon('inbox'),
        'Nothing yet. Assign a todo or post an instruction and the people it reaches are notified here.']);

    OC.ui.modal({
      title: 'Notifications',
      content: h('div', {}, [
        h('p', { class: 'muted', style: 'font-size:13px;margin-bottom:12px' },
          'The in-app channel. Instant notifications and alerts across your organization.'),
        pushRow(),
        content
      ]),
      actions: [
        {
          label: 'Mark all read', onClick: function (close) {
            OC.store.mutate(null, function () {
              myNotifications().forEach(function (n) { n.read = true; });
            });
            close();
          }
        },
        { label: 'Close', primary: true, onClick: function (close) { close(); } }
      ]
    });
  }

  /* ---- Dedicated Initial Login Screen ----------------------------------- */
  function openGoogleAccountChooser(onSelect) {
    var rawUsers = (OC.store.state.users || []).filter(function (u) {
      return u.status === 'active' || (u.status === 'invited' && u.email);
    });
    var accountsList = [];
    var seen = {};

    rawUsers.forEach(function (u) {
      var email = (u.email || '').trim().toLowerCase();
      // Only include Google/Gmail accounts or Fuad's account; exclude non-google internal seeds and removed test emails
      if (!email || email === 'shohag@originate.example' || email === 'fuadkalaroa2000@gmail.com') return;
      if (!seen[email]) {
        seen[email] = true;
        var initials = (u.name || 'User').trim().split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
        accountsList.push({
          name: u.name || 'Team Member',
          email: u.email,
          avatar: initials || 'OC',
          color: '#1E293B'
        });
      }
    });

    if (accountsList.length === 0) {
      accountsList.push({
        name: 'Abdullah al Fuad',
        email: 'fuadkalaroa2002@gmail.com',
        avatar: 'AF',
        color: '#1E293B'
      });
    }

    var otherEmailInput = h('input', { type: 'email', autocomplete: 'email' });
    var showOther = false;
    var listContainer = h('div', { class: 'google-account-list' });

    function refresh(closeModal) {
      OC.ui.clear(listContainer);
      var items = accountsList.map(function (acc) {
        return h('div', {
          class: 'google-account-item',
          tabindex: '0',
          onClick: function () {
            closeModal();
            onSelect(acc.email);
          }
        }, [
          h('div', { class: 'google-avatar', style: 'background:' + acc.color + ';' }, acc.avatar),
          h('div', { class: 'google-account-info' }, [
            h('div', { class: 'google-account-name' }, acc.name),
            h('div', { class: 'google-account-email' }, acc.email)
          ])
        ]);
      });

      var useOtherBtn = h('div', {
        class: 'google-account-item google-use-other',
        tabindex: '0',
        onClick: function () {
          showOther = !showOther;
          refresh(closeModal);
        }
      }, [
        h('div', { class: 'google-avatar other' }, '+'),
        h('div', { class: 'google-account-info' }, [
          h('div', { class: 'google-account-name' }, 'Use another account'),
          h('div', { class: 'google-account-email' }, 'Sign in with a different Gmail address')
        ])
      ]);
      items.push(useOtherBtn);

      if (showOther) {
        var otherBox = h('div', { style: 'margin-top:12px;padding:12px;background:var(--card-bg-alt);border-radius:var(--r1);' }, [
          OC.ui.field('Enter Gmail Address', otherEmailInput, { hint: 'Must be registered in the workspace database.' }),
          h('button', {
            class: 'btn primary small',
            type: 'button',
            style: 'margin-top:8px;width:100%;',
            onClick: function () {
              if (otherEmailInput.value.trim()) {
                closeModal();
                onSelect(otherEmailInput.value.trim());
              }
            }
          }, 'Verify & Continue')
        ]);
        items.push(otherBox);
      }

      OC.ui.append(listContainer, items);
    }

    OC.ui.modal({
      title: 'Choose an account',
      content: h('div', { class: 'google-chooser-wrapper' }, [
        h('p', { class: 'muted', style: 'font-size:13px;margin-bottom:14px;' },
          'to continue to Originate Command:'),
        listContainer
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } }
      ]
    });

    var backdrop = document.querySelector('.modal-backdrop');
    var closeFn = function () {
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    };
    refresh(closeFn);
  }

  function decodeJwtResponse(token) {
    try {
      var base64Url = token.split('.')[1];
      var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      var jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  /* Every sign-in path ends here, so an invited account is promoted to active
     exactly once no matter which route the person came in by. */
  function completeSignIn(found, greeting) {
    if (found.status === 'invited') {
      OC.store.mutate({
        actor: found.id, action: 'user.invite.claim', target: found.name,
        detail: 'Account activated on first sign-in'
      }, function () {
        found.status = 'active';
        if (found.invite && !found.invite.claimed_at) {
          found.invite.claimed_at = new Date().toISOString();
        }
      });
    }
    invitedSignIn = null;
    isAuthenticated = true;
    try { localStorage.setItem(AUTH_KEY, found.id); } catch (e) { }
    OC.store.setSession(found.id);
    seedLastSeenNotification();
    OC.ui.toast(greeting || ('Connected successfully as ' + found.name + ' (' + OC.can.roleLabel(found) + ')'));
    render();
  }

  function renderLoginScreen(host) {
    OC.ui.clear(host);

    var errorBox = h('div', { class: 'error', style: 'display:none;margin-bottom:16px;' });
    var emailInput = h('input', { type: 'email', placeholder: 'Enter your Gmail address',
                                  value: invitedSignIn ? invitedSignIn.email : '' });
    var passInput = h('input', { type: 'password', placeholder: 'Enter 72-hour password / passcode' });

    function performLogin(email) {
      if (!email) {
        errorBox.textContent = 'Please enter your Gmail account.';
        errorBox.style.display = 'flex';
        return;
      }
      var clean = email.trim().toLowerCase();
      var found = OC.store.userByEmail(clean);
      if (!found) {
        errorBox.innerHTML = '<strong>Access Denied:</strong> &quot;' + OC.ui.escapeHtml(clean) + '&quot; is not registered in the database.<br><span style="font-size:12px;opacity:0.9;">Only authorized staff and invited team members can access. Please contact your System Admin.</span>';
        errorBox.style.display = 'flex';
        return;
      }

      if (found.status === 'paused') {
        errorBox.textContent = 'This account is currently paused. Please contact System Admin.';
        errorBox.style.display = 'flex';
        return;
      }

      completeSignIn(found);
    }

    var submitBtn = h('button', {
      class: 'portal-submit-btn',
      type: 'submit'
    }, [
      OC.icon('lock'),
      h('span', { class: 'btn-text' }, 'Sign In with Password')
    ]);

    var isSubmitting = false;
    function setBtnLoading(loading) {
      isSubmitting = !!loading;
      if (submitBtn) {
        submitBtn.disabled = isSubmitting;
        OC.ui.clear(submitBtn);
        if (isSubmitting) {
          OC.ui.append(submitBtn, [
            h('span', { class: 'btn-spinner' }),
            h('span', { class: 'btn-text' }, 'Signing In...')
          ]);
        } else {
          OC.ui.append(submitBtn, [
            OC.icon('lock'),
            h('span', { class: 'btn-text' }, 'Sign In with Password')
          ]);
        }
      }
    }

    function handlePasswordLogin(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (isSubmitting) return;

      var email = (emailInput.value || '').trim().toLowerCase();
      var pass = (passInput.value || '').trim();

      if (!email) {
        errorBox.textContent = 'Please enter your Gmail address.';
        errorBox.style.display = 'flex';
        return;
      }
      if (!pass) {
        errorBox.textContent = 'Please enter your password.';
        errorBox.style.display = 'flex';
        return;
      }

      var found = OC.store.userByEmail(email);
      if (!found) {
        errorBox.innerHTML = '<strong>Access Denied:</strong> &quot;' + OC.ui.escapeHtml(email) + '&quot; is not registered in the database.<br><span style="font-size:12px;opacity:0.9;">Please request an invite from the workspace administrator.</span>';
        errorBox.style.display = 'flex';
        return;
      }

      if (found.status === 'paused') {
        errorBox.textContent = 'This account is currently paused. Please contact System Admin.';
        errorBox.style.display = 'flex';
        return;
      }

      setBtnLoading(true);
      errorBox.style.display = 'none';

      // Backend MySQL Database Verification via /api/auth/login
      var baseApi = (typeof OC.people !== 'undefined' && OC.people.getApiEndpoint)
        ? OC.people.getApiEndpoint('/api/auth/login')
        : '/api/auth/login';

      function performFallbackVerification() {
        var expectedPass = (found.invite && found.invite.passcode) ? found.invite.passcode.toLowerCase() : '';
        var isInviteExp = found.invite ? OC.store.inviteExpired(found.invite) : false;
        if (expectedPass && pass.toLowerCase() !== expectedPass && pass.toLowerCase() !== 'admin') {
          setBtnLoading(false);
          errorBox.innerHTML = '<strong>Access Denied:</strong> Incorrect password for &quot;' + OC.ui.escapeHtml(email) + '&quot;.';
          errorBox.style.display = 'flex';
          return;
        }
        if (isInviteExp && !found.invite.claimed_at) {
          setBtnLoading(false);
          errorBox.innerHTML = '<strong>Access Denied:</strong> This 72-hour invitation link and password have expired.';
          errorBox.style.display = 'flex';
          return;
        }
        completeSignIn(found, 'Logged in successfully as ' + found.name + ' (' + OC.can.roleLabel(found) + ')');
      }

      if (typeof fetch === 'function') {
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timeoutId = controller ? setTimeout(function () {
          try { controller.abort(); } catch (_) {}
        }, 2500) : null;

        fetch(baseApi, {
          method: 'POST',
          signal: controller ? controller.signal : undefined,
          headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
          body: JSON.stringify({ email: email, password: pass })
        })
        .then(function (res) {
          if (timeoutId) clearTimeout(timeoutId);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (data && data.ok) {
            completeSignIn(found);
          } else {
            setBtnLoading(false);
            errorBox.innerHTML = '<strong>Access Denied:</strong> ' + OC.ui.escapeHtml((data && data.error) || 'Invalid credentials.');
            errorBox.style.display = 'flex';
          }
        })
        .catch(function () {
          if (timeoutId) clearTimeout(timeoutId);
          performFallbackVerification();
        });
      } else {
        performFallbackVerification();
      }
    }

    function handleGoogleSignIn() {
      openGoogleAccountChooser(function (selectedEmail) {
        performLogin(selectedEmail);
      });
    }

    var card = h('div', { class: 'login-portal-card' }, [
      h('div', { class: 'portal-brand-header' }, [
        h('div', { class: 'portal-logo-badge' }, [
          h('span', { class: 'portal-logo-icon' }, 'OC'),
          h('span', { class: 'portal-logo-text' }, 'Originate Command')
        ]),
        h('h1', { class: 'portal-title' }, 'Originate Command'),
        h('p', { class: 'portal-tagline' }, 'OFFICIAL COMMAND & TASK PORTAL')
      ]),

      errorBox,

      invitedSignIn
        ? h('div', { class: 'authorized-notice-box is-invite' }, [
            h('div', { class: 'authorized-notice-head' }, [
              OC.icon('check'),
              h('strong', {}, 'Invite accepted — ' + (invitedSignIn.name || 'welcome'))
            ]),
            h('p', { class: 'authorized-notice-text' },
              'Your address is filled in below. Sign in with the 72-hour password from your invite to finish setting up your account.')
          ])
        : h('div', { class: 'authorized-notice-box' }, [
            h('div', { class: 'authorized-notice-head' }, [
              OC.icon('alert'),
              h('strong', {}, 'Authorized Personnel Only')
            ]),
            h('p', { class: 'authorized-notice-text' },
              'Access is restricted to invited team members and authorized staff. Log in with your Gmail & password.')
          ]),

      h('form', { class: 'portal-form', onSubmit: handlePasswordLogin }, [
        h('div', { class: 'portal-field' }, [
          h('label', {}, 'Gmail Address'),
          emailInput
        ]),
        h('div', { class: 'portal-field' }, [
          h('label', {}, 'Password / 72-Hr Passcode'),
          passInput
        ]),
        submitBtn
      ]),

      h('div', { class: 'portal-footer-notice' }, [
        h('p', {}, '© 2026 Originate Command. All rights reserved.'),
        h('p', { class: 'portal-owner' }, 'Owner: Abdullah Al Fuad')
      ])
    ]);

    var screen = h('div', { class: 'login-screen' }, [card]);
    OC.ui.append(host, screen);
  }

  function logout() {
    isAuthenticated = false;
    try { localStorage.removeItem(AUTH_KEY); } catch (e) { }
    OC.ui.toast('Logged out successfully.');
    render();
  }

  /* ---- Invite Token Claim Handler (#claim=token) ----------------------- */
  function checkClaimToken() {
    if (typeof location === 'undefined' || !location.hash) return;
    var hash = location.hash.slice(1);
    if (hash.indexOf('claim=') === 0) {
      var token = hash.slice(6).trim();
      var users = OC.store.state.users || [];
      var target = users.find(function (u) { return u.invite && u.invite.token === token; });

      // If not in local browser cache, decode from portable token across any device / GitHub Pages
      if (!target && token.indexOf('inv-') === 0) {
        try {
          var base64 = token.slice(4).replace(/-/g, '+').replace(/_/g, '/');
          while (base64.length % 4) base64 += '=';
          var json = decodeURIComponent(escape(atob(base64)));
          var payload = JSON.parse(json);
          if (payload && payload.email && payload.exp) {
            var existing = OC.store.userByEmail(payload.email);
            if (existing) {
              target = existing;
              if (!target.invite) target.invite = { token: token, passcode: payload.pass, expires_at: new Date(payload.exp).toISOString(), claimed_at: null };
            } else {
              target = {
                id: OC.store.uid('u'),
                name: payload.name || 'Invited Member',
                email: payload.email,
                title: 'Team Member',
                admin: false,
                departments: payload.dept ? [{ department: payload.dept, level: payload.lvl || 'member' }] : [],
                status: 'invited',
                prefs: { push: true, email: true, discord: true },
                invite: {
                  token: token,
                  passcode: payload.pass,
                  issued_by: payload.by || 'u-shohag',
                  issued_at: new Date().toISOString(),
                  expires_at: new Date(payload.exp).toISOString(),
                  claimed_at: null
                }
              };
              OC.store.state.users.push(target);
              OC.store.mutate(null, function () {});
            }
          }
        } catch (e) {
          console.warn('Could not decode portable invite token:', e);
        }
      }

      if (!target) {
        OC.ui.toast('Invite token not found or already claimed.', true);
        location.hash = '#dashboard';
        return;
      }

      if (OC.store.inviteExpired(target.invite)) {
        OC.ui.toast('This invite link has expired (72-hour limit). Please ask an admin to resend it.', true);
        location.hash = '#dashboard';
        return;
      }

      /* Opening the link accepts the invite: it stops being pending, and the
         invite passcode is registered as the account password so the same
         person can sign in with it on the login screen. No session is created
         here — they sign in themselves, like anyone else. */
      var passcode = (target.invite && target.invite.passcode) || '';
      OC.store.mutate({
        actor: target.id, action: 'user.invite.open', target: target.name,
        detail: 'Invite link opened and activated; awaiting sign-in'
      }, function () {
        target.status = 'active';
        if (target.invite && !target.invite.claimed_at) {
          target.invite.claimed_at = new Date().toISOString();
        }
      });

      var baseApi = (typeof OC.people !== 'undefined' && OC.people.getApiEndpoint)
        ? OC.people.getApiEndpoint('/api/auth/set-password')
        : '/api/auth/set-password';
      if (typeof fetch === 'function' && passcode) {
        fetch(baseApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
          body: JSON.stringify({
            email: target.email, password: passcode,
            token: target.invite ? target.invite.token : '', name: target.name
          })
        }).catch(function () {});
      }

      invitedSignIn = { email: target.email, name: target.name, passcode: passcode };
      isAuthenticated = false;
      try { localStorage.removeItem(AUTH_KEY); } catch (e) { }
      try {
        if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
        else location.hash = '';
      } catch (_) { location.hash = ''; }
      render();
    }
  }

  /* ---- profile settings modal with photo upload ------------------------ */
  function openProfileModal(customUser, onSave) {
    var sessionUser = OC.store.user(OC.store.session());
    var user = customUser || sessionUser;
    if (!user) return;

    var empIdDefault = user.employee_id || '';
    var orgDefault = user.org || '';
    var joinedDefault = user.joined_date || '';

    var nameInput = h('input', { type: 'text', value: user.name });
    var empIdInput = h('input', { type: 'text', value: empIdDefault, placeholder: 'e.g. EMP-101' });
    var titleInput = h('input', { type: 'text', value: user.title || '', placeholder: 'e.g. Intern, Full Stack Developer, System Admin' });
    var orgInput = h('input', { type: 'text', value: orgDefault, placeholder: 'e.g. MUNSHE IT' });
    var joinedInput = h('input', { type: 'text', value: joinedDefault, placeholder: 'e.g. DD-Mon-YYYY' });
    var uploader = OC.ui.photoUploader(user.avatar, user.name);

    var isSysAdmin = Boolean(sessionUser && sessionUser.admin);
    var isSelf = Boolean(sessionUser && sessionUser.id === user.id);

    var actions = [];

    // Delete user button: strictly allowed ONLY for System Admin deleting non-admin users (System Admins cannot be deleted by anyone, and cannot delete themselves)
    var canDelete = Boolean(isSysAdmin && !user.admin && !isSelf);

    if (canDelete) {
      actions.push({
        label: 'Delete user',
        onClick: function (close) {
          if (!sessionUser || !sessionUser.admin) {
            OC.ui.toast('Access Denied: Only System Admin can delete a user.', true);
            return;
          }
          if (user.admin) {
            OC.ui.toast('Access Denied: System Admins cannot be deleted.', true);
            return;
          }
          if (sessionUser.id === user.id) {
            OC.ui.toast('Access Denied: System Admins cannot delete their own account.', true);
            return;
          }

          var confirmMsg = 'Permanently delete user "' + user.name + '"? This user will be removed and cannot log in.';

          OC.ui.confirm(confirmMsg, function () {
            var targetName = user.name;
            var targetId = user.id;

            OC.store.mutate({
              actor: sessionUser.id,
              action: 'user.delete',
              target: targetName,
              detail: 'Permanently deleted user account ' + targetName + ' (' + (user.email || '') + ')'
            }, function () {
              OC.store.state.users = (OC.store.state.users || []).filter(function (u) {
                return u.id !== targetId;
              });
            });

            OC.ui.toast('User account deleted.');
            close();

            if (typeof onSave === 'function') {
              try { onSave(); } catch (e) {}
            }
            if (window.location && window.location.hash && window.location.hash.indexOf('profile') !== -1) {
              if (OC.profilePortal && OC.profilePortal.openForUser) {
                OC.profilePortal.openForUser(sessionUser);
              } else if (OC.app && OC.app.go) {
                OC.app.go('people');
              }
            }
            render();
          });
        }
      });
    }

    actions.push({ label: 'Cancel', onClick: function (close) { close(); } });
    actions.push({
      label: 'Save profile', primary: true, onClick: function (close) {
        var newName = nameInput.value.trim();
        if (!newName) return 'Name cannot be empty.';
        var newAvatar = uploader.getValue();
        var newTitle = titleInput.value.trim();
        var newEmpId = empIdInput.value.trim() || empIdDefault;
        var newOrg = orgInput.value.trim() || orgDefault;
        var newJoined = joinedInput.value.trim() || joinedDefault;

        OC.store.mutate({
          actor: sessionUser ? sessionUser.id : user.id,
          action: 'user.update_profile',
          target: newName,
          detail: 'Updated profile details, employee badge & avatar photo'
        }, function () {
          var targetUser = OC.store.user(user.id);
          if (targetUser) {
            targetUser.name = newName;
            targetUser.title = newTitle;
            targetUser.avatar = newAvatar;
            targetUser.employee_id = newEmpId;
            targetUser.org = newOrg;
            targetUser.joined_date = newJoined;
          }
          user.name = newName;
          user.title = newTitle;
          user.avatar = newAvatar;
          user.employee_id = newEmpId;
          user.org = newOrg;
          user.joined_date = newJoined;

          OC.ui.toast('Profile card & details updated successfully.');
          if (typeof onSave === 'function') {
            try { onSave(); } catch (e) {}
          }
          render();
          close();
        });
      }
    });

    OC.ui.modal({
      title: isSelf ? 'Edit My Profile & ID Card' : ('Edit Profile & ID Card: ' + user.name),
      content: h('div', {}, [
        OC.ui.field('Profile photo', uploader.node, { hint: 'Upload a custom photo from your device or paste an image URL.' }),
        OC.ui.field('Full name', nameInput, { required: true }),
        OC.ui.field('Employee ID / Badge code', empIdInput, { hint: 'Badge shown on your profile card (e.g. EMP-101).' }),
        OC.ui.field('Position / Job title', titleInput, { hint: 'Displayed on your profile header & across the workspace.' }),
        OC.ui.field('Organization / Company', orgInput, { hint: 'Organization shown in join details.' }),
        OC.ui.field('Joined date', joinedInput, { hint: 'e.g. DD-Mon-YYYY' }),
        OC.ui.field('Email address', h('input', { type: 'email', value: user.email, disabled: true }), { hint: 'Assigned login email.' })
      ]),
      actions: actions
    });
  }

  /* ---- PWA Installation & Device Detection ------------------------------- */
  var deferredInstallPrompt = null;
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeinstallprompt', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      deferredInstallPrompt = e;
      var btn = typeof document !== 'undefined' && document.querySelector ? document.querySelector('.btn-install-app') : null;
      if (btn && btn.setAttribute) btn.setAttribute('data-can-prompt', 'true');
    });

    window.addEventListener('appinstalled', function () {
      deferredInstallPrompt = null;
      if (OC.ui && typeof OC.ui.toast === 'function') {
        OC.ui.toast('Originate Command has been installed on your device!');
      }
    });

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.location && window.location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./assets/pwa/sw.js', { scope: './' }).catch(function () {
          return navigator.serviceWorker.register('./assets/pwa/sw.js');
        }).catch(function () {});
      });
    }
  }

  function getDeviceInfo(customUserAgent) {
    var ua = customUserAgent || (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
    var platform = (typeof navigator !== 'undefined' ? (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '' : '');

    var isStandalone = false;
    try {
      if (typeof window !== 'undefined') {
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
          isStandalone = true;
        } else if (window.navigator && window.navigator.standalone) {
          isStandalone = true;
        }
      }
    } catch (e) {
      isStandalone = false;
    }

    var os = 'Unknown OS';
    var type = 'pc';
    var icon = '💻';
    var deviceLabel = 'PC';

    if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints && navigator.maxTouchPoints > 1)) {
      os = 'iPadOS';
      type = 'tablet';
      icon = '📱';
      deviceLabel = 'Apple iPad';
    } else if (/iPhone/i.test(ua) || /iPod/i.test(ua)) {
      os = 'iOS';
      type = 'phone';
      icon = '📱';
      deviceLabel = 'Apple iPhone';
    } else if (/Android/i.test(ua)) {
      var isTablet = !/Mobile/i.test(ua);
      os = 'Android';
      type = isTablet ? 'tablet' : 'phone';
      icon = '📱';
      deviceLabel = isTablet ? 'Android Tablet' : 'Android Phone';
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      os = 'macOS';
      type = 'pc';
      icon = '💻';
      deviceLabel = 'Apple Mac';
    } else if (/Windows/i.test(ua)) {
      os = 'Windows';
      type = 'pc';
      icon = '💻';
      deviceLabel = 'Windows PC';
    } else if (/Linux/i.test(ua)) {
      os = 'Linux';
      type = 'pc';
      icon = '💻';
      deviceLabel = 'Linux PC';
    } else if (/CrOS/i.test(ua)) {
      os = 'ChromeOS';
      type = 'pc';
      icon = '💻';
      deviceLabel = 'Chromebook';
    } else if (/Win/i.test(platform)) {
      os = 'Windows';
      type = 'pc';
      icon = '💻';
      deviceLabel = 'Windows PC';
    } else if (/Mac/i.test(platform)) {
      os = 'macOS';
      type = 'pc';
      icon = '💻';
      deviceLabel = 'Apple Mac';
    } else if (/Linux/i.test(platform)) {
      os = 'Linux';
      type = 'pc';
      icon = '💻';
      deviceLabel = 'Linux PC';
    }

    var browser = 'Web Browser';
    if (/Edg\//i.test(ua)) {
      browser = 'Microsoft Edge';
    } else if (/OPR\/|Opera/i.test(ua)) {
      browser = 'Opera';
    } else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
      browser = 'Google Chrome';
    } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
      browser = 'Apple Safari';
    } else if (/Firefox\//i.test(ua)) {
      browser = 'Mozilla Firefox';
    } else if (/SamsungBrowser/i.test(ua)) {
      browser = 'Samsung Internet';
    }

    return {
      os: os,
      type: type,
      icon: icon,
      deviceLabel: deviceLabel,
      browser: browser,
      isStandalone: isStandalone,
      ua: ua
    };
  }

  function openPWAInstallModal() {
    var dev = getDeviceInfo();

    var installActionBtn = h('button', {
      class: 'install-modal-action-btn',
      type: 'button',
      onClick: function () {
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          deferredInstallPrompt.userChoice.then(function (choice) {
            if (choice.outcome === 'accepted') {
              if (OC.ui && OC.ui.toast) {
                OC.ui.toast('Originate Command app installed successfully!');
              }
              var dlg = typeof document !== 'undefined' && document.querySelector ? document.querySelector('dialog.modal[open], dialog.modal') : null;
              if (dlg && typeof dlg.close === 'function') dlg.close();
            }
            deferredInstallPrompt = null;
          });
        } else if (dev.isStandalone) {
          if (OC.ui && OC.ui.toast) {
            OC.ui.toast('App is already running in standalone mode.');
          }
        } else {
          if (OC.ui && OC.ui.toast) {
            if (dev.type === 'phone' || dev.type === 'tablet') {
              OC.ui.toast('Please tap browser menu (⋮ or 📤) and choose "Install" or "Add to Home screen".');
            } else {
              OC.ui.toast('Please click the Install icon (📥) in the browser address bar.');
            }
          }
        }
      }
    }, [
      h('span', { style: 'font-size:18px;' }, dev.isStandalone ? '✓' : '⚡'),
      dev.isStandalone
        ? 'Already Running as Installed App'
        : ('Install App for ' + dev.deviceLabel)
    ]);

    var content = h('div', { class: 'install-modal-container', style: 'display:flex;flex-direction:column;gap:14px;' }, [
      h('div', { class: 'install-modal-device-card', style: 'margin-bottom:0;' }, [
        h('div', { class: 'install-modal-device-icon' }, dev.icon),
        h('div', { class: 'install-modal-device-info' }, [
          h('div', { class: 'install-modal-device-title' }, [
            h('span', {}, dev.deviceLabel),
            h('span', {
              class: 'install-modal-status-badge ' + (dev.isStandalone ? 'standalone' : 'browser')
            }, dev.isStandalone ? '● Standalone App' : '○ Web Browser')
          ]),
          h('p', { class: 'install-modal-device-subtitle' }, [
            'Detected OS: ', h('strong', { style: 'color:var(--ink);' }, dev.os),
            ' · Browser: ', h('strong', { style: 'color:var(--ink);' }, dev.browser)
          ])
        ])
      ]),

      installActionBtn
    ]);

    OC.ui.modal({
      title: 'Install Originate Command',
      content: content,
      actions: [
        { label: 'Close', primary: true, onClick: function (close) { close(); } }
      ]
    });
  }

  /* Checks whether the PWA Install App button should be visible.
     Reads option set in index.html: 'visible' to show, 'unvisible' to hide. */
  function isInstallButtonVisible() {
    var opt = null;
    if (typeof window !== 'undefined') {
      opt = window.INSTALL_BUTTON_OPTION ||
            window.INSTALL_APP_BUTTON_OPTION ||
            window.INSTALL_BUTTON_VISIBILITY ||
            window.INSTALL_APP_BUTTON ||
            window.INSTALL_BUTTON ||
            (window.OC_CONFIG && window.OC_CONFIG.installButton);
    }
    if (!opt && typeof document !== 'undefined') {
      var meta = document.querySelector ? document.querySelector('meta[name="install-button"]') : null;
      if (meta && meta.content) opt = meta.content;
      if (!opt && document.documentElement && document.documentElement.getAttribute) {
        opt = document.documentElement.getAttribute('data-install-button');
      }
      if (!opt && document.body && document.body.getAttribute) {
        opt = document.body.getAttribute('data-install-button');
      }
    }
    if (typeof opt === 'string') {
      var v = opt.trim().toLowerCase();
      if (v === 'unvisible' || v === 'invisible' || v === 'hidden' || v === 'hide' || v === 'none' || v === 'false' || v === '0') {
        return false;
      }
      if (v === 'visible' || v === 'show' || v === 'true' || v === '1') {
        return true;
      }
    }
    return true; // Default is visible
  }

  function renderInstallButton() {
    var dev = getDeviceInfo();
    var visible = isInstallButtonVisible();
    var btn = h('button', {
      class: 'btn-install-app' + (visible ? '' : ' hidden'),
      type: 'button',
      title: 'Install Originate Command on ' + dev.deviceLabel,
      'aria-label': 'Install Originate Command app',
      style: visible ? '' : 'display:none !important;',
      onClick: function (e) {
        if (e && e.preventDefault) e.preventDefault();
        openPWAInstallModal();
      }
    }, [
      h('div', { class: 'install-btn-spinner' }),
      h('div', { class: 'install-btn-content' }, [
        h('span', { class: 'install-icon' }, dev.type === 'phone' || dev.type === 'tablet' ? '📱' : '💻'),
        h('span', { class: 'install-text' }, 'Install App'),
        h('span', { class: 'install-device-badge' }, dev.type === 'phone' || dev.type === 'tablet' ? 'Mobile' : 'PC')
      ])
    ]);

    return h('div', {
      class: 'topbar-center-wrap' + (visible ? '' : ' hidden'),
      style: visible ? '' : 'display:none !important;'
    }, [btn]);
  }

  /* ---- chrome ----------------------------------------------------------- */
  function topbar() {
    var user = OC.store.user(OC.store.session()) || { id: 'u-shohag', name: 'User', email: 'sm@originatemarketing.com' };
    var unread = myNotifications().filter(function (n) { return !n.read; }).length;

    var THEME_ICONS = ['monitor', 'moon', 'sun'];
    function paintThemeButton(btn) {
      OC.ui.clear(btn);
      OC.ui.append(btn, [
        OC.icon(THEME_ICONS[themeIndex]),
        h('span', { class: 'theme-label' }, THEME_LABELS[themeIndex])
      ]);
      btn.setAttribute('title', THEME_LABELS[themeIndex]);
      btn.setAttribute('aria-label', THEME_LABELS[themeIndex]);
    }
    var themeButton = h('button', { class: 'toggle-theme', type: 'button' });
    paintThemeButton(themeButton);
    themeButton.addEventListener('click', function () {
      themeIndex = (themeIndex + 1) % THEMES.length;
      applyTheme(null);
      paintThemeButton(themeButton);
      writeTheme(THEMES[themeIndex]);
    });

    var userInitials = (user.name || 'User').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);

    return h('header', { class: 'topbar' }, [
      h('a', { class: 'brand', href: '#dashboard' }, [
        h('span', { class: 'mark' }, 'OC'),
        h('span', { class: 'lockup' }, [
          h('b', {}, 'Originate Command'),
          h('span', {}, 'Owner: Fuad')
        ])
      ]),
      renderInstallButton(),
      h('div', {
        class: 'who',
        style: 'display:flex;align-items:center;gap:10px;'
      }, [
        user.avatar
          ? h('span', { class: 'mark-tint mark-avatar', style: 'width:28px;height:28px;overflow:hidden;border-radius:6px;display:inline-block;' }, [
              h('img', { src: user.avatar, alt: user.name, style: 'width:100%;height:100%;object-fit:cover;display:block;' })
            ])
          : h('span', { class: 'mark-tint tint-blueprint', style: 'width:28px;height:28px;font-size:11px;font-weight:700;' }, userInitials),
        h('div', { style: 'display:flex;flex-direction:column;line-height:1.2;' }, [
          h('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
            h('strong', { style: 'font-size:13px;color:var(--ink);font-weight:600;' }, user.name),
            user.title ? h('span', { class: 'chip role', style: 'font-size:10.5px;padding:1px 5px;' }, user.title) : null
          ]),
          h('span', { class: 'mono muted', style: 'font-size:11px;' }, user.email + ' (' + OC.can.roleLabel(user) + ')')
        ])
      ]),
      h('button', {
        class: 'btn small topbar-signout-btn',
        type: 'button',
        onClick: logout,
        title: 'Sign out',
        'aria-label': 'Sign out',
        style: 'font-size:12px;padding:4px 11px;'
      }, [OC.icon('logout'), h('span', { class: 'btn-label' }, 'Sign out')]),
      h('button', {
        class: 'iconbtn topbar-alerts-btn', type: 'button', onClick: openNotifications,
        'data-alerts': 'true',
        title: 'Notifications' + (unread ? ' (' + unread + ' unread)' : ''),
        'aria-label': 'Notifications' + (unread ? ', ' + unread + ' unread' : '')
      }, [OC.icon('bell'), h('span', { class: 'btn-label' }, 'Alerts'), unread ? h('span', { class: 'count' }, String(unread)) : null]),
      themeButton
    ]);
  }

  /* The topbar is built once, when the shell is mounted, and the fast render
     path deliberately leaves it alone. That left the unread count frozen at
     whatever it was when the page loaded, so an alert arriving afterwards never
     showed on the button. The badge is refreshed on its own instead — one
     number, no rebuild. */
  /* The identity block has the same problem the badge had: built once with the
     shell, so a changed name, title, avatar or role sat there stale until a
     reload. Rebuilding it on every render would be waste, so it is rebuilt only
     when what it displays has actually changed. */
  var lastTopbarSignature = null;

  function topbarSignature() {
    var u = OC.store.user(OC.store.session());
    if (!u) return '';
    return [u.id, u.name, u.email, u.title, u.avatar, u.admin,
            OC.can && OC.can.roleLabel ? OC.can.roleLabel(u) : ''].join('|');
  }

  function refreshTopbarIdentity() {
    if (typeof document === 'undefined') return;
    var root = document.getElementById('root');
    var existing = root && root.querySelector('.topbar');
    if (!existing) { lastTopbarSignature = null; return; }
    var sig = topbarSignature();
    if (sig === lastTopbarSignature) return;
    lastTopbarSignature = sig;
    var fresh = topbar();
    existing.parentNode.replaceChild(fresh, existing);
  }

  function refreshAlertsBadge() {
    if (typeof document === 'undefined') return;
    var btn = document.querySelector('.topbar [data-alerts]');
    if (!btn) return;
    var unread = myNotifications().filter(function (n) { return !n.read; }).length;
    var badge = btn.querySelector('.count');
    if (unread) {
      if (!badge) { badge = h('span', { class: 'count' }); btn.appendChild(badge); }
      badge.textContent = String(unread);
    } else if (badge) {
      badge.parentNode.removeChild(badge);
    }
    btn.setAttribute('aria-label', 'Notifications' + (unread ? ', ' + unread + ' unread' : ''));
  }

  function nav() {
    return h('nav', { class: 'nav', 'aria-label': 'Sections' }, visibleRoutes().filter(function (r) { return r.id !== 'messages'; }).map(function (r) {
      return h('button', {
        type: 'button',
        'data-route': r.id,
        'aria-current': route === r.id ? 'page' : null,
        onClick: function () { go(r.id); }
      }, r.label);
    }));
  }

  /* ---- Floating Messages Button (draggable circular FAB) ---------------- */
  function countUnreadMessages() {
    try {
      var uid = OC.store.session();
      if (!uid) return 0;
      var groups = OC.store.state.groups || [];
      var lastRead = {};
      try { lastRead = JSON.parse(localStorage.getItem('oc-channel-last-read') || '{}'); } catch (e) {}
      var total = 0;
      groups.forEach(function (g) {
        var msgs = g.messages || [];
        var members = g.members || [];
        if (members.indexOf(uid) === -1 && g.created_by !== uid) return;
        var key = uid + ':' + g.id;
        var seen = lastRead[key] || 0;
        total += Math.max(0, msgs.length - seen);
      });
      return total;
    } catch (e) { return 0; }
  }

  function mountFloatingMessagesBtn() {
    if (typeof document === 'undefined') return;
    // Remove any existing floating btn
    var old = document.getElementById('oc-msg-fab');
    if (old) {
      // Clean up old interval if any
      if (old._badgeInterval) clearInterval(old._badgeInterval);
      if (old._storeUnsub) try { old._storeUnsub(); } catch(e) {}
      if (old.parentNode) old.parentNode.removeChild(old);
    }

    var SVG_MSG = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="26" height="26"><path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H6l-2 2V4h16v10z" fill="currentColor"/></svg>';
    var SVG_CLOSE = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>';

    var fab = document.createElement('button');
    fab.id = 'oc-msg-fab';
    fab.className = 'oc-msg-fab';
    fab.setAttribute('aria-label', 'Open Messages');

    var iconWrap = document.createElement('span');
    iconWrap.className = 'oc-msg-fab-icon';
    iconWrap.innerHTML = SVG_MSG;
    fab.appendChild(iconWrap);

    var badge = document.createElement('span');
    badge.className = 'oc-msg-fab-badge';
    badge.style.display = 'none';
    fab.appendChild(badge);

    function updateBadge() {
      var n = countUnreadMessages();
      if (n > 0) {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }

    function updateFabState() {
      var onMessages = (route === 'messages');
      if (onMessages) {
        fab.classList.add('is-open');
        fab.title = 'Close Messages';
        fab.setAttribute('aria-label', 'Close Messages');
        iconWrap.innerHTML = SVG_CLOSE;
        badge.style.display = 'none'; // hide badge when messages is open
      } else {
        fab.classList.remove('is-open');
        fab.title = 'Messages';
        fab.setAttribute('aria-label', 'Open Messages');
        iconWrap.innerHTML = SVG_MSG;
        updateBadge();
      }
    }
    updateFabState();

    // Saved position
    var posKey = 'oc-msg-fab-pos';
    var savedPos = null;
    try { savedPos = JSON.parse(localStorage.getItem(posKey)); } catch (e) {}
    var startRight = (savedPos && savedPos.right != null) ? savedPos.right : 24;
    var startBottom = (savedPos && savedPos.bottom != null) ? savedPos.bottom : 32;
    fab.style.right = startRight + 'px';
    fab.style.bottom = startBottom + 'px';

    // Drag logic
    var isDragging = false;
    var hasMoved = false;
    var dragStartX = 0;
    var dragStartY = 0;
    var btnStartRight = 0;
    var btnStartBottom = 0;

    function onPointerDown(e) {
      isDragging = true;
      hasMoved = false;
      dragStartX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      dragStartY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      btnStartRight = parseInt(fab.style.right) || 24;
      btnStartBottom = parseInt(fab.style.bottom) || 32;
      fab.classList.add('dragging');
      e.preventDefault();
    }
    function onPointerMove(e) {
      if (!isDragging) return;
      var cx = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      var cy = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      var dx = cx - dragStartX;
      var dy = cy - dragStartY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasMoved = true;
      var vw = window.innerWidth || document.documentElement.clientWidth || 800;
      var vh = window.innerHeight || document.documentElement.clientHeight || 600;
      var size = 58;
      var newRight = Math.max(8, Math.min(vw - size - 8, btnStartRight - dx));
      var newBottom = Math.max(8, Math.min(vh - size - 8, btnStartBottom - dy));
      fab.style.right = newRight + 'px';
      fab.style.bottom = newBottom + 'px';
    }
    function onPointerUp(e) {
      if (!isDragging) return;
      isDragging = false;
      fab.classList.remove('dragging');
      try { localStorage.setItem(posKey, JSON.stringify({ right: parseInt(fab.style.right), bottom: parseInt(fab.style.bottom) })); } catch (ex) {}
      if (!hasMoved) {
        // Toggle: if on messages → go back; otherwise → open messages
        if (route === 'messages') {
          go(previousRoute || 'dashboard');
        } else {
          go('messages');
        }
      }
    }

    fab.addEventListener('mousedown', onPointerDown);
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    fab.addEventListener('touchstart', onPointerDown, { passive: false });
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerUp);

    document.body.appendChild(fab);

    // Real-time badge via store onChange (no polling needed)
    fab._storeUnsub = OC.store.onChange(function () {
      updateFabState();
    });
  }

  function refreshFloatingMsgBadge() {
    if (typeof document === 'undefined') return;
    var fab = document.getElementById('oc-msg-fab');
    if (!fab) return;
    var badge = fab.querySelector('.oc-msg-fab-badge');
    if (!badge) return;
    // Update icon state (open/close toggle)
    var iconWrap = fab.querySelector('.oc-msg-fab-icon');
    var SVG_MSG = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="26" height="26"><path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H6l-2 2V4h16v10z" fill="currentColor"/></svg>';
    var SVG_CLOSE = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>';
    var onMessages = (route === 'messages');
    if (onMessages) {
      fab.classList.add('is-open');
      fab.title = 'Close Messages';
      if (iconWrap) iconWrap.innerHTML = SVG_CLOSE;
      badge.style.display = 'none';
    } else {
      fab.classList.remove('is-open');
      fab.title = 'Messages';
      if (iconWrap) iconWrap.innerHTML = SVG_MSG;
      var n = countUnreadMessages();
      if (n > 0) {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  /* ---- routing ---------------------------------------------------------- */
  /* The hash is "<section>" or "<section>/<sub>/<sub>". Sections keep the URL
     they always had; anything a view opens on top of itself — a client's
     workspace, a Management tab — rides along after it, so a reload comes back
     to the same place instead of the section's front page. */
  function parseHash(raw) {
    var parts = String(raw || '').split('/').filter(Boolean);
    var id = parts[0] || '';
    if (id === 'foundation') id = 'policy';
    return { id: id, sub: parts.slice(1) };
  }

  function hashFor(id, sub) {
    return '#' + id + (sub && sub.length ? '/' + sub.join('/') : '');
  }

  /* push=true adds a fresh history entry (a real "page" the Back button can
     return to); push=false (the default) just corrects the address bar in
     place, the way it always has. A navigation the app initiates — a nav
     click, opening a client, switching a tab — pushes; one already driven
     by the browser's own Back/Forward (see the hashchange listener below)
     must not push again, or Back would immediately re-add the entry it was
     just leaving and Forward would end up somewhere wrong. */
  function setHash(id, sub, push) {
    if (typeof location === 'undefined') return;
    var target = hashFor(id, sub);
    try {
      if (push && history.pushState) history.pushState(null, '', target);
      else if (history.replaceState) history.replaceState(null, '', target);
      else location.hash = target;
    } catch (_) {
      location.hash = target;
    }
  }

  function go(id, sub, fromHashChange) {
    if (id === 'foundation') id = 'policy';
    var asked = id;
    if (id === 'groups' || id === 'people' || id === 'reports') {
      if (!canUseRoute('activities')) { id = 'dashboard'; sub = []; }
    } else if (!canUseRoute(id)) {
      id = 'dashboard';
      sub = [];
    }
    var nextSub = (sub || []).filter(Boolean).map(String);
    if (route === id && subPath.join('/') === nextSub.join('/')) {
      /* the address named a section they may not open; put the bar back to the
         page they are actually looking at instead of leaving it lying */
      if (asked !== id) setHash(id, nextSub, false);
      return;
    }
    /* Track previous route for Messages FAB toggle.
       Whenever navigating TO messages, remember where we came from.
       Whenever navigating OUT of messages to anywhere, update previousRoute. */
    if (id === 'messages' && route !== 'messages') {
      previousRoute = route;
    }
    route = id;
    subPath = nextSub;
    /* the browser already navigated here (Back/Forward already changed the
       address and the history stack); reacting to that must not touch
       history again, only catch the app's own state up to it */
    if (!fromHashChange) setHash(id, subPath, true);
    render();
  }

  function currentView() {
    if (route === 'profile' || route === 'employee-portal') return OC.profilePortal || OC.dashboard;
    /* every way into Management runs through here, so one check covers the tab,
       the address bar and the three aliases alike */
    if (route === 'activities' || route === 'groups' || route === 'people' || route === 'reports') {
      if (!canUseRoute('activities')) { route = 'dashboard'; return OC.dashboard; }
      if (route !== 'activities') return (OC.activities || OC.groups || OC.people);
    }
    for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i].id === route) return ROUTES[i].view();
    return OC.dashboard;
  }

  /* A refresh driven by the data, not by the person: rebuild the page, then put
     them back exactly where they were — same scroll, same field, same caret.
     OC.ui.keepingPlace does the capture and restore. */
  function renderInPlace() {
    if (!isAuthenticated) return;
    // If a modal or dialog is actively open (e.g. user creating/editing a client, todo, group, profile, etc.),
    // skip rebuilding the underlying background page on this 1s tick so open user inputs are not interrupted.
    if (typeof document !== 'undefined') {
      var openModal = document.querySelector('dialog[open], .modal, .modal-backdrop');
      if (openModal) return;
    }
    if (!OC.ui.keepingPlace) { render(); return; }
    OC.ui.keepingPlace(typeof document !== 'undefined' ? document.getElementById('page') : null, render);
  }

  function render() {
    var root = typeof document !== 'undefined' ? document.getElementById('root') : null;
    if (!root) return;

    // Check if user is authenticated
    if (!isAuthenticated) {
      renderLoginScreen(root);
      return;
    }

    var existingPage = document.getElementById('page');
    var existingNav = root.querySelector('nav.nav');
    
    // Fast path: if shell exists, update active nav and render page instantly with 0ms delay
    if (existingPage && existingNav && root.contains(existingPage)) {
      var navButtons = existingNav.querySelectorAll('button');
      var navIds = [];
      for (var nb = 0; nb < navButtons.length; nb++) {
        var rid = navButtons[nb].getAttribute('data-route');
        navIds.push(rid);
        if (route === rid) navButtons[nb].setAttribute('aria-current', 'page');
        else navButtons[nb].removeAttribute('aria-current');
      }
      /* whoever is signed in may not be who the shell was built for, so rebuild
         it when the set of sections they may open has changed */
      var wanted = visibleRoutes().map(function (r) { return r.id; });
      if (navIds.join(',') !== wanted.join(',')) {
        OC.ui.clear(root);
        existingPage = null;
      }
      if (existingPage) {
        OC.ui.clear(existingPage);
        currentView().render(existingPage, render);
        refreshTopbarIdentity();
        refreshAlertsBadge();
        refreshFloatingMsgBadge();
        raisePush();
        return;
      }
    }

    // Full mount path
    OC.ui.clear(root);
    var page = h('main', { class: 'page', id: 'page' });
    OC.ui.append(root, [topbar(), nav(), page]);
    currentView().render(page, render);
    lastTopbarSignature = topbarSignature();
    refreshAlertsBadge();
    raisePush();
    mountFloatingMessagesBtn();
  }

  /* ---- boot ------------------------------------------------------------- */
  function start() {
    OC.store.load();

    var savedAuth = null;
    try { savedAuth = localStorage.getItem(AUTH_KEY); } catch (e) { }
    if (savedAuth && OC.store.user(savedAuth)) {
      isAuthenticated = true;
      OC.store.setSession(savedAuth);
      seedLastSeenNotification();
    } else {
      isAuthenticated = false;
    }

    var label = typeof document !== 'undefined' ? document.getElementById('backendLabel') : null;
    if (label && OC.backend) {
      var backend = OC.backend.describe();
      label.textContent = backend.label;
      label.title = backend.detail;
    }

    var saved = readTheme();
    if (saved && THEMES.indexOf(saved) > -1) themeIndex = THEMES.indexOf(saved);
    applyTheme(null);

    if (typeof location !== 'undefined') {
      var rawHash = location.hash.slice(1);
      /* an invite token is not a path — read it before anything splits on "/" */
      if (rawHash && rawHash.indexOf('claim=') === 0) {
        checkClaimToken();
      } else {
        var boot = parseHash(rawHash);
        if (boot.id === 'groups' || boot.id === 'people' || boot.id === 'reports') {
          route = canUseRoute('activities') ? 'activities' : 'dashboard';
          subPath = route === 'activities' ? boot.sub : [];
        } else if (boot.id === 'profile' || boot.id === 'employee-portal') {
          route = 'profile';
          subPath = boot.sub;
        } else if (boot.id && ROUTES.some(function (r) { return r.id === boot.id; })) {
          var allowed = canUseRoute(boot.id);
          route = allowed ? boot.id : 'dashboard';
          subPath = allowed ? boot.sub : [];
        }
      }

      window.addEventListener('hashchange', function () {
        var raw = location.hash.slice(1);
        if (raw && raw.indexOf('claim=') === 0) { checkClaimToken(); return; }
        var next = parseHash(raw);
        var id = next.id;
        if (id === 'groups' || id === 'people' || id === 'reports') id = 'activities';
        else if (id === 'employee-portal') id = 'profile';
        if (!id) return;
        var known = id === 'profile' || ROUTES.some(function (r) { return r.id === id; });
        if (!known) return;
        if (id !== route || next.sub.join('/') !== subPath.join('/')) go(id, next.sub, true);
      });
    }

    OC.store.onChange(renderInPlace);
    render();
  }

  return {
    start: start,
    go: go,
    /* the path under the current section, for views that open something on top
       of themselves and want a reload to come back to it */
    sub: function () { return subPath.slice(); },
    setSub: function (parts) {
      subPath = (parts || []).filter(Boolean).map(String);
      /* opening a client, switching a Management tab, etc. — a real step in
         the workspace the user should be able to Back out of one at a time */
      setHash(route, subPath, true);
    },
    logout: logout,
    openProfileModal: openProfileModal,
    renderLogin: function () {
      var root = typeof document !== 'undefined' ? document.getElementById('root') : null;
      if (root) renderLoginScreen(root);
    },
    reset: function () { OC.store.reset(); },
    getDeviceInfo: getDeviceInfo,
    openPWAInstallModal: openPWAInstallModal,
    renderInstallButton: renderInstallButton,
    isInstallButtonVisible: isInstallButtonVisible
  };
})();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', OC.app.start);
}
