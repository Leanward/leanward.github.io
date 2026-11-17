/* M5a diary logic (js/diary.js): units, snapshots, edits, quick add, totals with coverage, recents,
 * frequents, copying and the time-of-day slot. Arithmetic is worked in the comments. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/diary.js');

const yogurt = { id: 'usda:1', source: 'usda-branded', verification: 'verified', name: 'Greek yogurt, plain, nonfat', brand: 'Dairy Farm',
  kcal: 59, protein_g: 10.3, carbs_g: 3.6, fat_g: 0.4, per: 'g', serving_g: 170, serving_label: '1 container', servings: [],
  nutrients: { calcium: 110, sodium: 36 } };
const chicken = { id: 'usda:2', source: 'usda-sr-legacy', verification: 'verified', name: 'Chicken breast, roasted', kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6,
  per: 'g', servings: [{ label: '1 cup chopped or diced', g: 140 }], nutrients: { sodium: 74, potassium: 256 } };
const milk = { id: 'off:1', source: 'off', verification: 'community', name: 'Milk 2%', kcal: 50, protein_g: 3.3, carbs_g: 4.8, fat_g: 2, per: 'ml', nutrients: { calcium: 120 } };
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test('units: labelled servings first, then g and oz; volumes only for drinks (LOG-5)', () => {
  assert.deepEqual(D.unitsFor(yogurt).map((u) => u.label), ['1 container', 'g', 'oz']);
  assert.deepEqual(D.unitsFor(chicken).map((u) => u.label), ['1 cup chopped or diced', 'g', 'oz']);
  assert.deepEqual(D.unitsFor(milk).map((u) => u.label), ['ml', 'fl oz', 'cup', 'tbsp', 'tsp']);
  close(D.unitsFor(milk).find((u) => u.label === 'cup').g, 236.5882365);
});

test('an entry snapshots the amount eaten', () => {
  // 1.5 containers × 170 g = 255 g; 59 × 2.55 = 150.45 → 150.5 kcal; protein 10.3 × 2.55 = 26.3 g; calcium 110 × 2.55 = 280.5 mg
  const e = D.entryFromFood({ food: yogurt, qty: 1.5, unit: D.unitsFor(yogurt)[0], date: '2026-11-04', slot: 'breakfast', via: 'search' });
  assert.deepEqual([e.grams, e.kcal, e.protein_g, e.carbs_g, e.fat_g], [255, 150.5, 26.3, 9.2, 1]);
  assert.equal(e.nutrients.calcium, 280.5);
  assert.equal(e.unit, '1.5 × 1 container');
  assert.equal(e.name, 'Greek yogurt, plain, nonfat · Dairy Farm');
  assert.equal(e.food_source, 'usda'); assert.equal(e.food_ref, 'usda:1'); assert.equal(e.logged_via, 'search');
  // 4 oz of chicken = 113.4 g; 165 × 1.134 = 187.1 kcal
  const c = D.entryFromFood({ food: chicken, qty: 4, unit: D.unitsFor(chicken).find((u) => u.label === 'oz'), date: '2026-11-04', slot: 'dinner' });
  assert.equal(c.grams, 113.4); assert.equal(c.kcal, 187.1);
  assert.throws(() => D.entryFromFood({ food: yogurt, qty: 0, unit: D.unitsFor(yogurt)[1], date: 'x', slot: 'lunch' }));
});

test('editing an entry uses its own snapshot, so it works offline and after the food changes', () => {
  const e = D.entryFromFood({ food: yogurt, qty: 1, unit: D.unitsFor(yogurt)[0], date: '2026-11-04', slot: 'breakfast' });
  const changed = D.updateEntry(e, { qty: 200, unit: { label: 'g', g: 1 }, slot: 'snacks', date: '2026-11-05' });
  // 200 g × 0.59 = 118 kcal
  assert.deepEqual([changed.kcal, changed.grams, changed.slot, changed.date, changed.id], [118, 200, 'snacks', '2026-11-05', e.id]);
  assert.deepEqual(D.foodOfEntry(changed).servings.map((u) => u.label), ['1 container', 'g', 'oz']);
});

test('quick add: calories only, or with macros; no micronutrients (LOG-7)', () => {
  const q = D.quickAdd({ kcal: 650, label: 'Team lunch', date: '2026-11-04', slot: 'lunch' });
  assert.deepEqual([q.kcal, q.protein_g, q.food_source, q.name, q.logged_via], [650, null, 'quick', 'Team lunch', 'quick']);
  assert.equal(D.quickAdd({ kcal: 300, protein_g: 20, carbs_g: 30, fat_g: 10, date: 'x', slot: 'snacks' }).name, 'Quick add');
  assert.throws(() => D.quickAdd({ kcal: -5, date: 'x', slot: 'snacks' }));
});

test('totals and coverage (NUT-1, NUT-4)', () => {
  const a = D.entryFromFood({ food: yogurt, qty: 1, unit: D.unitsFor(yogurt)[0], date: 'd', slot: 'breakfast' });   // 170 g: 100.3 kcal, calcium 187
  const b = D.entryFromFood({ food: chicken, qty: 100, unit: { label: 'g', g: 1 }, date: 'd', slot: 'dinner' });      // 165 kcal, sodium 74
  const q = D.quickAdd({ kcal: 234.7, date: 'd', slot: 'snacks' });                                                   // no micros, no macros
  const t = D.totals([a, b, q]);
  // kcal 100.3 + 165 + 234.7 = 500
  close(t.kcal, 500, 1e-9);
  // calcium only from the yogurt: 100.3 of 500 kcal = 20.06% coverage; sodium from both foods: 265.3 / 500 = 53.06%
  close(t.nutrients.calcium, 187); close(t.coverage.calcium, 0.2006); close(t.coverage.sodium, 0.5306);
  close(t.coverage.protein_g, 0.5306, 1e-9);   // the quick add has no protein
  assert.equal(t.entries, 3);
  assert.equal(D.totals([Object.assign({}, a, { deleted: true })]).kcal, 0);
});

test('versus target: neutral "left" or "over" (LOG-13)', () => {
  const v = D.versusTarget({ kcal: 2410, protein_g: 150, carbs_g: 200, fat_g: 70, nutrients: { fiber: 30 } }, { kcal: 2310, protein_g: 176, carbs_g: 246, fat_g: 69, fiber_g: 32 });
  assert.equal(v.kcal.text, '100 over');
  assert.equal(D.versusTarget({ kcal: 2000, nutrients: {} }, { kcal: 2310 }).kcal.text, '310 left');
  assert.equal(D.versusTarget({ kcal: 1 }, null), null);
});

test('recents and frequents', () => {
  const mk = (food, date, slot) => Object.assign(D.entryFromFood({ food, qty: 1, unit: { label: 'g', g: 100 }, date, slot }), { created_at: date + 'T08:00:00Z' });
  const list = [mk(yogurt, '2026-11-01', 'breakfast'), mk(chicken, '2026-11-02', 'dinner'), mk(yogurt, '2026-11-03', 'breakfast'), D.quickAdd({ kcal: 100, date: '2026-11-04', slot: 'snacks' })];
  assert.deepEqual(D.recents(list).map((e) => e.food_ref), ['usda:1', 'usda:2']);
  const f = D.frequents(list, '2026-11-04');
  assert.deepEqual(f.map((x) => [x.entry.food_ref, x.count, x.entry.date]), [['usda:1', 2, '2026-11-03']]);
});

test('copy a meal or a day to another date (LOG-10)', () => {
  const e = Object.assign(D.entryFromFood({ food: yogurt, qty: 1, unit: D.unitsFor(yogurt)[0], date: '2026-11-03', slot: 'breakfast' }), { rev: 3, dirty: 0, updated_at: 'x', created_at: 'y' });
  const [c] = D.copyEntries([e], '2026-11-04');
  assert.notEqual(c.id, e.id); assert.equal(c.date, '2026-11-04'); assert.equal(c.slot, 'breakfast'); assert.equal(c.logged_via, 'copy');
  assert.equal(c.rev, undefined); assert.equal(c.updated_at, undefined);
  assert.equal(D.copyEntries([e], '2026-11-04', 'lunch')[0].slot, 'lunch');
});

test('slot by time of day, and date maths', () => {
  assert.deepEqual([7 * 60, 12 * 60, 16 * 60, 19 * 60, 22 * 60].map(D.slotForTime), ['breakfast', 'lunch', 'snacks', 'dinner', 'snacks']);
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.addDays('2026-03-01', -1), '2026-02-28');
});

test('amounts and names read naturally in the diary', () => {
  const a = (unit, grams) => D.amountText({ unit, grams });
  assert.equal(a('1 × 1 bagel (46 g)', 46), '1 bagel (46 g)');             // not "1 × 1 bagel (46 g) · 46 g"
  assert.equal(a('2 × 1 bagel (46 g)', 92), '2 × 1 bagel (46 g) · 92 g');
  assert.equal(a('8 × oz', 226.8), '8 oz · 226.8 g');
  assert.equal(a('1.5 × cup', 354.9), '1.5 cup · 354.9 g');
  assert.equal(a('150 g', 150), '150 g');
  assert.equal(a('1 × 1 Scoop', 33), '1 Scoop · 33 g');
  assert.equal(a('1 × 1 cup (54 g)', 54), '1 cup (54 g)');
  assert.equal(a('1 × 1 fillet (138 g)', 138), '1 fillet (138 g)');
  assert.equal(a(null, null), '');
  assert.equal(D.calmName('SUNFLOWER CEREAL Real Cocoa · SEVEN SUNDAYS'), 'Sunflower Cereal Real Cocoa · Seven Sundays');
  assert.equal(D.calmName("Thomas' BBQ Chips, USDA"), "Thomas' BBQ Chips, USDA");
  assert.equal(D.calmName('KIND Bar'), 'KIND Bar');
});

test('serving names: USDA portion codes and the placeholder serving never reach the screen', () => {
  const beans = { id: 'usda:9', source: 'usda-fndds', name: 'Black beans, from dried, no added fat', kcal: 132, protein_g: 8.9, carbs_g: 23.7, fat_g: 0.5, per: 'g',
    servings: [{ label: '40014 1 oz dry, yield after cooking', g: 66 }, { label: '90000 Quantity not specified', g: 172 }, { label: '10205 1 cup', g: 172 }] };
  assert.deepEqual(D.unitsFor(beans).map((u) => u.label), ['1 oz dry, yield after cooking', '1 cup', 'g', 'oz']);
  // an entry logged before the fix still shows and edits correctly
  const old = { unit: '1 × 10205 1 cup', grams: 172 };
  assert.equal(D.unitLabelOf(old), '1 cup');
  assert.equal(D.amountText(old), '1 cup · 172 g');
  assert.equal(D.amountText({ unit: '2 × 10205 1 cup', grams: 344 }), '2 × 1 cup · 344 g');
  assert.equal(D.unitLabelOf({ unit: '150 g' }), 'g');
  // real names that start with numbers are untouched
  assert.equal(D.servingLabel('1000 ml bottle'), '1000 ml bottle');
  assert.equal(D.servingLabel('2 tbsp (32 g)'), '2 tbsp (32 g)');
  assert.equal(D.servingLabel('90000 Quantity not specified'), '');
});
