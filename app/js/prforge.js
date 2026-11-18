/* Leanward — key lifts from PR Forge, read-only (M6b; PRD MEA-5, §15 Q6).
 *
 * PR Forge is a separate app with its own Supabase project. "Connect PR Forge" signs the user in
 * to that project with Google through a second client that only ever reads: the user's own
 * workouts and custom exercise names, under PR Forge's row-level security. Leanward never writes
 * there. The PR Forge session is kept apart from Leanward's (its own storage key) and can be
 * disconnected at any time.
 *
 * A lift's point for a day is the best estimated 1RM (Epley, calc/strength.js: sets of 12 reps or
 * fewer) among that day's working sets, following PR Forge's own rules (js/metrics.js there): the
 * workout is finished, the set is confirmed, not a warm-up, not timed or assisted, with weight > 0.
 * PR Forge compares in pounds; so does this file, converting only for display.
 *
 * The first part is pure (tested in Node); the second needs the browser.
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var strength = node ? require('./calc/strength.js') : root.LW.calc.strength;

  var MAX_LIFTS = 5;
  var LB_PER_KG = 2.20462262185;   // PR Forge's own factor (js/units.js)
  // PR Forge's built-in exercise names (its js/exercises.js at 7c77fde). Other ids fall back to a readable form.
  var NAMES = {
    'bench-press': 'Bench Press (Barbell)', 'incline-bench-press': 'Incline Bench Press (Barbell)', 'decline-bench-press': 'Decline Bench Press (Barbell)',
    'close-grip-bench': 'Close-Grip Bench Press', 'db-bench-press': 'Bench Press (Dumbbell)', 'db-incline-press': 'Incline Press (Dumbbell)',
    'db-fly': 'Chest Fly (Dumbbell)', 'cable-fly': 'Cable Fly', 'machine-chest-press': 'Chest Press (Machine)', 'pec-deck': 'Pec Deck',
    'smith-bench': 'Bench Press (Smith Machine)', 'push-up': 'Push-Up', 'dip': 'Dip', 'deadlift': 'Deadlift (Barbell)', 'trap-bar-deadlift': 'Deadlift (Trap Bar)',
    'barbell-row': 'Bent-Over Row (Barbell)', 'pendlay-row': 'Pendlay Row', 't-bar-row': 'T-Bar Row', 'db-row': 'Single-Arm Row (Dumbbell)',
    'chest-supported-row': 'Chest-Supported Row (Dumbbell)', 'seated-cable-row': 'Seated Cable Row', 'single-arm-cable-row': 'Single-Arm Cable Row',
    'lat-pulldown': 'Lat Pulldown', 'machine-row': 'Row (Machine)', 'pull-up': 'Pull-Up', 'chin-up': 'Chin-Up', 'straight-arm-pulldown': 'Straight-Arm Pulldown',
    'back-extension': 'Back Extension', 'rack-pull': 'Rack Pull', 'shrug': 'Shrug (Barbell)', 'db-shrug': 'Shrug (Dumbbell)',
    'overhead-press': 'Overhead Press (Barbell)', 'db-shoulder-press': 'Shoulder Press (Dumbbell)', 'arnold-press': 'Arnold Press',
    'machine-shoulder-press': 'Shoulder Press (Machine)', 'lateral-raise': 'Lateral Raise (Dumbbell)', 'cable-lateral-raise': 'Single-Arm Cable Lateral Raise',
    'front-raise': 'Front Raise (Dumbbell)', 'rear-delt-fly': 'Rear Delt Fly (Dumbbell)', 'reverse-pec-deck': 'Reverse Pec Deck', 'face-pull': 'Face Pull',
    'upright-row': 'Upright Row', 'landmine-press': 'Single-Arm Landmine Press', 'barbell-curl': 'Curl (Barbell)', 'ez-bar-curl': 'Curl (EZ Bar)',
    'db-curl': 'Curl (Dumbbell)', 'hammer-curl': 'Hammer Curl', 'incline-db-curl': 'Incline Curl (Dumbbell)', 'concentration-curl': 'Concentration Curl',
    'preacher-curl': 'Preacher Curl', 'cable-curl': 'Curl (Cable)', 'triceps-pushdown': 'Triceps Pushdown', 'rope-pushdown': 'Rope Pushdown',
    'overhead-triceps-ext': 'Overhead Triceps Extension (Cable)', 'db-overhead-ext': 'Overhead Triceps Extension (Dumbbell)', 'skull-crusher': 'Skull Crusher',
    'single-arm-pushdown': 'Single-Arm Pushdown', 'wrist-curl': 'Wrist Curl', 'farmers-carry': 'Farmer\'s Carry', 'back-squat': 'Back Squat (Barbell)',
    'front-squat': 'Front Squat (Barbell)', 'goblet-squat': 'Goblet Squat', 'hack-squat': 'Hack Squat', 'smith-squat': 'Squat (Smith Machine)', 'leg-press': 'Leg Press',
    'single-leg-press': 'Single-Leg Press', 'leg-extension': 'Leg Extension', 'bulgarian-split-squat': 'Bulgarian Split Squat',
    'walking-lunge': 'Walking Lunge (Dumbbell)', 'reverse-lunge': 'Reverse Lunge (Dumbbell)', 'step-up': 'Step-Up (Dumbbell)',
    'romanian-deadlift': 'Romanian Deadlift (Barbell)', 'db-romanian-deadlift': 'Romanian Deadlift (Dumbbell)', 'single-leg-rdl': 'Single-Leg Romanian Deadlift',
    'lying-leg-curl': 'Lying Leg Curl', 'seated-leg-curl': 'Seated Leg Curl', 'good-morning': 'Good Morning', 'nordic-curl': 'Nordic Curl',
    'hip-thrust': 'Hip Thrust (Barbell)', 'glute-bridge': 'Glute Bridge', 'cable-kickback': 'Cable Glute Kickback', 'hip-abduction': 'Hip Abduction (Machine)',
    'hip-adduction': 'Hip Adduction (Machine)', 'kb-swing': 'Kettlebell Swing', 'standing-calf-raise': 'Standing Calf Raise', 'seated-calf-raise': 'Seated Calf Raise',
    'single-leg-calf-raise': 'Single-Leg Calf Raise', 'plank': 'Plank', 'hanging-leg-raise': 'Hanging Leg Raise', 'cable-crunch': 'Cable Crunch',
    'ab-wheel': 'Ab Wheel Rollout', 'russian-twist': 'Russian Twist', 'pallof-press': 'Pallof Press', 'decline-sit-up': 'Decline Sit-Up', 'power-clean': 'Power Clean',
    'clean-and-jerk': 'Clean and Jerk', 'snatch': 'Snatch', 'thruster': 'Thruster (Barbell)'
  };

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function localDate(iso) { var d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nameOf(id, custom) {
    var c = (custom || []).filter(function (e) { return e && e.id === id; })[0];
    if (c && c.name) return String(c.name).slice(0, 80);
    if (NAMES[id]) return NAMES[id];
    return String(id).replace(/^fedb:/, '').replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, function (ch) { return ch.toUpperCase(); }).slice(0, 80);
  }

  /** The best usable set of one exercise in one workout: { e1rmLb, weightLb, reps } or null. */
  function bestSet(workout, exerciseId) {
    var best = null;
    (workout.exercises || []).forEach(function (ex) {
      if (!ex || ex.exerciseId !== exerciseId) return;
      (ex.sets || []).forEach(function (s) {
        if (!s || !s.done || s.warmup) return;
        var reps = num(s.reps), timed = s.tracking === 'timed' || (num(s.seconds) > 0 && !(reps > 0));
        if (timed || s.tracking === 'assisted') return;
        var lb = workout.unit === 'kg' ? num(s.weight) * LB_PER_KG : num(s.weight);
        var est = strength.e1rm(lb, reps);
        if (est && (!best || est.e1rm > best.e1rmLb)) best = { e1rmLb: est.e1rm, weightLb: lb, reps: reps };
      });
    });
    return best;
  }

  /**
   * Everything Leanward keeps from PR Forge: for each exercise with at least one usable set, one
   * point per day (the day's best). workouts: PR Forge workout objects (deleted ones left out by the caller).
   * Returns [{ id, name, sessions: [{ date, e1rmLb, weightLb, reps }] }], most sessions first.
   */
  function summarize(workouts, custom) {
    var by = {};
    (workouts || []).forEach(function (w) {
      if (!w || !w.endedAt || !w.startedAt || isNaN(new Date(w.startedAt))) return;
      var date = localDate(w.startedAt), ids = {};
      (w.exercises || []).forEach(function (ex) { if (ex && ex.exerciseId) ids[ex.exerciseId] = 1; });
      Object.keys(ids).forEach(function (id) {
        var b = bestSet(w, id);
        if (!b) return;
        var days = by[id] = by[id] || {};
        if (!days[date] || b.e1rmLb > days[date].e1rmLb) days[date] = { date: date, e1rmLb: b.e1rmLb, weightLb: b.weightLb, reps: b.reps };
      });
    });
    return Object.keys(by).map(function (id) {
      return { id: id, name: nameOf(id, custom), sessions: Object.keys(by[id]).sort().map(function (d) { return by[id][d]; }) };
    }).sort(function (a, b) { return b.sessions.length - a.sessions.length || a.name.localeCompare(b.name); });
  }

  /** The chosen key lifts with their points in display units: [{ id, name, points: [{ date, v }], missing? }]. */
  function series(summary, picks, units) {
    var f = units === 'metric' ? 1 / LB_PER_KG : 1;
    return (picks || []).slice(0, MAX_LIFTS).map(function (p) {
      var ex = (summary || []).filter(function (e) { return e.id === p.id; })[0];
      return { id: p.id, name: ex ? ex.name : p.name, missing: !ex, points: ex ? ex.sessions.map(function (s) { return { date: s.date, v: s.e1rmLb * f, weight: s.weightLb * f, reps: s.reps }; }) : [] };
    });
  }

  /** The input calc/progress.js wants: { 'Bench Press (Barbell)': [{ date, e1rm }] }. */
  function forProgress(summary, picks) {
    var out = {};
    series(summary, picks, 'us').forEach(function (l) { if (!l.missing) out[l.name] = l.points.map(function (p) { return { date: p.date, e1rm: p.v }; }); });
    return out;
  }

  /** Adds or removes a pick, keeping at most MAX_LIFTS. Returns the new list, or throws when full. */
  function toggle(picks, ex) {
    var list = (picks || []).slice(), i = list.map(function (p) { return p.id; }).indexOf(ex.id);
    if (i >= 0) { list.splice(i, 1); return list; }
    if (list.length >= MAX_LIFTS) throw new Error('Pick up to ' + MAX_LIFTS + ' key lifts. Remove one first.');
    list.push({ id: ex.id, name: ex.name });
    return list;
  }

  /**
   * Training days from PR Forge (NUT-9): any day with a finished workout that had a weighted set.
   * Works on the summary Leanward already keeps (exercise session dates), so it needs no new data.
   * Returns { today: 'logged' | 'usual' | null, usual: [0–6 weekdays trained on 2+ times in the last
   * 4 weeks], sessions14, sessions28, perWeek (average over 4 weeks) }.
   */
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function weekday(date) { return new Date(date + 'T12:00:00Z').getUTCDay(); }
  function shift(date, n) { var d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function trainingDays(exercises, today) {
    var dates = {};
    (exercises || []).forEach(function (ex) { (ex.sessions || []).forEach(function (s) { if (s.date <= today) dates[s.date] = 1; }); });
    var from28 = shift(today, -27), from14 = shift(today, -13), counts = [0, 0, 0, 0, 0, 0, 0], s14 = 0, s28 = 0;
    Object.keys(dates).forEach(function (d) {
      if (d < from28) return;
      s28++; counts[weekday(d)]++;
      if (d >= from14) s14++;
    });
    var usual = counts.map(function (c, i) { return c >= 2 ? i : -1; }).filter(function (i) { return i >= 0; });
    // This week (Monday to today) and the weekly aim: the usual training days, or the 4-week average.
    var monday = shift(today, -((weekday(today) + 6) % 7)), week = Object.keys(dates).filter(function (d) { return d >= monday && d <= today; }).length;
    return { today: dates[today] ? 'logged' : usual.indexOf(weekday(today)) >= 0 ? 'usual' : null, usual: usual,
      usualNames: usual.map(function (i) { return DAY_NAMES[i]; }), sessions14: s14, sessions28: s28, perWeek: Math.round(s28 / 4 * 10) / 10,
      week: week, weekAim: usual.length || Math.round(s28 / 4) };
  }

  var api = { trainingDays: trainingDays, MAX_LIFTS: MAX_LIFTS, LB_PER_KG: LB_PER_KG, NAMES: NAMES, nameOf: nameOf, bestSet: bestSet, summarize: summarize, series: series, forProgress: forProgress, toggle: toggle };
  if (node) { module.exports = api; return; }

  /* ---------- browser: the read-only PR Forge client ---------- */
  var C = root.LW.config, client = null, PAGE = 500;
  var RETURN_FLAG = 'pf=1';

  function getClient() {
    if (client) return client;
    if (!root.supabase || !root.supabase.createClient || !C.PRFORGE_URL) return null;
    client = root.supabase.createClient(C.PRFORGE_URL, C.PRFORGE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: C.STORAGE_PREFIX + 'prforge-auth' }
    });
    return client;
  }
  /** True when Google has just sent the user back from "Connect PR Forge". */
  function returning() { return new RegExp('[?&]' + RETURN_FLAG + '(&|$)').test(root.location.search); }
  function cleanUrl() { if (returning()) { try { root.history.replaceState(null, '', root.location.pathname); } catch (e) { /* ignore */ } } }
  function returnError() {
    var m = /[?&#]error_description=([^&#]*)/.exec(root.location.search + root.location.hash);
    return returning() && m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  /** Resolves to { id, email } when connected, else null. Finishes a pending "Connect" return first. */
  function session() {
    var c = getClient();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (res) {
      var s = res && res.data && res.data.session;
      return s && s.user ? { id: s.user.id, email: s.user.email || '' } : null;
    }, function () { return null; });
  }
  function connect() {
    var c = getClient();
    if (!c) return Promise.reject(new Error('The connection could not load. Check your connection and reload.'));
    return c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: root.location.origin + root.location.pathname + '?' + RETURN_FLAG } })
      .then(function (res) { if (res.error) throw res.error; });
  }
  function disconnect() { var c = getClient(); return c ? c.auth.signOut({ scope: 'local' }).then(function () {}, function () {}) : Promise.resolve(); }

  /** Reads the user's own PR Forge workouts and custom exercise names (select only) and summarizes them. */
  function load(userId) {
    var c = getClient(), all = [];
    function page(from) {
      return c.from('workouts').select('id,data,deleted').eq('user_id', userId).order('id').range(from, from + PAGE - 1).then(function (res) {
        if (res.error) throw new Error(res.error.message);
        all = all.concat(res.data || []);
        return res.data && res.data.length === PAGE ? page(from + PAGE) : all;
      });
    }
    return page(0).then(function (rows) {
      return c.from('profiles').select('data').eq('user_id', userId).maybeSingle().then(function (res) {
        var custom = (res && res.data && res.data.data && res.data.data.customExercises) || [];
        var workouts = rows.filter(function (r) { return !r.deleted && r.data; }).map(function (r) { return r.data; });
        return { at: new Date().toISOString(), workouts: workouts.length, exercises: summarize(workouts, custom) };
      });
    });
  }

  // Coming back from "Connect PR Forge": start the client now so it finishes the sign-in from the address.
  if (returning()) getClient();

  api.returning = returning; api.cleanUrl = cleanUrl; api.returnError = returnError; api.session = session; api.connect = connect; api.disconnect = disconnect; api.load = load;
  root.LW.prforge = api;
})(this);
