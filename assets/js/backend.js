/* =========================================================================
   backend.js — Backend connection state and server descriptor
   Originate Command · OM SRS 001
   ========================================================================= */

window.OC = window.OC || {};

OC.backend = (function () {
  'use strict';

  var serverOnline = false;

  function setServerStatus(online) {
    serverOnline = !!online;
    updateFooter();
  }

  function describe() {
    if (typeof window !== 'undefined' && window.location && window.location.protocol.indexOf('http') === 0) {
      var portStr = window.location.port ? ' (Port ' + window.location.port + ')' : '';
      var hostname = window.location.hostname;
      var isTunnel = hostname.indexOf('trycloudflare.com') > -1 || hostname.indexOf('loca.lt') > -1;

      var cfg = window.OC_CONFIG || window.LGS_CONFIG;
      var tunnelUrl = (cfg && cfg.API_URL) ? cfg.API_URL : '';

      if (hostname.indexOf('originateteam.com') > -1) {
        return {
          kind: 'server',
          label: 'connected to Originate Command Production Server · Live DB Sync',
          detail: 'Connected directly to Originate Command Production Server at originateteam.com with real-time SSE sync.'
        };
      }

      if (isTunnel) {
        return {
          kind: 'tunnel',
          label: 'connected to Cloudflare / Public Gateway · Live Sync',
          detail: 'Connected via secure public tunnel to Originate Command Operations Server with real-time SSE sync.'
        };
      }

      if (tunnelUrl && (hostname.indexOf('github.io') > -1 || (hostname !== 'localhost' && hostname !== '127.0.0.1' && !portStr))) {
        var cleanUrl = tunnelUrl.replace(/^https?:\/\//, '');
        return {
          kind: 'tunnel',
          label: 'connected to Tunnel Gateway (' + cleanUrl + ') · Live Sync',
          detail: 'Connected to local server via live tunnel ' + tunnelUrl + ' with real-time SSE sync.'
        };
      }

      return {
        kind: 'server',
        label: 'connected to Originate Command Server' + portStr + ' · Live DB Sync',
        detail: 'Running on manual API server (dev3) with persistent JSON database and real-time live synchronization.'
      };
    }

    var cfgLocal = window.OC_CONFIG || window.LGS_CONFIG;
    if (cfgLocal && cfgLocal.API_URL) {
      return {
        kind: 'tunnel',
        label: 'connected to Tunnel Gateway (' + cfgLocal.API_URL.replace(/^https?:\/\//, '') + ')',
        detail: 'Configured tunnel gateway: ' + cfgLocal.API_URL
      };
    }

    return {
      kind: 'local',
      label: 'demonstration data held in this browser (offline mode)',
      detail: 'Loaded from local storage. Launch dev3 server or start-servers.bat to enable full multi-client persistence.'
    };
  }

  function updateFooter() {
    var label = document.getElementById('backendLabel');
    if (label) {
      var info = describe();
      label.textContent = info.label;
      label.title = info.detail;
    }
  }

  return {
    describe: describe,
    updateFooter: updateFooter,
    setServerStatus: setServerStatus,
    get isOnline() { return serverOnline; }
  };
})();
