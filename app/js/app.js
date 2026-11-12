/* Leanward — app shell. Google sign-in first (required, ONB-1), then onboarding until a phase and
 * targets exist (M3, js/screens.js), then five tabs and the global + button. Home shows today's
 * targets, Phase the current phase, Profile your details, the account and "About this build".
 * Other screens arrive milestone by milestone (docs/development-plan.md).
 */
(function (root) {
  'use strict';

  var C = root.LW.config, E = root.LW.errors, cloud = root.LW.cloud;
  var doc = root.document;

  /* ---------- storage (every key namespaced with STORAGE_PREFIX) ---------- */
  var store = {
    get: function (k, fallback) { try { var v = root.localStorage.getItem(C.STORAGE_PREFIX + k); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set: function (k, v) { try { root.localStorage.setItem(C.STORAGE_PREFIX + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };

  /* ---------- error reporting ---------- */
  var reporter = E.Reporter({
    send: cloud.sendError,
    storage: { get: function () { return store.get('error-queue', []); }, set: function (v) { store.set('error-queue', v); } },
    env: { version: C.VERSION, userAgent: root.navigator && root.navigator.userAgent }
  });
  E.install(root, reporter);

  /* ---------- state ---------- */
  var TABS = [
    ['home', 'Home', 'M7', 'Your phase card and one tip.'],
    ['diary', 'Diary', 'M5', 'Your day by meal.'],
    ['progress', 'Progress', 'M6', 'Weight trend, waist, key lifts from PR Forge and the charts.'],
    ['phase', 'Phase', 'M3, M6', 'Your current phase, targets with the working, and whether it is working.'],
    ['profile', 'Profile', 'M7', 'Settings, appearance, export and account.']
  ];
  // account: who signed in on this phone, kept locally so the app still opens offline.
  var state = { tab: store.get('tab', 'home'), sheet: false, ping: { ok: null, reason: 'Checking…' }, sw: 'Checking…',
    account: store.get('account', null), signingIn: false, sync: { state: 'idle', pending: 0 },
    // rows: the signed-in person's saved data, read from the phone's database (M3).
    rows: emptyRows(), loaded: false, everSynced: false, ob: null };
  var data = null, syncer = null;   // the signed-in person's phone copy (js/db.js) and its sync
  function emptyRows() { return { profile: null, goals: [], phases: [], sets: [], weights: [], waist: [], measures: [], diary: [], customs: [], meals: [] }; }

  /** Today as the user's local calendar day. */
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  var ICONS = {
    home: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" stroke-linejoin="round"/>',
    diary: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h3" stroke-linecap="round"/>',
    progress: '<path d="M4 18l5-6 4 3 7-9" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 21h16" stroke-linecap="round"/>',
    phase: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" opacity=".6"/>',
    profile: '<circle cx="12" cy="9" r="3.5"/><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" stroke-linecap="round"/>'
  };

  // Google's "G" logo, as Google's sign-in branding guidelines ask for on the button.
  var GOOGLE = '<svg class="g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- views ---------- */
  function statusRow(label, ok, text) {
    var cls = ok === true ? 'ok' : ok === false ? 'bad' : 'wait';
    return '<div class="status"><span>' + label + '</span><span class="pill ' + cls + '">' + esc(text) + '</span></div>';
  }

  function signInView() {
    var err = cloud.auth.error();
    var busy = (cloud.auth.returning() && !err) || state.signingIn;
    var online = root.navigator.onLine !== false;
    return '<main class="view signin">' +
      '<div class="brand"><picture><source srcset="icons/mark-light.svg" media="(prefers-color-scheme: light)"><img src="icons/mark.svg" alt="" width="84" height="87"></picture><h1>Leanward</h1>' +
      '<p class="muted">Calories and macros, guided by the phase you\'re in.</p></div>' +
      '<section class="card">' +
        '<h2>' + (busy ? 'Signing you in…' : 'Sign in to get started') + '</h2>' +
        '<p class="small muted">Your account keeps your diary, phases and progress safe, and brings them back on a new phone. Only you can see your data.</p>' +
        (err ? '<p class="small warn">Sign-in didn\'t work: ' + esc(err) + '. Try again.</p>' : '') +
        (online ? '' : '<p class="small warn">You\'re offline. Signing in needs a connection the first time; after that the app opens without one.</p>') +
        '<button type="button" class="btn block google" data-a="signin"' + (busy ? ' disabled' : '') + '>' + GOOGLE + 'Continue with Google</button>' +
        '<p class="small muted center">For adults 18 and over.</p>' +
      '</section>' +
      '<p class="small center"><a class="link" href="privacy.html">Privacy</a></p>' + versionLine() +
    '</main>';
  }

  /** Small print on screens before the tabs, so the version can be checked without finishing setup. */
  function versionLine() { return '<p class="small muted center">Version ' + esc(C.VERSION) + '</p>'; }

  function accountCard() {
    var a = state.account;
    return '<section class="card" aria-labelledby="acct-h"><h2 id="acct-h">Account</h2>' +
      '<p class="small muted">Signed in with Google as <b>' + esc(a.email || a.name || 'your Google account') + '</b>.</p>' +
      '<div class="actions"><button type="button" class="btn ghost" data-a="signout">Sign out</button></div></section>';
  }

  function syncRow() {
    var s = state.sync, waiting = s.pending ? ' · ' + s.pending + ' waiting' : '';
    var map = { idle: [null, 'Starting…'], syncing: [null, 'Syncing…'], synced: [true, 'Up to date' + waiting], offline: [null, 'Offline' + waiting], signin: [false, 'Sign in again'], error: [false, 'Problem' + waiting] };
    var m = map[s.state] || map.idle;
    return statusRow('Backup', m[0], m[1]) + (s.message && (s.state === 'error' || s.state === 'signin') ? '<p class="small muted">' + esc(s.message) + '</p>' : '');
  }

  function aboutCard() {
    var online = root.navigator.onLine !== false;
    return '<section class="card" aria-labelledby="about-h">' +
      '<h2 id="about-h">About this build</h2>' +
      statusRow('Version', true, C.VERSION) +
      statusRow('Network', online, online ? 'Online' : 'Offline') +
      statusRow('Database', state.ping.ok, state.ping.ok ? state.ping.message : state.ping.ok === false ? 'Not connected' : 'Checking…') +
      (state.ping.ok === false ? '<p class="small muted">' + esc(state.ping.reason) + '</p>' : '') +
      statusRow('Works offline', state.sw === 'Ready', state.sw) +
      syncRow() +
      '<div class="actions"><button type="button" class="btn ghost" data-a="recheck">Check again</button>' +
      '<button type="button" class="btn ghost" data-a="testerror">Send a test error</button></div>' +
      '<p class="small muted">The test error goes to Leanward\'s own error table. It holds only technical details, never food or body data.</p>' +
      '</section>';
  }

  function tabView(id) {
    var t = TABS.filter(function (x) { return x[0] === id; })[0];
    if (id === 'phase') return screens.phaseView();
    if (id === 'diary') return diaryui.view();
    if (id === 'progress') return progressui.view();
    var soon = '<section class="card"><span class="chip"><i></i>Coming in ' + esc(t[2]) + '</span><p>' + esc(t[3]) + '</p></section>';
    if (id === 'home') return '<header class="top"><h1>Today</h1></header>' + diaryui.homeCard() + progressui.homeCard() + soon;
    if (id === 'profile') return '<header class="top"><h1>Profile</h1></header>' + screens.profileCard() + accountCard() + aboutCard() + '<section class="card"><a class="link" href="privacy.html">Privacy</a></section>';
    return '<header class="top"><h1>' + esc(t[1]) + '</h1></header>' + soon;
  }

  /** While the account downloads on a new phone, or when there's no connection for the first setup. */
  function waitView() {
    var stuck = state.loaded && (state.sync.state === 'offline' || state.sync.state === 'error' || state.sync.state === 'signin');
    return '<main class="view signin"><div class="brand"><picture><source srcset="icons/mark-light.svg" media="(prefers-color-scheme: light)"><img src="icons/mark.svg" alt="" width="84" height="87"></picture><h1>Leanward</h1></div>' +
      '<section class="card"><h2>' + (stuck ? 'Connect to finish setting up' : 'Loading your account…') + '</h2>' +
      '<p class="small muted">' + (stuck ? 'Leanward needs the internet once, to check whether your account already has a phase and targets. ' + esc(state.sync.message || '') : 'Checking your account for saved data.') + '</p>' +
      (stuck ? (state.sync.state === 'signin' ? '<button type="button" class="btn block google" data-a="signin">' + GOOGLE + 'Sign in again</button>' : '<button type="button" class="btn block" data-a="retrysync">Try again</button>') : '') + '</section>' + versionLine() + '</main>';
  }

  function sheet() {
    if (!state.sheet) return '';
    return diaryui.sheetView() || progressui.sheetView() || foodui.sheetView() || screens.sheetView() || '';
  }

  /** Redraw for background events (sync, connection, offline cache). Skipped during setup and while a
   *  sheet is open (search, food, scanner), which show none of them: redrawing there closes the iPhone
   *  date picker or keyboard and would stop the camera. */
  function refresh() { if (!state.ob && !state.sheet) render(); }

  // A redraw can blur a focused field, which fires "change", which asks for another redraw. Run them one at a time.
  var drawing = false, again = false;
  function render() {
    if (drawing) { again = true; return; }
    drawing = true;
    try { draw(); } finally { drawing = false; }
    if (again) { again = false; render(); }
  }

  function draw() {
    var app = doc.getElementById('app');
    if (!state.account) { app.innerHTML = signInView(); return; }
    if (state.ob) { app.innerHTML = screens.onboardingView().replace(/<\/main>$/, versionLine() + '</main>'); return; }
    if (!state.loaded || !screens.hasSetup()) {
      // First setup only once the phone knows the account has nothing saved (so onboarding never runs twice).
      if (state.loaded && state.everSynced) { screens.startOnboarding(); app.innerHTML = screens.onboardingView(); return; }
      app.innerHTML = waitView(); return;
    }
    app.innerHTML = '<main class="view" id="view">' + tabView(state.tab) + '</main>' +
      '<button type="button" class="plus" data-a="add" aria-label="Add">+</button>' +
      '<nav class="tabs" aria-label="Main">' + TABS.map(function (t) {
        return '<button type="button" data-a="tab" data-v="' + t[0] + '"' + (state.tab === t[0] ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' + ICONS[t[0]] + '</svg>' + t[1] + '</button>';
      }).join('') + '</nav>' + sheet();
  }

  /* ---------- actions ---------- */
  var actions = {
    tab: function (v) { state.tab = v; store.set('tab', v); render(); },
    close: function () { foodui.stop(); state.sheet = false; render(); },
    signin: function () {
      state.signingIn = true; render();
      cloud.auth.signIn().catch(function (e) {
        state.signingIn = false; render();
        toast((e && e.message) || 'Sign-in didn\'t start. Try again.');
      });
    },
    signout: function () {
      var n = state.sync.pending;
      var msg = n ? n + ' change' + (n === 1 ? ' hasn\'t' : 's haven\'t') + ' reached your account yet and will be lost if you sign out now. Sign out anyway?'
        : 'Sign out of Leanward on this phone? Your data stays in your account.';
      if (!root.confirm(msg)) return;
      var id = state.account && state.account.id;
      stopData();
      cloud.auth.signOut().then(function () { return id ? root.LW.db.destroy(id) : null; }).then(function () { setAccount(null); state.tab = 'home'; store.set('tab', 'home'); render(); });
    },
    retrysync: function () { if (syncer) syncer.now(); },
    recheck: function () { state.ping = { ok: null, reason: 'Checking…' }; render(); checkConnection(); },
    testerror: function () {
      reporter.report({ message: 'Test error from About this build (' + new Date().toISOString() + ')', source: root.location.href, line: 1, col: 1 })
        .then(function (sent) { toast(sent ? 'Test error sent' : 'Saved to send when the database is reachable'); });
    }
  };
  doc.addEventListener('click', function (e) {
    var el = e.target.closest('[data-a]');
    if (!el) return;
    var fn = actions[el.dataset.a] || screens.actions[el.dataset.a] || foodui.actions[el.dataset.a] || diaryui.actions[el.dataset.a] || progressui.actions[el.dataset.a];
    if (fn) { e.preventDefault(); fn(el.dataset.v, el); }
  });
  // Typing updates the form without redrawing it; choices that change the screen redraw on change.
  doc.addEventListener('input', function (e) {
    if (/^(number|text|search)$/.test(e.target.type) && (progressui.onInput(e.target) || foodui.onInput(e.target) || diaryui.onInput(e.target))) return;
    if (/^(number|text)$/.test(e.target.type)) screens.onInput(e.target);
  });
  doc.addEventListener('change', function (e) {
    if (/^(select-one|date|time)$/.test(e.target.type) && (progressui.onInput(e.target) || foodui.onInput(e.target) || diaryui.onInput(e.target))) return;
    if (/^(checkbox|select-one|date)$/.test(e.target.type)) screens.onInput(e.target);
    // Fields that change the whole calculation (e.g. a known maintenance) redraw when you leave them.
    else if (e.target.dataset.redraw) render();
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.sheet) actions.close(); });

  function toast(msg) {
    var t = doc.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------- M3 screens ---------- */
  var screens = root.LW.screens.create({ state: state, render: function () { render(); }, toast: toast, esc: esc, save: save, today: today });
  var diaryui = root.LW.diaryui.create({ state: state, render: function () { render(); }, toast: toast, esc: esc, save: save, remove: remove, today: today });
  var progressui = root.LW.progressui.create({ state: state, render: function () { render(); }, toast: toast, esc: esc, save: save, remove: remove, today: today });
  var foodui = root.LW.foodui.create({ state: state, render: function () { render(); }, toast: toast, esc: esc, save: save, remove: remove, today: today, slotLabel: diaryui.slotLabel, slotOptions: diaryui.slotOptions, dayName: diaryui.dayName });

  /** Deletes a record (a tombstone until the cloud has it), reloads, and asks the Syncer to back it up. */
  function remove(table, id) {
    if (!data) return Promise.reject(new Error('Your data isn\'t open yet.'));
    return data.remove(table, id).then(loadRows).then(function () { if (syncer) syncer.changed(); });
  }

  /** Saves records to the phone's database (marked for upload), reloads, and asks the Syncer to back them up. */
  function save(rows) {
    if (!data) return Promise.reject(new Error('Your data isn\'t open yet. Try again in a moment.'));
    var d = data;
    return rows.reduce(function (p, r) { return p.then(function () { return d.put(r[0], r[1]); }); }, Promise.resolve())
      .then(loadRows).then(function () { if (syncer) syncer.changed(); });
  }
  function loadRows() {
    if (!data) return Promise.resolve();
    var d = data;
    return Promise.all([d.get('lw_profiles', 'me'), d.all('lw_goals'), d.all('lw_phases'), d.all('lw_target_sets'), d.all('lw_weights'), d.all('lw_measurements'), d.all('lw_diary_entries'), d.all('lw_custom_foods'), d.all('lw_saved_meals')])
      .then(function (r) {
        if (d !== data) return;
        state.rows = { profile: r[0] || null, goals: r[1], phases: r[2], sets: r[3], weights: r[4], waist: r[5].filter(function (m) { return m.site === 'waist' && !m.deleted; }), measures: r[5], diary: r[6],
          customs: r[7].filter(function (x) { return !x.deleted; }), meals: r[8].filter(function (x) { return !x.deleted; }) };
        state.loaded = true;
        refresh();
      });
  }

  /* ---------- sign-in ---------- */
  function setAccount(a) { state.account = a; store.set('account', a); if (a) startData(a); }

  /* ---------- the phone copy and its backup (M2) ---------- */
  function startData(a) {
    if (data && data.userId === a.id) return;
    stopData();
    root.LW.db.open(a.id).then(function (d) {
      data = d;
      return d.getMeta('sync', null).then(function (m) {
        state.everSynced = !!(m && m.lastSyncAt);
        syncer = cloud.Syncer(d, function (st) {
          state.sync = Object.assign({}, st);
          if (st.state === 'synced') { state.everSynced = true; loadRows(); } else refresh();
        });
        return loadRows().then(function () { syncer.now(); });
      });
    }, function (e) { state.sync = { state: 'error', pending: 0, message: e && e.message }; state.loaded = true; render(); });
  }
  function stopData() {
    if (syncer) syncer.stop();
    if (data) data.close();
    syncer = null; data = null;
    state.sync = { state: 'idle', pending: 0 };
    state.rows = emptyRows(); state.loaded = false; state.everSynced = false; state.ob = null; state.sheet = false;
  }

  cloud.auth.init(function (account, event) {
    if (account) {
      var changed = !state.account || state.account.id !== account.id || state.account.email !== account.email;
      setAccount(account);
      cloud.auth.cleanUrl();
      if (changed) { state.signingIn = false; render(); }
    } else if (event === 'SIGNED_OUT') {
      setAccount(null); render();
    } else if (event === 'INITIAL_SESSION' && (cloud.auth.returning() || cloud.auth.error())) {
      // Back from Google, but the sign-in couldn't be finished (or Google sent an error).
      var why = cloud.auth.error();
      cloud.auth.cleanUrl(); state.signingIn = false; render();
      toast(why ? 'Sign-in didn\'t work: ' + why : 'Sign-in didn\'t finish. Try again.');
    }
    // A missing session at start-up while offline (e.g. an expired token) keeps the saved account,
    // so the app still opens; Supabase refreshes the session once the phone is back online.
  });

  /* ---------- connection + offline ---------- */
  function checkConnection() {
    cloud.ping().then(function (r) { state.ping = r; refresh(); if (r.ok) reporter.flush(); });
  }
  root.addEventListener('online', function () { refresh(); checkConnection(); });
  root.addEventListener('offline', refresh);

  function registerServiceWorker() {
    var local = /^(localhost|127\.0\.0\.1)$/.test(root.location.hostname);
    if (!('serviceWorker' in root.navigator)) { state.sw = 'Not supported here'; return; }
    // Off on localhost so a refresh always shows your latest edits; add ?sw=1 to test offline locally.
    if (local && !/[?&]sw=1/.test(root.location.search)) { state.sw = 'Off on localhost'; return; }
    root.navigator.serviceWorker.register('sw.js').then(function () { return root.navigator.serviceWorker.ready; })
      .then(function () { state.sw = 'Ready'; refresh(); }, function () { state.sw = 'Could not start'; refresh(); });
  }

  render();
  if (state.account) startData(state.account);
  registerServiceWorker();
  checkConnection();
  reporter.flush();
})(this);
