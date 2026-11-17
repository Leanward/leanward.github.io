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
  // A lift is judged on the best of several sessions at each end, never one session (audit D3).
  var LIFT_MIN_SESSIONS = 4;
  var SLOW_JUDGE_DAYS = 28;
  var WAIST_NOISE_CM = 1.0;          // tape-measure noise: changes smaller than this count as flat (audit D4)
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
    return sig(id, label, 'collecting', 'Collecting data: ' + need, 'Needs ' + MIN_DAYS + ' days of the phase and enough entries (' + LIFT_MIN_SESSIONS + ' sessions for a lift) before it can be read.');
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
      // The trend lags for the first weeks of a phase, which makes any pace look slower than it is
      // (28–37% of on-plan users read "slow" on day 21 in tests/sim.test.js). So before day 28 a slower
      // pace isn't judged yet; a faster one is, since the lag never exaggerates the change.
      var slower = (pct - planned) * (planned < 0 ? 1 : -1) > 0;
      if (status !== 'on-track' && slower && ctx.days < SLOW_JUDGE_DAYS) {
        return sig('weight', label, 'collecting', value + ' so far', 'A slower pace can\'t be judged before day ' + SLOW_JUDGE_DAYS + ' of a phase: the trend lags at first.', { planned: planned, actual: pct, rate: rate, early: true });
      }
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
    // Average of the first 2 vs the last 2 readings when there are 4 or more, so one off tape reading
    // doesn't read as change (audit D4); with 2–3 readings, first vs last.
    var k = w.length >= 4 ? 2 : 1, avg = function (xs) { return xs.reduce(function (a, x) { return a + x.cm; }, 0) / xs.length; };
    var d = avg(w.slice(-k)) - avg(w.slice(0, k));
    var value = fmtS(U.l(d), 1) + ' ' + U.lu + ' since ' + core.niceDate(w[0].date, ctx.today.slice(0, 4)) + (k === 2 ? ' (average of 2 readings at each end)' : '');
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
      if (ctx.days < MIN_DAYS || l.length < LIFT_MIN_SESSIONS) {
        var need = [];
        if (ctx.days < MIN_DAYS) need.push(plural(MIN_DAYS - ctx.days, 'day'));
        if (l.length < LIFT_MIN_SESSIONS) need.push(plural(LIFT_MIN_SESSIONS - l.length, 'session'));
        out.push(collecting('lift:' + name, label, need.join(' and ')));
        return;
      }
      // Best estimated 1RM of the first k sessions vs the last k (k = 3, or half when there are fewer than 6),
      // so one off day at either end doesn't read as strength gained or lost.
      var k = Math.min(3, Math.floor(l.length / 2)), best = function (xs) { return Math.max.apply(null, xs.map(function (x) { return x.e1rm; })); };
      var first = best(l.slice(0, k)), last = best(l.slice(-k)), pct = (last - first) / first * 100;
      var value = 'Estimated 1RM ' + fmtS(pct, 1) + '% since ' + core.niceDate(l[0].date, ctx.today.slice(0, 4)) + ' (best of ' + k + ' sessions at each end)';
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

  /**
   * "What should I do next week?" — one step, with its reasons, from the signals of read().
   * Checks the data before the body: with gaps in logging or weigh-ins, a slow scale can't be told apart
   * from untracked food, so it never suggests eating less on thin data. Changes it suggests are small
   * (100–250 kcal) and it points to the maintenance check, which updates maintenance from real data.
   * q: { loggedDays14 (days in the last 14 logged to ≥ 50% of target), weighIns14 (days weighed in the last 14),
   *      targetWeeklyPct?, manualTarget?,
   *      floorKcal?, targetKcal? (never suggest eating less when that would go under the floor),
   *      belowFloorDays7? (of the last 7 days, those logged under the floor), rate21Pct? (weight trend over 21 days) }
   * Safety first (audit C1/C2): 5+ of 7 days logged under the floor, or losing more than 1.5% a week for
   * 3 weeks, gives a "care" step: no deficit advice, a suggestion to talk to a dietitian or doctor.
   * Rules (coaching review, 2026-11-17): 10+ of 14 days logged and 8+ weigh-ins before any change; the
   * weight trend decides, the waist only supports (it never changes calories on its own); routine changes
   * are 100–150 kcal, 200–250 only when the data clearly supports it (off track, 12+ of 14 days logged).
   * Returns { kind, title, why: [advice], evidence?: [the numbers it rests on] } or null (nutrition phase). kind: wait | log-more | keep |
   * eat-more | eat-less | recovery | maintenance-check.
   */
  function nextStep(type, result, q) {
    if (type === 'nutrition') return null;
    q = q || {};
    var sigs = result.signals || [], by = function (id) { return sigs.filter(function (s) { return s.id === id; })[0]; };
    var w = by('weight'), waist = by('waist');
    var SUPPORT = 'If tracking is starting to feel stressful, the support link in Profile can help.';
    if (q.belowFloorDays7 != null && q.belowFloorDays7 >= 5) {
      return { kind: 'care', title: 'You\'ve been eating under your safety floor', why: [
        q.belowFloorDays7 + ' of the last 7 days were logged under ' + fmt(q.floorKcal) + ' kcal, the lowest target Leanward sets for you. Eating this little for long makes it harder to keep muscle, train well and feel good.',
        'If those days weren\'t fully logged, you can ignore this. If they were, aim for at least your target, and consider talking to a registered dietitian or your doctor. ' + SUPPORT] };
    }
    var lifts = sigs.filter(function (s) { return s.id.indexOf('lift:') === 0 && s.status !== 'collecting'; });
    var down = lifts.filter(function (s) { return s.status === 'off-track'; });
    var liftsHeld = lifts.length && !down.length;
    var waistDown = waist && waist.status !== 'collecting' && waist.changeCm <= -WAIST_NOISE_CM;
    var waistUp = waist && waist.status !== 'collecting' && waist.changeCm >= WAIST_NOISE_CM;
    var name = PHASE_NAMES[type];
    if (w && w.early) {
      return { kind: 'wait', title: 'Too early to judge the pace', why: ['Weight trend: ' + w.value + '. In the first weeks of a phase the trend lags behind, so a pace that looks slow often isn\'t. Hold steady; it can be judged from day ' + SLOW_JUDGE_DAYS + '.'] };
    }
    if (!w || w.status === 'collecting') {
      return { kind: 'wait', title: 'Too early to change anything', why: ['Keep logging and weighing in. ' + (w ? w.value.replace(/^Collecting data: /, 'Still needed: ') + '.' : '')] };
    }
    if (type !== 'bulk' && q.rate21Pct != null && q.rate21Pct < -1.5) {
      return { kind: 'care', title: 'You\'ve been losing weight quickly for 3 weeks', why: [
        'Your weight trend has fallen about ' + fmt(Math.abs(q.rate21Pct), 1) + '% of body weight a week over the last 21 days, faster than Leanward plans for anyone.',
        'Eat at least your target, and 100–250 kcal more if your energy, sleep or training are suffering. If you can\'t explain the loss (illness, a big change in activity), talk to your doctor. ' + SUPPORT] };
    }
    if (q.loggedDays14 != null && q.loggedDays14 < 10) {
      return { kind: 'log-more', title: 'More complete days will sharpen this', why: [
        'Your logs cover ' + q.loggedDays14 + ' of the last 14 days. More complete days make this advice more accurate: with gaps, a slow scale can\'t be told apart from food that wasn\'t logged.',
        'No change to your targets for now. Logging 10 of the next 14 days, oils and drinks included, is plenty.'] };
    }
    if (q.weighIns14 != null && q.weighIns14 < 8) {
      return { kind: 'weigh-more', title: 'A few more weigh-ins will sharpen this', why: [
        q.weighIns14 + ' weigh-ins in the last 14 days. Day-to-day water swings hide the trend; 8 or more (most mornings) make it reliable. No change to your targets for now.'] };
    }
    var clear = w.status === 'off-track' && (q.loggedDays14 == null || q.loggedDays14 >= 12);
    var size = clear ? '200–250' : '100–150';
    var notes = [w.label + ': ' + w.value + '.'];
    if (waist && waist.status !== 'collecting') notes.push('Waist: ' + waist.value + '.');
    lifts.forEach(function (l) { notes.push(l.label + ': ' + l.value.charAt(0).toLowerCase() + l.value.slice(1) + '.'); });
    var atFloor = q.floorKcal > 0 && q.targetKcal > 0 && q.targetKcal - 100 < q.floorKcal;
    var floorHold = function (lead) {
      return { kind: 'hold', title: 'Hold steady', evidence: notes, why: [lead + ' Your target (' + fmt(q.targetKcal) + ' kcal) is at your safety floor (' + fmt(q.floorKcal) + ' kcal), so Leanward won\'t suggest eating less.',
        'Keep logging carefully; the maintenance check will refine your maintenance. If progress stays slow for several more weeks, a registered dietitian can help you look at the whole picture.'] };
    };
    var keep = function (extra) { return { kind: 'keep', title: 'Keep your current targets', evidence: notes, why: (['This is consistent with a productive ' + name + '.' + (extra || '')]) }; };
    var recovery = function (lead) {
      return { kind: 'recovery', title: 'Look after recovery', evidence: notes, why: [lead].concat([down.map(function (l) { return l.label; }).join(' and ') + (down.length === 1 ? ' is' : ' are') + ' down more than expected. Check sleep, keep protein at target, and put more of your carbs around training. Eat ' + size + ' kcal more a day.']) };
    };

    if (type === 'cut' || type === 'bulk') {
      var a = w.actual, p = w.planned, sign = type === 'cut' ? -1 : 1;
      var fast = w.status !== 'on-track' && a * sign > p * sign, slow = w.status !== 'on-track' && !fast;
      var implied = q.targetWeeklyPct != null && Math.abs(q.targetWeeklyPct - p) >= 0.1
        ? ' Your current target' + (q.manualTarget ? ' (set by you)' : '') + ' works out to about ' + fmt(Math.abs(q.targetWeeklyPct), 1) + '% a week, so this pace is what it predicts. To go at the planned ' + fmt(Math.abs(p), 2).replace(/0$/, '') + '%, use Plan → Edit targets → Go back to calculated.' : '';
      if (type === 'cut') {
        if (fast) {
          if (down.length) return recovery('You\'re losing faster than planned.' + implied);
          return { kind: 'eat-more', title: 'Losing faster than planned', evidence: notes, why: (['Short stretches are fine, but losing quickly for weeks makes it harder to keep muscle. Consider ' + size + ' kcal more a day.' + implied]) };
        }
        if (slow) {
          if (waistDown) return keep(' The scale is slower than planned, but your waist is coming down: water and food weight often hide fat loss for a while. Hold steady for two more weeks.');
          // Only a clear stall (off track) justifies eating less; a mildly slow read is often weigh-in noise
          // (about 1 in 10 on-plan users with noisy weigh-ins, tests/sim.test.js).
          if (w.status !== 'off-track') return { kind: 'hold', title: 'A little slower than planned', evidence: notes, why: ['That\'s within the range weigh-in noise can cause, so hold steady and keep logging. If it\'s real, the maintenance check will pick it up from your 3-week numbers.'] };
          if (atFloor) return floorHold('Weight is falling slower than planned.');
          if (q.loggedDays14 == null || q.loggedDays14 >= 12) {
            return { kind: 'eat-less', title: 'Consider a small change', evidence: notes, why: ['Weight is falling slower than planned and your waist is flat, with consistent logging. Eat 100–150 kcal less a day, or accept the maintenance check\'s suggestion if it offers one (not both).'] };
          }
          return { kind: 'maintenance-check', title: 'Don\'t cut calories yet', evidence: notes, why: (['Weight is falling slower than planned. Before eating less, weigh foods rather than estimating them and log everything for two weeks.',
            'The maintenance check compares what you eat with your weight trend over 3 weeks; if your real maintenance is lower than the estimate, it will suggest a new number.']) };
        }
        if (down.length) return recovery('Weight is on plan.');
        return keep(liftsHeld ? ' Strength is holding, so there\'s no reason to cut calories further.' : ' There\'s no reason to cut calories further.');
      }
      if (fast) return { kind: 'eat-less', title: 'Gaining faster than planned', evidence: notes, why: (['Faster gain mostly adds fat. Consider ' + size + ' kcal less a day.' + implied]) };
      if (waist && waist.status === 'off-track') return { kind: 'hold', title: 'Hold, and re-measure your waist', evidence: notes, why: ['Weight is on plan but your waist is growing faster than expected. Tape measurements vary, so check it again next week (same spot, morning, relaxed) before changing calories.'] };
      if (slow) return { kind: 'eat-more', title: 'Gaining slower than planned', evidence: notes, why: (['Consider 100–150 kcal more a day, mostly from carbs around training, or accept the maintenance check\'s suggestion when it comes.']) };
      if (down.length) return recovery('Weight is on plan.');
      return keep(lifts.length && !down.length ? ' Strength is moving the right way.' : '');
    }
    if (type === 'recomp') {
      if (w.status !== 'on-track' && w.actual > 0 && waistUp && atFloor) return floorHold('Weight and waist are both rising.');
      if (w.status !== 'on-track' && w.actual > 0 && waistUp) return { kind: 'eat-less', title: 'Weight and waist are both rising', evidence: notes, why: (['A recomp aims for about flat weight. Consider 100–150 kcal less a day.']) };
      if (w.status !== 'on-track' && w.actual < 0) return { kind: 'eat-more', title: 'You\'re losing weight', evidence: notes, why: (['That\'s more like a slow cut than a recomp. Fine if that\'s what you want; otherwise eat 100–150 kcal more a day.']) };
      if (down.length) return recovery('Weight is about flat.');
      return keep(waistDown ? ' Waist down with weight flat is the recomp pattern.' : '');
    }
    if (type === 'maintenance') {
      if (w.status !== 'on-track') return { kind: 'maintenance-check', title: 'Weight is drifting', evidence: notes, why: (['Let the maintenance check (Plan tab) update your number from 3 weeks of data, or adjust by 100 kcal a day toward your phase-start weight.']) };
      return keep(' Nothing needs to change.');
    }
    return null;
  }

  var api = { MIN_DAYS: MIN_DAYS, MIN_WEIGHINS: MIN_WEIGHINS, MIN_ENTRIES: MIN_ENTRIES, WAIST_NOISE_CM: WAIST_NOISE_CM, LIFT_MIN_SESSIONS: LIFT_MIN_SESSIONS, read: read, nextStep: nextStep };
  if (node) module.exports = api;
  else { root.LW.calc.progress = api; }
})(this);
