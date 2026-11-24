/* Leanward — the planned-end hand-off (PRD PHS-6): when a phase is near its planned end, or the weight
 * trend has reached its goal weight, what to offer next. Pure: no screen code, no saving. The choice is
 * carried out by screens.js through the normal new-phase rules (model.startPhase), so the old phase is
 * kept and the floor and caps apply. Nothing switches on its own. */
(function (root) {
  'use strict';

  var core = (typeof module === 'object' && module.exports) ? require('./calc/core.js') : root.LW.calc.core;
  var SOON_DAYS = 7, BREAK_DAYS = 14, EXTEND_WEEKS = 4, MAX_CUT_WEEKS = 16, SNOOZE_DAYS = 7;

  /** A diet break: a 14-day maintenance phase under a fat-loss goal (no schema change). */
  function isDietBreak(phase, goalType) {
    return !!phase && phase.type === 'maintenance' && goalType === 'lose-fat' && !!phase.planned_end &&
      core.daysBetween(phase.start_date, phase.planned_end) + 1 === BREAK_DAYS;
  }

  /**
   * Is the hand-off due? o: { phase, goalType, today, trendKg, snooze: { phaseId, until } }.
   * Returns { due, reason: 'planned-end' | 'goal' | null, daysLeft, snoozed }.
   */
  function due(o) {
    var ph = o.phase, today = o.today;
    if (!ph) return { due: false, reason: null };
    var reason = null, daysLeft = null;
    var goal = ph.target_weight_kg != null ? Number(ph.target_weight_kg) : null, t = o.trendKg;
    if (goal && t != null && ((ph.type === 'cut' && t <= goal) || (ph.type === 'bulk' && t >= goal))) reason = 'goal';
    if (ph.planned_end) {
      daysLeft = core.daysBetween(today, ph.planned_end);
      if (!reason && daysLeft <= SOON_DAYS) reason = 'planned-end';
    }
    var sz = o.snooze, snoozed = !!(sz && sz.phaseId === ph.id && sz.until && today < sz.until);
    return { due: !!reason, reason: reason, daysLeft: daysLeft, snoozed: snoozed };
  }

  /**
   * The choices, suggested first. o: { phase, goalType, today, careStep (bool), lastCut (the cut before a
   * diet break, for "Back to your cut") }. Each: { id, label, why, phase (type to start) | extend (weeks),
   * goal (goal type for the new phase), rate, plannedDays, suggested }.
   */
  function options(o) {
    var ph = o.phase, out = [], weeksRun = Math.floor((core.daysBetween(ph.start_date, o.today) + 1) / 7);
    var maint = { id: 'maintenance', label: 'Maintenance', phase: 'maintenance', goal: 'maintain',
      why: 'Hold your new weight for at least 2–4 weeks; it makes the result easier to keep.' };
    var other = { id: 'other', label: 'Something else', why: 'Pick any phase, with the usual setup.' };
    if (isDietBreak(ph, o.goalType)) {
      var lc = o.lastCut;
      out.push({ id: 'resume', label: 'Back to your cut', phase: 'cut', goal: 'lose-fat', rate: lc && lc.rate != null ? Number(lc.rate) : null, suggested: true,
        why: 'Your 2-week break is over. Resume at ' + (lc && lc.rate != null ? Number(lc.rate) + '% a week' : 'the suggested rate') + '.' });
      out.push(Object.assign({}, maint, { why: 'Stop the cut here and hold this weight.' }));
      out.push(other);
      return out;
    }
    if (ph.type === 'cut') {
      out.push(Object.assign({ suggested: true }, maint));
      out.push({ id: 'break', label: 'Diet break', phase: 'maintenance', goal: 'lose-fat', plannedDays: BREAK_DAYS,
        why: '2 weeks at maintenance, then Leanward offers to resume the cut. A rest from dieting can make the next stretch easier.' });
      if (!o.careStep && weeksRun < MAX_CUT_WEEKS) {
        out.push({ id: 'extend', label: 'Keep cutting ' + EXTEND_WEEKS + ' more weeks', extend: EXTEND_WEEKS,
          why: 'Your cut has run ' + weeksRun + ' week' + (weeksRun === 1 ? '' : 's') + '. Same targets, new planned end.' });
      }
      out.push(other);
      return out;
    }
    if (ph.type === 'bulk') {
      out.push(Object.assign({ suggested: true }, maint, { why: 'Settle at your new weight before deciding what\'s next.' }));
      out.push({ id: 'extend', label: 'Keep going ' + EXTEND_WEEKS + ' more weeks', extend: EXTEND_WEEKS, why: 'Same targets, new planned end.' });
      out.push({ id: 'cut', label: 'Start a cut', phase: 'cut', goal: 'lose-fat', why: 'Trim the fat gained while building.' });
      out.push(other);
      return out;
    }
    // maintenance, recomp, nutrition with a planned end
    out.push({ id: 'extend', label: 'Keep going ' + EXTEND_WEEKS + ' more weeks', extend: EXTEND_WEEKS, suggested: true, why: 'Same targets, new planned end.' });
    out.push(other);
    return out;
  }

  /** The phase row after "keep going": the planned end moves out by `weeks` from today or the old end, whichever is later. */
  function extended(phase, weeks, today) {
    var base = phase.planned_end && phase.planned_end > today ? phase.planned_end : today;
    return Object.assign({}, phase, { planned_end: core.addDays(base, weeks * 7) });
  }
  /** The snooze kept in profile preferences after "Not now". */
  function snooze(phaseId, today) { return { phaseId: phaseId, until: core.addDays(today, SNOOZE_DAYS) }; }

  var api = { BREAK_DAYS: BREAK_DAYS, isDietBreak: isDietBreak, due: due, options: options, extended: extended, snooze: snooze };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.LW = root.LW || {};
  root.LW.phaseend = api;
})(this);
