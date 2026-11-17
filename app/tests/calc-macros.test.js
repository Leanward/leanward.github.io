/* M1 calculation engine: protein, fat, carbohydrate and fiber (PRD §8.4).
 * Every expected value is worked by hand in the comment next to it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/calc/macros.js');

test('Alex on a 2,310 kcal cut', () => {
  // protein 2.2 × 80 = 176 g; fat 27% × 2310 ÷ 9 = 69.3 → 69 g; floor max(20% × 2310 ÷ 9 = 51.3, 0.5 × 80 = 40) → 51 g
  // carbs (2310 − 176×4 − 69×9) ÷ 4 = (2310 − 704 − 621) ÷ 4 = 246.25 → 246 g; fiber 14 × 2.31 = 32.3 → 32 g
  const r = M.macroTargets({ phase: 'cut', kcal: 2310, kg: 80, cm: 180 });
  assert.deepEqual([r.proteinG, r.fatG, r.carbsG, r.fiberG, r.fatFloorG], [176, 69, 246, 32, 51]);
  assert.deepEqual(r.flags, []);
  assert.equal(r.referenceAdjusted, false);
  assert.ok(r.steps.includes('Carbs (the rest): (2,310 − 176 × 4 − 69 × 9) ÷ 4 = 246 g'));
  // split: 704 / 2310 = 30.5%, 621 / 2310 = 26.9%, 984 / 2310 = 42.6%
  assert.ok(Math.abs(r.split.proteinPct - 30.48) < 0.01);
});

test('protein per kg for each phase', () => {
  const g = (phase) => M.macroTargets({ phase, kcal: 2500, kg: 80, cm: 180 }).proteinG;
  assert.deepEqual(['cut', 'recomp', 'bulk', 'maintenance', 'nutrition'].map(g), [176, 160, 144, 128, 96]);
});

test('BMI over 30 uses the weight at BMI 27.5 for protein', () => {
  // Sam: 95 kg, 172 cm → BMI 32.1; reference = 27.5 × 1.72² = 81.356 kg; 2.2 × 81.356 = 178.98 → 179 g
  const r = M.macroTargets({ phase: 'cut', kcal: 1760, kg: 95, cm: 172 });
  assert.equal(r.proteinG, 179);
  assert.equal(r.referenceAdjusted, true);
  // Fat floor uses current weight: max(20% × 1760 ÷ 9 = 39.1, 0.5 × 95 = 47.5) → 48; 27% = 52.8 → 53
  assert.equal(r.fatFloorG, 48);
  assert.equal(r.fatG, 53);
  // carbs (1760 − 716 − 477) ÷ 4 = 141.75 → 142
  assert.equal(r.carbsG, 142);
  assert.match(r.steps[0], /BMI is 32\.1.*27\.5 × \(1\.72 m\)² = 81\.4 kg/);
});

test('BMI of exactly 30 is not adjusted', () => {
  // 30 × 1.8² = 97.2 kg
  assert.equal(M.referenceWeight(97.2, 180).adjusted, false);
  assert.equal(M.referenceWeight(97.3, 180).adjusted, true);
});

test('fat is raised to its floor when 0.5 g/kg is more than 27% of calories', () => {
  // 100 kg, 1500 kcal: 27% = 45 g; floor max(33.3, 50) = 50 → fat 50
  const r = M.macroTargets({ phase: 'maintenance', kcal: 1500, kg: 100, cm: 190 });
  assert.equal(r.fatG, 50);
  assert.ok(r.steps.some((s) => /raised to the fat floor of 50 g/.test(s)));
});

test('carbs under 50 g: fat comes down only as far as needed', () => {
  // 50 kg, 170 cm, cut, 870 kcal (low on purpose to test the rule)
  // protein 110 g (440 kcal); fat 27% = 26.1 → 26 g; floor max(19.3, 25) = 25
  // carbs (870 − 440 − 234) ÷ 4 = 49 < 50 → lower fat by ceil(1 × 4 ÷ 9) = 1 g → 25 g
  // carbs (870 − 440 − 225) ÷ 4 = 51.25 → 51 g
  const r = M.macroTargets({ phase: 'cut', kcal: 870, kg: 50, cm: 170 });
  assert.equal(r.fatG, 25);
  assert.equal(r.carbsG, 51);
  assert.deepEqual(r.flags, ['fat-lowered']);
});

test('carbs still under 50 g at the fat floor: the protein-crowds-carbs message', () => {
  // 850 kcal: fat 27% = 25.5 → 26; carbs (850 − 440 − 234) ÷ 4 = 44 → need ceil(6 × 4 ÷ 9) = 3 g → floor 25
  // carbs (850 − 440 − 225) ÷ 4 = 46.25 → 46 g, still < 50
  const r = M.macroTargets({ phase: 'cut', kcal: 850, kg: 50, cm: 170 });
  assert.equal(r.fatG, 25);
  assert.equal(r.carbsG, 46);
  assert.deepEqual(r.flags, ['fat-lowered', 'protein-crowds-carbs']);
  assert.ok(r.steps.some((s) => /protein target leaves less than 50 g of carbs/.test(s)));
});

test('fiber: 14 g per 1,000 kcal', () => {
  // 1440 → 20.16 → 20; 3160 → 44.24 → 44
  assert.equal(M.macroTargets({ phase: 'cut', kcal: 1440, kg: 70, cm: 165 }).fiberG, 20);
  assert.equal(M.macroTargets({ phase: 'bulk', kcal: 3160, kg: 80, cm: 180 }).fiberG, 44);
});

test('manual macros warn, never block', () => {
  // 80 kg: 0.8 g/kg = 64 g; fat 40 g × 9 = 360 of 2300 kcal = 15.7%
  const w = M.checkManualMacros({ kcal: 2300, proteinG: 60, fatG: 40, kg: 80, cm: 180 });
  assert.deepEqual(w.warnings.map((x) => x.id), ['protein-below-rda', 'fat-below-20pct']);
  // carbs (2300 − 240 − 360) ÷ 4 = 425
  assert.equal(w.carbsG, 425);
  assert.deepEqual(M.checkManualMacros({ kcal: 2300, proteinG: 150, fatG: 70, kg: 80, cm: 180 }).warnings, []);
  assert.deepEqual(M.checkManualMacros({ kcal: 1200, proteinG: 200, fatG: 60, kg: 80, cm: 180 }).warnings.map((x) => x.id), ['over-calories']);
});

test('protein counts as enough from 1.6 g/kg, never above the target (coaching review)', () => {
  const Mc = require('../js/calc/macros.js');
  // 86.4 kg, 172.7 cm (BMI 29.0): 1.6 × 86.4 = 138.2 → 138 g; the 190 g target stays the aim
  assert.equal(Mc.proteinEnough(190, 86.4, 172.7), 138);
  // BMI over 30 uses the weight at BMI 27.5: 110 kg at 175 cm → 27.5 × 1.75² = 84.2 kg → 1.6 × 84.2 = 134.8 → 135
  assert.equal(Mc.proteinEnough(185, 110, 175), 135);
  // a nutrition-phase target of 1.2 g/kg is already below 1.6 → the target itself
  assert.equal(Mc.proteinEnough(96, 80, 180), 96);
  assert.equal(Mc.proteinEnough(150, null, null), 150);
  assert.equal(Mc.proteinEnough(0, 80, 180), null);
});
