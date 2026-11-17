/* USDA FoodData Central → Leanward catalog rows (PRD §7, FDB-1/2/4/6, LOG-5/6).
 *
 * Reads one dataset's CSV folder (Foundation, SR Legacy, FNDDS or Branded) and returns rows for
 * public.lw_foods. Nutrients are per 100 g (USDA's basis), keyed by Leanward ids, in USDA's units
 * (g, mg, µg) except where noted.
 *
 * Safety: every USDA nutrient id used here is checked against the dataset's own nutrient.csv names
 * before anything is converted (checkNutrients). If USDA ever renumbers or renames one, the import
 * stops instead of putting values in the wrong place.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { readCsv } = require('./csv.js');
const { toGtin14 } = require('../../js/gtin.js');

// USDA nutrient id → [Leanward key, expected name pattern, expected unit]
const NUTRIENTS = {
  1003: ['protein', /^Protein$/, 'G'],
  1004: ['fat', /^Total lipid \(fat\)$/, 'G'],
  1005: ['carbs', /^Carbohydrate, by difference$/, 'G'],
  1050: ['carbsSum', /^Carbohydrate, by summation$/, 'G'],
  1008: ['kcal', /^Energy$/, 'KCAL'],
  2047: ['kcalAtwaterGeneral', /^Energy \(Atwater General Factors\)$/, 'KCAL'],
  2048: ['kcalAtwaterSpecific', /^Energy \(Atwater Specific Factors\)$/, 'KCAL'],
  1018: ['alcohol', /^Alcohol, ethyl$/, 'G'],
  1051: ['water', /^Water$/, 'G'],
  1079: ['fiber', /^Fiber, total dietary$/, 'G'],
  // Seen in SR Legacy (2018-04): 2000 "Sugars, Total", 1063 "Sugars, Total NLEA". Both are total sugars.
  2000: ['sugar', /^(Sugars, total including NLEA|Sugars, Total|Total Sugars)$/i, 'G'],
  1063: ['sugarNlea', /^Sugars, Total( NLEA)?$/i, 'G'],
  1235: ['addedSugar', /^Sugars, added$/, 'G'],
  1258: ['satFat', /^Fatty acids, total saturated$/, 'G'],
  1292: ['monoFat', /^Fatty acids, total monounsaturated$/, 'G'],
  1293: ['polyFat', /^Fatty acids, total polyunsaturated$/, 'G'],
  1257: ['transFat', /^Fatty acids, total trans$/, 'G'],
  1253: ['cholesterol', /^Cholesterol$/, 'MG'],
  1093: ['sodium', /^Sodium, Na$/, 'MG'],
  1092: ['potassium', /^Potassium, K$/, 'MG'],
  1087: ['calcium', /^Calcium, Ca$/, 'MG'],
  1090: ['magnesium', /^Magnesium, Mg$/, 'MG'],
  1091: ['phosphorus', /^Phosphorus, P$/, 'MG'],
  1089: ['iron', /^Iron, Fe$/, 'MG'],
  1095: ['zinc', /^Zinc, Zn$/, 'MG'],
  1098: ['copper', /^Copper, Cu$/, 'MG'],
  1103: ['selenium', /^Selenium, Se$/, 'UG'],
  1106: ['vitaminA', /^Vitamin A, RAE$/, 'UG'],
  1162: ['vitaminC', /^Vitamin C, total ascorbic acid$/, 'MG'],
  1114: ['vitaminD', /^Vitamin D \(D2 \+ D3\)$/, 'UG'],
  1110: ['vitaminDIu', /^Vitamin D \(D2 \+ D3\), International Units$/, 'IU'],
  1109: ['vitaminE', /^Vitamin E \(alpha-tocopherol\)$/, 'MG'],
  1185: ['vitaminK', /^Vitamin K \(phylloquinone\)$/, 'UG'],
  1165: ['thiamin', /^Thiamin$/, 'MG'],
  1166: ['riboflavin', /^Riboflavin$/, 'MG'],
  1167: ['niacin', /^Niacin$/, 'MG'],
  1175: ['vitaminB6', /^Vitamin B-6$/, 'MG'],
  1178: ['vitaminB12', /^Vitamin B-12$/, 'UG'],
  1190: ['folate', /^Folate, DFE$/, 'UG'],
  1180: ['choline', /^Choline, total$/, 'MG'],
  1404: ['ala', /^PUFA 18:3 n-3 c,c,c \(ALA\)$/, 'G'],
  1270: ['ala183', /^PUFA 18:3$/, 'G'],
  1278: ['epa', /^PUFA 20:5 n-3 \(EPA\)$/, 'G'],
  1272: ['dha', /^PUFA 22:6 n-3 \(DHA\)$/, 'G'],
  1057: ['caffeine', /^Caffeine$/, 'MG']
};
// Keys kept in the nutrients JSON (helpers like kcalAtwater* and sugarNlea are folded into these).
const KEEP = ['fiber', 'sugar', 'addedSugar', 'satFat', 'monoFat', 'polyFat', 'transFat', 'cholesterol', 'sodium', 'potassium', 'calcium',
  'magnesium', 'phosphorus', 'iron', 'zinc', 'copper', 'selenium', 'vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'thiamin',
  'riboflavin', 'niacin', 'vitaminB6', 'vitaminB12', 'folate', 'choline', 'ala', 'epa', 'dha', 'alcohol', 'water', 'caffeine'];

const SOURCES = { foundation_food: 'usda-foundation', sr_legacy_food: 'usda-sr-legacy', survey_fndds_food: 'usda-fndds', branded_food: 'usda-branded' };
const COOKED = /\b(cooked|boiled|baked|roasted|grilled|fried|broiled|braised|steamed|stewed|poached|sauteed|toasted|microwaved|scrambled|simmered)\b/i;
const RAW = /\braw\b/i;

/** Checks the ids above against the dataset's nutrient.csv. Returns { problems, missing }. */
async function checkNutrients(dir) {
  const seen = {}, byNumber = {};
  await readCsv(path.join(dir, 'nutrient.csv'), (r) => {
    seen[r.id] = { name: r.name, unit: (r.unit_name || '').toUpperCase() };
    // Some datasets (e.g. FNDDS) refer to nutrients by the older 3-digit nutrient number instead of the id.
    const nbr = String(r.nutrient_nbr || '').replace(/\.0+$/, '');
    if (nbr && NUTRIENTS[r.id]) byNumber[nbr] = r.id;
  });
  const problems = [], missing = [];
  Object.keys(NUTRIENTS).forEach((id) => {
    const [key, re, unit] = NUTRIENTS[id], s = seen[id];
    if (!s) { missing.push(id + ' (' + key + ')'); return; }
    if (!re.test(s.name) || s.unit !== unit) problems.push(`nutrient ${id}: expected ${re} in ${unit} for "${key}", found "${s.name}" in ${s.unit}`);
  });
  return { problems, missing, byNumber };
}

