/* Leanward — reminders (ACC-5, PRD v1.26). The settings, the fixed words (shared with sw.js, which
 * shows them), and this phone's Web Push subscription. The server decides when to send
 * (supabase/schema.sql, lw_reminders_due) and sends (supabase/functions/lw-reminders).
 * The pure part runs in Node for tests; the push part only runs in the browser, when called.
 */
(function (root) {
  'use strict';

  var KINDS = ['log', 'weigh', 'checkin'];
  var DEFAULT_TIME = { log: '20:00', weigh: '07:30' };
  var CHECKIN_TIME = '09:00';
  // Exactly what the lock screen shows (ACC-5): no numbers, food or weight; never shame or streaks.
  var TEXT = {
    log: { title: 'Leanward', body: 'Time to log today\'s meals?' },
    weigh: { title: 'Leanward', body: 'Morning weigh-in? Before breakfast is best.' },
    checkin: { title: 'Leanward', body: 'Your weekly check-in is ready.' }
  };
  var TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

  /** The saved settings with defaults filled in: { log: {on, time}, weigh: {on, time, days|null}, checkin: {on} }. */
  function normalize(r) {
    r = r && typeof r === 'object' ? r : {};
    var time = function (k) { var t = r[k] && r[k].time; return TIME_RE.test(t || '') ? t : DEFAULT_TIME[k]; };
    var days = r.weigh && Array.isArray(r.weigh.days) ? r.weigh.days.filter(function (d) { return d >= 0 && d <= 6 && d === Math.floor(d); }) : null;
    return {
      log: { on: !!(r.log && r.log.on === true), time: time('log') },
      weigh: { on: !!(r.weigh && r.weigh.on === true), time: time('weigh'), days: days && days.length < 7 ? days.slice().sort() : null },
      checkin: { on: !!(r.checkin && r.checkin.on === true) }
    };
  }
  function anyOn(r) { var n = normalize(r); return KINDS.some(function (k) { return n[k].on; }); }

  /** Times in 15-minute steps, as the server checks every 15 minutes: ['00:00', '00:15', …]. */
  function times() {
    var out = [];
    for (var m = 0; m < 24 * 60; m += 15) out.push(('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2));
    return out;
  }
  /** '20:00' → '8:00 pm'. */
  function niceTime(t) {
    var h = Number(t.slice(0, 2)), m = t.slice(3);
    return (h % 12 || 12) + ':' + m + (h < 12 ? ' am' : ' pm');
  }
  /** The Settings row's line: "Off", or what's on. */
  function summary(r) {
    var n = normalize(r), on = [];
    if (n.log.on) on.push('Log ' + niceTime(n.log.time));
    if (n.weigh.on) on.push('Weigh-in ' + niceTime(n.weigh.time));
    if (n.checkin.on) on.push('Check-in day');
    return on.length ? on.join(' · ') : 'Off';
  }

  /**
   * What the phone allows, as one word for the settings sheet:
   * 'unconfigured' (no server key yet), 'unsupported', 'install' (Safari tab, not the home-screen app),
   * 'denied' (turned off in iOS Settings) or 'ready'.
   * env: { key, push (PushManager and Notification exist), standalone, permission }
   */
  function status(env) {
    if (!env.key) return 'unconfigured';
    if (!env.push) return env.standalone || !env.ios ? 'unsupported' : 'install';
    if (env.permission === 'denied') return 'denied';
    return 'ready';
  }

  /** The screen a tapped reminder opens (the service worker adds ?open=<kind> to the address). */
  function openFrom(search) {
    var m = /[?&]open=(log|weigh|checkin)(&|$)/.exec(search || '');
    return m ? m[1] : null;
  }

  /* ---------- this phone's subscription (browser only) ---------- */
  function b64uToBytes(s) {
    var b = root.atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  function env() {
    var nav = root.navigator || {};
    return {
      key: root.LW.config.VAPID_PUBLIC_KEY,
      push: 'serviceWorker' in nav && 'PushManager' in root && 'Notification' in root,
      standalone: nav.standalone === true || !!(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches),
      ios: /iPhone|iPad|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1),
      permission: 'Notification' in root ? root.Notification.permission : 'default'
    };
  }
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } }
  function rpc(name, args) {
    var c = root.LW.cloud.client();
    if (!c) return Promise.reject(new Error('Leanward can\'t reach the server. Check your connection.'));
    return c.rpc(name, args).then(function (res) {
      if (res.error) {
        var missing = res.error.code === 'PGRST202' || /could not find the function/i.test(res.error.message || '');
        throw new Error(missing ? 'Reminders aren\'t switched on in the database yet.' : res.error.message || 'The request failed.');
      }
      return res.data;
    });
  }
  function registration() {
    var sw = root.navigator.serviceWorker;
    return sw.getRegistration().then(function (r) { return r || Promise.reject(new Error('The offline helper isn\'t running. Reload Leanward and try again.')); });
  }
  function current() {
    if (!env().push) return Promise.resolve(null);
    return root.navigator.serviceWorker.getRegistration().then(function (r) { return r ? r.pushManager.getSubscription() : null; });
  }
  function keysOf(sub) { var j = sub.toJSON(); return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }; }

  var push = {
    env: env,
    current: current,
    /**
     * Asks iOS for permission (call straight from a tap), subscribes this phone and saves it on the
     * server. Resolves 'on', or 'denied' if the person said no.
     */
    enable: function () {
      var e = env();
      if (status(e) === 'unconfigured' || status(e) === 'unsupported' || status(e) === 'install') return Promise.reject(new Error('Reminders can\'t be turned on here.'));
      var ask = e.permission === 'granted' ? Promise.resolve('granted') : root.Notification.requestPermission();
      return ask.then(function (p) {
        if (p !== 'granted') return 'denied';
        return registration().then(function (reg) {
          return reg.pushManager.getSubscription().then(function (s) {
            return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(e.key) });
          });
        }).then(function (sub) {
          var k = keysOf(sub);
          return rpc('lw_push_save', { p_endpoint: k.endpoint, p_p256dh: k.p256dh, p_auth: k.auth, p_tz: tz() });
        }).then(function () { return 'on'; });
      });
    },
    /** Every reminder off: forget this phone on the server and here. */
    disable: function () {
      return current().then(function (sub) {
        if (!sub) return null;
        return rpc('lw_push_remove', { p_endpoint: sub.endpoint }).then(function () { return sub.unsubscribe(); }, function () { return sub.unsubscribe(); });
      });
    },
    /** On each open: 'ok', 'paused', 'missing' (this phone isn't saved) or 'none' (no subscription here). */
    touch: function () {
      return current().then(function (sub) { return sub ? rpc('lw_push_touch', { p_endpoint: sub.endpoint, p_tz: tz() }) : 'none'; });
    },
    resume: function () { return rpc('lw_push_resume', {}); }
  };

  var api = { KINDS: KINDS, TEXT: TEXT, DEFAULT_TIME: DEFAULT_TIME, CHECKIN_TIME: CHECKIN_TIME, normalize: normalize, anyOn: anyOn, times: times, niceTime: niceTime, summary: summary, status: status, openFrom: openFrom, push: push };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LW = root.LW || {}; root.LW.reminders = api; }
})(this);
