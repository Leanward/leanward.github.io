/* Leanward — recipes (PRD LOG-15): ingredients + the weight of the finished dish → a food per 100 g.
 *
 * A recipe is saved as one of the user's own foods (lw_custom_foods) with a `recipe` column holding the
 * ingredients, so logging, search and sync work as for any other food of theirs. Each ingredient keeps
 * a snapshot of its food per 100 g, so the recipe can be changed later offline and old ingredients stay
 * right even if the catalog changes.
 *
 * Nutrients per 100 g of the dish = the sum over ingredients ÷ cooked weight × 100. Cooking changes the
 * weight (water lost or absorbed), not the calories, so the finished weight is what makes "250 g of the
 * pot" right. A vitamin or mineral is listed only when ingredients that list it make up at least 90% of
 * the recipe's calories, so a missing value isn't shown as a low one.
 * Pure: no DOM, no storage. Testable in Node.
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var DY = node ? require('./diary.js') : root.LW.diary;

  var MAX_ITEMS = 40, KNOWN_SHARE = 0.9;
  function round(x, step) { return Math.round(x / step) * step; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function newId() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /** An ingredient from a food (catalog, online or your own), an amount and one of DY.unitsFor(food). */
  function ingredientOf(food, qty, unit) {
    if (!food || !(qty > 0) || !unit || !(unit.g > 0)) throw new Error('Enter an amount above zero.');
    if (food.recipe) throw new Error('A recipe can\'t go inside another recipe yet. Add its ingredients instead.');
    var n = {};
    Object.keys(food.nutrients || {}).forEach(function (k) { var v = Number(food.nutrients[k]); if (isFinite(v) && k.charAt(0) !== '_') n[k] = v; });
    return {
      ref: String(food.id || '').slice(0, 64), name: String(food.name || 'Ingredient').slice(0, 200), brand: food.brand || null,
      qty: Number(qty), unit: DY.servingLabel(unit.label) || unit.label, g: r1(qty * unit.g),
      per100: { kcal: Number(food.kcal) || 0, protein_g: Number(food.protein_g) || 0, carbs_g: Number(food.carbs_g) || 0, fat_g: Number(food.fat_g) || 0, per: food.per === 'ml' ? 'ml' : 'g', nutrients: n }
    };
  }

  /** The same ingredient at a new amount, in the unit it was added with. */
  function withQty(item, qty) {
    if (!(qty > 0)) throw new Error('Enter an amount above zero.');
    var gPerUnit = item.g / item.qty;
    return Object.assign({}, item, { qty: Number(qty), g: r1(qty * gPerUnit) });
  }

  /** Totals for the whole recipe: calories, macros, vitamins and minerals (with the 90% rule), raw weight. */
  function totals(items) {
    var t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, rawG: 0, nutrients: {} }, known = {}, sums = {};
    (items || []).forEach(function (it) {
      var a = DY.amountsFor(it.per100, it.g);
      t.kcal += a.kcal; t.protein_g += a.protein_g; t.carbs_g += a.carbs_g; t.fat_g += a.fat_g; t.rawG += it.g;
      Object.keys(a.nutrients).forEach(function (k) { sums[k] = (sums[k] || 0) + a.nutrients[k]; known[k] = (known[k] || 0) + a.kcal; });
    });
    Object.keys(sums).forEach(function (k) { if (t.kcal <= 0 || known[k] / t.kcal >= KNOWN_SHARE) t.nutrients[k] = sums[k]; });
    t.kcal = r1(t.kcal); t.protein_g = r1(t.protein_g); t.carbs_g = r1(t.carbs_g); t.fat_g = r1(t.fat_g); t.rawG = r1(t.rawG);
    return t;
  }

  /**
   * Check a recipe before saving and work out its food row.
   * r: { id?, name, items, cookedG?, servings? } — cookedG blank = the ingredients' raw weight.
   * Returns { row, totals, cookedG, per100 } or throws with a message for the user.
   */
  function build(r, now) {
    var name = String(r.name || '').trim();
    if (!name) throw new Error('Give the recipe a name.');
    var items = r.items || [];
    if (!items.length) throw new Error('Add at least one ingredient.');
    if (items.length > MAX_ITEMS) throw new Error('A recipe can have up to ' + MAX_ITEMS + ' ingredients.');
    var t = totals(items);
    var cooked = r.cookedG == null || r.cookedG === '' ? t.rawG : Number(r.cookedG);
    if (!(cooked > 0)) throw new Error('Enter the weight of the finished dish, or leave it blank.');
    // Cooking can shrink a dish (water lost) or swell it (rice, pasta, beans take water up), but not by 10×.
    if (cooked < t.rawG * 0.2 || cooked > t.rawG * 5) throw new Error('The finished weight (' + Math.round(cooked) + ' g) is far from the ingredients\' ' + Math.round(t.rawG) + ' g. Check it: weigh the pot, then take off the pot\'s own weight.');
    var servings = r.servings == null || r.servings === '' ? null : Number(r.servings);
    if (servings != null && !(servings >= 1 && servings <= 100 && Math.round(servings) === servings)) throw new Error('Servings should be a whole number from 1 to 100, or blank.');
    var f = 100 / cooked, n = {};
    Object.keys(t.nutrients).forEach(function (k) { n[k] = round(t.nutrients[k] * f, 0.0001); });
    var per100 = { kcal: r1(t.kcal * f), protein_g: round(t.protein_g * f, 0.01), carbs_g: round(t.carbs_g * f, 0.01), fat_g: round(t.fat_g * f, 0.01), per: 'g', nutrients: n };
    var sv = [];
    if (servings > 1) sv.push({ label: '1 serving (1/' + servings + ' of the recipe)', g: r1(cooked / servings) });
    sv.push({ label: 'whole recipe', g: r1(cooked) });
    var row = {
      id: r.id || newId(), name: name.slice(0, 200), brand: null, barcode: null, nutrients_per_100g: per100, servings: sv,
      recipe: { items: items, cooked_g: r1(cooked), cooked_given: !(r.cookedG == null || r.cookedG === ''), servings: servings, raw_g: t.rawG, saved_at: now || null }
    };
    return { row: row, totals: t, cookedG: r1(cooked), per100: per100 };
  }

  /** The editor's starting state for a saved recipe row. */
  function editState(row) {
    var rc = row.recipe || {};
    return { id: row.id, name: row.name, items: (rc.items || []).slice(), cookedG: rc.cooked_given ? rc.cooked_g : null, servings: rc.servings || null };
  }

  var api = { MAX_ITEMS: MAX_ITEMS, KNOWN_SHARE: KNOWN_SHARE, ingredientOf: ingredientOf, withQty: withQty, totals: totals, build: build, editState: editState };
  if (node) module.exports = api;
  else { root.LW = root.LW || {}; root.LW.recipe = api; }
})(this);
