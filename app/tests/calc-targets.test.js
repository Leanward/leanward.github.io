/* M1 calculation engine: safety floors and caps (PRD §8.2) and phase calorie targets (§8.3).
 * Every expected value is worked by hand in the comment next to it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/calc/targets.js');

// Alex: male, 31, 180 cm, 80 kg, moderately active → BMR 1775, maintenance 2751 (see calc-energy tests).
const alex = { kg: 80, cm: 180, sex: 'male', bmr: 1775, tdee: 2751 };
// Maya: female, 34, 165 cm, 70 kg, lightly active → BMR 1400, maintenance 1400 × 1.375 = 1925.
const maya = { kg: 70, cm: 165, sex: 'female', bmr: 1400, tdee: 1925 };
// Sam: prefer not to say, 38, 172 cm, 95 kg, sedentary → BMR 1757, maintenance 1757 × 1.2 = 2108.4 → 2108.
const sam = { kg: 95, cm: 172, sex: 'unspecified', bmr: 1757, tdee: 2108 };

const close = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test('floor: the higher of BMR and 1,200 (female) / 1,500 kcal (male or unspecified)', () => {
  assert.equal(T.floor({ sex: 'female', bmr: 1100 }).kcal, 1200);
  assert.equal(T.floor({ sex: 'female', bmr: 1400 }).kcal, 1400);
  assert.equal(T.floor({ sex: 'male', bmr: 1450 }).kcal, 1500);
  assert.equal(T.floor({ sex: 'unspecified', bmr: 1450 }).kcal, 1500);
});

test('cut 0.5%: Alex', () => {
  // deficit = 0.5% × 80 × 7700 ÷ 7 = 440; 2751 − 440 = 2311 → 2310
  // weekly = (2310 − 2751) × 7 ÷ 7700 = −0.4009 kg = −0.501% of 80 kg
  const r = T.calorieTarget(Object.assign({ phase: 'cut', rate: 0.5 }, alex));
  assert.equal(r.kcal, 2310);
  assert.deepEqual(r.limitedBy, []);
  close(r.expectedWeeklyKg, -0.4009);
  close(r.expectedWeeklyPct, -0.5011);
  assert.ok(r.steps.includes('Before rounding: 2,751 − 440 = 2,311 kcal'));
  assert.equal(r.calcVersion, '1.0.0');
});

test('cut defaults to 0.5% when no rate is given', () => {
  assert.equal(T.calorieTarget(Object.assign({ phase: 'cut' }, alex)).rate, 0.5);
});

test('cut 1.0%: Maya hits the 25% deficit cap', () => {
  // deficit = 1% × 70 × 7700 ÷ 7 = 770; cap = 25% × 1925 = 481.25; 1925 − 481.25 = 1443.75 → 1440
  // floor = max(1400, 1200) = 1400, so 1440 stands. weekly = −485 × 7 ÷ 7700 = −0.4409 kg (−0.630%)
  const r = T.calorieTarget(Object.assign({ phase: 'cut', rate: 1.0 }, maya));
  assert.equal(r.kcal, 1440);
  assert.deepEqual(r.limitedBy, ['deficit-cap']);
  close(r.expectedWeeklyKg, -0.4409);
  close(r.expectedWeeklyPct, -0.6299);
});

test('cut 0.75%: Sam is capped, then raised to the floor, and told to expect slower loss', () => {
  // deficit = 0.75% × 95 × 7700 ÷ 7 = 783.75; cap = 25% × 2108 = 527; 2108 − 527 = 1581
  // floor = max(1757, 1500) = 1757 > 1581 → raised, rounded up to 1760
  // weekly = −348 × 7 ÷ 7700 = −0.3164 kg
  const r = T.calorieTarget(Object.assign({ phase: 'cut', rate: 0.75 }, sam));
  assert.equal(r.kcal, 1760);
  assert.deepEqual(r.limitedBy, ['deficit-cap', 'floor']);
  close(r.expectedWeeklyKg, -0.3164);
  assert.ok(r.steps.some((s) => /below your safety floor of 1,757 kcal.*slower loss/.test(s)));
  assert.ok(r.kcal >= r.floor);
});

test('every cut rate stays at or above the floor and within the 25% cap', () => {
  [alex, maya, sam].forEach((p) => T.PHASES.cut.rates.forEach((rate) => {
    const r = T.calorieTarget(Object.assign({ phase: 'cut', rate }, p));
    assert.ok(r.kcal >= r.floor, `floor ${p.sex} ${rate}`);
    assert.ok(r.kcal >= p.tdee * 0.75 - 5, `cap ${p.sex} ${rate}`);   // −5 allows rounding to 10
    assert.ok(r.kcal < p.tdee);
  }));
});

test('rate caps: nothing faster than 1.0%/wk loss or 0.5%/wk gain is accepted', () => {
  assert.throws(() => T.calorieTarget(Object.assign({ phase: 'cut', rate: 1.5 }, alex)), /rate must be one of/);
  assert.throws(() => T.calorieTarget(Object.assign({ phase: 'bulk', rate: 1.0 }, alex)), /rate must be one of/);
  assert.equal(Math.max(...T.PHASES.cut.rates), 1.0);
  assert.equal(Math.max(...T.PHASES.bulk.rates), 0.5);
});

test('recomp: maintenance by default, −5% and −10% options', () => {
  // 2751 → 2750
  assert.equal(T.calorieTarget(Object.assign({ phase: 'recomp' }, alex)).kcal, 2750);
  // 2751 × 0.95 = 2613.45 → 2610
  assert.equal(T.calorieTarget(Object.assign({ phase: 'recomp', rate: 5 }, alex)).kcal, 2610);
  // 2751 × 0.90 = 2475.9 → 2480; weekly = (2480 − 2751) × 7 ÷ 7700 = −0.2464 kg
  const r = T.calorieTarget(Object.assign({ phase: 'recomp', rate: 10 }, alex));
  assert.equal(r.kcal, 2480);
  close(r.expectedWeeklyKg, -0.2464);
});

test('recomp −10% is still held at the floor', () => {
  // Sam: 2108 × 0.9 = 1897.2 → 1900, above the 1757 floor
  assert.equal(T.calorieTarget(Object.assign({ phase: 'recomp', rate: 10 }, sam)).kcal, 1900);
  // A low-maintenance person: BMR 1300, maintenance 1430 (×1.1 for the test); 1430 × 0.9 = 1287 → 1290 < 1300 → 1300
  const r = T.calorieTarget({ phase: 'recomp', rate: 10, kg: 60, sex: 'female', bmr: 1300, tdee: 1430 });
  assert.equal(r.kcal, 1300);
  assert.deepEqual(r.limitedBy, ['floor']);
});

test('lean bulk: 0.25% default, 0.5% hits the +15% cap', () => {
  // 0.25% × 80 × 7700 ÷ 7 = 220; 2751 + 220 = 2971 → 2970; weekly = 219 × 7 ÷ 7700 = +0.1991 kg
  const d = T.calorieTarget(Object.assign({ phase: 'bulk' }, alex));
  assert.equal(d.rate, 0.25);
  assert.equal(d.kcal, 2970);
  close(d.expectedWeeklyKg, 0.1991);
  // 0.5% → 440, cap = 15% × 2751 = 412.65; 2751 + 412.65 = 3163.65 → 3160
  const r = T.calorieTarget(Object.assign({ phase: 'bulk', rate: 0.5 }, alex));
  assert.equal(r.kcal, 3160);
  assert.deepEqual(r.limitedBy, ['surplus-cap']);
});

test('maintenance: a ±100 kcal band; nutrition optimization: no weight-change language', () => {
  // 1925 → 1930; band 1830–2030
  const m = T.calorieTarget(Object.assign({ phase: 'maintenance' }, maya));
  assert.equal(m.kcal, 1930);
  assert.deepEqual(m.band, { low: 1830, high: 2030 });
  const n = T.calorieTarget(Object.assign({ phase: 'nutrition' }, maya));
  assert.equal(n.kcal, 1930);
  assert.equal(n.label, 'Estimated energy needs');
  assert.equal(n.expectedWeeklyKg, null);
  assert.ok(n.steps.every((s) => !/deficit|surplus|lose|loss|gain/i.test(s)), 'PHS-7');
});

test('the maintenance band never dips below the floor', () => {
  // BMR 1250, maintenance 1300 (female): floor 1250; 1300 − 100 = 1200 → band starts at 1250
  const m = T.calorieTarget({ phase: 'maintenance', kg: 50, sex: 'female', bmr: 1250, tdee: 1300 });
  assert.equal(m.band.low, 1250);
});

test('underweight guard: no Cut below BMI 18.5, and no goal weight below it', () => {
  // 50 kg at 170 cm: BMI 50 ÷ 1.7² = 17.3
  const o = T.phaseOptions({ kg: 50, cm: 170, sex: 'female', bmr: 1230, tdee: 1690 });
  assert.equal(o.cut.available, false);
  assert.equal(o.cut.reason, 'underweight');
  assert.equal(o.recomp.available, true);
  assert.throws(() => T.calorieTarget({ phase: 'cut', rate: 0.5, kg: 50, cm: 170, sex: 'female', bmr: 1230, tdee: 1690 }), /BMI under 18.5/);
  // Exactly 18.5 is allowed: 18.5 × 1.7² = 53.465 kg
  assert.equal(T.phaseOptions({ kg: 53.465, cm: 170, sex: 'female', bmr: 1260, tdee: 1730 }).cut.available, true);
  // Goal weight: 52 kg at 170 cm is BMI 18.0 → refused; lowest accepted is 53.5 kg
  const g = T.checkGoalWeight(52, 170);
  assert.equal(g.ok, false);
  close(g.minKg, 53.465);
  assert.equal(T.checkGoalWeight(60, 170).ok, true);
});

test('no Cut when the floor is at or above maintenance', () => {
  // Female, 70, 150 cm, 45 kg, sedentary: BMR 450 + 937.5 − 350 − 161 = 876.5 → 877; × 1.2 = 1052.4 → 1052
  // floor = max(877, 1200) = 1200 ≥ 1052 → a cut can't be set safely
  const o = T.phaseOptions({ kg: 45, cm: 150, sex: 'female', bmr: 877, tdee: 1052 });
  assert.equal(o.cut.available, false);
  assert.equal(o.cut.reason, 'no-safe-deficit');
});

test('pregnancy or breastfeeding: only Maintenance and Nutrition optimization', () => {
  const o = T.phaseOptions(Object.assign({ pregnantOrBreastfeeding: true }, maya));
  assert.deepEqual(Object.keys(o).filter((k) => o[k].available), ['maintenance', 'nutrition']);
  assert.equal(o.cut.reason, 'pregnancy');
});

test('manual calorie edits can go below the calculated target but not below the floor', () => {
  assert.deepEqual(T.manualCalories(2000, 1775), { kcal: 2000, raisedToFloor: false });
  const r = T.manualCalories(1500, 1757);
  assert.equal(r.kcal, 1760);
  assert.equal(r.raisedToFloor, true);
  assert.match(r.message, /safety floor of 1,757 kcal/);
});

test('a typed-in target shows the pace it really implies (owner review, 2026-11-17)', () => {
  const T = require('../js/calc/targets.js');
  // 194.4 lb = 88.18 kg; maintenance 2,854; target 1,900:
  // (1,900 − 2,854) × 7 ÷ 7,700 = −0.867 kg a week = −0.98% of body weight; 954 ÷ 2,854 = 33.4% below maintenance
  const r = T.pace(1900, 2854, 88.18);
  assert.ok(Math.abs(r.weeklyKg + 0.8673) < 1e-3); assert.ok(Math.abs(r.weeklyPct + 0.9835) < 1e-3); assert.ok(Math.abs(r.pctOfTdee + 33.43) < 0.01);
  const w = T.paceWarnings(1900, 2854, 88.18);
  assert.deepEqual(w.map((x) => x.id), ['deficit-over-cap']);
  assert.match(w[0].message, /33% below maintenance.*about 1\.0% of body weight a week/);
  // the calculated 0.5% target is 2,854 − 0.5% × 88.18 × 7,700 ÷ 7 (= 485) = 2,369 → no warning
  assert.deepEqual(T.paceWarnings(2370, 2854, 88.18), []);
  // 1.2%/wk on a small deficit share: 80 kg, maintenance 4,000, 3,100 kcal → −0.82 kg = −1.02%/wk, 22.5% below
  assert.deepEqual(T.paceWarnings(3100, 4000, 80).map((x) => x.id), ['loss-over-cap']);
  assert.deepEqual(T.paceWarnings(3500, 2800, 80).map((x) => x.id), ['surplus-over-cap']);
  assert.deepEqual(T.paceWarnings(2800, 2854, 0), []);
});
