/* Leanward — Supabase connection: Google sign-in, the connection check (lw_ping) and error reports.
 * Sign-in works like PR Forge's: Supabase handles Google, with the PKCE flow and a redirect back here.
 * Sync (M2): remote pull/push for js/sync.js and a Syncer that runs it. Email/password sign-in arrives in M3.
 */
(function (root) {
  'use strict';

  var C = root.LW.config;
  var client = null;
  var PING_TIMEOUT_MS = 8000;

  function getClient() {
    if (client) return client;
    if (!root.supabase || !root.supabase.createClient) return null;
    // Leanward has its own origin and its own Supabase project, so its session is separate from
    // PR Forge's. The session is stored under the Leanward prefix like every other key.
    client = root.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: C.STORAGE_PREFIX + 'auth' }
    });
    return client;
  }

  /* ---------- sign-in ---------- */
  // True when the address is a return from "Connect PR Forge", which belongs to js/prforge.js, not to this sign-in.
  function pfReturn() { return /[?&]pf=1(&|$)/.test(root.location.search); }
  function accountOf(s) {
    var u = s && s.user;
    if (!u) return null;
    var m = u.user_metadata || {};
    return { id: u.id, email: u.email || '', name: m.full_name || m.name || '' };
  }

  var auth = {
    /** Calls onChange(account or null, event) whenever the sign-in changes, and once at start. */
    init: function (onChange) {
      var c = getClient();
      if (!c) { onChange(null, 'UNAVAILABLE'); return; }
      c.auth.onAuthStateChange(function (event, s) {
        // Supabase asks that no other Supabase calls run inside this callback.
        setTimeout(function () { onChange(accountOf(s), event); }, 0);
      });
    },
    /** True while Google has just sent the user back and the sign-in is being finished. */
    returning: function () { return /[?&]code=/.test(root.location.search) && !pfReturn(); },
    /** The reason Google or Supabase gave if a sign-in failed, else ''. */
    error: function () {
      if (pfReturn()) return '';
      var m = /[?&#]error_description=([^&#]*)/.exec(root.location.search + root.location.hash);
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    },
    /** Removes ?code= / error details from the address once they've been used. */
    cleanUrl: function () {
      if (pfReturn()) return;   // a "Connect PR Forge" return: js/prforge.js reads and clears it
      if (/[?&](code|error)=/.test(root.location.search) || /error=/.test(root.location.hash)) {
        try { root.history.replaceState(null, '', root.location.pathname); } catch (e) { /* ignore */ }
      }
    },
    signIn: function () {
      var c = getClient();
      if (!c) return Promise.reject(new Error('Sign-in could not load. Check your connection and reload.'));
      return c.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: root.location.origin + root.location.pathname }
      }).then(function (res) { if (res.error) throw res.error; });
    },
    /** Signs out on this phone only. */
    signOut: function () {
      var c = getClient();
      return c ? c.auth.signOut({ scope: 'local' }).then(function () {}, function () {}) : Promise.resolve();
    }
  };

  /** Resolves { ok: true, message } or { ok: false, reason }. Never rejects. */
  function ping() {
    var c = getClient();
    if (!c) return Promise.resolve({ ok: false, reason: 'The Supabase library did not load.' });
    if (root.navigator && root.navigator.onLine === false) return Promise.resolve({ ok: false, reason: 'You are offline.' });
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve({ timedOut: true }); }, PING_TIMEOUT_MS); });
    return Promise.race([c.from('lw_ping').select('message').eq('id', 1).maybeSingle(), timeout]).then(function (res) {
      if (res.timedOut) return { ok: false, reason: 'Supabase did not answer within ' + PING_TIMEOUT_MS / 1000 + ' seconds. Check your connection and try again.' };
      if (res.error) {
        var missing = res.error.code === '42P01' || res.error.code === 'PGRST205' || /does not exist|schema cache/i.test(res.error.message || '');
        var network = /failed to fetch|network|load failed/i.test(res.error.message || '');
        return { ok: false, reason: missing ? 'Reached Supabase, but the Leanward tables are not set up yet. Run supabase/schema.sql.' : network ? 'Could not reach Supabase. Check your connection and try again.' : (res.error.message || 'Request failed.') };
      }
      return res.data ? { ok: true, message: res.data.message } : { ok: false, reason: 'Reached Supabase, but the test row is missing. Run supabase/schema.sql again.' };
    }, function (err) {
      return { ok: false, reason: (err && err.message) || 'Could not reach Supabase.' };
    });
  }

  /** Inserts one error report. Rejects on failure so the reporter can queue it. */
  function sendError(row) {
    var c = getClient();
    if (!c) return Promise.reject(new Error('No client'));
    return c.from('lw_errors').insert(row).then(function (res) {
      if (res.error) throw new Error(res.error.message);
      return true;
    });
  }

  /* ---------- sync (M2): pull and push through the Data API; the rules are in js/sync.js ---------- */
  var PAGE = 500, CHUNK = 200;
  var remote = {
    pull: function (table, since) {
      var c = getClient(), all = [];
      function page(from) {
        var q = c.from(table).select('*');
        if (since) q = q.gt('updated_at', since);
        return q.order('updated_at').order('id').range(from, from + PAGE - 1).then(function (res) {
          if (res.error) throw httpError(res);
          all = all.concat(res.data || []);
          return res.data && res.data.length === PAGE ? page(from + PAGE) : all;
        });
      }
      return page(0);
    },
    push: function (table, rows) {
      var c = getClient(), out = [], chunks = [];
      for (var i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));
      return chunks.reduce(function (p, chunk) {
        return p.then(function () {
          // user_id isn't sent: the database fills it in from the signed-in session.
          return c.from(table).upsert(chunk, { onConflict: 'user_id,id', defaultToNull: false }).select('id,updated_at').then(function (res) {
            if (res.error) throw httpError(res);
            out = out.concat(res.data || []);
          });
        });
      }, Promise.resolve()).then(function () { return out; });
    }
  };
  function httpError(res) {
    var e = new Error(res.error.message || 'Request failed');
    e.code = res.error.code; e.status = res.status;
    return e;
  }
  function isNetworkError(e) {
    return (root.navigator && root.navigator.onLine === false) || (e && (e.name === 'TypeError' || /fetch|network|load failed/i.test(String(e.message))));
  }

  /**
   * Keeps one person's phone copy (js/db.js) in step with the cloud.
   * Syncs at start, when the phone comes back online or the app comes back to the front, and shortly
   * after each local change. Status: idle | syncing | synced | offline | signin | error.
   */
  function Syncer(db, onStatus) {
    var SY = root.LW.sync, meta = null, running = false, again = false, timer = null, stopped = false;
    var status = { state: 'idle', pending: 0, lastSyncAt: null, message: '' };
    function set(state, message) {
      status.state = state; status.message = message || '';
      SY.pendingCount(db.local).then(function (n) { status.pending = n; if (onStatus) onStatus(status); }, function () { if (onStatus) onStatus(status); });
    }
    function run() {
      if (stopped) return Promise.resolve();
      if (running) { again = true; return Promise.resolve(); }
      if (root.navigator && root.navigator.onLine === false) { set('offline'); return Promise.resolve(); }
      running = true;
      set('syncing');
      var c = getClient();
      return (meta ? Promise.resolve(meta) : db.getMeta('sync', SY.emptyMeta())).then(function (m) {
        meta = m;
        return c ? c.auth.getSession() : null;
      }).then(function (r) {
        if (!r || !r.data || !r.data.session) { set('signin', 'Sign in again to keep backing up.'); return; }
        return SY.run(meta, db.local, remote).then(function () {
          meta.lastSyncAt = new Date().toISOString();
          status.lastSyncAt = meta.lastSyncAt;
          return db.setMeta('sync', meta).then(function () { set('synced'); });
        }, function (err) {
          return db.setMeta('sync', meta).then(function () {
            if (isNetworkError(err)) set('offline');
            else if (err && (err.status === 401 || /jwt/i.test(String(err.message)))) set('signin', 'Sign in again to keep backing up.');
            else if (err && (err.code === '42P01' || err.code === 'PGRST205')) set('error', 'The Leanward tables are missing. Run supabase/schema.sql again.');
            else set('error', err && err.message);
          });
        });
      }).catch(function (err) { set('error', err && err.message); }).then(function () {
        running = false;
        if (again) { again = false; schedule(500); }
      });
    }
    function schedule(ms) { clearTimeout(timer); timer = setTimeout(run, ms == null ? 1500 : ms); }
    function wake() { schedule(300); }
    function visible() { if (root.document.visibilityState === 'visible') schedule(300); }
    function offline() { set('offline'); }
    root.addEventListener('online', wake);
    root.addEventListener('offline', offline);
    root.document.addEventListener('visibilitychange', visible);
    return {
      /** Call after every local save. */
      changed: function () { schedule(); },
      now: function () { clearTimeout(timer); return run(); },
      status: function () { return status; },
      stop: function () {
        stopped = true; clearTimeout(timer);
        root.removeEventListener('online', wake);
        root.removeEventListener('offline', offline);
        root.document.removeEventListener('visibilitychange', visible);
      }
    };
  }

  root.LW.cloud = { ping: ping, sendError: sendError, auth: auth, remote: remote, Syncer: Syncer, client: getClient };
})(this);
