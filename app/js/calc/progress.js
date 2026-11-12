/* Leanward calculation engine — phase progress read (PRD PRG-2, PRG-3, PRG-4).
 *
 * Each phase has its own signals. Every signal is "on track", "watch" or "off track" and carries the
 * numbers behind it, so nothing is an opaque score. A signal needs ≥ 14 days of phase data and
 * ≥ 8 weigh-ins (or 2 waist / 2 lift entries); before that it says "collecting data".
 * PRG-2 gives the "on track" rule for each signal; the "watch" and "off track" bands are in PRD §8.10.
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var core = node ? require('./core.js') : root.LW.calc.core;
  var trend = node ? require('./trend.js') : root.LW.calc.trend;
  var fmt = core.fmt, fmtS = core.fmtSigned;

  var MIN_DAYS = 14, MIN_WEIGHINS = 8, MIN_ENTRIES = 2;
  var WAIST_NOISE_CM = 0.5;          // tape-measure noise: changes smaller than this count as flat
  var DEFAULT_WAIST_CM_PER_KG = 1;   // lean bulk: waist growth limit per kg gained (PRG-2 proposed default)

  // Display units: stored values are kg and cm; U.w / U.l convert for the text when the user's units are US.
  var U = { us: false, wu: 'kg', lu: 'cm', w: function (kg) { return kg; }, l: function (cm) { return cm; } };
  function setUnits(units) {
    var us = units === 'us';
    U = { us: us, wu: us ? 'lb' : 'kg', lu: us ? 'in' : 'cm', w: function (kg) { return us ? core.kgToLb(kg) : kg; }, l: function (cm) { return us ? core.cmToIn(cm) : cm; } };
  }

  var PHASE_NAMES = { cut: 'cut', recomp: 'recomp', bulk: 'lean bulk', maintenance: 'maintenance', nutrition: 'nutrition phase' };

  function sig(id, label, status, value, rule, extra) {
    var s = { id: id, label: label, status: status, value: value, rule: rule };
    if (extra) Object.keys(extra).forEach(function (k) { s[k] = extra[k]; });
    return s;
  }
  function collecting(id, label, need) {
    return sig(id, label, 'collecting', 'Collecting data: ' + need, 'Needs ' + MIN_DAYS + ' days of the phase and enough entries before it can be read.');
  }
  function inPhase(list, start, today) { return (list || []).filter(function (e) { return e.date >= start && e.date <= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
  function plural(n, word) { return n + ' more ' + word + (n === 1 ? '' : 's'); }

  /* ---------- weight ---------- */
  function weightSignal(phase, ctx) {
    var label = 'Weight trend';
    var need = [];
    if (ctx.days < MIN_DAYS) need.push(plural(MIN_DAYS - ctx.days, 'day'));
    if (ctx.weighIns < MIN_WEIGHINS) need.push(plural(MIN_WEIGHINS - ctx.weighIns, 'weigh-in'));
    if (need.length) return collecting('weight', label, need.join(' and '));

    var rate = trend.rateOfChange(ctx.series);
    if (!rate) return collecting('weight', label, 'a few more days of weigh-ins');
    var pct = rate.pctPerWeek;
    var value = fmtS(U.w(rate.kgPerWeek), 2) + ' ' + U.wu + ' a week (' + fmtS(pct, 2) + '% of body weight)';

    if (phase.type === 'cut' || phase.type === 'bulk') {
      var planned = phase.expectedWeeklyPct;
      var dev = Math.abs(pct - planned) / Math.abs(planned);   // 0 = exactly on plan
      var status = dev <= 0.5 ? 'on-track' : dev <= 1.0 ? 'watch' : 'off-track';
      return sig('weight', label, status, value, 'On track within ±50% of the planned ' + fmtS(planned, 2) + '% a week; watch up to ±100%.', { planned: planned, actual: pct, rate: rate });
    }
    if (phase.type === 'recomp') {
      var a = Math.abs(pct);
      return sig('weight', label, a <= 0.25 ? 'on-track' : a <= 0.5 ? 'watch' : 'off-track', value,
        'On track within ±0.25% of body weight a week of flat; watch up to ±0.5%.', { actual: pct, rate: rate });
    }
    if (phase.type === 'maintenance') {
      var startKg = ctx.startTrendKg, nowKg = ctx.series[ctx.series.length - 1].trendKg;
      var diff = (nowKg - startKg) / startKg * 100, ad = Math.abs(diff);
      return sig('weight', label, ad <= 1.5 ? 'on-track' : ad <= 3 ? 'watch' : 'off-track',
        fmtS(U.w(nowKg - startKg), 1) + ' ' + U.wu + ' since the phase started (' + fmtS(diff, 1) + '%)',
        'On track within ±1.5% of your phase-start weight (' + fmt(U.w(startKg), 1) + ' ' + U.wu + '); watch up to ±3%.', { changePct: diff });
    }
    return null;
  }

  /* ---------- waist ---------- */
  function waistSignal(phase, ctx, opts) {
    var label = 'Waist';
    var w = ctx.waist;
    var need = [];
    if (ctx.days < MIN_DAYS) need.push(plural(MIN_DAYS - ctx.days, 'day'));
    if (w.length < MIN_ENTRIES) need.push(plural(MIN_ENTRIES - w.length, 'waist measurement'));
    if (need.length) return collecting('waist', label, need.join(' and '));
    var d = w[w.length - 1].cm - w[0].cm;
    var value = fmtS(U.l(d), 1) + ' ' + U.lu + ' since ' + w[0].date;
    var n = WAIST_NOISE_CM, nText = fmt(U.l(n), U.us ? 1 : 1) + ' ' + U.lu;
    if (phase.type === 'cut') {
      return sig('waist', label, d <= -n ? 'on-track' : d < n ? 'watch' : 'off-track', value,
        'On track when falling (by more than ' + nText + '); flat is worth watching.', { changeCm: d });
    }
    if (phase.type === 'recomp') {
      return sig('waist', label, d < n ? 'on-track' : d < 2 * n ? 'watch' : 'off-track', value,
        'On track when flat or falling (changes under ' + nText + ' count as flat).', { changeCm: d });
    }
    if (phase.type === 'maintenance') {
      var a = Math.abs(d);
      return sig('waist', label, a <= 1 ? 'on-track' : a <= 2 ? 'watch' : 'off-track', value, 'On track within ±' + fmt(U.l(1), U.us ? 1 : 0) + ' ' + U.lu + '; watch up to ±' + fmt(U.l(2), U.us ? 1 : 0) + ' ' + U.lu + '.', { changeCm: d });
    }
    if (phase.type === 'bulk') {
      var limit = (opts && opts.waistCmPerKg) || DEFAULT_WAIST_CM_PER_KG;
      var gained = ctx.series[ctx.series.length - 1].trendKg - ctx.startTrendKg;
      var allowed = Math.max(gained, 0) * limit + n;
      return sig('waist', label, d <= allowed ? 'on-track' : d <= allowed * 1.5 ? 'watch' : 'off-track',
        value + ' with ' + fmtS(U.w(gained), 1) + ' ' + U.wu + ' gained',
        'On track when waist grows no faster than ' + limit + ' cm per kg gained (allowed now: ' + fmt(U.l(allowed), 1) + ' ' + U.lu + ').', { changeCm: d, gainedKg: gained });
    }
    return null;
  }

  /* ---------- key lifts ---------- */
  function liftSignals(phase, ctx) {
    var out = [];
    Object.keys(ctx.lifts).forEach(function (name) {
      var l = ctx.lifts[name], label = name;
      if (ctx.days < MIN_DAYS || l.length < MIN_ENTRIES) {
        var need = [];
        if (ctx.days < MIN_DAYS) need.push(plural(MIN_DAYS - ctx.days, 'day'));
        if (l.length < MIN_ENTRIES) need.push(plural(MIN_ENTRIES - l.length, 'session'));
        out.push(collecting('lift:' + name, label, need.join(' and ')));
        return;
      }
      var first = l[0].e1rm, last = l[l.length - 1].e1rm, pct = (last - first) / first * 100;
      var value = 'Estimated 1RM ' + fmtS(pct, 1) + '% since ' + l[0].date;
      if (phase.type === 'cut') {
        out.push(sig('lift:' + name, label, pct >= -5 ? 'on-track' : pct >= -10 ? 'watch' : 'off-track', value,
          'On track within 5% of your phase-start estimate; watch down to −10%.', { changePct: pct }));
      } else {
        out.push(sig('lift:' + name, label, pct > 0 ? 'on-track' : pct >= -2.5 ? 'watch' : 'off-track', value,
          'On track when rising; holding or a small dip (to −2.5%) is worth watching.', { changePct: pct }));
      }
    });
    return out;
  }

  /* ---------- nutrition optimization ---------- */
  function nutritionSignals(ctx, input) {
    var out = [];
    var logged = (input.loggedDates || []).filter(function (d) { return d >= ctx.windowStart && d <= ctx.today; }).length;
    var windowDays = Math.min(ctx.days, MIN_DAYS);
    if (ctx.days < MIN_DAYS) out.push(collecting('logging', 'Logging', plural(MIN_DAYS - ctx.days, 'day')));
    else {
      var share = logged / windowDays * 100;
      out.push(sig('logging', 'Logging', share >= 80 ? 'on-track' : share >= 50 ? 'watch' : 'off-track',
        logged + ' of the last ' + windowDays + ' days logged', 'On track at 80% of days or more; watch from 50%.', { sharePct: share }));
    }
    if (input.nutrientsMet != null && input.nutrientsTotal) {
      var p = input.nutrientsMet / input.nutrientsTotal * 100;
      out.push(sig('nutrients', 'Nutrients at target', ctx.days < MIN_DAYS ? 'collecting' : p >= 80 ? 'on-track' : p >= 60 ? 'watch' : 'off-track',
        input.nutrientsMet + ' of ' + input.nutrientsTotal + ' nutrients at 100% of target (7-day average)', 'On track when 80% of nutrients meet their target; watch from 60%.', { sharePct: p }));
    }
    return out;
  }

  /**
   * input: {
   *   phase: { type, startDate, expectedWeeklyPct? (cut/bulk, from the calorie target) },
   *   today: 'YYYY-MM-DD',
   *   weights: [{ date, kg, at? }], waist: [{ date, cm }], lifts: { 'Back squat': [{ date, e1rm }] },
   *   loggedDates?: ['YYYY-MM-DD'], nutrientsMet?, nutrientsTotal?   (nutrition optimization)
   * }
   * opts: { waistCmPerKg?, units?: 'us' | 'metric' (the text's units; the default is metric) }
   * Returns { signals: [...], summary, dayOfPhase }.
   */
  function read(input, opts) {
    setUnits(opts && opts.units);
    var ph = input.phase, today = input.today;
    var days = core.daysBetween(ph.startDate, today) + 1;
    var ctx = { days: days, today: today, windowStart: core.addDays(today, -(Math.min(days, MIN_DAYS) - 1)) };
    var signals = [];

    if (ph.type === 'nutrition') {
      signals = nutritionSignals(ctx, input);
    } else {
      var all = input.weights || [];
      var phaseWeights = trend.dailyWeights(inPhase(all, ph.startDate, today));
      ctx.weighIns = phaseWeights.length;
      ctx.series = all.length ? trend.trendSeries(all, { endDate: today }).filter(function (d) { return d.date <= today; }) : [];
      // Phase-start weight: the trend on the start day (carried from earlier weigh-ins), or the first one in the phase.
      var atStart = ctx.series.filter(function (d) { return d.date <= ph.startDate; });
      ctx.startTrendKg = atStart.length ? atStart[atStart.length - 1].trendKg : (phaseWeights[0] && phaseWeights[0].kg);
      ctx.waist = inPhase(input.waist, ph.startDate, today);
      ctx.lifts = {};
      Object.keys(input.lifts || {}).forEach(function (k) { ctx.lifts[k] = inPhase(input.lifts[k], ph.startDate, today); });

      var ws = ctx.series.length ? weightSignal(ph, ctx) : collecting('weight', 'Weight trend', plural(MIN_WEIGHINS, 'weigh-in'));
      if (ws) signals.push(ws);
      if (input.waist && input.waist.length) signals.push(waistSignal(ph, ctx, opts));
      if (ph.type !== 'maintenance') signals = signals.concat(liftSignals(ph, ctx));
    }
    return { dayOfPhase: days, signals: signals, summary: summary(ph.type, signals) };
  }

  /** PRG-4: plain, non-judgmental copy built from the signals. */
  function summary(type, signals) {
    var read = signals.filter(function (s) { return s.status !== 'collecting'; });
    if (!read.length) return 'Still collecting data for your ' + PHASE_NAMES[type] + '. Keep logging and weighing in.';
    var parts = read.map(function (s) {
      if (s.id === 'weight') {
        if (s.changePct != null) return 'weight ' + fmtS(s.changePct, 1) + '% since the start';
        return Math.abs(s.actual) < 0.1 ? 'weight flat' : 'weight ' + fmtS(U.w(s.rate.kgPerWeek), 2) + ' ' + U.wu + ' a week';
      }
      if (s.id === 'waist') return 'waist ' + (Math.abs(s.changeCm) < WAIST_NOISE_CM ? 'flat' : fmtS(U.l(s.changeCm), 1) + ' ' + U.lu);
      if (s.id.indexOf('lift:') === 0) return s.label.toLowerCase() + ' e1RM ' + fmtS(s.changePct, 0) + '%';
      return s.value.charAt(0).toLowerCase() + s.value.slice(1);
    });
    var text = parts.join(', ');
    text = text.charAt(0).toUpperCase() + text.slice(1);
    var watch = read.filter(function (s) { return s.status !== 'on-track'; });
    if (!watch.length) return text + ': consistent with a successful ' + PHASE_NAMES[type] + '.';
    return text + '. Worth a look: ' + watch.map(function (s) { return s.label.toLowerCase(); }).join(', ') + '.';
  }

  var api = { MIN_DAYS: MIN_DAYS, MIN_WEIGHINS: MIN_WEIGHINS, MIN_ENTRIES: MIN_ENTRIES, WAIST_NOISE_CM: WAIST_NOISE_CM, read: read };
  if (node) module.exports = api;
  else { root.LW.calc.progress = api; }
})(this);
