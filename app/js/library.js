/* Leanward — the user's own library (M5b): custom foods (LOG-8, LOG-4 "Create this food", FDB-5
 * private copy), saved meals (LOG-9), copying a meal (LOG-10) and meal-slot names, order and
 * visibility (LOG-1). Pure: no storage or DOM.
 *
 * Custom food rows (lw_custom_foods) keep values per 100 g (or 100 ml) in nutrients_per_100g, so they
 * behave like catalog foods. People type them from a label, which is per serving; fromLabel()
 * converts. Saved meals (lw_saved_meals) keep each item's diary snapshot, so logging a meal works
 * offline and gives the same numbers every time.
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var DY = node ? require('./diary.js') : root.LW.diary;
  var GT = node ? require('./gtin.js') : root.LW.gtin;

  // The extra nutrients a US Nutrition Facts label lists, offered when creating a food.
  var LABEL_NUTRIENTS = ['fiber', 'sugar', 'addedSugar', 'satFat', 'transFat', 'cholesterol', 'sodium', 'potassium', 'calcium', 'iron', 'vitaminD'];
  var MACROS = ['kcal', 'protein_g', 'carbs_g', 'fat_g'];

  function round(v, dp) { var f = Math.pow(10, dp || 0); return Math.round(v * f) / f; }
  function newId() { return root.LW && root.LW.model ? root.LW.model.newId() : (node ? require('crypto').randomUUID() : String(Math.random()).slice(2)); }
  function num(v) { return v === '' || v == null ? null : Number(v); }

  /* ---------- custom foods ---------- */

  /**
   * A custom-food row from what's on the label (per serving).
   * f: { id?, name, brand?, barcode?, servingLabel?, servingSize, per: 'g' | 'ml', kcal, protein_g, carbs_g, fat_g,
   *      nutrients?: { id: amount per serving } }
   * Throws a plain-language Error when something is missing or impossible.
   */
  function fromLabel(f) {
    var name = String(f.name || '').trim(), size = num(f.servingSize);
    if (!name) throw new Error('Give the food a name.');
    if (!(size > 0) || size > 5000) throw new Error('Enter the serving size in ' + (f.per === 'ml' ? 'ml' : 'grams') + ' (it\'s on the label, e.g. "1 bar (40 g)").');
    MACROS.forEach(function (k) {
      var v = num(f[k]);
      if (v == null || !(v >= 0)) throw new Error(k === 'kcal' ? 'Enter the calories per serving (0 is fine).' : 'Enter protein, carbs and fat per serving (0 is fine).');
    });
    var f100 = 100 / size, per100 = { per: f.per === 'ml' ? 'ml' : 'g' };
    MACROS.forEach(function (k) { per100[k] = round(num(f[k]) * f100, 2); });
    // Energy density can't pass pure fat (about 900 kcal per 100 g); macros can't outweigh the serving.
    if (per100.kcal > 900) throw new Error('That\'s more calories than the serving size allows. Check the serving size and calories.');
    if (f.per !== 'ml' && num(f.protein_g) + num(f.carbs_g) + num(f.fat_g) > size * 1.05) throw new Error('Protein, carbs and fat add up to more than the serving weighs. Check the numbers.');
    var nutrients = {};
    Object.keys(f.nutrients || {}).forEach(function (k) {
      var v = num(f.nutrients[k]);
      if (v == null) return;
      if (!(v >= 0)) throw new Error('Nutrients can\'t be negative.');
      nutrients[k] = round(v * f100, 4);
    });
    per100.nutrients = nutrients;
    var code = f.barcode ? GT.toGtin14(String(f.barcode).replace(/\s/g, '')) : null;
    if (f.barcode && String(f.barcode).trim() && !code) throw new Error('That barcode doesn\'t look right. Check the digits, or leave it empty.');
    var label = String(f.servingLabel || '').trim();
    return {
      id: f.id || newId(), name: name.slice(0, 200), brand: String(f.brand || '').trim().slice(0, 200) || null, barcode: code,
      nutrients_per_100g: per100,
      servings: [{ label: (label ? label + ' (' + round(size, 1) + ' ' + per100.per + ')' : '1 serving (' + round(size, 1) + ' ' + per100.per + ')').slice(0, 80), g: round(size, 2), raw: label.slice(0, 60) }]
    };
  }

  /**
   * The check behind "do the calories add up?": 4 kcal per g of protein and carbs, 9 per g of fat.
   * Labels round, and fiber and sugar alcohols carry fewer calories, so only a big gap is mentioned.
   */
  function energyCheck(kcal, p, c, fat) {
    if ([kcal, p, c, fat].some(function (v) { return v == null || !isFinite(v); })) return null;
    var expected = 4 * p + 4 * c + 9 * fat, gap = kcal - expected;
    return { expected: round(expected), gap: round(gap), off: Math.abs(gap) > Math.max(25, expected * 0.2) };
  }

  /** A custom-food row as a food (the same shape as catalog foods). */
  function foodOfCustom(row) {
    var p = row.nutrients_per_100g || {}, sv = row.servings || [];
    return {
      id: 'custom:' + row.id, rowId: row.id, source: 'custom', verification: 'user', name: row.name, brand: row.brand || null,
      gtin: row.barcode || null, kcal: Number(p.kcal), protein_g: Number(p.protein_g), carbs_g: Number(p.carbs_g), fat_g: Number(p.fat_g),
      per: p.per === 'ml' ? 'ml' : 'g', serving_g: sv[0] ? Number(sv[0].g) : null, serving_label: sv[0] ? sv[0].label : null,
      serving_raw: sv[0] && sv[0].raw != null ? sv[0].raw : null, servings: sv.slice(1), nutrients: p.nutrients || {}
    };
  }

  /**
   * The label form for a food: to edit a custom food, or to start a private copy of any food (FDB-5).
   * Values are per serving (the food's first serving, else 100 g).
   */
  function labelOf(food) {
    var size = food.serving_g || 100, f = size / 100, n = {};
    Object.keys(food.nutrients || {}).forEach(function (k) { if (food.nutrients[k] != null) n[k] = round(Number(food.nutrients[k]) * f, 3); });
    // "2 tbsp (32 g)" → "2 tbsp": the size goes in its own field.
    var raw = food.serving_raw != null ? food.serving_raw : String(food.serving_label || '').replace(/\s*\([\d.,]+\s*(g|ml)\)\s*$/i, '');
    return {
      id: food.source === 'custom' ? food.rowId : null, name: food.name, brand: food.brand || '', barcode: food.gtin ? String(food.gtin).replace(/^0+(?=\d{12})/, '') : '',
      servingLabel: food.serving_g ? raw : '', servingSize: round(size, 1), per: food.per === 'ml' ? 'ml' : 'g',
      kcal: round(food.kcal * f, 1), protein_g: round(food.protein_g * f, 1), carbs_g: round(food.carbs_g * f, 1), fat_g: round(food.fat_g * f, 1), nutrients: n
    };
  }

  /** Custom foods matching a search: every word in the name or brand. Newest first. */
  function matchCustom(rows, q) {
    var words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return (rows || []).filter(function (r) {
      if (r.deleted) return false;
      var hay = (r.name + ' ' + (r.brand || '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }).map(foodOfCustom);
  }

  /** The user's own food for a barcode (checked before USDA, so a private correction wins). */
  function customByBarcode(rows, code) {
    var g = GT.toGtin14(code);
    if (!g) return null;
    var hit = (rows || []).filter(function (r) { return !r.deleted && r.barcode === g; })
      .sort(function (a, b) { return String(a.updated_at || a.created_at || '') < String(b.updated_at || b.created_at || '') ? 1 : -1; })[0];
    return hit ? foodOfCustom(hit) : null;
  }

  /* ---------- saved meals ---------- */

  var KEEP = ['name', 'food_source', 'food_ref', 'qty', 'unit', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'alcohol_g', 'nutrients'];
  var MEAL_MAX_BYTES = 60000;   // the table allows 64 KB of items

  /** A saved meal from diary entries (LOG-9). */
  function mealFromEntries(name, entries) {
    var list = (entries || []).filter(function (e) { return !e.deleted; });
    name = String(name || '').trim();
    if (!name) throw new Error('Give the meal a name.');
    if (!list.length) throw new Error('There\'s nothing in this meal to save.');
    var items = list.map(function (e) { var o = {}; KEEP.forEach(function (k) { o[k] = e[k] == null ? null : e[k]; }); return o; });
    if (JSON.stringify(items).length > MEAL_MAX_BYTES) throw new Error('That meal is too big to save. Save it in two parts.');
    return { id: newId(), name: name.slice(0, 200), items: items };
  }

  /**
   * An entry (or saved-meal item) scaled by a factor (×0.5, ×2). Every amount is linear in the
   * quantity, so scaling the snapshot is exact; the unit text keeps its form ("1.5 × 1 bar", "150 g").
   */
  function scaleEntry(e, factor) {
    var out = Object.assign({}, e), n = {};
    ['grams'].forEach(function (k) { if (e[k] != null) out[k] = round(Number(e[k]) * factor, 1); });
    ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'alcohol_g'].forEach(function (k) { if (e[k] != null) out[k] = round(Number(e[k]) * factor, 1); });
    Object.keys(e.nutrients || {}).forEach(function (k) { n[k] = k[0] === '_' ? e.nutrients[k] : round(Number(e.nutrients[k]) * factor, 4); });
    out.nutrients = n;
    if (e.qty != null) {
      var unit = String(e.unit || ''), m;
      if ((m = unit.match(/^[\d.]+ (g|ml)$/))) { out.qty = round(Number(e.grams) * factor, 1); out.unit = out.qty + ' ' + m[1]; }
      else if ((m = unit.match(/^[\d.]+ × (.+)$/))) { out.qty = round(Number(e.qty) * factor, 2); out.unit = (out.qty + ' × ' + m[1]).slice(0, 40); }
      else out.qty = round(Number(e.qty) * factor, 2);
    }
    return out;
  }

  /** Diary entries for a saved meal, scaled, on a date and slot. */
  function entriesFromMeal(meal, factor, date, slot) {
    if (!(factor > 0)) throw new Error('Choose how much of the meal.');
    return (meal.items || []).map(function (it) {
      var e = scaleEntry(it, factor);
      return Object.assign(e, { id: newId(), date: date, slot: slot, logged_via: 'meal' });
    });
  }

  /** Calories and macros of a meal at a scale, for the preview. */
  function mealTotals(meal, factor) {
    return DY.totals((meal.items || []).map(function (it) { return scaleEntry(it, factor || 1); }));
  }

  /** Saved meals matching a search (LOG-3): every word in the meal's name or in one of its items. */
  function matchMeals(meals, q) {
    var words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return (meals || []).filter(function (m) {
      if (m.deleted) return false;
      var hay = (m.name + ' ' + (m.items || []).map(function (i) { return i.name; }).join(' ')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }

  /* ---------- meal slots (LOG-1) ---------- */

  /**
   * The six slots in the user's order, with their names and whether they're hidden, from
   * profile.preferences.slots ([{ id, label, hidden }]). Entries keep the slot id, so renaming or
   * reordering never moves anything; a hidden slot still shows on a day that has food in it.
   */
  function slotsFor(prefs) {
    var saved = (prefs && prefs.slots) || [], byId = {}, out = [];
    DY.SLOTS.forEach(function (s) { byId[s.id] = s; });
    saved.forEach(function (p) {
      if (!byId[p.id] || out.some(function (o) { return o.id === p.id; })) return;
      var label = String(p.label || '').trim();
      out.push({ id: p.id, label: label ? label.slice(0, 30) : byId[p.id].label, hidden: !!p.hidden, standard: byId[p.id].label });
    });
    DY.SLOTS.forEach(function (s) { if (!out.some(function (o) { return o.id === s.id; })) out.push({ id: s.id, label: s.label, hidden: false, standard: s.label }); });
    return out;
  }
  /** Preferences with new slot settings. At least one slot stays visible. */
  function withSlots(prefs, slots) {
    if (!slots.some(function (s) { return !s.hidden; })) throw new Error('Keep at least one meal visible.');
    var list = slots.map(function (s) { var l = String(s.label || '').trim(); return { id: s.id, label: l && l !== s.standard ? l.slice(0, 30) : null, hidden: !!s.hidden }; });
    return Object.assign({}, prefs || {}, { slots: list });
  }

  var api = { LABEL_NUTRIENTS: LABEL_NUTRIENTS, fromLabel: fromLabel, energyCheck: energyCheck, foodOfCustom: foodOfCustom, labelOf: labelOf, matchCustom: matchCustom,
    customByBarcode: customByBarcode, matchMeals: matchMeals, mealFromEntries: mealFromEntries, scaleEntry: scaleEntry, entriesFromMeal: entriesFromMeal, mealTotals: mealTotals,
    slotsFor: slotsFor, withSlots: withSlots };
  if (node) module.exports = api;
  else { root.LW.library = api; }
})(this);
