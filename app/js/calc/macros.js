/* Leanward calculation engine — protein, fat, carbohydrate and fiber targets (PRD §8.4).
 *
 * Protein is set per kg of reference weight: current weight, or for BMI > 30 the weight at BMI 27.5
 * for the user's height, so targets aren't inflated (Morton et al. 2018; Helms et al. 2014).
 * Fat defaults to 27% of calories with a floor of max(20% of calories, 0.5 g/kg).
 * Carbohydrate is what's left. If that's under 50 g, fat comes down toward its floor first; if it's
 * still under 50 g, the user is told the protein target is crowding out carbs.
 * Fiber is 14 g per 1,000 kcal (Dietary Guidelines for Americans / IOM).
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var core = node ? require('./core.js') : root.LW.calc.core;
  var fmt = core.fmt;

  var PROTEIN_G_PER_KG = { cut: 2.2, recomp: 2.0, bulk: 1.8, maintenance: 1.6, nutrition: 1.2 };
  var PROTEIN_RDA = 0.8;          // g/kg, the floor under every phase
  var OBESE_BMI = 30;
  var REFERENCE_BMI = 27.5;
  var FAT_DEFAULT = 0.27;         // share of calories
  var FAT_MIN_SHARE = 0.20;
  var FAT_MIN_G_PER_KG = 0.5;
  var CARB_MIN_G = 50;
  var FIBER_G_PER_1000 = 14;
  var KCAL = { protein: 4, carbs: 4, fat: 9, alcohol: 7 };

  /** Current weight, or the weight at BMI 27.5 when BMI is over 30. */
  function referenceWeight(kg, cm) {
    var b = core.bmi(kg, cm);
    if (b <= OBESE_BMI) return { kg: kg, adjusted: false, steps: [] };
    var ref = core.weightAtBmi(REFERENCE_BMI, cm);
    return {
      kg: ref, adjusted: true,
      steps: ['Reference weight: your BMI is ' + fmt(b, 1) + ', so protein uses the weight at BMI 27.5 for ' + fmt(cm) + ' cm: 27.5 × (' + fmt(cm / 100, 2) + ' m)² = ' + fmt(ref, 1) + ' kg']
    };
  }

  /**
   * Macro and fiber targets for a calorie target.
   * p: { phase, kcal, kg, cm }
   * Returns grams (whole numbers), the fat floor, % of calories, flags and the working.
   */
  function macroTargets(p) {
    var perKg = PROTEIN_G_PER_KG[p.phase];
    if (perKg == null) throw new Error('Unknown phase: ' + p.phase);
    core.checkPositive('calories', p.kcal); core.checkPositive('weight', p.kg); core.checkPositive('height', p.cm);
    var ref = referenceWeight(p.kg, p.cm), steps = ref.steps.slice(), flags = [];

    var protein = core.round(Math.max(perKg, PROTEIN_RDA) * ref.kg);
    steps.push('Protein: ' + fmt(perKg, 1) + ' g per kg × ' + fmt(ref.kg, 1) + ' kg' + (ref.adjusted ? ' (reference weight)' : '') + ' = ' + protein + ' g');

    var fatFloor = core.round(Math.max(FAT_MIN_SHARE * p.kcal / 9, FAT_MIN_G_PER_KG * p.kg));
    var fat = Math.max(core.round(FAT_DEFAULT * p.kcal / 9), fatFloor);
    var fatDefault = fat;
    var carbs = (p.kcal - protein * 4 - fat * 9) / 4;

    if (carbs < CARB_MIN_G) {
      // Lower fat just enough to bring carbs to 50 g, but not below the fat floor.
      var need = Math.ceil((CARB_MIN_G - carbs) * 4 / 9);
      fat = Math.max(fatFloor, fat - need);
      carbs = (p.kcal - protein * 4 - fat * 9) / 4;
      if (fat < fatDefault) flags.push('fat-lowered');
      if (carbs < CARB_MIN_G) flags.push('protein-crowds-carbs');
    }
    carbs = Math.max(0, core.round(carbs));
    var fiber = core.round(FIBER_G_PER_1000 * p.kcal / 1000);

    var fat27 = core.round(FAT_DEFAULT * p.kcal / 9);
    if (fat < fatDefault) steps.push('Fat: lowered from ' + fatDefault + ' g to ' + fat + ' g so carbs can stay near 50 g');
    else if (fat > fat27) steps.push('Fat: 27% of ' + fmt(p.kcal) + ' kcal would be ' + fat27 + ' g, raised to the fat floor of ' + fat + ' g');
    else steps.push('Fat: 27% of ' + fmt(p.kcal) + ' kcal ÷ 9 = ' + fat + ' g');
    steps.push('Fat floor: ' + fatFloor + ' g, the higher of 20% of calories and 0.5 g per kg');
    steps.push('Carbs (the rest): (' + fmt(p.kcal) + ' − ' + protein + ' × 4 − ' + fat + ' × 9) ÷ 4 = ' + carbs + ' g');
    steps.push('Fiber: 14 g per 1,000 kcal × ' + fmt(p.kcal) + ' kcal = ' + fiber + ' g');
    if (flags.indexOf('protein-crowds-carbs') >= 0) {
      steps.push('Your protein target leaves less than 50 g of carbs at this calorie level. You can lower protein a little or raise calories if you\'d like more carbs.');
    }

    return {
      proteinG: protein, fatG: fat, carbsG: carbs, fiberG: fiber, fatFloorG: fatFloor,
      referenceKg: ref.kg, referenceAdjusted: ref.adjusted, proteinPerKg: perKg,
      split: split(p.kcal, protein, fat, carbs), flags: flags, steps: steps, calcVersion: core.CALC_VERSION
    };
  }

  /** % of calories from each macro, using 4 / 4 / 9 kcal per gram. */
  function split(kcal, proteinG, fatG, carbsG) {
    return {
      proteinPct: proteinG * KCAL.protein / kcal * 100,
      fatPct: fatG * KCAL.fat / kcal * 100,
      carbsPct: carbsG * KCAL.carbs / kcal * 100
    };
  }

  /**
   * Warnings for a macro split the user typed in (§8.4: warn, don't block).
   * p: { kcal, proteinG, fatG, kg, cm }
   */
  function checkManualMacros(p) {
    var ref = referenceWeight(p.kg, p.cm), warnings = [];
    var minProtein = PROTEIN_RDA * ref.kg;
    if (p.proteinG < minProtein) warnings.push({ id: 'protein-below-rda', message: 'Protein is below 0.8 g per kg (' + fmt(minProtein) + ' g for you), the minimum most adults need.' });
    var fatPct = p.fatG * 9 / p.kcal * 100;
    if (fatPct < FAT_MIN_SHARE * 100) warnings.push({ id: 'fat-below-20pct', message: 'Fat is ' + fmt(fatPct) + '% of calories. Below 20% can make it hard to get essential fats and absorb some vitamins.' });
    var carbs = (p.kcal - p.proteinG * 4 - p.fatG * 9) / 4;
    if (carbs < 0) warnings.push({ id: 'over-calories', message: 'Protein and fat alone add up to more than ' + fmt(p.kcal) + ' kcal.' });
    return { carbsG: Math.max(0, core.round(carbs)), warnings: warnings };
  }

  /**
   * The protein amount that counts as "enough" for the day: 1.6 g per kg of reference weight, where the
   * benefit for muscle levels off in the evidence (Morton et al. 2018), but never above the target.
   * The target stays the aim; this keeps a day at 170 of 190 g from reading as a miss.
   */
  var PROTEIN_ENOUGH_G_PER_KG = 1.6;
  function proteinEnough(targetG, kg, cm) {
    if (!(targetG > 0)) return null;
    if (!(kg > 0) || !(cm > 0)) return targetG;
    return Math.min(targetG, core.round(PROTEIN_ENOUGH_G_PER_KG * referenceWeight(kg, cm).kg));
  }

  var api = {
    PROTEIN_ENOUGH_G_PER_KG: PROTEIN_ENOUGH_G_PER_KG, proteinEnough: proteinEnough,
    PROTEIN_G_PER_KG: PROTEIN_G_PER_KG, PROTEIN_RDA: PROTEIN_RDA, KCAL: KCAL, FIBER_G_PER_1000: FIBER_G_PER_1000,
    referenceWeight: referenceWeight, macroTargets: macroTargets, split: split, checkManualMacros: checkManualMacros
  };
  if (node) module.exports = api;
  else { root.LW.calc.macros = api; }
})(this);