function num(v) { if (v === '' || v == null) return null; const n = Number(v); return isFinite(n) ? n : null; }
function round(v, dp) { const f = Math.pow(10, dp); return Math.round(v * f) / f; }

/** "CHEERIOS TOASTED WHOLE GRAIN OAT CEREAL" → "Cheerios Toasted Whole Grain Oat Cereal" (only for all-caps names). */
function tidyName(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s.toLowerCase().replace(/(^|[\s(/&-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Of|And|With|In|Or|The|A|For)\b/g, (w, x, i) => (i === 0 ? w : w.toLowerCase()));
  }
  return s;
}

function preparation(name) { return COOKED.test(name) ? 'cooked' : RAW.test(name) ? 'raw' : null; }

/** Energy: 1008, else Atwater general, else Atwater specific, else 4/4/9/7 from the macros (flagged). */
function energy(n) {
  if (n.kcal != null) return { kcal: n.kcal, derived: false };
  if (n.kcalAtwaterGeneral != null) return { kcal: n.kcalAtwaterGeneral, derived: false };
  if (n.kcalAtwaterSpecific != null) return { kcal: n.kcalAtwaterSpecific, derived: false };
  if (n.protein != null && n.carbs != null && n.fat != null) return { kcal: 4 * n.protein + 4 * n.carbs + 9 * n.fat + 7 * (n.alcohol || 0), derived: true };
  return null;
}

/**
 * Converts one dataset folder. Returns { rows, stats }.
 * opts: { onlyTypes?: ['branded_food'] } (the Foundation download also contains sample and acquisition records)
 */
async function convert(dir, opts) {
  opts = opts || {};
  const check = await checkNutrients(dir);
  if (check.problems.length) throw new Error('USDA nutrient ids don\'t match what Leanward expects; stopping so no values land in the wrong place:\n' + check.problems.join('\n'));

  const foods = new Map(), stats = { rowsIn: 0, kept: 0, dropped: {}, missingNutrients: check.missing, release: null };
  const drop = (why) => { stats.dropped[why] = (stats.dropped[why] || 0) + 1; };
  const categories = {};
  if (fs.existsSync(path.join(dir, 'food_category.csv'))) await readCsv(path.join(dir, 'food_category.csv'), (r) => { categories[r.id] = r.description; });
  if (fs.existsSync(path.join(dir, 'wweia_food_category.csv'))) await readCsv(path.join(dir, 'wweia_food_category.csv'), (r) => { categories['w' + r.wweia_food_category] = r.wweia_food_category_description; });

  await readCsv(path.join(dir, 'food.csv'), (r) => {
    const source = SOURCES[r.data_type];
    if (!source || (opts.onlyTypes && opts.onlyTypes.indexOf(r.data_type) < 0)) return;
    stats.rowsIn++;
    if (r.publication_date && (!stats.release || r.publication_date > stats.release)) stats.release = r.publication_date;
    foods.set(r.fdc_id, { fdcId: r.fdc_id, source, name: r.description, category: categories[r.food_category_id] || null, published: r.publication_date || null, n: {}, servings: [] });
  });

  if (fs.existsSync(path.join(dir, 'survey_fndds_food.csv'))) {
    await readCsv(path.join(dir, 'survey_fndds_food.csv'), (r) => { const f = foods.get(r.fdc_id); if (f && !f.category) f.category = categories['w' + r.wweia_category_number] || null; });
  }
  if (fs.existsSync(path.join(dir, 'branded_food.csv'))) {
    await readCsv(path.join(dir, 'branded_food.csv'), (r) => {
      const f = foods.get(r.fdc_id);
      if (!f) return;
      f.brand = tidyName(r.brand_name || r.brand_owner) || null;
      f.rawGtin = r.gtin_upc;
      f.category = r.branded_food_category || f.category;
      f.updated = r.modified_date || r.available_date || f.published;
      const size = num(r.serving_size), unit = String(r.serving_size_unit || '').toLowerCase();
      if (size && (unit === 'g' || unit === 'grm' || unit === 'ml' || unit === 'mlt')) {
        f.per = unit[0] === 'm' ? 'ml' : 'g';
        f.servingG = size;
        f.servingLabel = (r.household_serving_fulltext || '').trim() || null;
      }
    });
  }

  let sample = [];
  await readCsv(path.join(dir, 'food_nutrient.csv'), (r) => {
    if (sample.length < 5) sample.push(r);
    const f = foods.get(r.fdc_id); if (!f) return;
    // An id we map, or (only when it isn't a known id) an old nutrient number that maps to one.
    const id = NUTRIENTS[r.nutrient_id] ? r.nutrient_id : check.byNumber[r.nutrient_id];
    const m = id && NUTRIENTS[id]; if (!m) return;
    const v = num(r.amount); if (v == null || v < 0) return;
    f.n[m[0]] = v;
  });

  if (fs.existsSync(path.join(dir, 'food_portion.csv'))) {
    const units = {};
    if (fs.existsSync(path.join(dir, 'measure_unit.csv'))) await readCsv(path.join(dir, 'measure_unit.csv'), (r) => { units[r.id] = r.name; });
    await readCsv(path.join(dir, 'food_portion.csv'), (r) => {
      const f = foods.get(r.fdc_id); if (!f) return;
      const g = num(r.gram_weight); if (!g || g <= 0) return;
      const amount = num(r.amount), unit = units[r.measure_unit_id];
      const unitText = unit && unit !== 'undetermined' ? unit : '';
      // FNDDS puts an internal portion code (digits only) in `modifier` and the name in
      // `portion_description`; the code is not part of the name. "Quantity not specified" is a
      // placeholder, not a serving anyone would pick.
      const modifier = /^\d+$/.test(String(r.modifier || '').trim()) ? '' : r.modifier || '';
      const label = [amount != null ? round(amount, 2) : '', unitText, modifier, !unitText ? r.portion_description || '' : ''].join(' ').replace(/\s+/g, ' ').trim();
      if (label && !/^quantity not specified$/i.test(label)) f.servings.push({ label: label.slice(0, 80), g: round(g, 2) });
    });
  }

  const rows = [], byGtin = new Map();
  foods.forEach((f) => {
    const n = f.n;
    if (n.carbs == null && n.carbsSum != null) n.carbs = n.carbsSum;
    if (n.sugar == null && n.sugarNlea != null) n.sugar = n.sugarNlea;
    if (n.vitaminD == null && n.vitaminDIu != null) n.vitaminD = n.vitaminDIu / 40;   // 40 IU = 1 µg
    if (n.ala == null && n.ala183 != null) n.ala = n.ala183;
    const e = energy(n);
    // FDB-6: no calories or a missing macro → not shown (quality before quantity).
    if (!e || n.protein == null || n.carbs == null || n.fat == null) { drop('missing calories or a macro'); return; }
    if (e.kcal > 1000 || n.protein > 100 || n.carbs > 100 || n.fat > 100) { drop('values out of range'); return; }
    const nutrients = {};
    KEEP.forEach((k) => { if (n[k] != null) nutrients[k] = round(n[k], 4); });
    const name = tidyName(f.name);
    if (!name) { drop('no name'); return; }
    const row = {
      id: 'usda:' + f.fdcId, source: f.source, source_id: f.fdcId, verification: 'verified', name: name.slice(0, 300), brand: f.brand || null,
      gtin: f.rawGtin ? toGtin14(f.rawGtin) : null, category: f.category ? String(f.category).slice(0, 200) : null,
      kcal: round(e.kcal, 1), protein_g: round(n.protein, 2), carbs_g: round(n.carbs, 2), fat_g: round(n.fat, 2), energy_derived: e.derived,
      per: f.per || 'g', serving_g: f.servingG || null, serving_label: f.servingLabel ? f.servingLabel.slice(0, 120) : null,
      servings: f.servings.slice(0, 20), nutrients, preparation: f.source === 'usda-branded' ? null : preparation(name),
      published: f.updated || f.published || null
    };
    if (f.rawGtin && !row.gtin) drop('barcode invalid (food kept, barcode dropped)');
    // FDB-4: one record per barcode, the most recently updated.
    if (row.gtin) {
      const prev = byGtin.get(row.gtin);
      if (prev && (prev.published || '') >= (row.published || '')) { drop('duplicate barcode (older kept out)'); return; }
      if (prev) { rows[prev._i] = null; drop('duplicate barcode (older kept out)'); }
      row._i = rows.length; byGtin.set(row.gtin, row);
    }
    rows.push(row);
  });
  const out = rows.filter(Boolean).map((r) => { delete r._i; return r; });
  stats.kept = out.length;
  if (!out.length && stats.rowsIn) stats.sampleFoodNutrientRows = sample;   // nothing usable: show what the rows look like
  return { rows: out, stats };
}

const COLUMNS = ['id', 'source', 'source_id', 'verification', 'name', 'brand', 'gtin', 'category', 'kcal', 'protein_g', 'carbs_g', 'fat_g',
  'energy_derived', 'per', 'serving_g', 'serving_label', 'servings', 'nutrients', 'preparation', 'published'];

module.exports = { NUTRIENTS, KEEP, SOURCES, COLUMNS, checkNutrients, tidyName, preparation, energy, convert };
