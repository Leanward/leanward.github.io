/* Leanward — the maintenance check (M6b; PRD PRG-5, §8.6). Pure: no storage or DOM.
 *
 * Once there are 21 days with enough food logging and weigh-ins, compare what was eaten with how
 * the weight trend moved (calc/adaptive.js) and, if maintenance looks different from the one in use,
 * offer a corrected maintenance with the working. Nothing changes unless the user accepts.
 *
 * Decisions made here (PRD §8.10):
 * - A day counts as "fully logged" when its logged calories reach at least half of that day's
 *   calorie target (800 kcal when there is no target), so a day with only breakfast logged doesn't
 *   drag the average down.
 * - The window ends yesterday: today is still being logged.
 * - A difference under 50 kcal is treated as "matches": it is inside the noise of food labels.
 * - After a decision (accept or decline), the next suggestion waits 7 days ("recomputed weekly").
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var core = node ? require('./calc/core.js') : root.LW.calc.core;
  var adaptive = node ? require('./calc/adaptive.js') : root.LW.calc.adaptive;

  var MIN_SHARE_OF_TARGET = 0.5, MIN_KCAL_NO_TARGET = 800, MIN_DIFF_KCAL = 50, WAIT_DAYS = 7;

  function newId() { return root.LW && root.LW.model ? root.LW.model.newId() : (node ? require('crypto').randomUUID() : String(Math.random()).slice(2)); }
  function live(rows) { return (rows || []).filter(function (r) { return !r.deleted; }); }

  /** One row per day with food logged: { date, kcal, complete }. targetOn(date) → { kcal } or null. */
  function intakeDays(diary, targetOn, from, to) {
    var by = {};
    live(diary).forEach(function (e) { if (e.date >= from && e.date <= to) by[e.date] = (by[e.date] || 0) + (Number(e.kcal) || 0); });
    return Object.keys(by).sort().map(function (date) {
      var t = targetOn ? targetOn(date) : null;
      var need = t && t.kcal ? Number(t.kcal) * MIN_SHARE_OF_TARGET : MIN_KCAL_NO_TARGET;
      return { date: date, kcal: by[date], complete: by[date] >= need };
    });
  }

  /**
   * input: { today, diary, weights, targetOn(date), previousTdee, recommendations }
   * Returns one of:
   *   { state: 'unavailable', why }                     no maintenance in use to compare with
   *   { state: 'collecting', need: [...], logged, neededDays, weeks: [n, n, n] }
   *   { state: 'waiting', until, last }                 decided recently; next check date
   *   { state: 'matches', tdee, estimate }              within 50 kcal
   *   { state: 'proposed', from, to, estimate }         a suggestion, with estimate.steps as the working
   */
  function check(input) {
    var prev = Number(input.previousTdee);
    if (!(prev > 0)) return { state: 'unavailable', why: 'There is no maintenance estimate to compare with yet.' };
    var end = core.addDays(input.today, -1), start = core.addDays(end, -(adaptive.WINDOW_DAYS - 1));
    var days = intakeDays(input.diary, input.targetOn, start, end);
    var weights = live(input.weights).map(function (w) { return { date: w.date, kg: Number(w.kg), at: w.measured_at }; }).filter(function (w) { return w.date <= end; });
    var est = adaptive.estimate({ endDate: end, intake: days, weights: weights, previousTdee: prev });

    var logged = days.filter(function (d) { return d.complete; }).length, weeks = [0, 1, 2].map(function (wk) {
      var a = core.addDays(start, wk * 7), b = core.addDays(start, wk * 7 + 6), seen = {};
      weights.forEach(function (w) { if (w.date >= a && w.date <= b) seen[w.date] = 1; });
      return Object.keys(seen).length;
    });
    var base = { windowStart: start, windowEnd: end, logged: logged, neededDays: Math.ceil(adaptive.WINDOW_DAYS * 0.8), weeks: weeks, partialDays: days.length - logged };
    if (est.status === 'not-enough-data') return Object.assign({ state: 'collecting', need: est.reasons }, base);

    var last = live(input.recommendations).filter(function (r) { return r.type === 'maintenance-update' && r.decided_at; })
      .sort(function (a, b) { return a.decided_at < b.decided_at ? 1 : -1; })[0];
    if (last) {
      var until = core.addDays(String(last.decided_at).slice(0, 10), WAIT_DAYS);
      if (input.today < until) return Object.assign({ state: 'waiting', until: until, last: last }, base);
    }
    if (Math.abs(est.tdee - prev) < MIN_DIFF_KCAL) return Object.assign({ state: 'matches', tdee: prev, estimate: est }, base);
    return Object.assign({ state: 'proposed', from: prev, to: est.tdee, estimate: est }, base);
  }

  /** The record of a decision (lw_recommendations). status: 'accepted' | 'declined'. */
  function decisionRow(result, status, phaseId, nowIso) {
    return {
      id: newId(), phase_id: phaseId || null, type: 'maintenance-update',
      proposed: { from: result.from, to: result.to, windowStart: result.windowStart, windowEnd: result.windowEnd, calcVersion: core.CALC_VERSION },
      reasoning: result.estimate.steps.slice(0, 20), status: status, decided_at: nowIso
    };
  }

  var api = { MIN_SHARE_OF_TARGET: MIN_SHARE_OF_TARGET, MIN_DIFF_KCAL: MIN_DIFF_KCAL, WAIT_DAYS: WAIT_DAYS, intakeDays: intakeDays, check: check, decisionRow: decisionRow };
  if (node) module.exports = api;
  else { root.LW.maint = api; }
})(this);
