/* Leanward calculation engine — safety floors and caps (PRD §8.2) and phase calorie targets (§8.3).
 *
 * Energy-density assumption: 7,700 kcal per kg of body-weight change (≈ 3,500 kcal per lb). It's a
 * known simplification (Hall et al. 2011); the Phase 2 adaptive model corrects it from real data.
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var core = node ? require('./core.js') : root.LW.calc.core;
  var fmt = core.fmt;

  var KCAL_PER_KG = 7700;
  var MIN_KCAL = { female: 1200, male: 1500, unspecified: 1500 };
  var DEFICIT_CAP = 0.25;      // at most 25% below maintenance
  var SURPLUS_CAP = 0.15;      // lean bulk at most 15% above maintenance
  var UNDERWEIGHT_BMI = 18.5;
  var BAND_KCAL = 100;         // maintenance is shown as ±100 kcal

  // Rates are % of body weight per week (Cut, Lean bulk) or % below maintenance (Recomp).
  // The top options are the rate caps in §8.2 (loss ≤ 1.0%/wk, gain ≤ 0.5%/wk): nothing faster is offered.
  var PHASES = {
    cut: { label: 'Cut', rates: [0.25, 0.5, 0.75, 1.0], defaultRate: 0.5, rateUnit: '% of body weight a week' },
    recomp: { label: 'Recomp', rates: [0, 5, 10], defaultRate: 0, rateUnit: '% below maintenance' },
    bulk: { label: 'Lean bulk', rates: [0.1, 0.25, 0.5], defaultRate: 0.25, rateUnit: '% of body weight a week' },
    maintenance: { label: 'Maintenance', rates: [], defaultRate: null },
    nutrition: { label: 'Nutrition optimization', rates: [], defaultRate: null }
  };

  /** The lowest daily target Leanward will set: the higher of BMR and 1,200 (female) / 1,500 kcal. */
  function floor(p) {
    core.checkSex(p.sex);
    var min = MIN_KCAL[p.sex];
    var kcal = Math.max(p.bmr, min);
    return {
      kcal: kcal,
      steps: ['Safety floor: never below ' + fmt(kcal) + ' kcal, the higher of your BMR (' + fmt(p.bmr) + ') and ' + fmt(min) + ' kcal']
    };
  }

  /**
   * Which phases can be offered, and why any are not (§8.2).
   * p: { kg, cm, sex, bmr, tdee, pregnantOrBreastfeeding? }
   */
  function phaseOptions(p) {
    var b = core.bmi(p.kg, p.cm), fl = floor(p).kcal, out = {};
    Object.keys(PHASES).forEach(function (id) { out[id] = { available: true, reason: '' }; });
    if (p.pregnantOrBreastfeeding) {
      ['cut', 'recomp', 'bulk'].forEach(function (id) {
        out[id] = { available: false, reason: 'pregnancy', message: 'While pregnant or breastfeeding, Leanward only offers Maintenance or Nutrition optimization. Talk to your clinician about your needs.' };
      });
      return out;
    }
    if (b < UNDERWEIGHT_BMI) {
      out.cut = { available: false, reason: 'underweight', message: 'A cut isn\'t offered at a BMI under 18.5 (yours is ' + fmt(b, 1) + '). If you want to lose weight, please talk to a clinician first.' };
    } else if (fl >= p.tdee) {
      out.cut = { available: false, reason: 'no-safe-deficit', message: 'Your maintenance (' + fmt(p.tdee) + ' kcal) is at or below the safety floor (' + fmt(fl) + ' kcal), so a cut can\'t be set safely. Maintenance or a recomp is a better fit.' };
    }
    return out;
  }

  /** A goal weight that would mean a BMI under 18.5 isn't accepted (§8.2). */
  function checkGoalWeight(goalKg, cm) {
    var b = core.bmi(goalKg, cm);
    if (b >= UNDERWEIGHT_BMI) return { ok: true, bmi: b };
    var min = core.weightAtBmi(UNDERWEIGHT_BMI, cm);
    return { ok: false, bmi: b, minKg: min, message: 'That goal is a BMI of ' + fmt(b, 1) + ', below the healthy range (18.5). The lowest goal Leanward accepts for your height is ' + fmt(min, 1) + ' kg. A clinician can help if you want to go lower.' };
  }

  function weeklyChangeKg(tdee, kcal) { return (kcal - tdee) * 7 / KCAL_PER_KG; }

  /**
   * The pace a calorie target implies: kg and % of body weight a week (negative = loss), and how far
   * it sits from maintenance in %. Used to show what a typed-in target really means (§8.4).
   */
  function pace(kcal, tdee, kg) {
    var wk = weeklyChangeKg(tdee, kcal);
    return { weeklyKg: wk, weeklyPct: wk / kg * 100, pctOfTdee: (kcal - tdee) / tdee * 100 };
  }
  /** Warnings (not blocks) for a typed-in target faster than the caps in §8.2. */
  function paceWarnings(kcal, tdee, kg) {
    if (!(tdee > 0) || !(kg > 0) || !(kcal > 0)) return [];
    var r = pace(kcal, tdee, kg), out = [], at = ' At ' + fmt(kcal) + ' kcal against a maintenance of ' + fmt(tdee) + ', expect about ' + fmt(Math.abs(r.weeklyPct), 1) + '% of body weight a week.';
    if (r.pctOfTdee < -25) out.push({ id: 'deficit-over-cap', message: 'That\'s ' + fmt(-r.pctOfTdee) + '% below maintenance, deeper than the 25% Leanward plans at most.' + at });
    else if (r.weeklyPct < -1.0) out.push({ id: 'loss-over-cap', message: 'That\'s faster than the 1% of body weight a week Leanward plans at most.' + at });
    if (r.pctOfTdee > 15) out.push({ id: 'surplus-over-cap', message: 'That\'s ' + fmt(r.pctOfTdee) + '% above maintenance, more than the 15% Leanward plans at most.' + at });
    else if (r.weeklyPct > 0.5) out.push({ id: 'gain-over-cap', message: 'That\'s faster than the 0.5% of body weight a week Leanward plans at most for a lean bulk.' + at });
    return out;
  }

  /**
   * The daily calorie target for a phase.
   * p: { phase, rate?, kg, sex, bmr, tdee, pregnantOrBreastfeeding?, cm? }
   * Returns { kcal, floor, expectedWeeklyKg, expectedWeeklyPct, limitedBy: [...], band?, label, steps }.
   * kcal is rounded to the nearest 10 and never below the floor.
   */
  function calorieTarget(p) {
    var ph = PHASES[p.phase];
    if (!ph) throw new Error('Unknown phase: ' + p.phase);
    var rate = p.rate == null ? ph.defaultRate : p.rate;
    if (ph.rates.length && ph.rates.indexOf(rate) < 0) throw new Error(ph.label + ' rate must be one of ' + ph.rates.join(', '));
    if (p.cm) {
      var opt = phaseOptions(p)[p.phase];
      if (!opt.available) throw new Error(opt.message);
    }
    var tdee = p.tdee, fl = floor(p), steps = [], limitedBy = [], raw;

    if (p.phase === 'cut') {
      var deficit = rate / 100 * p.kg * KCAL_PER_KG / 7;
      steps.push('Deficit for ' + rate + '% a week: ' + rate + '% × ' + fmt(p.kg, 1) + ' kg × 7,700 kcal ÷ 7 days = ' + fmt(deficit) + ' kcal a day');
      var cap = tdee * DEFICIT_CAP;
      if (deficit > cap) {
        deficit = cap; limitedBy.push('deficit-cap');
        steps.push('Capped at 25% below maintenance: ' + fmt(cap) + ' kcal a day');
      }
      raw = tdee - deficit;
    } else if (p.phase === 'recomp') {
      raw = tdee * (1 - rate / 100);
      if (rate) steps.push('Recomp ' + rate + '% below maintenance: ' + fmt(tdee) + ' × (1 − ' + rate + '%) = ' + fmt(raw) + ' kcal');
    } else if (p.phase === 'bulk') {
      var surplus = rate / 100 * p.kg * KCAL_PER_KG / 7;
      steps.push('Surplus for ' + rate + '% a week: ' + rate + '% × ' + fmt(p.kg, 1) + ' kg × 7,700 kcal ÷ 7 days = ' + fmt(surplus) + ' kcal a day');
      var scap = tdee * SURPLUS_CAP;
      if (surplus > scap) {
        surplus = scap; limitedBy.push('surplus-cap');
        steps.push('Capped at 15% above maintenance: ' + fmt(scap) + ' kcal a day');
      }
      raw = tdee + surplus;
    } else {
      raw = tdee;
    }

    var kcal = core.round(raw, 10), floorHit = kcal < fl.kcal;
    if (floorHit) { kcal = core.ceilTo(fl.kcal, 10); limitedBy.push('floor'); }

    var wk = weeklyChangeKg(tdee, kcal);
    var res = {
      phase: p.phase, rate: rate, kcal: kcal, floor: fl.kcal, tdee: tdee, limitedBy: limitedBy,
      expectedWeeklyKg: (p.phase === 'nutrition') ? null : wk,
      expectedWeeklyPct: (p.phase === 'nutrition') ? null : wk / p.kg * 100,
      label: p.phase === 'nutrition' ? 'Estimated energy needs' : 'Daily calorie target',
      calcVersion: core.CALC_VERSION
    };

    var changes = p.phase === 'cut' || p.phase === 'bulk' || (p.phase === 'recomp' && rate);
    if (p.phase === 'cut') steps.push('Before rounding: ' + fmt(tdee) + ' − ' + fmt(tdee - raw) + ' = ' + fmt(raw) + ' kcal');
    else if (p.phase === 'bulk') steps.push('Before rounding: ' + fmt(tdee) + ' + ' + fmt(raw - tdee) + ' = ' + fmt(raw) + ' kcal');
    if (floorHit) {
      steps.push('That\'s below your safety floor of ' + fmt(fl.kcal) + ' kcal, so the target is raised to it' + (p.phase === 'cut' ? '. Expect slower loss than you chose' : ''));
    }
    if (changes || floorHit) {
      steps.push('Target: ' + fmt(kcal) + ' kcal a day (rounded ' + (floorHit ? 'up ' : '') + 'to the nearest 10)');
    } else if (p.phase === 'nutrition') {
      steps.push('Estimated energy needs: ' + fmt(kcal) + ' kcal a day (maintenance, rounded to the nearest 10; no weight-change target)');
    } else {
      steps.push('Target: maintenance, ' + fmt(kcal) + ' kcal a day (rounded to the nearest 10)');
    }
    if (p.phase === 'maintenance') {
      res.band = { low: Math.max(kcal - BAND_KCAL, core.ceilTo(fl.kcal, 10)), high: kcal + BAND_KCAL };
      steps.push('Anywhere from ' + fmt(res.band.low) + ' to ' + fmt(res.band.high) + ' kcal counts as on target');
    }
    steps.push(fl.steps[0]);
    if (changes || floorHit) {
      steps.push('Expected change: about ' + core.fmtSigned(wk, 2) + ' kg a week (' + core.fmtSigned(res.expectedWeeklyPct, 2) + '% of body weight), using 7,700 kcal per kg');
    }
    res.steps = steps;
    return res;
  }

  /**
   * A calorie target the user typed in. It may be below the calculated target but never below the floor.
   * Returns { kcal, raisedToFloor, message? }.
   */
  function manualCalories(requested, floorKcal) {
    core.checkPositive('calories', requested);
    if (requested >= floorKcal) return { kcal: core.round(requested), raisedToFloor: false };
    var k = core.ceilTo(floorKcal, 10);
    return { kcal: k, raisedToFloor: true, message: 'That\'s below your safety floor of ' + fmt(floorKcal) + ' kcal, so Leanward will use ' + fmt(k) + '.' };
  }

  var api = {
    KCAL_PER_KG: KCAL_PER_KG, MIN_KCAL: MIN_KCAL, DEFICIT_CAP: DEFICIT_CAP, SURPLUS_CAP: SURPLUS_CAP, UNDERWEIGHT_BMI: UNDERWEIGHT_BMI, PHASES: PHASES,
    floor: floor, phaseOptions: phaseOptions, checkGoalWeight: checkGoalWeight, pace: pace, paceWarnings: paceWarnings, calorieTarget: calorieTarget, manualCalories: manualCalories
  };
  if (node) module.exports = api;
  else { root.LW.calc.targets = api; }
})(this);
