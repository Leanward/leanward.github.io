/* Leanward — the Nutrient review (M5b; PRD NUT-6, NUT-7, NUT-4). Pure: no storage or DOM.
 *
 * Every nutrient the day's foods report, grouped as Energy and macros · Fats · Carbohydrates ·
 * Minerals · Vitamins · Other, each with its data coverage (the share of calories from foods that
 * report it). The 7-day average counts only days with food logged.
 *
 * Micronutrient targets come from calc/dri.js (checked against the National Academies tables,
 * dri.VERIFIED). If that flag were ever false, the app passes no targets and the review shows amounts
 * and coverage only. Limits and ratios (calc/nutrients.js, Dietary Guidelines for Americans) are shown.
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var DY = node ? require('./diary.js') : root.LW.diary;
  var NU = node ? require('./calc/nutrients.js') : root.LW.calc.nutrients;

  var GROUPS = [['macros', 'Energy and macros'], ['fats', 'Fats'], ['carbs', 'Carbohydrates'], ['minerals', 'Minerals'], ['vitamins', 'Vitamins'], ['other', 'Other']];
  // Food data unit → DRI unit, where they differ (USDA lists copper in mg; the DRI is in µg).
  var TO_DRI = { copper: 1000 };

  /** Totals for the logged days among `dates`, divided by how many there were. */
  function average(entries, dates) {
    var logged = dates.filter(function (d) { return entries.some(function (e) { return !e.deleted && e.date === d; }); });
    var t = DY.totals(entries.filter(function (e) { return logged.indexOf(e.date) >= 0; }));
    var n = logged.length || 1;
    ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'alcohol_g'].forEach(function (k) { t[k] = t[k] / n; });
    Object.keys(t.nutrients).forEach(function (k) { t.nutrients[k] = t.nutrients[k] / n; });
    t.days = logged.length;
    return t;
  }
  /** The 7 days ending on `date`. */
  function week(date) { var out = []; for (var i = 6; i >= 0; i--) out.push(DY.addDays(date, -i)); return out; }

  /**
   * Review rows, grouped. t: totals (DY.totals or average). targets: dri.targetsFor() result, or null.
   * Each row: { id, label, unit, amount, coverage, target?, pct?, kind?, flags }.
   */
  function rows(t, targets) {
    var groups = GROUPS.map(function (g) { return { id: g[0], label: g[1], rows: [] }; });
    var by = {};
    groups.forEach(function (g) { by[g.id] = g; });
    if (t.entries) {
      by.macros.rows.push({ id: 'kcal', label: 'Calories', unit: 'kcal', amount: t.kcal, coverage: 1, flags: [] });
      [['protein_g', 'Protein'], ['carbs_g', 'Carbohydrates'], ['fat_g', 'Fat']].forEach(function (m) {
        by.macros.rows.push({ id: m[0], label: m[1], unit: 'g', amount: t[m[0]], coverage: t.coverage[m[0]] == null ? 0 : t.coverage[m[0]], flags: [] });
      });
      if (t.alcohol_g) by.macros.rows.push({ id: 'alcohol_g', label: 'Alcohol', unit: 'g', amount: t.alcohol_g, coverage: 1, flags: [] });
    }
    DY.NUTRIENTS.forEach(function (n) {
      if (n[0] === 'alcohol' || t.nutrients[n[0]] == null) return;
      var r = { id: n[0], label: n[1], unit: n[2], amount: t.nutrients[n[0]], coverage: t.coverage[n[0]] == null ? 1 : t.coverage[n[0]], flags: [] };
      var d = targets && targets[n[0]];
      if (d) {
        var ev = NU.evaluate(n[0], r.amount * (TO_DRI[n[0]] || 1), d, r.coverage);
        r.target = d.target / (TO_DRI[n[0]] || 1); r.pct = ev.pct; r.kind = d.kind; r.flags = ev.flags; r.ulNote = ev.ulNote || null;
        if (d.limit != null) r.limit = d.limit / (TO_DRI[n[0]] || 1);
      }
      by[n[3]].rows.push(r);
    });
    return groups.filter(function (g) { return g.rows.length; });
  }

  /** Limits, guidelines and ratios (NUT-7) for the totals. kg: latest weight, for protein per kg. */
  function quality(t, kg) {
    if (!t.entries) return [];
    var n = t.nutrients, epa = n.epa, dha = n.dha;
    return NU.quality({
      kcal: t.kcal, proteinG: t.protein_g, carbsG: t.carbs_g, fatG: t.fat_g, alcoholG: t.alcohol_g,
      satFatG: n.satFat, addedSugarG: n.addedSugar, sodiumMg: n.sodium, potassiumMg: n.potassium, fiberG: n.fiber,
      epaDhaMg: epa == null && dha == null ? null : ((epa || 0) + (dha || 0)) * 1000
    }, kg ? { kg: kg } : null);
  }

  /** The foods that gave the most of a nutrient (NUT-7), largest first, with their share. */
  function contributors(entries, id, limit) {
    var key = function (e) { return id === 'kcal' || /_g$/.test(id) ? Number(e[id]) : Number((e.nutrients || {})[id]); };
    var by = {}, total = 0;
    entries.forEach(function (e) {
      if (e.deleted) return;
      var v = key(e);
      if (!(v > 0)) return;
      var k = e.food_ref || e.name;
      by[k] = by[k] || { name: e.name, amount: 0 };
      by[k].amount += v; total += v;
    });
    return Object.keys(by).map(function (k) { return { name: by[k].name, amount: by[k].amount, share: total ? by[k].amount / total : 0 }; })
      .sort(function (a, b) { return b.amount - a.amount; }).slice(0, limit || 3);
  }

  /** The % daily value bar for a nutrient row, or null when it has no target.
   *  fill: share of the bar filled (0–1). The bar's end is the target; for a nutrient with a limit
   *  (sodium) the bar's end is the limit and mark is where the target sits. tone: 'met' (target reached),
   *  'over' (over the limit or above the upper limit), 'part' (on the way). */
  function meter(r) {
    if (!r || r.pct == null || !(r.target > 0)) return null;
    var f = r.flags || [], over = f.indexOf('over-limit') >= 0 || f.indexOf('above-ul') >= 0;
    var amt = Math.max(0, Number(r.amount) || 0);
    if (r.limit > 0) {
      return { fill: Math.min(1, amt / r.limit), mark: Math.min(1, r.target / r.limit), tone: over ? 'over' : amt >= r.target ? 'met' : 'part' };
    }
    return { fill: Math.min(1, r.pct / 100), mark: null, tone: over ? 'over' : r.pct >= 100 ? 'met' : 'part' };
  }

  var api = { GROUPS: GROUPS, TO_DRI: TO_DRI, average: average, week: week, rows: rows, quality: quality, contributors: contributors, meter: meter };
  if (node) module.exports = api;
  else { root.LW.review = api; }
})(this);
