/* M5b: custom foods, saved meals and meal slots (js/library.js), and the Nutrient review (js/review.js).
 * Arithmetic is worked in the comments. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/diary.js');
const L = require('../js/library.js');
const R = require('../js/review.js');
const DRI = require('../js/calc/dri.js');
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

const bar = { name: 'Protein bar', brand: 'Acme', barcode: '036000291452', servingLabel: '1 bar', servingSize: 40, per: 'g',
  kcal: 190, protein_g: 15, carbs_g: 18, fat_g: 5, nutrients: { fiber: 5, sodium: 150, addedSugar: '' } };

test('a custom food from its label is stored per 100 g (LOG-8)', () => {
  const row = L.fromLabel(bar);
  // 100 / 40 = 2.5: 190 kcal → 475; protein 15 → 37.5; fat 5 → 12.5; fiber 5 → 12.5; sodium 150 → 375 mg; the empty field is skipped
  assert.deepEqual([row.nutrients_per_100g.kcal, row.nutrients_per_100g.protein_g, row.nutrients_per_100g.fat_g], [475, 37.5, 12.5]);
  assert.deepEqual(row.nutrients_per_100g.nutrients, { fiber: 12.5, sodium: 375 });
  assert.equal(row.barcode, '00036000291452');
  assert.deepEqual(row.servings, [{ label: '1 bar (40 g)', g: 40, raw: '1 bar' }]);
  const food = L.foodOfCustom(Object.assign({}, row, { id: 'r1' }));
  assert.equal(food.id, 'custom:r1'); assert.equal(food.source, 'custom');
  // logging 1 bar gives the label back: 475 × 0.4 = 190 kcal
  const e = D.entryFromFood({ food, qty: 1, unit: D.unitsFor(food)[0], date: '2026-11-04', slot: 'snacks' });
  assert.deepEqual([e.kcal, e.protein_g, e.nutrients.sodium, e.food_source, e.unit], [190, 15, 150, 'custom', '1 × 1 bar (40 g)']);
  // and the form round-trips for editing
  const back = L.labelOf(food);
  assert.deepEqual([back.name, back.servingLabel, back.servingSize, back.kcal, back.nutrients.fiber, back.barcode], ['Protein bar', '1 bar', 40, 190, 5, '036000291452']);
});

test('custom food checks catch impossible labels', () => {
  assert.throws(() => L.fromLabel(Object.assign({}, bar, { name: ' ' })), /name/);
  assert.throws(() => L.fromLabel(Object.assign({}, bar, { servingSize: 0 })), /serving size/);
  assert.throws(() => L.fromLabel(Object.assign({}, bar, { fat_g: '' })), /protein, carbs and fat/);
  assert.throws(() => L.fromLabel(Object.assign({}, bar, { kcal: 400 })), /more calories/);        // 1,000 kcal per 100 g
  assert.throws(() => L.fromLabel(Object.assign({}, bar, { carbs_g: 30 })), /weighs/);              // 50 g of macros in 40 g
  assert.throws(() => L.fromLabel(Object.assign({}, bar, { barcode: '12345' })), /barcode/);
  assert.equal(L.fromLabel(Object.assign({}, bar, { barcode: '' })).barcode, null);
});

test('energy check: 4/4/9 with room for label rounding', () => {
  // 4 × 20 + 4 × 22 + 9 × 6 = 222 expected; 190 is 32 under, inside 20% (44)
  assert.deepEqual(L.energyCheck(190, 20, 22, 6), { expected: 222, gap: -32, off: false });
  assert.equal(L.energyCheck(400, 20, 22, 6).off, true);
  assert.equal(L.energyCheck(null, 1, 1, 1), null);
});

test('a private copy of a catalog food starts from its serving (FDB-5)', () => {
  const pb = { id: 'off:1', source: 'off', name: 'Peanut butter', brand: 'Nutty', gtin: '00036000291452', kcal: 594, protein_g: 22, carbs_g: 22, fat_g: 50,
    per: 'g', serving_g: 32, serving_label: '2 tbsp (32 g)', nutrients: { sodium: 469 } };
  const f = L.labelOf(pb);
  // 594 × 0.32 = 190.08 → 190.1; sodium 469 × 0.32 = 150.08
  assert.deepEqual([f.id, f.servingLabel, f.servingSize, f.kcal, f.fat_g, f.nutrients.sodium], [null, '2 tbsp', 32, 190.1, 16, 150.08]);
});

test('custom search and barcode lookup', () => {
  const rows = [Object.assign(L.fromLabel(bar), { id: 'a', updated_at: '2026-11-01' }), Object.assign(L.fromLabel(Object.assign({}, bar, { name: 'Protein bar v2' })), { id: 'b', updated_at: '2026-11-03' }),
    Object.assign(L.fromLabel(Object.assign({}, bar, { name: 'Old bar' })), { id: 'c', deleted: true })];
  assert.deepEqual(L.matchCustom(rows, 'acme PROTEIN').map((f) => f.name), ['Protein bar', 'Protein bar v2']);
  assert.deepEqual(L.matchCustom(rows, 'old').length, 0);
  assert.equal(L.customByBarcode(rows, '036000291452').name, 'Protein bar v2');   // newest wins
  assert.equal(L.customByBarcode(rows, '4006381333931'), null);
});

const yogurt = { id: 'usda:1', source: 'usda-branded', name: 'Greek yogurt', kcal: 59, protein_g: 10.3, carbs_g: 3.6, fat_g: 0.4, per: 'g', serving_g: 170, serving_label: '1 container', nutrients: { calcium: 110 } };
const oats = { id: 'usda:2', source: 'usda-sr-legacy', name: 'Oats', kcal: 379, protein_g: 13.2, carbs_g: 67.7, fat_g: 6.5, per: 'g', nutrients: { fiber: 10.1, iron: 4.25 } };

test('saved meals: save, scale and log (LOG-9)', () => {
  const es = [D.entryFromFood({ food: yogurt, qty: 1, unit: D.unitsFor(yogurt)[0], date: 'd', slot: 'breakfast' }),
    D.entryFromFood({ food: oats, qty: 40, unit: { label: 'g', g: 1 }, date: 'd', slot: 'breakfast' }),
    D.quickAdd({ kcal: 30, label: 'Coffee', date: 'd', slot: 'breakfast' })];
  const meal = L.mealFromEntries('Usual breakfast', es);
  assert.equal(meal.items.length, 3); assert.equal(meal.items[0].id, undefined); assert.equal(meal.items[0].date, undefined);
  // ×1: 100.3 + 151.6 + 30 = 281.9 kcal
  close(L.mealTotals(meal).kcal, 281.9, 1e-9);
  const half = L.entriesFromMeal(meal, 0.5, '2026-11-05', 'lunch');
  // yogurt 0.5 × 1 container = 85 g, 50.2 kcal (100.3 / 2 = 50.15 → 50.2); oats 20 g; coffee 15 kcal
  assert.deepEqual(half.map((e) => [e.unit, e.grams, e.kcal]), [['0.5 × 1 container', 85, 50.2], ['20 g', 20, 75.8], [null, null, 15]]);
  assert.ok(half.every((e) => e.date === '2026-11-05' && e.slot === 'lunch' && e.logged_via === 'meal' && e.id));
  close(half[1].nutrients.iron, 0.85);   // 4.25 × 0.4 × 0.5
  assert.ok(half[0].nutrients._per100);  // still editable later
  // a scaled entry edits like any other: 2 containers = 340 g
  assert.equal(D.updateEntry(half[0], { qty: 2, unit: D.unitsFor(yogurt)[0] }).grams, 340);
  assert.throws(() => L.mealFromEntries('', es), /name/);
  assert.throws(() => L.mealFromEntries('X', []), /nothing/);
});

test('meal slots: rename, reorder and hide (LOG-1)', () => {
  assert.deepEqual(L.slotsFor({}).map((s) => s.id), D.SLOTS.map((s) => s.id));
  const prefs = L.withSlots({ foodPrefs: ['vegetarian'] }, [
    { id: 'snacks', label: 'Pre-workout', standard: 'Snacks' }, { id: 'breakfast', label: 'Breakfast', standard: 'Breakfast' },
    { id: 'supplements', label: '', hidden: true, standard: 'Supplements' }]);
  assert.deepEqual(prefs.foodPrefs, ['vegetarian']);
  const s = L.slotsFor(prefs);
  assert.deepEqual(s.map((x) => [x.id, x.label, x.hidden]), [['snacks', 'Pre-workout', false], ['breakfast', 'Breakfast', false], ['supplements', 'Supplements', true],
    ['lunch', 'Lunch', false], ['dinner', 'Dinner', false], ['beverages', 'Beverages', false]]);
  assert.throws(() => L.withSlots({}, L.slotsFor({}).map((x) => Object.assign(x, { hidden: true }))), /at least one/);
  assert.equal(L.slotsFor({ slots: [{ id: 'bogus', label: 'x' }] }).length, 6);
});

test('nutrient review: groups, coverage and the 7-day average (NUT-6)', () => {
  const day1 = [D.entryFromFood({ food: oats, qty: 100, unit: { label: 'g', g: 1 }, date: '2026-11-03', slot: 'breakfast' }),
    D.quickAdd({ kcal: 379, date: '2026-11-03', slot: 'lunch' })];
  const day2 = [D.entryFromFood({ food: oats, qty: 50, unit: { label: 'g', g: 1 }, date: '2026-11-05', slot: 'breakfast' })];
  const t = D.totals(day1), g = R.rows(t, null);
  assert.deepEqual(g.map((x) => x.id), ['macros', 'carbs', 'minerals']);
  const fiber = g[1].rows[0];
  // fiber known for 379 of 758 kcal = 50%
  assert.deepEqual([fiber.id, fiber.amount, fiber.coverage, fiber.target], ['fiber', 10.1, 0.5, undefined]);
  // 7 days ending 11-05: two logged days; fiber (10.1 + 5.05) / 2 = 7.575; kcal (758 + 189.5) / 2 = 473.75
  const avg = R.average(day1.concat(day2), R.week('2026-11-05'));
  assert.equal(avg.days, 2); close(avg.nutrients.fiber, 7.575); close(avg.kcal, 473.75);
  assert.deepEqual(R.week('2026-11-05'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  assert.deepEqual(R.rows(D.totals([]), null), []);
});

test('nutrient review with targets: % of target, units matched to the DRI', () => {
  const targets = DRI.targetsFor({ age: 40, sex: 'male' });
  const e = Object.assign(D.quickAdd({ kcal: 500, date: 'd', slot: 'lunch' }), { nutrients: { iron: 4, copper: 0.45 } });
  const g = R.rows(D.totals([e]), targets), mins = g.find((x) => x.id === 'minerals').rows;
  const iron = mins.find((r) => r.id === 'iron'), copper = mins.find((r) => r.id === 'copper');
  // iron 4 / 8 mg = 50%; copper 0.45 mg = 450 µg / 900 µg = 50%, target shown back in mg (0.9)
  assert.deepEqual([iron.pct, iron.kind, copper.pct, copper.target], [50, 'RDA', 50, 0.9]);
});

test('quality and top contributors (NUT-7)', () => {
  const es = [Object.assign(D.quickAdd({ kcal: 1000, protein_g: 50, carbs_g: 100, fat_g: 40, date: 'd', slot: 'lunch' }), { name: 'Lunch', food_ref: 'a', nutrients: { sodium: 1200, potassium: 2400, satFat: 15, epa: 0.1, dha: 0.2 } }),
    Object.assign(D.quickAdd({ kcal: 500, date: 'd', slot: 'dinner' }), { name: 'Soup', food_ref: 'b', nutrients: { sodium: 800 } })];
  const q = R.quality(D.totals(es), 80);
  const byId = Object.fromEntries(q.map((x) => [x.id, x]));
  // sat fat 15 g × 9 = 135 kcal of 1,500 = 9%; Na:K 2,000 / 2,400 = 0.83; EPA + DHA 0.3 g = 300 mg; protein 50 / 80 = 0.625 g/kg
  close(byId.satFatPct.value, 9); close(byId.naK.value, 2000 / 2400); close(byId.epaDha.value, 300); close(byId.proteinPerKg.value, 0.625);
  const top = R.contributors(es, 'sodium');
  assert.deepEqual(top.map((x) => [x.name, x.amount, x.share]), [['Lunch', 1200, 0.6], ['Soup', 800, 0.4]]);
});

test('saved meals are found by search, by their name or what\'s in them (LOG-3)', () => {
  const meals = [{ id: 'm1', name: 'Usual breakfast', items: [{ name: 'Greek yogurt' }, { name: 'Oats' }] }, { id: 'm2', name: 'Post-workout', items: [{ name: 'Whey protein' }] }, { id: 'm3', name: 'Old oats', deleted: true, items: [] }];
  assert.deepEqual(L.matchMeals(meals, 'breakfast').map((m) => m.id), ['m1']);
  assert.deepEqual(L.matchMeals(meals, 'OATS yogurt').map((m) => m.id), ['m1']);
  assert.deepEqual(L.matchMeals(meals, 'whey').map((m) => m.id), ['m2']);
  assert.deepEqual(L.matchMeals(meals, ''), []);
});
