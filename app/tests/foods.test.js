/* M4b food helpers (js/foods.js): Open Food Facts conversion (FDB-3/6), barcode forms for the OFF
 * lookup, per-serving scaling and source badges. The OFF product is a hand-made sample in the shape
 * of the OFF v2 API. */
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/foods.js');

const offProduct = {
  code: '0036000291452', product_name: 'Crunchy Peanut Butter', brands: 'Nutty Co, Nutty Holdings',
  serving_size: '2 tbsp (32 g)', serving_quantity: 32,
  nutriments: { 'energy-kcal_100g': 594, proteins_100g: 22, carbohydrates_100g: 22, fat_100g: 50, fiber_100g: 6.3,
    sugars_100g: 9.4, 'saturated-fat_100g': 9.4, sodium_100g: 0.469, 'vitamin-d_100g': 0.0000025, 'calcium_100g': 0.04 }
};

test('an Open Food Facts product becomes a community food with attribution', () => {
  const f = F.fromOff(offProduct);
  assert.equal(f.id, 'off:00036000291452');
  assert.equal(f.source, 'off'); assert.equal(f.verification, 'community');
  assert.equal(f.brand, 'Nutty Co');
  assert.deepEqual([f.kcal, f.protein_g, f.carbs_g, f.fat_g], [594, 22, 22, 50]);
  assert.deepEqual([f.serving_g, f.serving_label], [32, '2 tbsp (32 g)']);
  // OFF minerals are in grams: sodium 0.469 g → 469 mg; calcium 0.04 g → 40 mg; vitamin D 2.5e-6 g → 2.5 µg
  assert.equal(f.nutrients.sodium, 469); assert.equal(f.nutrients.calcium, 40); assert.equal(f.nutrients.vitaminD, 2.5);
  assert.match(f.attribution, /Open Food Facts.*ODbL/);
});

test('FDB-6: no calories or a missing macro hides an OFF product; kJ-only energy is converted', () => {
  assert.equal(F.fromOff({ code: '1', product_name: 'X', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 1, fat_100g: 1 } }), null);
  assert.equal(F.fromOff({ code: '1', product_name: 'X', nutriments: { proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } }), null);
  assert.equal(F.fromOff({ code: '1', product_name: '', nutriments: { 'energy-kcal_100g': 1, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } }), null);
  assert.equal(F.fromOff({ code: '1', product_name: 'X', nutriments: { 'energy-kcal_100g': 2000, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } }), null);
  // 418.4 kJ ÷ 4.184 = 100 kcal
  const k = F.fromOff({ code: '96385074', product_name: 'Bar', nutriments: { energy_100g: 418.4, energy_unit: 'kJ', proteins_100g: 5, carbohydrates_100g: 10, fat_100g: 2 } });
  assert.equal(k.kcal, 100);
  assert.equal(k.gtin, '00000096385074');
});

test('barcode forms tried at Open Food Facts', () => {
  assert.deepEqual(F.offCodes('00036000291452'), ['0036000291452', '036000291452']);   // EAN-13, then UPC-A
  assert.deepEqual(F.offCodes('04006381333931'), ['4006381333931']);
  assert.deepEqual(F.offCodes('00000096385074'), ['0000096385074', '000096385074', '96385074']);
  assert.deepEqual(F.offCodes('bad'), []);
});

test('per-serving amounts and source badges', () => {
  const s = F.scale({ kcal: 594, protein_g: 22, carbs_g: 22, fat_g: 50, nutrients: { sodium: 469 } }, 32);
  assert.ok(Math.abs(s.kcal - 190.08) < 1e-9); assert.ok(Math.abs(s.nutrients.sodium - 150.08) < 1e-9);
  assert.deepEqual(F.badge({ source: 'usda-sr-legacy', verification: 'verified' }), { text: 'USDA', kind: 'verified' });
  assert.deepEqual(F.badge({ source: 'usda-branded', verification: 'verified' }), { text: 'Branded · USDA', kind: 'verified' });
  assert.equal(F.badge(F.fromOff(offProduct)).kind, 'community');
});

test('Search online: the Open Food Facts query and its results (FDB-3, FDB-6)', () => {
  const url = F.offSearchUrl('quest  overload bar ');
  assert.match(url, /^https:\/\/us\.openfoodfacts\.org\/cgi\/search\.pl\?search_terms=quest%20%20overload%20bar&/);
  assert.match(url, /json=1/); assert.match(url, /page_size=24/); assert.match(url, /fields=code,product_name/);
  assert.match(F.offSearchUrl('x', 'https://world.openfoodfacts.org'), /^https:\/\/world\./);
  const ok = { code: '0036000291452', product_name: 'Overload Bar, Chocolate Peanut Butter', brands: 'Quest', serving_quantity: 60, serving_size: '1 bar (60 g)',
    nutriments: { 'energy-kcal_100g': 400, proteins_100g: 35, carbohydrates_100g: 40, fat_100g: 16.7 } };
  const foods = F.fromOffSearch({ products: [ok, Object.assign({}, ok), { code: '1', product_name: 'No macros', nutriments: { 'energy-kcal_100g': 10 } }] });
  // the duplicate barcode is shown once; the product without macros is hidden
  assert.equal(foods.length, 1);
  assert.deepEqual([foods[0].id, foods[0].brand, foods[0].verification, foods[0].serving_g], ['off:00036000291452', 'Quest', 'community', 60]);
  assert.deepEqual(F.fromOffSearch(null), []);
});

test('Search online gives up with a clear message instead of hanging, and falls back to the worldwide site', async () => {
  const calls = [];
  const saved = { fetch: global.fetch, AbortController: global.AbortController };
  const product = { code: '0036000291452', product_name: 'Overload Bar', brands: 'Quest', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 35, carbohydrates_100g: 40, fat_100g: 16.7 } };
  try {
    // US site busy (503), worldwide site answers
    global.fetch = (url) => { calls.push(url.split('/cgi')[0]); return Promise.resolve(url.includes('//us.') ? { ok: false, status: 503 } : { ok: true, status: 200, json: () => Promise.resolve({ products: [product] }) }); };
    const foods = await F.offSearch('quest overload');
    assert.deepEqual(calls, ['https://us.openfoodfacts.org', 'https://world.openfoodfacts.org']);
    assert.equal(foods[0].name, 'Overload Bar');
    // both sites hang: each try is aborted at the time limit and the search fails with a message
    global.fetch = (url, o) => new Promise((resolve, reject) => o.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }));
    await assert.rejects(F.offSearch('quest overload', { timeoutMs: 20 }), /didn't answer in time.*create the food/);
  } finally { global.fetch = saved.fetch; }
});
