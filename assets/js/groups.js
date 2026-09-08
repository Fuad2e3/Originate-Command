/* =========================================================================
   groups.js — cross-department groups (4.2, 6.5)
   A group is separate from the department tree: its own member list, its own
   assignable identity, group discussions, chat messages with edit/delete,
   reactions, and member management.
   Creation is gated on the working default recorded in section 13: system
   admin plus department heads.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.groups = (function () {
  'use strict';

  var searchQuery = '';
  var filterStatus = 'all'; /* all | active | archived | mine */
  var activeChatGroupId = null;

  var EMOJIS = ['👍', '❤️', '🔥', '👏', '🎉', '🚀', '👀', '✅'];

  function me() {
    return OC.store.user(OC.store.session()) || (OC.store.state && OC.store.state.users && OC.store.state.users[0]) || { id: '', name: 'User', admin: false };
  }

  function newGroup(onDone) {
    var h = OC.ui.h;
    var user = me();
    if (!user || !user.admin) {
      OC.ui.toast('Only System Admins can create a new channel.');
      return;
    }
    var name = h('input', { type: 'text', placeholder: 'for example: Chaim Site Relaunch' });
    var purpose = h('textarea', { placeholder: 'what this group exists to do, and until when' });
    var boxes = OC.store.state.users.map(function (u) {
      var box = h('input', { type: 'checkbox', value: u.id, checked: u.id === user.id });
      return {
        id: u.id, box: box,
        node: h('label', { class: 'checkline' }, [
          box, u.name,
          h('span', { class: 'chip role ' + ((OC.can && OC.can.roleClass) ? OC.can.roleClass(OC.can.roleLabel(u)) : '') }, OC.can.roleLabel(u))
        ])
      };
    });

    OC.ui.modal({
      title: 'New group',
      content: h('div', {}, [
        OC.ui.field('Name', name, { required: true }),
        OC.ui.field('Purpose', purpose, { required: true }),
        OC.ui.field('Members', h('div', { style: 'max-height:180px;overflow-y:auto;padding-right:4px;' }, boxes.map(function (b) { return b.node; })), {
          hint: 'Add members from any department.'
        })
      ]),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Create group', primary: true, onClick: function (close) {
            if (!name.value.trim()) return 'Give the group a name.';
            if (!purpose.value.trim()) return 'Say what the group is for.';
            var members = boxes.filter(function (b) { return b.box.checked; }).map(function (b) { return b.id; });
            if (members.length < 2) return 'A group needs at least two people.';

            var group = {
              id: OC.store.uid('g'), name: name.value.trim(), purpose: purpose.value.trim(),
              members: members, created_by: user.id, status: 'active',
              messages: [], created_at: new Date().toISOString()
            };
            if (OC.store.trackGroupCreated) OC.store.trackGroupCreated(group.id);
            OC.store.mutate({ actor: user.id, action: 'group.create', target: group.name, groupId: group.id, detail: members.length + ' members' }, function () {
              OC.store.state.groups.push(group);
            });
            OC.store.notify(members.filter(function (id) { return id !== user.id; }),
              user.name + ' added you to the group ' + group.name, group.id);
            OC.ui.toast('Group created.');
            if (onDone) onDone();
            close();
          }
        }
      ]
    });
  }

  function editGroup(group, onDone) {
    var h = OC.ui.h;
    var user = me();
    var name = h('input', { type: 'text', value: group.name });
    var purpose = h('textarea', {}, group.purpose || '');
    var statusSelect = OC.ui.select([
      { value: 'active', label: 'Active' },
      { value: 'archived', label: 'Archived' }
    ], group.status || 'active');

    var boxes = OC.store.state.users.map(function (u) {
      var isMember = (group.members || []).indexOf(u.id) > -1;
      var box = h('input', { type: 'checkbox', value: u.id, checked: isMember });
      return {
        id: u.id, box: box,
        node: h('label', { class: 'checkline' }, [
          box, u.name,
          h('span', { class: 'chip role ' + ((OC.can && OC.can.roleClass) ? OC.can.roleClass(OC.can.roleLabel(u)) : '') }, OC.can.roleLabel(u))
        ])
      };
    });

    var actions = [
      { label: 'Cancel', onClick: function (close) { close(); } },
      {
        label: 'Save changes', primary: true, onClick: function (close) {
          var newName = name.value.trim();
          var newPurpose = purpose.value.trim();
          if (!newName) return 'Give the group a name.';
          if (!newPurpose) return 'Say what the group is for.';
          var members = boxes.filter(function (b) { return b.box.checked; }).map(function (b) { return b.id; });
          if (members.length < 2) return 'A group needs at least two people.';

          var oldMembers = (group.members || []).slice();
          var newlyAdded = members.filter(function (id) { return oldMembers.indexOf(id) === -1; });

          OC.store.mutate({
            actor: user.id, action: 'group.edit', target: newName,
            detail: 'Updated group details'
          }, function () {
            group.name = newName;
            group.purpose = newPurpose;
            group.status = statusSelect.value;
            group.members = members;
          });

          if (newlyAdded.length) {
            OC.store.notify(newlyAdded.filter(function (id) { return id !== user.id; }),
              user.name + ' added you to group ' + group.name, group.id);
          }

          OC.ui.toast('Group updated.');
          if (onDone) onDone();
          close();
        }
      }
    ];

    if (OC.can.canDeleteGroup(user, group)) {
      actions.unshift({
        label: 'Delete group',
        onClick: function (close) {
          OC.ui.confirm('Permanently delete group "' + group.name + '"? This will remove all group messages and cannot be undone.', function () {
            OC.store.mutate({
              actor: user.id, action: 'group.delete', target: group.name, groupId: group.id,
              detail: 'Deleted group'
            }, function () {
              OC.store.deleteGroup(group.id);
            });
            OC.ui.toast('Group deleted.');
            if (onDone) onDone();
            close();
          });
        }
      });
    }

    OC.ui.modal({
      title: 'Edit group: ' + group.name,
      content: h('div', {}, [
        OC.ui.field('Name', name, { required: true }),
        OC.ui.field('Purpose', purpose, { required: true }),
        OC.ui.field('Status', statusSelect, { required: true }),
        OC.ui.field('Members', h('div', { style: 'max-height:180px;overflow-y:auto;padding-right:4px;' }, boxes.map(function (b) { return b.node; })), {
          hint: 'Select or deselect members for this cross-department group.'
        })
      ]),
      actions: actions
    });
  }


  function deleteGroupDirect(group, onDone) {
    var user = me();
    if (!user || !user.admin) {
      OC.ui.toast('Access Denied: Only System Admin can delete groups.', true);
      return;
    }
    OC.ui.confirm('Permanently delete group "' + group.name + '" and all its discussions? This cannot be undone.', function () {
      OC.store.mutate({ actor: user.id, action: 'group.delete', target: group.name, groupId: group.id, detail: 'Deleted group' }, function () {
        OC.store.deleteGroup(group.id);
      });
      OC.ui.toast('Group permanently deleted.');
      if (activeChatGroupId === group.id) {
        activeChatGroupId = null;
      }
      if (onDone) onDone();
    });
  }

  /* ---- dedicated full-page group chat room view ------------------------- */
  /* Where the reader is in a channel has to outlive the page rebuild that a
     new message causes. Kept per channel at module level: held in a closure it
     was reset on every render, so a rebuild always looked like a fresh open and
     yanked whoever was reading history down to the newest message. */
  var chatOpenGroupId = null;
  var chatPinnedToBottom = true;
  var chatScrollTop = 0;

  function renderGroupChatPage(host, group, onBack) {
    var h = OC.ui.h;
    var user = me();
    var groupId = group.id;

    if (!OC.can.seeGroup(user, group)) {
      OC.ui.toast('Access restricted: Only assigned group members can view this group.', true);
      if (typeof onBack === 'function') onBack();
      return;
    }

    var chatContainer = h('div', { class: 'full-page-chat-container' });
    var msgInput = h('input', { type: 'text', placeholder: 'Write a message in ' + group.name + ' or type @ to mention...', 'aria-label': 'Group message' });
    var msgsList = null;
    var replyingBadgeWrap = h('div', { style: 'display:none;' });
    var activeReplyTarget = null;

    var mediaPreviewWrap = h('div', { style: 'display:none;' });
    var currentMediaAttachment = null;

    function setReplyContext(targetAuthor, targetMsg) {
      activeReplyTarget = (targetAuthor && targetMsg) ? {
        id: targetMsg.id,
        author_id: targetAuthor.id || targetMsg.author,
        author_name: targetAuthor.name || targetMsg.author,
        text: (targetMsg.text || (targetMsg.poll ? '📊 Poll: ' + targetMsg.poll.question : 'Media attachment')).slice(0, 75)
      } : null;

      OC.ui.clear(replyingBadgeWrap);
      if (activeReplyTarget) {
        replyingBadgeWrap.style.display = 'block';
        replyingBadgeWrap.appendChild(h('div', { class: 'reply-draft-banner' }, [
          h('div', { class: 'reply-draft-info' }, [
            h('span', { class: 'reply-draft-header' }, [
              h('span', {}, '↳ Replying to ' + activeReplyTarget.author_name)
            ]),
            h('span', { class: 'reply-draft-snippet' }, '"' + activeReplyTarget.text + '"')
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
      msgInput.focus();
    }

    function setMediaAttachment(media) {
      currentMediaAttachment = media;
      OC.ui.clear(mediaPreviewWrap);
      if (media) {
        mediaPreviewWrap.style.display = 'block';
        var thumb = media.type === 'image'
          ? h('img', { class: 'chat-media-preview-thumb', src: media.url, alt: media.name })
          : h('div', { class: 'chat-media-preview-thumb', style: 'display:flex;align-items:center;justify-content:center;background:var(--paper);color:var(--ink);font-size:16px;' }, OC.icon('video'));

        mediaPreviewWrap.appendChild(h('div', { class: 'chat-media-preview-bar' }, [
          thumb,
          h('div', { class: 'chat-media-preview-info' }, [
            h('span', { class: 'chat-media-preview-name' }, media.name),
            h('span', { class: 'chat-media-preview-size' }, (media.type === 'image' ? 'Optimized image · ' : 'Video · ') + media.size)
          ]),
          h('button', {
            type: 'button',
            class: 'replying-cancel-btn',
            title: 'Remove attachment',
            onClick: function (e) {
              e.preventDefault();
              setMediaAttachment(null);
            }
          }, OC.icon('close'))
        ]));
      } else {
        mediaPreviewWrap.style.display = 'none';
      }
    }

    function compressChatImage(img) {
      var canvas = document.createElement('canvas');
      var maxDim = 1200;
      var w = img.width;
      var h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      var compressed = canvas.toDataURL('image/webp', 0.82);
      if (compressed.indexOf('data:image/webp') !== 0) compressed = canvas.toDataURL('image/jpeg', 0.82);
      return compressed;
    }

    var mediaFileInput = h('input', {
      type: 'file',
      accept: 'image/png, image/jpeg, image/webp, image/gif, video/mp4, video/webm, video/quicktime',
      style: 'display:none;',
      onChange: function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        
        var isVideo = file.type.indexOf('video/') === 0;
        if (isVideo) {
          if (file.size > 25 * 1024 * 1024) {
            OC.ui.toast('Video size must be under 25MB.', true);
            return;
          }
          var reader = new FileReader();
          reader.onload = function (ev) {
            var approxMb = Math.round((file.size / (1024 * 1024)) * 10) / 10;
            setMediaAttachment({
              type: 'video',
              url: ev.target.result,
              name: file.name,
              size: approxMb + ' MB'
            });
            OC.ui.toast('Video attached successfully.');
          };
          reader.readAsDataURL(file);
        } else {
          if (file.size > 15 * 1024 * 1024) {
            OC.ui.toast('Image size must be under 15MB.', true);
            return;
          }
          var imgReader = new FileReader();
          imgReader.onload = function (ev) {
            var img = new Image();
            img.onload = function () {
              var optimizedUrl = compressChatImage(img);
              var approxKb = Math.round(((optimizedUrl.length * 0.75) / 1024) * 10) / 10;
              setMediaAttachment({
                type: 'image',
                url: optimizedUrl,
                name: file.name,
                size: approxKb + ' KB'
              });
              OC.ui.toast('Image optimized and attached.');
            };
            img.src = ev.target.result;
          };
          imgReader.readAsDataURL(file);
        }
        mediaFileInput.value = '';
      }
    });

    function openCreatePollModal() {
      var currentGroup = OC.store.group(groupId) || group;
      var qInput = h('input', { type: 'text', placeholder: 'e.g. Which design concept do you prefer?', 'aria-label': 'Poll question' });
      var multiChoiceBox = h('input', { type: 'checkbox' });
      var optionsListWrap = h('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-top:8px;' });
      var optionInputs = [];

      function addOptionRow(val) {
        if (optionInputs.length >= 8) {
          OC.ui.toast('Maximum 8 poll options allowed.', true);
          return;
        }
        var optInput = h('input', { type: 'text', placeholder: 'Option ' + (optionInputs.length + 1), value: val || '' });
        var row = h('div', { class: 'row', style: 'gap:8px;align-items:center;' }, [
          optInput,
          optionInputs.length >= 2 ? h('button', {
            type: 'button',
            class: 'replying-cancel-btn',
            title: 'Remove option',
            onClick: function (e) {
              e.preventDefault();
              var idx = optionInputs.indexOf(optInput);
              if (idx > -1) optionInputs.splice(idx, 1);
              row.remove();
            }
          }, OC.icon('close')) : null
        ]);
        optionInputs.push(optInput);
        optionsListWrap.appendChild(row);
      }

      addOptionRow('Concept A: Modern Grid');
      addOptionRow('Concept B: Minimalist');

      var addOptBtn = h('button', {
        class: 'btn small',
        type: 'button',
        onClick: function (e) {
          e.preventDefault();
          addOptionRow('');
        }
      }, [OC.icon('plus'), 'Add option']);

      OC.ui.modal({
        title: 'Create Interactive Poll in ' + currentGroup.name,
        content: h('div', {}, [
          OC.ui.field('Question / Topic', qInput, { required: true }),
          OC.ui.field('Poll Options', h('div', {}, [
            optionsListWrap,
            h('div', { style: 'margin-top:8px;' }, [addOptBtn])
          ]), { hint: 'Add up to 8 distinct voting choices for your team.' }),
          h('label', { class: 'checkline', style: 'margin-top:10px;' }, [
            multiChoiceBox,
            'Allow team members to select multiple options'
          ])
        ]),
        actions: [
          { label: 'Cancel', onClick: function (close) { close(); } },
          {
            label: 'Publish Poll', primary: true, onClick: function (close) {
              var qVal = qInput.value.trim();
              if (!qVal) return 'Poll question cannot be empty.';
              
              var validOptions = [];
              optionInputs.forEach(function (inp, idx) {
                var txt = inp.value.trim();
                if (txt) {
                  validOptions.push({
                    id: 'opt-' + (idx + 1) + '-' + Math.random().toString(36).slice(2, 6),
                    text: txt,
                    voters: []
                  });
                }
              });

              if (validOptions.length < 2) {
                return 'Please provide at least 2 voting options.';
              }

              var pollData = {
                id: OC.store.uid('poll'),
                question: qVal,
                multi: !!multiChoiceBox.checked,
                options: validOptions,
                created_by: user.id,
                created_at: new Date().toISOString()
              };

              OC.store.mutate({
                actor: user.id, action: 'group.poll.create', target: currentGroup.name, detail: qVal.slice(0, 35)
              }, function () {
                OC.store.addGroupMessage(currentGroup.id, '📊 Poll: ' + qVal, user.id, { poll: pollData });
              });

              var targets = (currentGroup.members || []).filter(function (id) { return id !== user.id; });
              if (targets.length) {
                OC.store.notify(targets, user.name + ' started a new poll in ' + currentGroup.name + ': "' + qVal.slice(0, 35) + '"', currentGroup.id);
              }

              OC.ui.toast('Poll created successfully.');
              renderMessages();
              close();
            }
          }
        ]
      });
    }

    var groupMemberUsers = (group.members || []).map(OC.store.user).filter(Boolean);
    var mentionHelper = OC.ui.attachMentionAutocomplete
      ? OC.ui.attachMentionAutocomplete(msgInput, groupMemberUsers.length ? groupMemberUsers : null, function (u) {})
      : null;

    /* a different channel, or the first time this one is opened */
    var isInitialGroupLoad = (chatOpenGroupId !== group.id);
    chatOpenGroupId = group.id;
    if (isInitialGroupLoad) { chatPinnedToBottom = true; chatScrollTop = 0; }
    /* when the code last moved the list itself; a scroll event that close to a
       programmatic write is the echo of that write, not the reader */
    var lastAutoScrollAt = 0;
    var onlineIds = (OC.store.onlineUserIds ? OC.store.onlineUserIds() : []);
    if (user && user.id && onlineIds.indexOf(user.id) === -1) {
      onlineIds = [user.id].concat(onlineIds);
    }

    var isDm = !!(OC.can.isDirect && OC.can.isDirect(group));
    var dmPartner = isDm
      ? OC.store.user((group.members || []).filter(function (m) { return m !== user.id; })[0])
      : null;
    var dmPartnerId = dmPartner ? dmPartner.id : '';
    var dmPartnerName = dmPartner ? dmPartner.name : 'Unknown member';

    function renderMessages(forceScrollBottom) {
      var prevScrollTop = msgsList ? msgsList.scrollTop : chatScrollTop;
      var wasNearBottom = chatPinnedToBottom;

      OC.ui.clear(chatContainer);

      var currentGroup = OC.store.group(groupId) || group;
      currentGroup.messages = currentGroup.messages || [];

      var memberChips = (currentGroup.members || []).map(function (id) {
        var u = OC.store.user(id);
        var isMemOnline = (onlineIds.indexOf(id) > -1);
        /* a member whose account is not loaded — deleted, or still to come down
           from the database — used to render as its raw id, which reads as a
           bug rather than as a person */
        return h('span', {
          class: 'chip custom person' + (u ? '' : ' is-unresolved'),
          title: u ? ((isMemOnline ? '🟢 Online · ' : '') + OC.can.roleLabel(u)) : 'This account is not loaded on this device'
        }, [
          h('div', { style: 'position:relative;display:inline-flex;align-items:center;' }, [
            OC.ui.mark(id),
            isMemOnline ? h('span', {
              class: 'discord-avatar-online-dot',
              style: 'position:absolute;bottom:-2px;right:-2px;width:7px;height:7px;border-radius:50%;background:#22c55e;border:1px solid var(--card-bg, #111b2e);box-shadow:0 0 3px rgba(34,197,94,0.7);'
            }) : null
          ]),
          u ? u.name : 'Unknown member'
        ]);
      });

      var headerBox = h('div', { class: 'full-page-chat-header' }, [
        h('div', { class: 'full-page-chat-header-top' }, [
          h('div', { class: 'full-page-chat-title-group' }, [
            h('button', {
              class: 'full-page-chat-back-btn',
              type: 'button',
              title: 'Return to groups list',
              onClick: function (e) {
                e.preventDefault();
                if (typeof onBack === 'function') onBack();
              }
            }, [OC.icon('left'), isDm ? 'Back' : 'Back to Channels']),
            h('h2', { style: 'font-size:17px;font-weight:700;color:var(--ink);margin:0;display:flex;align-items:center;gap:6px;' },
              isDm
                ? [
                    h('div', { style: 'position:relative;display:inline-flex;align-items:center;' }, [
                      OC.ui.mark(dmPartnerId),
                      (onlineIds.indexOf(dmPartnerId) > -1) ? h('span', {
                        class: 'discord-avatar-online-dot',
                        style: 'position:absolute;bottom:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:#22c55e;border:1.5px solid var(--card-bg, #111b2e);box-shadow:0 0 5px rgba(34,197,94,0.8);'
                      }) : null
                    ]),
                    h('span', {}, dmPartnerName),
                    (onlineIds.indexOf(dmPartnerId) > -1) ? h('span', { class: 'dot', style: 'color:#22c55e;font-size:16px;', title: 'Online now' }, '•') : null
                  ]
                : [h('span', { class: 'group-channel-hash' }, '#'), h('span', {}, currentGroup.name)]),
            isDm
              ? h('span', { class: 'chip custom', title: 'Only the two of you can read this' },
                  [OC.icon('lock'), 'Private'])
              : h('div', { class: 'row', style: 'gap:6px;align-items:center;' }, [
                  h('span', { class: 'chip ' + (currentGroup.status === 'active' ? 'group' : 'custom') }, currentGroup.status),
                  h('span', { class: 'chip count' }, (currentGroup.members || []).length + ' members')
                ])
          ]),
          isDm ? null : h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;align-items:center;' }, memberChips)
        ]),
        isDm
          ? h('p', { class: 'muted group-channel-topic', style: 'font-size:13px;margin:2px 0 0;' },
              'A private conversation between you and ' + dmPartnerName + ((onlineIds.indexOf(dmPartnerId) > -1) ? ' (🟢 Online now)' : '') + '.')
          : h('p', { class: 'muted group-channel-topic', style: 'font-size:13px;margin:2px 0 0;' }, currentGroup.purpose)
      ]);

      msgsList = h('div', { class: 'full-page-chat-messages' });

      if (!currentGroup.messages.length) {
        msgsList.appendChild(h('div', { class: 'empty', style: 'padding:40px 24px;text-align:center;' }, [
          OC.icon('board'),
          h('p', { style: 'margin-top:8px;font-size:14px;color:var(--text-secondary);' }, 'No discussions yet. Send the first message or create a poll below!')
        ]));
      } else {
        currentGroup.messages.forEach(function (m) {
          var canEdit = OC.can.canEditGroupMessage(user, m, currentGroup);
          var canDel = OC.can.canDeleteGroupMessage(user, m, currentGroup);
          var msgAuthorUser = OC.store.user(m.author);

          // Build reaction bar for this message
          var msgReactionsWrap = h('div', { class: 'reactions-bar', style: 'margin-top:4px;' });
          var rxKeys = Object.keys(m.reactions || {});
          var pickerPop = null;

          function toggleMsgReact(emoji) {
            if (!OC.can.canReactGroupMessage(user, currentGroup)) {
              OC.ui.toast('Access restricted: Only assigned group members can react.', true);
              return;
            }
            var list = (m.reactions && m.reactions[emoji]) || [];
            var had = list.indexOf(user.id) > -1;

            OC.store.mutate({
              actor: user.id, action: 'group.message.react', target: currentGroup.name, detail: emoji
            }, function () {
              OC.store.reactGroupMessage(currentGroup.id, m.id, emoji, user.id);
            });

            if (!had && m.author && m.author !== user.id) {
              OC.store.notify([m.author], user.name + ' reacted ' + emoji + ' to your message in ' + currentGroup.name, currentGroup.id);
            }

            renderMessages(false);
          }

          rxKeys.forEach(function (emoji) {
            var users = m.reactions[emoji] || [];
            if (!users.length) return;
            var active = users.indexOf(user.id) > -1;
            var names = users.map(OC.ui.personName).join(', ');
            var btn = h('button', {
              class: 'reaction-btn' + (active ? ' active' : ''),
              type: 'button',
              title: names,
              onClick: function (e) {
                e.preventDefault();
                toggleMsgReact(emoji);
              }
            }, [
              h('span', { class: 'emoji' }, emoji),
              h('span', { class: 'count' }, String(users.length))
            ]);
            msgReactionsWrap.appendChild(btn);
          });

          var pickerBtn = h('button', {
            class: 'reaction-picker-btn',
            type: 'button',
            title: 'Add reaction',
            onClick: function (e) {
              e.preventDefault();
              e.stopPropagation();
              if (pickerPop) { pickerPop.remove(); pickerPop = null; return; }

              pickerPop = h('div', { class: 'reaction-picker-pop' }, EMOJIS.map(function (em) {
                return h('button', {
                  type: 'button',
                  class: 'reaction-emoji-btn',
                  onClick: function (ev) {
                    ev.preventDefault(); ev.stopPropagation();
                    toggleMsgReact(em);
                    if (pickerPop) { pickerPop.remove(); pickerPop = null; }
                  }
                }, em);
              }));
              msgReactionsWrap.appendChild(pickerPop);
              var closeDoc = function (ev) {
                if (pickerPop && !pickerPop.contains(ev.target) && ev.target !== pickerBtn) {
                  pickerPop.remove(); pickerPop = null;
                  document.removeEventListener('click', closeDoc);
                }
              };
              setTimeout(function () { document.addEventListener('click', closeDoc); }, 0);
            }
          }, [
            h('span', { class: 'icon-smile' }, '😀'),
            h('span', { class: 'btn-label' }, '+ React')
          ]);
          msgReactionsWrap.appendChild(pickerBtn);

          // Render attached media
          var mediaNode = null;
          if (m.media) {
            if (m.media.type === 'image') {
              mediaNode = h('div', {
                class: 'group-msg-media-img',
                onClick: function (e) {
                  e.preventDefault();
                  OC.ui.modal({
                    title: (m.media.name || 'Image Preview'),
                    content: h('div', { style: 'text-align:center;' }, [h('img', { src: m.media.url, style: 'max-width:100%;max-height:75vh;border-radius:6px;' })]),
                    actions: [{ label: 'Close', onClick: function (close) { close(); } }]
                  });
                }
              }, [h('img', { src: m.media.url, alt: m.media.name || 'Image' })]);
            } else if (m.media.type === 'video') {
              mediaNode = h('div', { class: 'group-msg-media-video' }, [
                h('video', { src: m.media.url, controls: true, preload: 'metadata' })
              ]);
            }
          }

          // Render poll
          var pollNode = null;
          if (m.poll && Array.isArray(m.poll.options)) {
            var totalPollVotes = 0;
            m.poll.options.forEach(function (opt) {
              totalPollVotes += (opt.voters || []).length;
            });

            var optionNodes = m.poll.options.map(function (opt) {
              var voters = opt.voters || [];
              var hasVoted = voters.indexOf(user.id) > -1;
              var voteCount = voters.length;
              var pct = totalPollVotes > 0 ? Math.round((voteCount / totalPollVotes) * 100) : 0;
              var voterNames = voters.map(OC.ui.personName).join(', ');

              return h('div', {
                class: 'group-msg-poll-opt' + (hasVoted ? ' voted' : ''),
                onClick: function (e) {
                  e.preventDefault();
                  OC.store.mutate({
                    actor: user.id, action: 'group.poll.vote', target: currentGroup.name, detail: opt.text.slice(0, 35)
                  }, function () {
                    OC.store.voteGroupPoll(currentGroup.id, m.id, opt.id, user.id);
                  });
                  renderMessages(false);
                }
              }, [
                h('div', { class: 'group-msg-poll-opt-bar', style: 'width:' + pct + '%;' }),
                h('div', { class: 'group-msg-poll-opt-content' }, [
                  h('span', { class: 'group-msg-poll-opt-text' }, opt.text),
                  h('span', { class: 'group-msg-poll-opt-stats' }, voteCount + ' vote' + (voteCount === 1 ? '' : 's') + (voterNames ? ' · ' + voterNames : ''))
                ]),
                h('button', { type: 'button', class: 'btn small ' + (hasVoted ? 'primary' : 'outline') }, hasVoted ? [OC.icon('check'), 'Voted'] : 'Vote')
              ]);
            });

            pollNode = h('div', { class: 'group-msg-poll' }, [
              h('div', { class: 'group-msg-poll-head' }, [
                h('span', { class: 'group-msg-poll-title' }, [OC.icon('poll'), h('span', {}, m.poll.question)]),
                h('span', { class: 'chip count' }, totalPollVotes + ' vote' + (totalPollVotes === 1 ? '' : 's'))
              ]),
              h('div', { class: 'group-msg-poll-options' }, optionNodes)
            ]);
          }

          // Render message item
          var replyQuoteNode = null;
          if (m.reply_to) {
            var repAuthor = m.reply_to.author_name || (OC.store.user(m.reply_to.author_id) ? OC.store.user(m.reply_to.author_id).name : (m.reply_to.author || 'Someone'));
            var repSnippet = m.reply_to.text || m.reply_to.snippet || m.reply_to.body || 'Original message';
            replyQuoteNode = h('div', {
              class: 'msg-reply-quote group-msg-reply-quote',
              title: 'Replying to ' + repAuthor + ' (Click to view message)',
              onClick: function (e) {
                e.preventDefault();
                var targetEl = document.getElementById('gmsg-' + m.reply_to.id);
                if (targetEl) {
                  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  targetEl.classList.add('highlight-target-msg');
                  setTimeout(function () { targetEl.classList.remove('highlight-target-msg'); }, 1800);
                }
              }
            }, [
              h('div', { class: 'msg-reply-quote-author' }, [
                h('span', {}, '↩️ Replying to '),
                h('strong', {}, repAuthor)
              ]),
              h('div', { class: 'msg-reply-quote-snippet' }, '"' + repSnippet + '"')
            ]);
          }

          var msgItem = h('div', { class: 'group-msg-item', id: 'gmsg-' + m.id }, [
            h('div', { class: 'group-msg-head' }, [
              OC.ui.person(m.author, 'strong'),
              h('span', {}, OC.ui.fmtWhen(m.created_at)),
              h('div', { class: 'comment-tools push' }, [
                h('button', { class: 'btn-inline', type: 'button', onClick: function () { setReplyContext(msgAuthorUser || { id: m.author, name: m.author }, m); } }, [OC.icon('chat'), 'Reply']),
                canEdit ? h('button', {
                  class: 'btn-inline', type: 'button', onClick: function () {
                    var editInput = h('textarea', {}, m.text);
                    OC.ui.modal({
                      title: 'Edit message',
                      content: OC.ui.field('Message', editInput, { required: true }),
                      actions: [
                        { label: 'Cancel', onClick: function (close) { close(); } },
                        {
                          label: 'Save', primary: true, onClick: function (close) {
                            var val = editInput.value.trim();
                            if (!val) return;
                            OC.store.mutate({
                              actor: user.id, action: 'group.message.edit', target: currentGroup.name, detail: val.slice(0, 35)
                            }, function () {
                              OC.store.editGroupMessage(currentGroup.id, m.id, val);
                            });
                            OC.ui.toast('Message updated.');
                            renderMessages(false);
                            close();
                          }
                        }
                      ]
                    });
                  }
                }, [OC.icon('edit'), 'Edit']) : null,
                canDel ? h('button', {
                  class: 'btn-inline danger', type: 'button', onClick: function () {
                    OC.ui.confirm('Delete this message?', function () {
                      OC.store.mutate({
                        actor: user.id, action: 'group.message.delete', target: currentGroup.name, detail: 'Deleted message'
                      }, function () {
                        OC.store.deleteGroupMessage(currentGroup.id, m.id);
                      });
                      OC.ui.toast('Message deleted.');
                      renderMessages(false);
                    });
                  }
                }, [OC.icon('trash'), 'Delete']) : null
              ].filter(Boolean))
            ]),
            replyQuoteNode,
            h('div', { class: 'group-msg-text' }, OC.ui.formatMentions ? OC.ui.formatMentions(m.text) : m.text),
            mediaNode,
            pollNode,
            msgReactionsWrap
          ]);

          msgsList.appendChild(msgItem);
        });
      }

      /* Deterministic scroll positioning with zero bounce:
         Instant positioning without conflicting smooth scroll loops or multiple frame overrides. */
      function applyScroll(target) {
        if (!msgsList) return;
        var el = msgsList;
        lastAutoScrollAt = Date.now();
        if (target === 'bottom') {
          chatPinnedToBottom = true;
          el.scrollTop = el.scrollHeight;
        } else if (typeof target === 'number') {
          chatPinnedToBottom = false;
          el.scrollTop = target;
        }
      }

      function submitGroupMessage() {
        if (!OC.can.canPostGroupMessage(user, currentGroup)) return;
        var val = msgInput.value.trim();
        if (!val && !currentMediaAttachment) return;
        
        var messageText = val || (currentMediaAttachment.type === 'image' ? '🖼️ Photo attached' : '🎬 Video attached');
        var extra = {};
        if (currentMediaAttachment) extra.media = currentMediaAttachment;
        if (activeReplyTarget) extra.reply_to = activeReplyTarget;

        var preservedScroll = msgsList ? msgsList.scrollTop : chatScrollTop;

        OC.store.mutate({
          actor: user.id, action: 'group.message', target: currentGroup.name, detail: messageText.slice(0, 35)
        }, function () {
          OC.store.addGroupMessage(currentGroup.id, messageText, user.id, extra);
        });

        // Targeted notifications for Direct Messages (SMS) & Group Channels
        var isDirectConvo = OC.can.isDirect(currentGroup);
        var previewSnippet = messageText.length > 50 ? (messageText.slice(0, 47) + '…') : messageText;

        if (isDirectConvo) {
          // Direct Message (1-on-1 SMS/Chat): Notify the recipient
          var dmRecipients = (currentGroup.members || []).filter(function (mid) { return mid !== user.id; });
          if (dmRecipients.length) {
            OC.store.notify(
              dmRecipients,
              '💬 ' + user.name + ': "' + previewSnippet + '"',
              currentGroup.id
            );
          }
        } else {
          // Group Channel Message
          var groupRecipients = [];
          if (messageText.toLowerCase().indexOf('@everyone') > -1) {
            (currentGroup.members || []).forEach(function (mid) {
              if (mid !== user.id && groupRecipients.indexOf(mid) === -1) groupRecipients.push(mid);
            });
          } else {
            var mentioned = (OC.ui && OC.ui.extractMentionedUserIds) ? OC.ui.extractMentionedUserIds(messageText) : [];
            mentioned.forEach(function (mid) {
              if (mid !== user.id && groupRecipients.indexOf(mid) === -1) groupRecipients.push(mid);
            });
            if (activeReplyTarget && activeReplyTarget.author && activeReplyTarget.author !== user.id) {
              if (groupRecipients.indexOf(activeReplyTarget.author) === -1) groupRecipients.push(activeReplyTarget.author);
            }
            (currentGroup.members || []).forEach(function (mid) {
              if (mid !== user.id && groupRecipients.indexOf(mid) === -1) groupRecipients.push(mid);
            });
          }

          if (groupRecipients.length) {
            var prefix = messageText.toLowerCase().indexOf('@everyone') > -1 ? '📢 ' : '💬 ';
            OC.store.notify(
              groupRecipients,
              prefix + user.name + ' in #' + currentGroup.name + ': "' + previewSnippet + '"',
              currentGroup.id
            );
          }
        }

        msgInput.value = '';
        setReplyContext(null, null);
        setMediaAttachment(null);
        /* User requirement: When sending a message, stay right where you are.
           The new message sits below in chronological history, user scrolls down
           naturally to view it, and absolutely NO bounce or sudden jump occurs. */
        if (msgsList && typeof preservedScroll === 'number') {
          msgsList.scrollTop = preservedScroll;
        }
      }

      msgInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitGroupMessage();
        }
      });

      var form = h('div', { class: 'comment-form full-page-chat-input-bar' }, [
        replyingBadgeWrap,
        mediaPreviewWrap,
        mediaFileInput,
        h('div', { class: 'comment-form-row' }, [
          msgInput,
          h('button', { class: 'mention-btn-trigger', type: 'button', title: 'Attach Photo/Video', onClick: function () { mediaFileInput.click(); } }, OC.icon('image')),
          h('button', { class: 'mention-btn-trigger', type: 'button', title: 'Create Poll', onClick: openCreatePollModal }, OC.icon('poll')),
          h('button', { class: 'btn small primary', type: 'button', onClick: submitGroupMessage }, [OC.icon('send'), 'Send'])
        ])
      ]);

      chatContainer.appendChild(headerBox);
      chatContainer.appendChild(msgsList);
      chatContainer.appendChild(form);

      if (msgsList) {
        msgsList.addEventListener('scroll', function () {
          if (!msgsList) return;
          if (Date.now() - lastAutoScrollAt < 100) return;  /* our own write */
          chatPinnedToBottom = (msgsList.scrollHeight - msgsList.scrollTop - msgsList.clientHeight) < 60;
          chatScrollTop = msgsList.scrollTop;
        });
      }

      if (isInitialGroupLoad || forceScrollBottom) {
        applyScroll('bottom');
      } else {
        /* Reading or typing: stay exactly where you were without any jumping or bouncing */
        applyScroll(prevScrollTop);
      }
      isInitialGroupLoad = false;
    }

    OC.ui.clear(host);
    host.appendChild(chatContainer);
    /* Built after the container is in the document, so the scroll it applies
       actually lands. Nothing is forced here: opening the channel is handled by
       isInitialGroupLoad, and every other render is a rebuild underneath
       somebody who may be part way up the history. */
    renderMessages(false);
  }

  function getChannelLastRead(userId, groupId) {
    if (!userId || !groupId) return 0;
    if (typeof localStorage === 'undefined') return 0;
    try {
      var v = localStorage.getItem('oc_group_read_' + userId + '_' + groupId);
      return v !== null ? (parseInt(v, 10) || 0) : null;
    } catch (e) {
      return null;
    }
  }

  function setChannelLastRead(userId, groupId, count) {
    if (!userId || !groupId) return;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('oc_group_read_' + userId + '_' + groupId, String(count || 0));
    } catch (e) {}
  }

  /* ---- render (Discord Two-Column Layout) -------------------------------- */
  function render(host, rerender, hideHead) {
    var h = OC.ui.h;
    var user = me();

    var canCreate = OC.can.createGroup(user);
    var everything = (OC.store.state.groups || []).filter(function (g) {
      return OC.can.seeGroup(user, g);
    });
    /* channels and direct messages live in the same records but are listed
       separately: the counts and filters above are about channels only */
    var allGroups = everything.filter(function (g) { return !OC.can.isDirect(g); });
    var myDirects = everything.filter(function (g) { return OC.can.isDirect(g); });

    function otherPersonIn(convo) {
      var otherId = (convo.members || []).filter(function (m) { return m !== user.id; })[0];
      return OC.store.user(otherId) || null;
    }

    function openDirectWith(target) {
      var convo = OC.store.openDirect(user.id, target.id);
      if (!convo) return;
      activeChatGroupId = convo.id;
      render(host, rerender, hideHead);
    }

    // Filter groups
    /* Online presence — who is connected right now */
    var onlineIds = (OC.store.onlineUserIds ? OC.store.onlineUserIds() : []);
    if (user && user.id && onlineIds.indexOf(user.id) === -1) {
      onlineIds = [user.id].concat(onlineIds);
    }
    var onlineUsers = onlineIds.map(function (uid) { return OC.store.user(uid); }).filter(Boolean);

    var visible = allGroups.filter(function (g) {
      if (filterStatus === 'active') {
        if (onlineUsers.length > 0) {
          var hasOnlineMember = (g.members || []).some(function (mid) {
            return onlineIds.indexOf(mid) > -1;
          });
          if (!hasOnlineMember && g.status !== 'active') return false;
        } else if (g.status !== 'active') {
          return false;
        }
      }
      if (filterStatus === 'archived' && g.status !== 'archived') return false;
      if (filterStatus === 'mine' && (g.members || []).indexOf(user.id) === -1) return false;
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        var matchName = (g.name || '').toLowerCase().indexOf(q) > -1;
        var matchPurpose = (g.purpose || '').toLowerCase().indexOf(q) > -1;
        var matchMember = (g.members || []).some(function (mid) {
          var u = OC.store.user(mid);
          return u && u.name.toLowerCase().indexOf(q) > -1;
        });
        if (!matchName && !matchPurpose && !matchMember) return false;
      }
      return true;
    });

    var isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    if (!isMobile) {
      if (!activeChatGroupId || !OC.store.group(activeChatGroupId)) {
        activeChatGroupId = (visible.length ? visible[0].id : (allGroups.length ? allGroups[0].id : null));
      }
    } else {
      if (activeChatGroupId && !OC.store.group(activeChatGroupId)) {
        activeChatGroupId = null;
      }
    }

    var activeGroup = activeChatGroupId ? OC.store.group(activeChatGroupId) : null;
    if (activeGroup) {
      setChannelLastRead(user.id, activeGroup.id, (activeGroup.messages || []).length);
    }

    var activeCount = allGroups.filter(function (g) { return g.status === 'active'; }).length;

    /* "Mine" is the people tab: it lists who you can write to, not channels */
    var dmPeople = (OC.can.directMessageable ? OC.can.directMessageable(user) : [])
      .slice()
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    var myCount = dmPeople.length;
    var showingPeople = (filterStatus === 'mine');

    if (filterStatus !== 'all' && filterStatus !== 'mine') {
      filterStatus = 'all';
    }

    /* ---- 1. Discord Channels Left Sidebar ---- */
    var sidebar = h('div', { class: 'discord-channels-sidebar' }, [
      h('div', { class: 'discord-sidebar-top' }, [
        h('div', { class: 'discord-sidebar-title-row' }, [
          h('span', { class: 'discord-sidebar-title' }, [OC.icon('chat'), 'CHANNELS (' + allGroups.length + ')']),
          canCreate
            ? h('button', {
                class: 'discord-sidebar-new-btn',
                type: 'button',
                id: 'discord-sidebar-new-channel-btn',
                title: 'Create new channel / group (System Admin only)',
                onClick: function () {
                  newGroup(function () { render(host, rerender, hideHead); });
                }
              }, [OC.icon('plus'), 'New'])
            : null
        ]),
        h('input', {
          class: 'discord-sidebar-search',
          type: 'search',
          placeholder: showingPeople ? 'Filter people...' : 'Filter #channels...',
          value: searchQuery,
          onInput: OC.ui.debounce(function (e) {
            searchQuery = e.target.value;
            render(host, rerender, hideHead);
          }, 100)
        }),
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Filter groups', style: 'width:100%;gap:4px;' }, [
          ['all', 'Group (' + allGroups.length + ')'],
          ['mine', 'Mine (' + myCount + ')']
        ].map(function (opt) {
          return h('button', {
            type: 'button',
            style: 'padding:4px 8px;font-size:11.5px;flex:1;text-align:center;',
            title: opt[1],
            'aria-pressed': String(filterStatus === opt[0]),
            onClick: function () {
              filterStatus = opt[0];
              render(host, rerender, hideHead);
            }
          }, opt[1]);
        }))
      ]),

      /* Channel Items List — hidden while the people tab is showing */
      showingPeople ? null : h('div', { class: 'discord-channels-list' }, visible.length ? visible.map(function (g) {
        var isSelected = (activeChatGroupId === g.id);
        var totalMsgs = (g.messages || []).length;
        if (isSelected) {
          setChannelLastRead(user.id, g.id, totalMsgs);
        }
        var lastRead = getChannelLastRead(user.id, g.id);
        var unreadCount = 0;
        if (!isSelected && totalMsgs > 0 && lastRead !== null) {
          unreadCount = Math.max(0, totalMsgs - lastRead);
        }
        var canEdit = OC.can.canEditGroup(user, g);
        var canDel = OC.can.canDeleteGroup(user, g);

        return h('div', {
          class: 'discord-channel-pill' + (isSelected ? ' active' : ''),
          onClick: function () {
            activeChatGroupId = g.id;
            setChannelLastRead(user.id, g.id, (g.messages || []).length);
            render(host, rerender, hideHead);
          }
        }, [
          h('div', { class: 'discord-channel-left' }, [
            h('span', { class: 'discord-channel-hash' }, '#'),
            h('span', { class: 'discord-channel-name' }, g.name),
            g.status === 'active' ? h('span', { class: 'dot', style: 'color:var(--success);' }) : null
          ]),
          h('div', { class: 'row', style: 'align-items:center;gap:6px;' }, [
            unreadCount > 0 ? h('span', { class: 'discord-channel-badge' }, String(unreadCount)) : null,
            h('div', { class: 'discord-channel-actions', onClick: function (e) { e.stopPropagation(); } }, [
              canEdit ? h('button', {
                class: 'discord-channel-tool-btn',
                title: 'Edit channel',
                onClick: function () { editGroup(g, function () { render(host, rerender, hideHead); }); }
              }, OC.icon('edit')) : null,
              canDel ? h('button', {
                class: 'discord-channel-tool-btn',
                title: 'Delete channel',
                onClick: function () { deleteGroupDirect(g, function () { render(host, rerender, hideHead); }); }
              }, OC.icon('trash')) : null
            ].filter(Boolean))
          ])
        ]);
      }) : [
        h('div', { style: 'padding:24px 12px;text-align:center;color:var(--text-secondary);font-size:13px;' }, 'No channels found.')
      ]),

      /* Direct messages: everyone with an account, one click to a private
         conversation with them. A conversation is created the first time it is
         opened, so the list is people rather than a list of threads. */
      !showingPeople ? null : (function () {
        var people = dmPeople;
        var q = searchQuery.toLowerCase();
        var shown = q
          ? people.filter(function (u) {
              return (u.name || '').toLowerCase().indexOf(q) > -1
                || (u.email || '').toLowerCase().indexOf(q) > -1;
            })
          : people;

        return h('div', { class: 'discord-dm-section' }, [
          h('div', { class: 'discord-sidebar-title-row' }, [
            h('span', { class: 'discord-sidebar-title' },
              [OC.icon('users'), 'DIRECT MESSAGES (' + people.length + ')'])
          ]),
          h('div', { class: 'discord-dm-list' }, shown.length ? shown.map(function (person) {
            var convo = OC.store.findDirect(user.id, person.id);
            var isSelected = !!(convo && activeChatGroupId === convo.id);
            var total = convo ? (convo.messages || []).length : 0;
            var lastRead = convo ? getChannelLastRead(user.id, convo.id) : null;
            var unread = (!isSelected && convo && total > 0 && lastRead !== null)
              ? Math.max(0, total - lastRead) : 0;
            var isOnline = (onlineIds.indexOf(person.id) > -1);

            return h('button', {
              class: 'discord-dm-pill' + (isSelected ? ' active' : '') + (isOnline ? ' is-online' : ''),
              type: 'button',
              title: (isOnline ? '🟢 Online · ' : '') + 'Message ' + person.name + ' privately',
              onClick: function () { openDirectWith(person); }
            }, [
              h('div', { style: 'position:relative;display:inline-flex;align-items:center;flex-shrink:0;' }, [
                OC.ui.mark(person.id),
                isOnline ? h('span', {
                  class: 'discord-avatar-online-dot',
                  style: 'position:absolute;bottom:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:#22c55e;border:1.5px solid var(--discord-bg, #0e1217);box-shadow:0 0 5px rgba(34,197,94,0.8);'
                }) : null
              ]),
              h('span', { class: 'discord-dm-name' }, person.name),
              isOnline ? h('span', { class: 'dot', style: 'color:#22c55e;font-size:15px;line-height:1;margin-left:4px;', title: 'Online now' }, '•') : null,
              unread > 0 ? h('span', { class: 'discord-channel-badge' }, String(unread)) : null
            ]);
          }) : [
            h('div', { style: 'padding:14px 12px;color:var(--text-secondary);font-size:12.5px;' },
              q ? 'Nobody matches "' + searchQuery + '".' : 'No one else has an account yet.')
          ])
        ]);
      })(),

      /* Bottom User Bar */
      h('div', { class: 'discord-sidebar-user-bar' }, [
        h('div', { class: 'row', style: 'align-items:center;gap:8px;' }, [
          h('div', { style: 'position:relative;display:inline-flex;align-items:center;flex-shrink:0;' }, [
            OC.ui.mark(user.id),
            h('span', {
              class: 'discord-avatar-online-dot',
              style: 'position:absolute;bottom:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:#22c55e;border:1.5px solid var(--discord-bg, #0e1217);box-shadow:0 0 5px rgba(34,197,94,0.8);'
            })
          ]),
          h('div', { style: 'display:flex;flex-direction:column;' }, [
            h('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
              h('span', { style: 'color:var(--ink);font-size:13px;font-weight:700;' }, user.name),
              h('span', { class: 'dot', style: 'color:#22c55e;font-size:12px;', title: 'Online' }, '•')
            ]),
            h('span', { style: 'color:var(--text-secondary);font-size:10.5px;font-family:var(--font-mono);' }, OC.can.roleLabel(user))
          ])
        ])
      ])
    ]);

    /* ---- 2. Right Chat Main Pane ---- */
    var chatMainHost = h('div', { class: 'discord-chat-main' });
    if (activeGroup && OC.can.seeGroup(user, activeGroup)) {
      renderGroupChatPage(chatMainHost, activeGroup, function () {
        activeChatGroupId = null;
        render(host, rerender, hideHead);
      });
    } else {
      chatMainHost.appendChild(h('div', { class: 'empty', style: 'padding:80px 24px;text-align:center;color:var(--text-secondary);' }, [
        OC.icon('board'),
        h('h3', { style: 'color:var(--ink);margin-top:14px;' }, 'Welcome to Groups & Discussions'),
        h('p', { style: 'font-size:13.5px;margin-top:6px;' }, 'Select a channel from the left sidebar or create a new channel to begin chatting.'),
        canCreate ? h('button', {
          class: 'btn primary',
          type: 'button',
          style: 'margin-top:16px;',
          onClick: function () { newGroup(function () { render(host, rerender, hideHead); }); }
        }, [OC.icon('plus'), 'Create Channel']) : null
      ]));
    }

    var discordHub = h('div', {
      class: 'discord-hub-container' + (activeGroup ? ' has-active-chat' : ' no-active-chat')
    }, [
      sidebar,
      chatMainHost
    ]);

    OC.ui.clear(host);
    OC.ui.append(host, [discordHub]);
  }

  function openGroupChat(group, onDone) {
    activeChatGroupId = group ? group.id : null;
    var host = document.getElementById('page') || document.querySelector('.groups-sub-host');
    if (host) render(host, onDone, true);
  }

  return {
    render: render,
    newGroup: newGroup,
    editGroup: editGroup,
    openGroupChat: openGroupChat
  };
})();
