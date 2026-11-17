/* Recipes (js/recipe.js, PRD LOG-11). Arithmetic is worked in the comments. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/recipe.js');
const D = require('../js/diary.js');
const L = require('../js/library.js');
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

const food = (id, name, kcal, p, c, f, nutrients) => ({ id, name, kcal, protein_g: p, carbs_g: c, fat_g: f, per: 'g', nutrients: nutrients || {} });
const g = { label: 'g', g: 1 };
// The owner's example: chickpeas, kale, Parmesan, tahini and olive oil, 1,500 g when cooked.
const items = () => [
  R.ingredientOf(food('usda:1', 'Chickpeas, canned, drained', 120, 7, 20, 2, { fiber: 6 }), 800, g),     // 960 kcal · P 56 · C 160 · F 16 · fiber 48
  R.ingredientOf(food('usda:2', 'Kale, raw', 50, 4, 9, 1, { fiber: 4, vitC: 90 }), 300, g),               // 150 · 12 · 27 · 3 · fiber 12 · vit C 270
  R.ingredientOf(food('usda:3', 'Parmesan, grated', 400, 35, 3, 28, { fiber: 0 }), 50, g),                // 200 · 17.5 · 1.5 · 14 · fiber 0
  R.ingredientOf(food('off:4', 'Tahini', 600, 17, 21, 54, { fiber: 9 }), 2, { label: '1 tbsp', g: 15 }),  // 30 g: 180 · 5.1 · 6.3 · 16.2 · fiber 2.7
  R.ingredientOf(food('usda:5', 'Olive oil', 900, 0, 0, 100, { fiber: 0 }), 20, g)                        // 180 · 0 · 0 · 20 · fiber 0
];

test('recipe totals: calories, macros and raw weight add up (LOG-11)', () => {
  const t = R.totals(items());
  // 960 + 150 + 200 + 180 + 180 = 1,670 kcal; P 56 + 12 + 17.5 + 5.1 = 90.6; C 160 + 27 + 1.5 + 6.3 = 194.8; F 16 + 3 + 14 + 16.2 + 20 = 69.2
  assert.deepEqual([t.kcal, t.protein_g, t.carbs_g, t.fat_g, t.rawG], [1670, 90.6, 194.8, 69.2, 1200]);
  close(t.nutrients.fiber, 62.7, 1e-9);                 // 48 + 12 + 0 + 2.7 + 0, listed for 100% of the calories
  assert.equal(t.nutrients.vitC, undefined);            // only kale lists it: 150 ÷ 1,670 = 9% of the calories < 90%
});

test('250 g of a 1,500 g pot is one sixth of the recipe (the owner\'s example)', () => {
  const b = R.build({ name: 'Chickpea kale bowl', items: items(), cookedG: 1500, servings: 6 }, '2026-11-17T12:00:00Z');
  // per 100 g: 1,670 ÷ 15 = 111.3 kcal; P 90.6 ÷ 15 = 6.04; C 194.8 ÷ 15 = 12.99; F 69.2 ÷ 15 = 4.61; fiber 62.7 ÷ 15 = 4.18
  assert.deepEqual([b.per100.kcal, b.per100.protein_g, b.per100.carbs_g, b.per100.fat_g], [111.3, 6.04, 12.99, 4.61]);
  close(b.per100.nutrients.fiber, 4.18, 1e-9);
  assert.deepEqual(b.row.servings, [{ label: '1 serving (1/6 of the recipe)', g: 250 }, { label: 'whole recipe', g: 1500 }]);
  assert.deepEqual([b.row.recipe.cooked_g, b.row.recipe.raw_g, b.row.recipe.servings, b.row.recipe.items.length], [1500, 1200, 6, 5]);
  // Logged like any of your foods: 250 g = 111.3 × 2.5 = 278.3 kcal (1,670 ÷ 6 = 278.3)
  const f = L.foodOfCustom(b.row);
  assert.equal(f.recipe, true);
  const e = D.entryFromFood({ food: f, qty: 250, unit: g, date: '2026-11-17', slot: 'lunch' });
  assert.deepEqual([e.kcal, e.protein_g, e.carbs_g, e.fat_g], [278.3, 15.1, 32.5, 11.5]);
  // The serving unit is the same 250 g
  assert.equal(D.unitsFor(f)[0].label, '1 serving (1/6 of the recipe)'); assert.equal(D.unitsFor(f)[0].g, 250);
});

test('finished weight: blank uses the raw weight; far-off weights are caught', () => {
  const b = R.build({ name: 'Bowl', items: items() });
  assert.equal(b.cookedG, 1200); assert.equal(b.row.recipe.cooked_given, false);
  // no servings count → no serving unit, and "whole recipe" isn't the first unit (grams are what people weigh)
  const f = L.foodOfCustom(b.row);
  assert.equal(f.serving_g, null);
  assert.deepEqual(D.unitsFor(f).map((u) => u.label), ['whole recipe', 'g', 'oz']);
  assert.throws(() => R.build({ name: 'Bowl', items: items(), cookedG: 100 }), /far from the ingredients' 1200 g/);    // < 20% of 1,200
  assert.throws(() => R.build({ name: 'Bowl', items: items(), cookedG: 7000 }), /far from/);                          // > 5×
  assert.equal(R.build({ name: 'Rice', items: items(), cookedG: 3000 }).cookedG, 3000);                                 // 2.5×: rice and beans take up water
});

test('recipe checks: name, ingredients, servings, no recipe inside a recipe', () => {
  assert.throws(() => R.build({ name: ' ', items: items() }), /name/);
  assert.throws(() => R.build({ name: 'Bowl', items: [] }), /at least one ingredient/);
  assert.throws(() => R.build({ name: 'Bowl', items: items(), servings: 2.5 }), /whole number/);
  assert.throws(() => R.ingredientOf(food('x', 'Rice', 130, 2.7, 28, 0.3), 0, g), /above zero/);
  assert.throws(() => R.ingredientOf(Object.assign(food('custom:a', 'Stew', 100, 5, 10, 3), { recipe: true }), 100, g), /recipe can't go inside/);
});

test('changing an amount keeps its unit; editing starts from the saved recipe', () => {
  const tahini = items()[3];
  assert.deepEqual([tahini.qty, tahini.unit, tahini.g], [2, '1 tbsp', 30]);
  const more = R.withQty(tahini, 3);
  assert.deepEqual([more.qty, more.unit, more.g], [3, '1 tbsp', 45]);
  const b = R.build({ id: 'r1', name: 'Bowl', items: items(), cookedG: 1500, servings: 6 });
  const s = R.editState(b.row);
  assert.deepEqual([s.id, s.name, s.items.length, s.cookedG, s.servings], ['r1', 'Bowl', 5, 1500, 6]);
  assert.equal(R.build(s).row.id, 'r1');                        // saving again updates the same food
  assert.equal(R.editState(R.build({ name: 'B', items: items() }).row).cookedG, null);   // a blank weight stays blank
});
