/* Leanward — the food catalog in the app (M4b): search, barcode lookup with the Open Food Facts
 * fallback, and one shape for a food whatever its source (PRD §7, LOG-3/4, FDB-1/3/6).
 *
 * A food here: { id, source, verification, name, brand, gtin, kcal, protein_g, carbs_g, fat_g, per,
 *   serving_g, serving_label, servings: [{label, g}], nutrients: {key: amount per 100}, preparation,
 *   energy_derived, attribution? }
 * Amounts are per 100 g (or 100 ml when per = 'ml'). The pure helpers run in Node for tests;
 * search() and byBarcode() need the browser (Supabase client, fetch).
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var gtin = node ? require('./gtin.js') : root.LW.gtin;

  var OFF_API = 'https://world.openfoodfacts.org/api/v2/product/';
  // Text search ("Search online", FDB-3): US products first (the us. site lists products sold in the
  // US), then worldwide if that finds nothing. Open Food Facts asks for at most 10 searches a minute,
  // so the app searches only when the user taps the button.
  var OFF_SEARCH_HOSTS = ['https://us.openfoodfacts.org', 'https://world.openfoodfacts.org'];
  var OFF_FIELDS = 'code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,nutrition_data_per,last_modified_t';
  var OFF_ATTRIBUTION = 'Data from Open Food Facts (openfoodfacts.org), © Open Food Facts contributors, under the Open Database License (ODbL). Community data: check it against the label.';

  // Open Food Facts nutriment (per 100 g, in grams unless noted) → Leanward key and factor to our unit.
  var OFF_NUTRIENTS = {
    'fiber_100g': ['fiber', 1], 'sugars_100g': ['sugar', 1], 'added-sugars_100g': ['addedSugar', 1],
    'saturated-fat_100g': ['satFat', 1], 'monounsaturated-fat_100g': ['monoFat', 1], 'polyunsaturated-fat_100g': ['polyFat', 1],
    'trans-fat_100g': ['transFat', 1], 'cholesterol_100g': ['cholesterol', 1000],
    'sodium_100g': ['sodium', 1000], 'potassium_100g': ['potassium', 1000], 'calcium_100g': ['calcium', 1000],
    'iron_100g': ['iron', 1000], 'magnesium_100g': ['magnesium', 1000], 'zinc_100g': ['zinc', 1000],
    'vitamin-c_100g': ['vitaminC', 1000], 'vitamin-d_100g': ['vitaminD', 1e6], 'vitamin-a_100g': ['vitaminA', 1e6],
    'caffeine_100g': ['caffeine', 1000], 'alcohol_100g': ['alcoholPct', 1]
  };

  function num(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function round(v, dp) { var f = Math.pow(10, dp); return Math.round(v * f) / f; }

  /**
   * An Open Food Facts product → a Leanward food, or null if it's missing calories or a macro (FDB-6)
   * or has impossible values. Labelled "community" with the ODbL attribution (FDB-3).
   */
  function fromOff(p, scannedGtin) {
    if (!p) return null;
    var n = p.nutriments || {};
    var kcal = num(n['energy-kcal_100g']);
    if (kcal == null && num(n['energy_100g']) != null && String(n['energy_unit'] || 'kJ').toLowerCase() === 'kj') kcal = num(n['energy_100g']) / 4.184;
    var protein = num(n['proteins_100g']), carbs = num(n['carbohydrates_100g']), fat = num(n['fat_100g']);
    if (kcal == null || protein == null || carbs == null || fat == null) return null;
    if (kcal < 0 || kcal > 1000 || protein < 0 || protein > 100 || carbs < 0 || carbs > 100 || fat < 0 || fat > 100) return null;
    var name = String(p.product_name_en || p.product_name || p.generic_name || '').replace(/\s+/g, ' ').trim();
    if (!name) return null;
    var nutrients = {};
    Object.keys(OFF_NUTRIENTS).forEach(function (k) {
      var v = num(n[k]); if (v == null || v < 0) return;
      nutrients[OFF_NUTRIENTS[k][0]] = round(v * OFF_NUTRIENTS[k][1], 4);
    });
    var servingG = num(p.serving_quantity);
    var code = gtin.toGtin14(p.code) || scannedGtin || null;
    return {
      id: 'off:' + (code || p.code), source: 'off', verification: 'community',
      name: name.slice(0, 300), brand: p.brands ? String(p.brands).split(',')[0].trim().slice(0, 200) : null, gtin: code,
      kcal: round(kcal, 1), protein_g: round(protein, 2), carbs_g: round(carbs, 2), fat_g: round(fat, 2), energy_derived: false,
      per: 'g', serving_g: servingG && servingG > 0 ? servingG : null, serving_label: p.serving_size ? String(p.serving_size).slice(0, 120) : null,
      servings: [], nutrients: nutrients, preparation: null, attribution: OFF_ATTRIBUTION
    };
  }

  /** Barcodes to try at Open Food Facts for a GTIN-14: EAN-13, then UPC-A (12) for US products. */
  function offCodes(g14) {
    var out = [], s = String(g14 || '');
    if (!/^\d{14}$/.test(s)) return out;
    var ean13 = s.slice(1);
    out.push(ean13);
    if (ean13[0] === '0') out.push(ean13.slice(1));
    if (s.slice(0, 6) === '000000') out.push(s.slice(6));     // EAN-8
    return out.filter(function (c, i, a) { return a.indexOf(c) === i; });
  }

  /** Per-serving amounts from per-100 values. */
  function scale(food, grams) {
    var f = grams / 100, n = {};
    Object.keys(food.nutrients || {}).forEach(function (k) { n[k] = food.nutrients[k] * f; });
    return { kcal: food.kcal * f, protein_g: food.protein_g * f, carbs_g: food.carbs_g * f, fat_g: food.fat_g * f, nutrients: n };
  }

  var SOURCE_LABEL = { 'usda-foundation': 'USDA Foundation', 'usda-sr-legacy': 'USDA SR Legacy', 'usda-fndds': 'USDA FNDDS', 'usda-branded': 'USDA Branded', off: 'Open Food Facts', custom: 'Your food' };
  /** The badge text for a result (FDB-1): verified USDA generic, USDA branded, or community. */
  function badge(food) {
    if (food.verification === 'community' || food.source === 'off') return { text: 'Community', kind: 'community' };
    if (food.source === 'custom') return { text: 'Yours', kind: 'user' };
    if (food.source === 'usda-branded') return { text: 'Branded · USDA', kind: 'verified' };
    return { text: 'USDA', kind: 'verified' };
  }

  /* ---------- browser: Supabase and Open Food Facts ---------- */
  var cache = {};
  function client() { var c = root.LW && root.LW.cloud && root.LW.cloud.client(); if (!c) throw new Error('Search isn\'t available yet. Reload and try again.'); return c; }

  /** Catalog search (lw_search_foods). Resolves to an array of foods (without nutrients). */
  function search(q, limit) {
    q = String(q || '').trim();
    if (q.length < 2) return Promise.resolve([]);
    return client().rpc('lw_search_foods', { q: q, max_results: limit || 25 }).then(function (res) {
      if (res.error) throw new Error(res.error.message);
      return res.data || [];
    });
  }

  /** Full record for a catalog food (nutrients and servings). */
  function get(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    return client().from('lw_foods').select('id,source,source_id,verification,name,brand,gtin,category,kcal,protein_g,carbs_g,fat_g,energy_derived,per,serving_g,serving_label,servings,nutrients,preparation,published')
      .eq('id', id).maybeSingle().then(function (res) {
        if (res.error) throw new Error(res.error.message);
        if (res.data) { res.data = normalize(res.data); cache[id] = res.data; }
        return res.data;
      });
  }
  function normalize(f) {
    ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'serving_g'].forEach(function (k) { if (f[k] != null) f[k] = Number(f[k]); });
    return f;
  }

  /**
   * Barcode → food. USDA first (one canonical record per barcode); if it isn't there, Open Food Facts.
   * Resolves to { food, source: 'usda' | 'off', gtin } or { food: null, gtin, reason }.
   */
  function byBarcode(code) {
    var g = gtin.toGtin14(code);
    if (!g) return Promise.resolve({ food: null, gtin: null, reason: 'That doesn\'t look like a product barcode.' });
    return client().rpc('lw_food_by_barcode', { gtin14: g }).then(function (res) {
      if (res.error) throw new Error(res.error.message);
      var row = Array.isArray(res.data) ? res.data[0] : res.data;
      if (row && row.id) { row = normalize(row); cache[row.id] = row; return { food: row, source: 'usda', gtin: g }; }
      return offLookup(g);
    });
  }
  function offLookup(g) {
    var codes = offCodes(g), i = 0;
    function next() {
      if (i >= codes.length) return { food: null, gtin: g, reason: 'Not in USDA or Open Food Facts.' };
      var c = codes[i++];
      return root.fetch(OFF_API + encodeURIComponent(c) + '?fields=' + OFF_FIELDS).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
        .then(function (j) {
          if (j && j.status === 1 && j.product) {
            var f = fromOff(j.product, g);
            if (f) { cache[f.id] = f; return { food: f, source: 'off', gtin: g }; }
            return { food: null, gtin: g, reason: 'Open Food Facts has this product, but without calories or a macro, so Leanward doesn\'t show it.' };
          }
          return next();
        });
    }
    return next();
  }

  /** The Open Food Facts text-search URL for a query. */
  function offSearchUrl(q, host) {
    return (host || OFF_SEARCH_HOSTS[0]) + '/cgi/search.pl?search_terms=' + encodeURIComponent(String(q || '').trim().slice(0, 100)) +
      '&search_simple=1&action=process&json=1&page_size=24&sort_by=unique_scans_n&fields=' + OFF_FIELDS;
  }
  /** Products from an Open Food Facts search response, as foods (FDB-6 rules apply), one per barcode. */
  function fromOffSearch(json) {
    var seen = {}, out = [];
    ((json && json.products) || []).forEach(function (p) {
      var f = fromOff(p);
      if (f && !seen[f.id]) { seen[f.id] = 1; out.push(f); }
    });
    return out;
  }
  /**
   * Search Open Food Facts by name (browser). Only the typed words are sent. Resolves to foods,
   * which are cached so the detail screen opens without another request.
   */
  function offSearch(q, opts) {
    q = String(q || '').trim();
    if (q.length < 2) return Promise.resolve([]);
    var G = typeof globalThis !== 'undefined' ? globalThis : root;
    var timeoutMs = (opts && opts.timeoutMs) || 12000, i = 0, lastErr = null;
    // Open Food Facts' search is often busy (503) or slow; each try gets a time limit, and a failed or
    // empty US search falls back to the worldwide site once.
    function attempt(host) {
      var ctl = G.AbortController ? new G.AbortController() : null;
      var timer = G.setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs);
      return G.fetch(offSearchUrl(q, host), ctl ? { signal: ctl.signal } : undefined).then(function (r) {
        if (r.status === 429 || r.status === 503) throw new Error('busy');
        if (!r.ok) throw new Error('status ' + r.status);
        return r.json();
      }).then(function (j) { G.clearTimeout(timer); return fromOffSearch(j); },
        function (e) { G.clearTimeout(timer); throw e; });
    }
    function next() {
      if (i >= OFF_SEARCH_HOSTS.length) {
        var msg = lastErr && lastErr.name === 'AbortError' ? 'Open Food Facts didn\'t answer in time.' : 'Open Food Facts is busy right now.';
        return Promise.reject(new Error(msg + ' Try again in a minute, or create the food from its label.'));
      }
      var host = OFF_SEARCH_HOSTS[i++];
      return attempt(host).then(function (foods) {
        if (!foods.length && i < OFF_SEARCH_HOSTS.length) return next();
        foods.forEach(function (f) { cache[f.id] = f; });
        return foods;
      }, function (e) { lastErr = e; return next(); });
    }
    return next();
  }

  var api = { OFF_ATTRIBUTION: OFF_ATTRIBUTION, offSearchUrl: offSearchUrl, fromOffSearch: fromOffSearch, offSearch: offSearch, SOURCE_LABEL: SOURCE_LABEL, fromOff: fromOff, offCodes: offCodes, scale: scale, badge: badge, search: search, get: get, byBarcode: byBarcode };
  if (node) module.exports = api;
  else { root.LW.foods = api; }
})(this);
