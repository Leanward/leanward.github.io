/* Leanward — the weekly check-in (PRD PRG-6): when it's due, the week in numbers, and the one outcome.
 * Pure: no screen code. The outcome comes from rules that already exist (the "Next week" step, PRG-4,
 * and the maintenance check, PRG-5); this module only decides what the check-in shows and when.
 * It never changes targets: only the user's accept of a maintenance suggestion does (screens.js). */
(function (root) {
  'use strict';

  var core = (typeof module === 'object' && module.exports) ? require('./calc/core.js') : root.LW.calc.core;
  var TYPE = 'weekly-checkin', FIRST_DAY = 7, OPEN_DAYS = 3, MIN_LOGGED = 4;

  function weekday(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }
  function live(xs) { return (xs || []).filter(function (x) { return x && !x.deleted; }); }

  /** The check-in weekday (0 = Sunday): the user's choice, or the weekday the phase started. */
  function dayFor(prefs, phase) {
    var d = prefs && prefs.checkinDay;
    if (d != null && d !== '' && Number(d) >= 0 && Number(d) <= 6) return Number(d);
    return weekday(phase.start_date);
  }

  /**
   * Is a check-in due today? { due, date (the check-in day it belongs to), next (the next check-in day) }.
   * First from day 7 of the phase; open on the check-in day and for 3 days after; once done, not again that week.
   */
  function due(o) {
    var ph = o.phase, today = o.today;
    if (!ph || !ph.start_date) return { due: false, date: null, next: null };
    var wd = dayFor(o.prefs, ph), first = core.addDays(ph.start_date, FIRST_DAY);
    while (weekday(first) !== wd) first = core.addDays(first, 1);
    if (today < first) return { due: false, date: null, next: first };
    var d = today;
    while (weekday(d) !== wd) d = core.addDays(d, -1);
    var done = live(o.recs).some(function (r) { return r.type === TYPE && r.proposed && r.proposed.date === d; });
    var open = core.daysBetween(d, today) <= OPEN_DAYS;
    return { due: open && !done, done: done, date: d, next: core.addDays(d, 7) };
  }

  /**
   * The week before the check-in day (7 days ending the day before): days logged (a day counts when it
   * reaches half its calorie target, as in the maintenance check), weigh-ins, and averages of logged days.
   */
  function week(o) {
    var end = core.addDays(o.date, -1), start = core.addDays(o.date, -7), byDay = {}, wd = {};
    live(o.diary).forEach(function (e) {
      if (e.date < start || e.date > end) return;
      var b = byDay[e.date] || (byDay[e.date] = { kcal: 0, protein: 0 });
      b.kcal += Number(e.kcal) || 0; b.protein += Number(e.protein_g) || 0;
    });
    live(o.weights).forEach(function (w) { if (w.date >= start && w.date <= end) wd[w.date] = 1; });
    var logged = [], tk = 0, tp = 0, nt = 0;
    Object.keys(byDay).sort().forEach(function (d) {
      var t = o.targetOn ? o.targetOn(d) : null, k = t && Number(t.kcal);
      if (t) { tk += Number(t.kcal) || 0; tp += Number(t.protein_g) || 0; nt++; }
      if (!k || byDay[d].kcal >= k / 2) logged.push(byDay[d]);
    });
    var avg = function (f) { return logged.length ? Math.round(logged.reduce(function (a, x) { return a + x[f]; }, 0) / logged.length) : null; };
    return { start: start, end: end, loggedDays: logged.length, weighIns: Object.keys(wd).length,
      avgKcal: avg('kcal'), avgProtein: avg('protein'),
      targetKcal: nt ? Math.round(tk / nt) : null, targetProtein: nt ? Math.round(tp / nt) : null };
  }

  /**
   * The one outcome, in plain words. answer: 'all' | 'most' | 'some'. step: the "Next week" step
   * (calc/progress.js nextStep) or null. maint: the maintenance check result or null.
   * Returns { kind: 'care' | 'hold' | 'maint' | 'change' | 'keep', title, text, offerMaint }.
   */
  function outcome(o) {
    var step = o.step, m = o.maint, wk = o.week || {};
    if (step && step.kind === 'care') return { kind: 'care', title: step.title, text: step.why[0], offerMaint: false };
    var thin = o.answer === 'some' || (wk.loggedDays || 0) < MIN_LOGGED;
    if (thin) {
      return { kind: 'hold', title: 'No change this week', offerMaint: false,
        text: o.answer === 'some' ? 'You logged only some of what you ate, so this week can\'t tell whether your targets fit. Keep your targets; a fuller week gives a clearer read.'
          : 'Only ' + (wk.loggedDays || 0) + ' day' + (wk.loggedDays === 1 ? '' : 's') + ' were logged, and a change needs at least ' + MIN_LOGGED + '. Keep your targets for now.' };
    }
    if (m && m.state === 'proposed') {
      return { kind: 'maint', title: 'Your maintenance looks like ' + m.to + ' kcal, not ' + m.from, offerMaint: true,
        text: 'Three weeks of your logging and weigh-ins suggest a small correction (' + (m.to > m.from ? '+' : '−') + Math.abs(m.to - m.from) + ' kcal). Nothing changes unless you accept.' };
    }
    if (step && (step.kind === 'eat-less' || step.kind === 'eat-more' || step.kind === 'recovery' || step.kind === 'maintenance-check')) {
      return { kind: 'change', title: step.title, text: step.why[0], offerMaint: false };
    }
    var why = step && step.why && step.why[0] ? step.why[0] : 'Keep logging and weighing in.';
    return { kind: 'keep', title: 'No change needed', text: step && step.kind === 'keep' ? 'Your trend fits your plan. ' + why : why, offerMaint: false };
  }

  /** The record kept for a completed check-in (lw_recommendations, no schema change; status 'accepted' = completed). */
  function record(o) {
    return { id: 'ci-' + o.date + '-' + String(o.phaseId || '').slice(0, 20), phase_id: o.phaseId || null, type: TYPE,
      proposed: { date: o.date, answer: o.answer, week: o.week, outcome: o.outcome.kind, title: o.outcome.title },
      reasoning: [o.outcome.text], status: 'accepted', decided_at: o.now };
  }
  /** Completed check-ins, newest first. */
  function history(recs) {
    return live(recs).filter(function (r) { return r.type === TYPE && r.proposed; }).sort(function (a, b) { return a.proposed.date < b.proposed.date ? 1 : -1; });
  }

  var api = { TYPE: TYPE, MIN_LOGGED: MIN_LOGGED, dayFor: dayFor, due: due, week: week, outcome: outcome, record: record, history: history };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.LW = root.LW || {};
  root.LW.checkin = api;
})(this);
