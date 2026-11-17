/* Leanward calculation engine — adaptive maintenance estimate (PRD §8.6; used in Phase 2, built now
 * so the data shapes are proven).
 *
 *   TDEE_est = mean(daily intake) − (Δ trend kg × 7,700) ÷ days, over a 21-day window.
 *
 * Only windows with ≥ 80% of days fully logged and ≥ 4 weigh-ins in each week are used; otherwise
 * the answer is "not enough data" and the previous estimate stays. The new value is blended with the
 * previous one (70% new, 30% previous) and the change is capped at ±150 kcal a week. The result is a
 * Recommendation: targets change only if the user accepts it.
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var core = node ? require('./core.js') : root.LW.calc.core;
  var trend = node ? require('./trend.js') : root.LW.calc.trend;
  var targets = node ? require('./targets.js') : root.LW.calc.targets;
  var fmt = core.fmt;

  var WINDOW_DAYS = 21;
  var MIN_LOGGED_SHARE = 0.8;
  var MIN_WEIGHINS_PER_WEEK = 4;
  var BLEND_NEW = 0.7;
  var MAX_CHANGE_KCAL = 150;

  /**
   * input: {
   *   endDate: 'YYYY-MM-DD',
   *   intake: [{ date, kcal, complete: true|false }],   // one row per logged day
   *   weights: [{ date, kg, at? }],                      // all weigh-ins (earlier ones seed the trend)
   *   previousTdee: number,
   *   units?: 'us' | 'metric'                            // the working's units; the maths is always in kg
   * }
   */
  function estimate(input) {
    var end = input.endDate, start = core.addDays(end, -(WINDOW_DAYS - 1));
    var prev = input.previousTdee;
    core.checkPositive('previous maintenance', prev);
    var reasons = [];

    var complete = (input.intake || []).filter(function (d) { return d.complete && d.date >= start && d.date <= end; });
    var needDays = Math.ceil(WINDOW_DAYS * MIN_LOGGED_SHARE);   // 17 of 21
    if (complete.length < needDays) reasons.push(complete.length + ' of 21 days fully logged (needs ' + needDays + ')');

    var daily = trend.dailyWeights((input.weights || []).filter(function (w) { return w.date >= start && w.date <= end; }));
    var minWeek = Infinity;
    for (var wk = 0; wk < 3; wk++) {
      var a = core.addDays(start, wk * 7), b = core.addDays(start, wk * 7 + 6);
      var n = daily.filter(function (d) { return d.date >= a && d.date <= b; }).length;
      minWeek = Math.min(minWeek, n);
      if (n < MIN_WEIGHINS_PER_WEEK) reasons.push('week ' + (wk + 1) + ' has ' + n + ' weigh-in' + (n === 1 ? '' : 's') + ' (needs 4)');
    }

    if (reasons.length) {
      return {
        status: 'not-enough-data', tdee: prev, reasons: reasons,
        steps: ['Not enough data to update maintenance this week: ' + reasons.join('; ') + '. Keeping ' + fmt(prev) + ' kcal.']
      };
    }

    var series = trend.trendSeries(input.weights, { endDate: end });
    var at = function (d) { var r = series.filter(function (x) { return x.date <= d; }); return r[r.length - 1].trendKg; };
    var t0 = at(start), t1 = at(end), days = core.daysBetween(start, end);   // 20 days of change between the two trend points
    var dKg = t1 - t0;
    var meanIntake = complete.reduce(function (s, d) { return s + d.kcal; }, 0) / complete.length;
    var raw = meanIntake - dKg * targets.KCAL_PER_KG / days;
    var blended = BLEND_NEW * raw + (1 - BLEND_NEW) * prev;
    var change = Math.max(-MAX_CHANGE_KCAL, Math.min(MAX_CHANGE_KCAL, blended - prev));
    var next = core.round(prev + change);

    // The working in the user's units: 7,700 kcal per kg is 3,493 kcal per lb.
    var us = input.units === 'us', wu = us ? 'lb' : 'kg', w = function (kg) { return us ? core.kgToLb(kg) : kg; };
    var perUnit = us ? fmt(targets.KCAL_PER_KG * core.KG_PER_LB) : fmt(targets.KCAL_PER_KG);
    var steps = [
      'Average intake on ' + complete.length + ' fully logged days: ' + fmt(meanIntake) + ' kcal',
      'Trend weight ' + start + ' → ' + end + ': ' + fmt(w(t0), us ? 1 : 2) + ' → ' + fmt(w(t1), us ? 1 : 2) + ' ' + wu + ' (' + core.fmtSigned(w(dKg), 2) + ' ' + wu + ')',
      'Estimated maintenance: ' + fmt(meanIntake) + ' − (' + core.fmtSigned(w(dKg), 2) + ' ' + wu + ' × ' + perUnit + ' ÷ ' + days + ' days) = ' + fmt(raw) + ' kcal',
      'Blended 70% new, 30% previous (' + fmt(prev) + '): ' + fmt(blended) + ' kcal'
    ];
    if (Math.abs(blended - prev) > MAX_CHANGE_KCAL) steps.push('Change limited to ' + MAX_CHANGE_KCAL + ' kcal a week');
    // How much to trust it (reviewed 2026-11-17). Three weeks is the minimum, not proof. High needs all of:
    // 18+ of 21 days logged, 5+ weigh-ins every week, steady logging (daily intake varying by under 35%:
    // big swings usually mean missed foods on some days), and steady weigh-ins (scatter around the trend
    // under 1 kg: bigger swings are water from sodium, carbs, travel or illness). Otherwise Moderate.
    var kcals = complete.map(function (d) { return d.kcal; }), sd = function (xs, m) { return Math.sqrt(xs.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) / xs.length); };
    var intakeCv = sd(kcals, meanIntake) / meanIntake;
    var resid = daily.map(function (d) { return d.kg - at(d.date); }), noiseKg = sd(resid, resid.reduce(function (a, x) { return a + x; }, 0) / resid.length);
    var why = [];
    if (complete.length < 18) why.push(complete.length + ' of 21 days logged (18+ for high)');
    if (minWeek < 5) why.push('a week with ' + minWeek + ' weigh-ins (5+ for high)');
    if (intakeCv > 0.35) why.push('daily intake varies a lot (by ' + Math.round(intakeCv * 100) + '%), which often means missed foods on some days');
    if (noiseKg > 1.0) why.push('weigh-ins swing a lot around the trend (about ' + fmt(us ? core.kgToLb(noiseKg) : noiseKg, 1) + ' ' + (us ? 'lb' : 'kg') + '): water from sodium, carbs, travel or illness');
    var confidence = why.length ? 'moderate' : 'high';
    var cautions = [];
    if (raw < prev * 0.8) cautions.push('This estimate is more than 20% below your previous maintenance. That can be real, but it\'s often food that wasn\'t logged (oils, drinks, bites, weekends). If you\'re not sure your logs were complete, keep your targets and log carefully for another week.');
    steps.push('Suggested maintenance: ' + fmt(next) + ' kcal (' + core.fmtSigned(next - prev) + ' kcal). Your targets change only if you accept this.');

    return {
      status: next === prev ? 'no-change' : 'proposed',
      tdee: next, previousTdee: prev, rawTdee: raw, meanIntake: meanIntake, trendChangeKg: dKg, windowStart: start, windowEnd: end,
      confidence: confidence, confidenceWhy: why, intakeCv: intakeCv, noiseKg: noiseKg, cautions: cautions, loggedDays: complete.length, minWeighInsPerWeek: minWeek,
      recommendation: next === prev ? null : { type: 'maintenance-update', from: prev, to: next, calcVersion: core.CALC_VERSION, reasoning: steps.slice() },
      steps: steps
    };
  }

  var api = { WINDOW_DAYS: WINDOW_DAYS, BLEND_NEW: BLEND_NEW, MAX_CHANGE_KCAL: MAX_CHANGE_KCAL, estimate: estimate };
  if (node) module.exports = api;
  else { root.LW.calc.adaptive = api; }
})(this);
