/* Leanward — diary logic (M5a; PRD LOG-1/5/7/10/11, NUT-1/4, §4 Intake). Pure: no storage or DOM.
 *
 * A diary entry (lw_diary_entries) keeps a snapshot of what was eaten, worked out when it was logged:
 * grams, calories, protein, carbs, fat, alcohol and the other nutrients for that amount. Later
 * corrections to a food never rewrite history. A food's values are per 100 g (or 100 ml when
 * per = 'ml'; ml are treated as grams for the arithmetic, as food labels do).
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;

  var SLOTS = [
    { id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' },
    { id: 'snacks', label: 'Snacks' }, { id: 'beverages', label: 'Beverages' }, { id: 'supplements', label: 'Supplements' }
  ];
  // Every nutrient a food can carry (per 100 g): id, label, unit, Nutrient review group (NUT-2, NUT-6).
  var NUTRIENTS = [
    ['fiber', 'Fiber', 'g', 'carbs'], ['sugar', 'Sugars', 'g', 'carbs'], ['addedSugar', 'Added sugars', 'g', 'carbs'], ['satFat', 'Saturated fat', 'g', 'fats'],
    ['monoFat', 'Monounsaturated fat', 'g', 'fats'], ['polyFat', 'Polyunsaturated fat', 'g', 'fats'], ['transFat', 'Trans fat', 'g', 'fats'], ['cholesterol', 'Cholesterol', 'mg', 'fats'],
    ['sodium', 'Sodium', 'mg', 'minerals'], ['potassium', 'Potassium', 'mg', 'minerals'], ['calcium', 'Calcium', 'mg', 'minerals'], ['magnesium', 'Magnesium', 'mg', 'minerals'],
    ['phosphorus', 'Phosphorus', 'mg', 'minerals'], ['iron', 'Iron', 'mg', 'minerals'], ['zinc', 'Zinc', 'mg', 'minerals'], ['copper', 'Copper', 'mg', 'minerals'], ['selenium', 'Selenium', 'µg', 'minerals'],
    ['vitaminA', 'Vitamin A', 'µg RAE', 'vitamins'], ['vitaminC', 'Vitamin C', 'mg', 'vitamins'], ['vitaminD', 'Vitamin D', 'µg', 'vitamins'], ['vitaminE', 'Vitamin E', 'mg', 'vitamins'],
    ['vitaminK', 'Vitamin K', 'µg', 'vitamins'], ['thiamin', 'Thiamin (B1)', 'mg', 'vitamins'], ['riboflavin', 'Riboflavin (B2)', 'mg', 'vitamins'], ['niacin', 'Niacin (B3)', 'mg', 'vitamins'],
    ['vitaminB6', 'Vitamin B6', 'mg', 'vitamins'], ['vitaminB12', 'Vitamin B12', 'µg', 'vitamins'], ['folate', 'Folate', 'µg DFE', 'vitamins'], ['choline', 'Choline', 'mg', 'vitamins'],
    ['ala', 'Omega-3 ALA', 'g', 'fats'], ['epa', 'Omega-3 EPA', 'g', 'fats'], ['dha', 'Omega-3 DHA', 'g', 'fats'], ['alcohol', 'Alcohol', 'g', 'other'], ['caffeine', 'Caffeine', 'mg', 'other'], ['water', 'Water', 'g', 'other']
  ];
  var G_PER_OZ = 28.349523125, ML_PER_FL_OZ = 29.5735295625;
  // Volume units only for foods measured in ml (drinks): turning a cup of a solid into grams needs its
  // density, which only the food's own labelled servings (e.g. USDA's "1 cup, chopped = 140 g") give.
  var VOLUME = [['fl oz', ML_PER_FL_OZ], ['cup', 236.5882365], ['tbsp', 14.78676478125], ['tsp', 4.92892159375]];

  function round(v, dp) { var f = Math.pow(10, dp || 0); return Math.round(v * f) / f; }
  function newId() { return root.LW && root.LW.model ? root.LW.model.newId() : (node ? require('crypto').randomUUID() : String(Math.random()).slice(2)); }

  /**
   * A serving name fit to show. USDA's survey foods (FNDDS) carry an internal 5-digit portion code in
   * front of the name ("10205 1 cup") and a placeholder serving ("Quantity not specified"); an early
   * import kept both. The code is dropped and the placeholder is not offered (returns '').
   */
  function servingLabel(label) {
    var s = String(label || '').replace(/^\d{5}\s+(?=\S)/, '').replace(/\s+/g, ' ').trim();
    return /^quantity not specified$/i.test(s) ? '' : s;
  }
  /** The serving name inside an entry's stored unit text ("1.5 × 10205 1 cup" → "1 cup"; "150 g" → "g"). */
  function unitLabelOf(e) { return servingLabel(String((e && e.unit) || '').replace(/^[\d.]+\s*(×\s*)?/, '')); }

  /** The units a food can be logged in (LOG-5): its labelled servings first, then g/oz (or ml/fl oz/cup/tbsp/tsp). */
  function unitsFor(food) {
    var out = [], seen = {};
    function add(label, g) { label = servingLabel(label); var k = label.toLowerCase(); if (!label || !(g > 0) || seen[k]) return; seen[k] = 1; out.push({ label: label, g: g }); }
    if (food.serving_g) add(food.serving_label || ('1 serving (' + round(food.serving_g, 1) + ' ' + (food.per === 'ml' ? 'ml' : 'g') + ')'), Number(food.serving_g));
    (food.servings || []).forEach(function (s) { add(s.label, Number(s.g)); });
    if (food.per === 'ml') { add('ml', 1); VOLUME.forEach(function (v) { add(v[0], v[1]); }); }
    else { add('g', 1); add('oz', G_PER_OZ); }
    return out;
  }

  /** Nutrients for `grams` of a food (per-100 values scaled). */
  function amountsFor(food, grams) {
    var f = grams / 100, n = {};
    Object.keys(food.nutrients || {}).forEach(function (k) { var v = Number(food.nutrients[k]); if (isFinite(v)) n[k] = round(v * f, 4); });
    return {
      kcal: round(Number(food.kcal) * f, 1), protein_g: round(Number(food.protein_g) * f, 1), carbs_g: round(Number(food.carbs_g) * f, 1),
      fat_g: round(Number(food.fat_g) * f, 1), alcohol_g: n.alcohol != null ? round(n.alcohol, 1) : null, nutrients: n
    };
  }

  function sourceOf(food) { return food.source === 'off' ? 'off' : food.source === 'custom' ? 'custom' : food.source === 'quick' ? 'quick' : 'usda'; }

  /**
   * A diary entry from a food (LOG-3/4/5). unit is one of unitsFor(food); qty is free (1.5 cups).
   * o: { food, qty, unit: { label, g }, date, slot, via: 'search' | 'recent' | 'barcode' | 'copy' | 'meal' }
   */
  function entryFromFood(o) {
    var grams = o.qty * o.unit.g;
    if (!(grams > 0)) throw new Error('Enter an amount above zero.');
    var a = amountsFor(o.food, grams);
    var label = o.unit.label === 'g' || o.unit.label === 'ml' ? round(o.qty, 1) + ' ' + o.unit.label : round(o.qty, 2) + ' × ' + o.unit.label;
    return {
      id: newId(), date: o.date, slot: o.slot, food_source: sourceOf(o.food), food_ref: String(o.food.id).slice(0, 64),
      name: (o.food.brand ? o.food.name + ' · ' + o.food.brand : o.food.name).slice(0, 200),
      qty: round(o.qty, 2), unit: label.slice(0, 40), grams: round(grams, 1),
      kcal: a.kcal, protein_g: a.protein_g, carbs_g: a.carbs_g, fat_g: a.fat_g, alcohol_g: a.alcohol_g,
      // Per-100 values ride along so the entry can be edited or re-logged later, even offline.
      nutrients: Object.assign({}, a.nutrients, { _per100: per100(o.food), _units: unitsFor(o.food).slice(0, 12) }),
      logged_via: o.via || 'search'
    };
  }
  function per100(f) {
    return { kcal: Number(f.kcal), protein_g: Number(f.protein_g), carbs_g: Number(f.carbs_g), fat_g: Number(f.fat_g), per: f.per || 'g',
      brand: f.brand || null, name: f.name, source: f.source, verification: f.verification || null, nutrients: f.nutrients || {} };
  }
  /** The food an entry was logged from, rebuilt from its snapshot (for editing and re-logging offline). */
  function foodOfEntry(e) {
    var p = e.nutrients && e.nutrients._per100;
    if (!p) return null;
    return { id: e.food_ref, source: p.source, verification: p.verification, name: p.name, brand: p.brand, kcal: p.kcal, protein_g: p.protein_g,
      carbs_g: p.carbs_g, fat_g: p.fat_g, per: p.per, nutrients: p.nutrients, servings: e.nutrients._units || [] };
  }
  /** Change an entry's amount (and optionally slot/date), recomputing the snapshot from its own per-100 values. */
  function updateEntry(e, change) {
    var food = foodOfEntry(e), out = Object.assign({}, e);
    if (change.slot) out.slot = change.slot;
    if (change.date) out.date = change.date;
    if (food && change.qty != null && change.unit) {
      var fresh = entryFromFood({ food: food, qty: change.qty, unit: change.unit, date: out.date, slot: out.slot, via: e.logged_via });
      ['qty', 'unit', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'alcohol_g', 'nutrients'].forEach(function (k) { out[k] = fresh[k]; });
      out.nutrients._units = e.nutrients._units;   // keep the units the food had when logged
    }
    return out;
  }

  /** Quick add (LOG-7): calories only, or calories + protein/carbs/fat, with an optional label. No micronutrients. */
  function quickAdd(o) {
    if (!(o.kcal >= 0) || o.kcal > 20000) throw new Error('Enter the calories.');
    ['protein_g', 'carbs_g', 'fat_g'].forEach(function (k) { if (o[k] != null && !(o[k] >= 0)) throw new Error('Macros can\'t be negative.'); });
    return {
      id: newId(), date: o.date, slot: o.slot, food_source: 'quick', food_ref: null, name: (o.label || 'Quick add').slice(0, 200),
      qty: null, unit: null, grams: null, kcal: round(o.kcal, 1),
      protein_g: o.protein_g == null ? null : round(o.protein_g, 1), carbs_g: o.carbs_g == null ? null : round(o.carbs_g, 1), fat_g: o.fat_g == null ? null : round(o.fat_g, 1),
      alcohol_g: null, nutrients: {}, logged_via: 'quick'
    };
  }

  /**
   * Totals for a set of entries (NUT-1), plus each nutrient's data coverage (NUT-4): the share of the
   * day's calories that came from entries reporting that nutrient. A quick add with no fiber makes
   * fiber coverage less than 100%, so a low total isn't mistaken for a real low intake.
   */
  function totals(entries) {
    var t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, alcohol_g: 0, nutrients: {}, coverage: {}, entries: 0 };
    var cov = {}, kcalAll = 0;
    entries.forEach(function (e) {
      if (e.deleted) return;
      t.entries++;
      var k = Number(e.kcal) || 0;
      t.kcal += k; kcalAll += k;
      t.protein_g += Number(e.protein_g) || 0; t.carbs_g += Number(e.carbs_g) || 0; t.fat_g += Number(e.fat_g) || 0; t.alcohol_g += Number(e.alcohol_g) || 0;
      Object.keys(e.nutrients || {}).forEach(function (key) {
        if (key[0] === '_') return;
        t.nutrients[key] = (t.nutrients[key] || 0) + Number(e.nutrients[key]);
        cov[key] = (cov[key] || 0) + k;
      });
      ['protein_g', 'carbs_g', 'fat_g'].forEach(function (m) { if (e[m] != null) cov[m] = (cov[m] || 0) + k; });
    });
    Object.keys(cov).forEach(function (key) { t.coverage[key] = kcalAll > 0 ? Math.min(1, cov[key] / kcalAll) : 1; });
    ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'alcohol_g'].forEach(function (k) { t[k] = round(t[k], 1); });
    return t;
  }

  /**
   * Target comparison for the day (NUT-1, LOG-13). Over target is stated plainly with a neutral tone;
   * nothing is marked as failure.
   */
  function versusTarget(t, target) {
    if (!target) return null;
    var left = target.kcal - t.kcal;
    return {
      kcal: { eaten: t.kcal, target: target.kcal, left: left, text: left >= 0 ? Math.round(left).toLocaleString('en-US') + ' left' : Math.round(-left).toLocaleString('en-US') + ' over' },
      protein: { eaten: t.protein_g, target: target.protein_g }, carbs: { eaten: t.carbs_g, target: target.carbs_g },
      fat: { eaten: t.fat_g, target: target.fat_g }, fiber: { eaten: t.nutrients.fiber || 0, target: target.fiber_g }
    };
  }

  /** Recent foods (LOG-2): most recent first, one per food, quick adds excluded. Each carries its last amount. */
  function recents(entries, limit) {
    var seen = {}, out = [];
    entries.filter(function (e) { return !e.deleted && e.food_ref && e.food_source !== 'quick'; })
      .sort(function (a, b) { return (a.date + (a.created_at || '')) < (b.date + (b.created_at || '')) ? 1 : -1; })
      .forEach(function (e) { if (!seen[e.food_ref] && out.length < (limit || 20)) { seen[e.food_ref] = 1; out.push(e); } });
    return out;
  }
  /** Foods logged before whose name has every word of the query (search shows them first), most recent first.
   *  Your own created foods are left out: search lists them under "Your foods" already. */
  function matchLogged(entries, q, limit) {
    var words = String(q || '').toLowerCase().replace(/'s\b/g, '').split(/[^a-z0-9%]+/).filter(Boolean);
    if (!words.length) return [];
    return recents((entries || []).filter(function (e) { return !/^custom:/.test(e.food_ref || ''); }), 500).filter(function (e) {
      var hay = (e.name + ' ' + ((e.nutrients && e.nutrients._per100 && e.nutrients._per100.brand) || '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).slice(0, limit || 5);
  }
  /**
   * Calories by 4/4/9 (and 7 for alcohol) next to the food's own calories, with the likely reason when
   * they differ by more than 8% and 15 kcal per 100 g. Leanward always uses the source's calories.
   */
  function atwaterNote(food) {
    var p = Number(food.protein_g), c = Number(food.carbs_g), f = Number(food.fat_g), k = Number(food.kcal);
    if (![p, c, f, k].every(isFinite) || k <= 0) return null;
    var alc = Number((food.nutrients || {}).alcohol) || 0, est = 4 * p + 4 * c + 9 * f + 7 * alc, gap = k - est;
    if (Math.abs(gap) <= Math.max(15, k * 0.08)) return null;
    var src = String(food.source || ''), why;
    if (/^usda-(sr|foundation|fndds)/.test(src)) why = 'USDA works out calories with factors for each kind of food (for example lower for the protein and carbs in grains and beans), not a flat 4/4/9.';
    else if (gap < 0) why = 'Labels often count fiber at about 2 kcal a gram instead of 4, count sugar alcohols lower, and round each line.';
    else why = 'The label may round each line, or count something the macros leave out. If it looks wrong, check the package.';
    return { kcal: round(k, 1), byMacros: round(est, 1), gap: round(gap, 1), text: 'By 4/4/9 this would be ' + Math.round(est) + ' kcal, not ' + Math.round(k) + '. ' + why + ' Leanward uses the source\'s calories.' };
  }

  /** Frequent foods: logged most often in the last `days` days before `today`. */
  function frequents(entries, today, days, limit) {
    var since = addDays(today, -(days || 30)), n = {}, last = {};
    entries.forEach(function (e) {
      if (e.deleted || !e.food_ref || e.food_source === 'quick' || e.date < since) return;
      n[e.food_ref] = (n[e.food_ref] || 0) + 1;
      if (!last[e.food_ref] || last[e.food_ref].date <= e.date) last[e.food_ref] = e;
    });
    return Object.keys(n).filter(function (k) { return n[k] >= 2; }).sort(function (a, b) { return n[b] - n[a]; }).slice(0, limit || 10).map(function (k) { return { entry: last[k], count: n[k] }; });
  }

  /**
   * Quick log (HOM-3): the foods most often logged in this slot over the last 30 days, each with its
   * most recent amount, leaving out ones already logged in that slot today. Most frequent first.
   */
  function quickPicks(entries, slot, today, limit) {
    var since = addDays(today, -30), n = {}, last = {}, done = {};
    entries.forEach(function (e) {
      if (e.deleted || e.slot !== slot || !e.food_ref || e.food_source === 'quick') return;
      if (e.date === today) { done[e.food_ref] = 1; return; }
      if (e.date < since || e.date > today) return;
      n[e.food_ref] = (n[e.food_ref] || 0) + 1;
      if (!last[e.food_ref] || (last[e.food_ref].date + (last[e.food_ref].created_at || '')) <= (e.date + (e.created_at || ''))) last[e.food_ref] = e;
    });
    return Object.keys(n).filter(function (k) { return !done[k]; })
      .sort(function (a, b) { return n[b] - n[a] || (last[a].date < last[b].date ? 1 : -1); }).slice(0, limit || 5).map(function (k) { return last[k]; });
  }

  /**
   * "Your usual breakfast" (HOM-3, v1.25): the same set of foods logged in this slot on at least 3 of the
   * last 28 days, and on at least 40% of the days that slot was logged. Returns that day's entries (the most
   * recent day with the set, so the amounts are the latest), with { days, of }; null when there's no habit.
   */
  function usualMeal(entries, slot, today, days) {
    var since = addDays(today, -(days || 28)), byDay = {};
    entries.forEach(function (e) {
      if (e.deleted || e.slot !== slot || e.date < since || e.date >= today) return;
      (byDay[e.date] = byDay[e.date] || []).push(e);
    });
    var dates = Object.keys(byDay).sort(), count = {}, latest = {};
    dates.forEach(function (d) {
      var refs = byDay[d].map(function (e) { return e.food_ref || ('quick:' + e.name + ':' + Math.round(Number(e.kcal) || 0)); }).sort();
      var key = refs.join('|');
      count[key] = (count[key] || 0) + 1; latest[key] = d;
    });
    var best = Object.keys(count).sort(function (a, b) { return count[b] - count[a] || (latest[a] < latest[b] ? 1 : -1); })[0];
    if (!best || count[best] < 3 || count[best] < 0.4 * dates.length) return null;
    return { entries: byDay[latest[best]], days: count[best], of: dates.length };
  }

  /** Copy entries to another date (and optionally slot) as new entries (LOG-10). */
  function copyEntries(list, toDate, toSlot) {
    return list.filter(function (e) { return !e.deleted; }).map(function (e) {
      var c = Object.assign({}, e, { id: newId(), date: toDate, slot: toSlot || e.slot, logged_via: 'copy' });
      delete c.rev; delete c.dirty; delete c.updated_at; delete c.created_at;
      return c;
    });
  }

  var PLAIN_UNITS = ['g', 'ml', 'oz', 'fl oz', 'cup', 'tbsp', 'tsp'];
  /**
   * An entry's amount as people say it: "8 oz · 227 g", "1 bagel (46 g)", "2 × 1 bar (40 g) · 80 g", "150 g".
   * The stored unit text is "QTY × LABEL" (or "150 g"); the grams are added only when the text doesn't
   * already say them.
   */
  function amountText(e) {
    var unit = String(e.unit || '');
    if (!unit) return '';
    var m = /^([\d.]+) × (.+)$/.exec(unit), text = unit, per = / ml\)?$/.test(unit) ? 'ml' : 'g';
    if (m) {
      var qty = Number(m[1]), label = servingLabel(m[2]) || m[2];
      text = m[1] + ' × ' + label;
      if (PLAIN_UNITS.indexOf(label.toLowerCase()) >= 0) text = m[1] + ' ' + label;
      else if (qty === 1 && /^1\b/.test(label)) text = label;
    }
    var grams = e.grams == null ? null : Math.round(Number(e.grams) * 10) / 10;
    if (grams == null || !(grams > 0)) return text;
    var said = new RegExp('(^|[^\\d.])' + String(grams).replace('.', '\\.') + ' ?(g|ml)\\b').test(text);
    return said ? text : text + ' · ' + grams + ' ' + per;
  }
  /** A food name for display: words shouted in capitals (5+ letters) are calmed to Title Case; short ones (USDA, KIND, BBQ) stay. */
  function calmName(name) {
    return String(name || '').replace(/\b[A-Z][A-Z']{4,}\b/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); });
  }

  /** The slot to suggest for the time of day (minutes since midnight). */
  function slotForTime(minutes) {
    if (minutes < 10 * 60 + 30) return 'breakfast';
    if (minutes < 15 * 60) return 'lunch';
    if (minutes < 17 * 60) return 'snacks';
    if (minutes < 21 * 60) return 'dinner';
    return 'snacks';
  }

  function addDays(iso, n) {
    var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }

  var api = { atwaterNote: atwaterNote, matchLogged: matchLogged, SLOTS: SLOTS, NUTRIENTS: NUTRIENTS, G_PER_OZ: G_PER_OZ, unitsFor: unitsFor, amountsFor: amountsFor, entryFromFood: entryFromFood, foodOfEntry: foodOfEntry,
    updateEntry: updateEntry, quickAdd: quickAdd, totals: totals, versusTarget: versusTarget, recents: recents, frequents: frequents,
    quickPicks: quickPicks, usualMeal: usualMeal, servingLabel: servingLabel, unitLabelOf: unitLabelOf, amountText: amountText, calmName: calmName, copyEntries: copyEntries, slotForTime: slotForTime, addDays: addDays };
  if (node) module.exports = api;
  else { root.LW.diary = api; }
})(this);
