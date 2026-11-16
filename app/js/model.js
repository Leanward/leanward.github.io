/* Leanward — goals, phases and target sets as records for the synced tables (M3, PRD §4, §11, PHS-*).
 *
 * Pure: turns onboarding answers into rows, finds the current phase and targets, starts a new phase
 * (closing the old one, PHS-2), and saves edited targets as a new version effective from a date
 * (PHS-5). Every number comes from js/calc; nothing here calculates on its own.
 * Storage and sync happen elsewhere (js/db.js, js/sync.js).
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var calc = node ? {
    core: require('./calc/core.js'), targets: require('./calc/targets.js'), macros: require('./calc/macros.js'), plan: require('./calc/plan.js')
  } : root.LW.calc;

  // Goal → suggested phase (PRD §4 [Proposed], as in the prototype). Any phase can be picked for any goal.
  var GOALS = [
    { id: 'lose-fat', label: 'Lose fat', phase: 'cut', desc: 'Lower body fat, keep muscle' },
    { id: 'build-muscle', label: 'Build muscle', phase: 'bulk', desc: 'Gain muscle with as little fat as possible' },
    { id: 'recomp', label: 'Recomp', phase: 'recomp', desc: 'Lose fat and build muscle at about the same weight' },
    { id: 'maintain', label: 'Maintain', phase: 'maintenance', desc: 'Hold your weight steady' },
    { id: 'nutrition', label: 'Improve nutrition', phase: 'nutrition', desc: 'No weight goal. Eat better: fiber, vitamins, minerals' }
  ];
  // Planned length used for "day 23 of ~84" (prototype defaults); open-ended phases have none.
  var PLANNED_WEEKS = { cut: 12, recomp: 12, bulk: 16, maintenance: null, nutrition: null };
  var SAFE_GOALS_PREGNANT = ['maintain', 'nutrition'];

  function goalById(id) { for (var i = 0; i < GOALS.length; i++) if (GOALS[i].id === id) return GOALS[i]; throw new Error('Unknown goal: ' + id); }

  function newId() {
    var c = root.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    var b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /** Which goals can be picked (the same rules as phases, §8.2). */
  function goalOptions(profile, energy) {
    var opts = calc.targets.phaseOptions({ kg: profile.kg, cm: profile.cm, sex: profile.sex, bmr: energy.bmr, tdee: energy.tdee, pregnantOrBreastfeeding: profile.pregnantOrBreastfeeding });
    return GOALS.map(function (g) {
      var available = profile.pregnantOrBreastfeeding ? SAFE_GOALS_PREGNANT.indexOf(g.id) >= 0 : !(g.id === 'lose-fat' && !opts.cut.available);
      return { id: g.id, label: g.label, desc: g.desc, phase: g.phase, available: available, message: available ? '' : (profile.pregnantOrBreastfeeding ? 'While pregnant or breastfeeding, Leanward only offers maintenance and nutrition goals. Check your targets with your clinician.' : opts.cut.message) };
    });
  }

  /**
   * The targets for a choice, before saving. `manual` = { kcal?, proteinG?, fatG? } the user typed.
   * Returns the plan (calculated), the final numbers (manual edits applied, calories held at the floor),
   * and warnings for the edits (§8.4: warn, don't block).
   */
  function preview(profile, choice, today, manual) {
    var p = calc.plan.plan(profile, choice, today);
    var calcd = { kcal: p.calories.kcal, proteinG: p.macros.proteinG, fatG: p.macros.fatG, carbsG: p.macros.carbsG, fiberG: p.macros.fiberG };
    var m = manual || {};
    var edited = m.kcal != null || m.proteinG != null || m.fatG != null;
    if (!edited) return { plan: p, final: calcd, origin: 'calculated', warnings: [] };
    var kc = calc.targets.manualCalories(m.kcal != null ? m.kcal : calcd.kcal, p.calories.floor);
    var prot = m.proteinG != null ? Math.round(m.proteinG) : calcd.proteinG;
    var fat = m.fatG != null ? Math.round(m.fatG) : calcd.fatG;
    var chk = calc.macros.checkManualMacros({ kcal: kc.kcal, proteinG: prot, fatG: fat, kg: profile.kg, cm: profile.cm });
    var warnings = (kc.raisedToFloor ? [{ id: 'below-floor', message: kc.message }] : []).concat(chk.warnings);
    if (chk.carbsG < 50 && !chk.warnings.some(function (w) { return w.id === 'over-calories'; })) warnings.push({ id: 'carbs-under-50', message: 'Carbs would fall under 50 g.' });
    var final = { kcal: kc.kcal, proteinG: prot, fatG: fat, carbsG: chk.carbsG, fiberG: calc.core.round(14 * kc.kcal / 1000) };
    var same = final.kcal === calcd.kcal && final.proteinG === calcd.proteinG && final.fatG === calcd.fatG;
    return { plan: p, final: same ? calcd : final, origin: same ? 'calculated' : 'manual', warnings: warnings };
  }

  function targetSetRow(phaseId, effectiveFrom, pv, profile, choice, now) {
    return {
      // created_at orders two versions that start on the same day, before the server has stamped them.
      id: newId(), created_at: now || undefined, phase_id: phaseId, effective_from: effectiveFrom,
      kcal: pv.final.kcal, protein_g: pv.final.proteinG, carbs_g: pv.final.carbsG, fat_g: pv.final.fatG, fiber_g: pv.final.fiberG,
      micronutrients: {}, origin: pv.origin, calc_version: pv.plan.calcVersion,
      calc_inputs: {
        // What the numbers were worked out from, so they can be explained later (ONB-7, §11).
        kg: profile.kg, cm: profile.cm, age: pv.plan.age, sex: profile.sex, activity: profile.activity,
        bodyFatPct: profile.bodyFatPct == null ? null : profile.bodyFatPct, useBodyFat: !!profile.useBodyFat,
        pregnantOrBreastfeeding: !!profile.pregnantOrBreastfeeding, phase: choice.phase, rate: pv.plan.calories.rate,
        energySource: pv.plan.energySource, knownTdee: profile.knownTdee == null ? null : profile.knownTdee, knownBmr: profile.knownBmr == null ? null : profile.knownBmr,
        tdee: pv.plan.tdee, formulaTdee: pv.plan.formulaTdee,
        calculated: { kcal: pv.plan.calories.kcal, proteinG: pv.plan.macros.proteinG, carbsG: pv.plan.macros.carbsG, fatG: pv.plan.macros.fatG, fiberG: pv.plan.macros.fiberG },
        floor: pv.plan.calories.floor, expectedWeeklyPct: pv.plan.calories.expectedWeeklyPct, steps: pv.plan.steps
      }
    };
  }

  function phaseRow(goalId, choice, pv, today, id) {
    var weeks = PLANNED_WEEKS[choice.phase];
    return {
      id: id || newId(), goal_id: goalId, type: choice.phase, start_date: today, end_date: null,
      planned_end: weeks ? calc.core.addDays(today, weeks * 7 - 1) : null,
      target_weight_kg: null, rate: pv.plan.calories.rate == null ? null : pv.plan.calories.rate, calc_version: pv.plan.calcVersion
    };
  }

  /**
   * Everything onboarding saves (ONB-2…7, ONB-9).
   * a: { units, dob, sex, cm, kg, activity, trainingPerWeek, pregnantOrBreastfeeding, bodyFatPct?, bodyFatSource?,
   *      useBodyFat?, waistCm?, goal, phase, rate?, manual?, foodPrefs?: [] }
   * Returns { rows: [[table, record], …], preview }.
   */
  function setup(a, today, nowIso) {
    var profile = profileOf(a);
    var choice = { phase: a.phase, rate: a.rate };
    var pv = preview(profile, choice, today, a.manual);
    var goal = { id: newId(), type: a.goal, started_on: today, ended_on: null };
    var phase = phaseRow(goal.id, choice, pv, today);
    var rows = [
      ['lw_profiles', Object.assign(knownColumns(a), {
        id: 'me', dob: a.dob, sex: a.sex, height_cm: calc.core.round(a.cm, 0.1), units: a.units, activity: a.activity,
        training_per_week: a.trainingPerWeek == null ? null : a.trainingPerWeek,
        body_fat_pct: a.bodyFatPct == null ? null : a.bodyFatPct, body_fat_source: a.bodyFatPct == null ? null : (a.bodyFatSource || 'guess'),
        use_body_fat: !!a.useBodyFat, pregnant_or_breastfeeding: !!a.pregnantOrBreastfeeding,
        preferences: { foodPrefs: a.foodPrefs || [] }
      })],
      ['lw_weights', { id: newId(), measured_at: nowIso, date: today, kg: calc.core.round(a.kg, 0.01), source: 'manual', note: null }],
      ['lw_goals', goal],
      ['lw_phases', phase],
      ['lw_target_sets', targetSetRow(phase.id, today, pv, profile, choice, nowIso)]
    ];
    if (a.waistCm != null) rows.push(['lw_measurements', { id: newId(), date: today, site: 'waist', cm: calc.core.round(a.waistCm, 0.1), method: null }]);
    if (a.bodyFatPct != null) rows.push(['lw_body_fat', { id: newId(), date: today, pct: a.bodyFatPct, method: a.bodyFatSource || 'guess' }]);
    return { rows: rows, preview: pv };
  }

  /** A calc profile from the onboarding answers or saved rows. */
  function profileOf(a) {
    return {
      dob: a.dob, sex: a.sex, kg: a.kg, cm: a.cm, activity: a.activity,
      bodyFatPct: a.bodyFatPct == null ? undefined : a.bodyFatPct,
      useBodyFat: !!(a.useBodyFat && a.bodyFatPct != null && a.bodyFatSource && a.bodyFatSource !== 'guess'),
      pregnantOrBreastfeeding: !!a.pregnantOrBreastfeeding,
      // ONB-10: at most one of these is used (a known maintenance wins over a measured BMR).
      knownTdee: a.knownTdee == null ? undefined : a.knownTdee, knownTdeeSource: a.knownTdee == null ? undefined : a.knownTdeeSource,
      knownBmr: a.knownTdee != null || a.knownBmr == null ? undefined : a.knownBmr, knownBmrSource: a.knownTdee != null || a.knownBmr == null ? undefined : a.knownBmrSource
    };
  }
  /** The ONB-10 columns for the profile row. */
  function knownColumns(a) {
    var tdee = a.knownTdee != null, bmr = !tdee && a.knownBmr != null;
    return {
      known_tdee_kcal: tdee ? Math.round(a.knownTdee) : null, known_tdee_source: tdee ? (a.knownTdeeSource || 'other') : null,
      known_bmr_kcal: bmr ? Math.round(a.knownBmr) : null, known_bmr_source: bmr ? (a.knownBmrSource || 'other') : null
    };
  }
  /** The same from saved rows: the profile plus the latest weigh-in. */
  function profileFromRows(prof, weights) {
    var w = latest(weights, 'measured_at');
    return profileOf({
      dob: prof.dob, sex: prof.sex, cm: Number(prof.height_cm), kg: w ? Number(w.kg) : null, activity: prof.activity,
      bodyFatPct: prof.body_fat_pct == null ? null : Number(prof.body_fat_pct), bodyFatSource: prof.body_fat_source,
      useBodyFat: prof.use_body_fat, pregnantOrBreastfeeding: prof.pregnant_or_breastfeeding,
      knownTdee: prof.known_tdee_kcal == null ? null : Number(prof.known_tdee_kcal), knownTdeeSource: prof.known_tdee_source,
      knownBmr: prof.known_bmr_kcal == null ? null : Number(prof.known_bmr_kcal), knownBmrSource: prof.known_bmr_source
    });
  }
  function latest(list, key) { return (list || []).filter(function (x) { return !x.deleted; }).sort(function (x, y) { return x[key] < y[key] ? 1 : -1; })[0]; }

  /**
   * Edited profile details (date of birth, sex, height, activity, pregnant or breastfeeding), checked.
   * d: { dob, sex, cm, activity, pregnantOrBreastfeeding }. Returns the profile columns to save.
   */
  function detailsRow(d, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.dob || '')) || d.dob > today) throw new Error('Enter your date of birth.');
    var age = calc.core.ageOn(d.dob, today);
    if (age < 18) throw new Error('Leanward is for adults 18 and over.');
    if (age > 110) throw new Error('Check the year of your date of birth.');
    if (calc.core.SEXES.indexOf(d.sex) < 0) throw new Error('Choose the sex used for the calorie formula.');
    var cm = Number(d.cm);
    if (!(cm >= 120 && cm <= 230)) throw new Error('Check your height.');
    calc.energy.activityById(d.activity);
    return { dob: d.dob, sex: d.sex, height_cm: calc.core.round(cm, 0.1), activity: d.activity, pregnant_or_breastfeeding: d.sex === 'male' ? false : !!d.pregnantOrBreastfeeding };
  }

  /** The active phase: not deleted, no end date; the newest if somehow there are several. */
  function currentPhase(phases) {
    return (phases || []).filter(function (p) { return !p.deleted && !p.end_date; }).sort(function (x, y) { return x.start_date < y.start_date ? 1 : x.start_date > y.start_date ? -1 : (x.created_at < y.created_at ? 1 : -1); })[0] || null;
  }
  /**
   * An optional goal weight for the current phase (ONB-2, PHS-1), in kg, checked: a plausible weight,
   * in the direction the phase moves, and never below a BMI of 18.5 for the person's height.
   * o: { value (user's units), units, cm, phaseType, currentKg }. Returns kg, or null to clear it.
   */
  function goalWeightKg(o) {
    if (o.value === '' || o.value == null) return null;
    if (o.phaseType === 'nutrition') throw new Error('A nutrition phase has no weight goal.');
    var v = Number(o.value), kg = o.units === 'metric' ? v : calc.core.lbToKg(v);
    if (!(kg >= 30 && kg <= 300)) throw new Error('Check the goal weight.');
    var floor = o.cm ? calc.core.weightAtBmi(18.5, o.cm) : null;
    if (floor && kg < floor) {
      var f = o.units === 'metric' ? calc.core.fmt(floor, 1) + ' kg' : calc.core.fmt(calc.core.kgToLb(floor), 0) + ' lb';
      throw new Error('That\'s below the healthy range for your height (BMI 18.5, about ' + f + '). Leanward doesn\'t set goals under it.');
    }
    if (o.currentKg && o.phaseType === 'cut' && kg > o.currentKg) throw new Error('A cut\'s goal weight is below your current weight.');
    if (o.currentKg && o.phaseType === 'bulk' && kg < o.currentKg) throw new Error('A lean bulk\'s goal weight is above your current weight.');
    return calc.core.round(kg, 0.1);
  }
  /** Weeks to the goal at the current trend rate, or null when it isn't moving toward it (or there's no rate yet). */
  function weeksToGoal(goalKg, trendKg, kgPerWeek) {
    if (goalKg == null || trendKg == null || !kgPerWeek) return null;
    var left = goalKg - trendKg;
    if (Math.abs(left) < 0.2) return 0;
    if (left * kgPerWeek <= 0 || Math.abs(kgPerWeek) < 0.05) return null;
    var w = left / kgPerWeek;
    return w > 104 ? null : Math.ceil(w);
  }

  /**
   * The phase in effect on a date. Today's is always the current phase (the same one the Phase tab
   * shows); for earlier days, the phase that covered the day, newest first, with the same tie-break
   * as currentPhase so two phases that start on the same day never give different answers.
   */
  function phaseOn(phases, date, today) {
    var cur = currentPhase(phases);
    if (cur && (date === today || date >= cur.start_date)) return cur;
    return (phases || []).filter(function (p) { return !p.deleted && p.start_date <= date && (!p.end_date || p.end_date >= date); })
      .sort(function (x, y) { return x.start_date < y.start_date ? 1 : x.start_date > y.start_date ? -1 : (x.created_at < y.created_at ? 1 : -1); })[0] || null;
  }
  /** The targets for a day: that day's phase and its target set; today falls back to the phase's first set, as the Phase tab does. */
  function targetsFor(phases, sets, date, today) {
    var ph = phaseOn(phases, date, today);
    if (!ph) return null;
    return targetsOn(sets, ph.id, date) || (date === today
      ? (sets || []).filter(function (s) { return s.phase_id === ph.id && !s.deleted; }).sort(function (x, y) { return x.effective_from < y.effective_from ? -1 : 1; })[0] || null : null);
  }
  /** The phase's target set in effect on a date: the latest effective_from on or before it. */
  function targetsOn(sets, phaseId, date) {
    return (sets || []).filter(function (s) { return !s.deleted && s.phase_id === phaseId && s.effective_from <= date; })
      .sort(function (x, y) { return x.effective_from < y.effective_from ? 1 : x.effective_from > y.effective_from ? -1 : (x.created_at < y.created_at ? 1 : -1); })[0] || null;
  }
  /** "Day 23 of ~84", "Day 5". */
  function dayOf(phase, today) {
    var d = calc.core.daysBetween(phase.start_date, today) + 1;
    var total = phase.planned_end ? calc.core.daysBetween(phase.start_date, phase.planned_end) + 1 : null;
    return { day: d, total: total, label: total ? 'Day ' + d + ' of ~' + total : 'Day ' + d };
  }

  /**
   * Start a new phase today (PHS-2, PHS-3): the old phase ends yesterday (or today if it started today),
   * and if the goal changed, the old goal ends too. Nothing is deleted.
   */
  function startPhase(o) {
    var today = o.today, rows = [];
    var choice = { phase: o.phase, rate: o.rate };
    var pv = preview(o.profile, choice, today, o.manual);
    var goalId = o.currentGoal && o.currentGoal.type === o.goal ? o.currentGoal.id : null;
    if (o.currentPhase) {
      var end = o.currentPhase.start_date >= today ? today : calc.core.addDays(today, -1);
      rows.push(['lw_phases', Object.assign({}, o.currentPhase, { end_date: end })]);
    }
    if (!goalId) {
      if (o.currentGoal) rows.push(['lw_goals', Object.assign({}, o.currentGoal, { ended_on: o.currentGoal.started_on >= today ? today : calc.core.addDays(today, -1) })]);
      var g = { id: newId(), type: o.goal, started_on: today, ended_on: null };
      goalId = g.id; rows.push(['lw_goals', g]);
    }
    var phase = phaseRow(goalId, choice, pv, today);
    // The numbers the user entered (or cleared) on the targets step are saved with the profile.
    rows.unshift(['lw_profiles', Object.assign({ id: 'me' }, knownColumns(o.profile))]);
    rows.push(['lw_phases', phase]);
    rows.push(['lw_target_sets', targetSetRow(phase.id, today, pv, o.profile, choice, o.now)]);
    return { rows: rows, preview: pv, phase: phase };
  }

  /**
   * New targets mid-phase (PHS-5): a new version from `from` (today or tomorrow). Past days keep theirs.
   * manual = { kcal, proteinG, fatG } or null to go back to the calculated numbers. now: ISO time (orders same-day versions).
   */
  function editTargets(o) {
    var choice = { phase: o.phase.type, rate: o.phase.rate == null ? undefined : Number(o.phase.rate) };
    var pv = preview(o.profile, choice, o.from, o.manual);
    return { rows: [['lw_target_sets', targetSetRow(o.phase.id, o.from, pv, o.profile, choice, o.now)]], preview: pv };
  }

  var api = {
    GOALS: GOALS, PLANNED_WEEKS: PLANNED_WEEKS, goalById: goalById, newId: newId, goalOptions: goalOptions, preview: preview, setup: setup,
    profileOf: profileOf, profileFromRows: profileFromRows, knownColumns: knownColumns, detailsRow: detailsRow, goalWeightKg: goalWeightKg, weeksToGoal: weeksToGoal, currentPhase: currentPhase, phaseOn: phaseOn, targetsFor: targetsFor, targetsOn: targetsOn, dayOf: dayOf,
    startPhase: startPhase, editTargets: editTargets
  };
  if (node) module.exports = api;
  else { root.LW.model = api; }
})(this);
