/* Leanward — the add sheet: Recent and Frequent (LOG-2), Find a food (LOG-3), your own foods
 * (LOG-8, FDB-5), saved meals (LOG-9), Quick add (LOG-7), food detail with amount, unit and meal
 * (NUT-5, LOG-5, FDB-1/3/5) and barcode scanning with "Create this food" (LOG-4).
 * Opened from the global + button or a Diary slot's +. Logging writes a diary entry (js/diary.js).
 * Barcode scanning uses ZXing (js/vendor/zxing.min.js, Apache-2.0), loaded the first time you scan.
 */
(function (root) {
  'use strict';

  var FD = root.LW.foods, DY = root.LW.diary, L = root.LW.library, fmt = root.LW.calc.core.fmt, doc = root.document;

  var NUTRIENTS = DY.NUTRIENTS;   // id, label, unit, group (js/diary.js)
  var ISSUES = [['wrong-nutrients', 'Wrong nutrients'], ['wrong-serving', 'Wrong serving size'], ['wrong-name', 'Wrong name or brand'], ['duplicate', 'Duplicate'], ['other', 'Something else']];

  function create(ctx) {
    var S = ctx.state, esc = ctx.esc, timer = null, seq = 0, reader = null, scanStart = 0;

    function wrap(title, body, extra) {
      return '<div class="scrim" data-a="close"></div><div class="sheet' + (extra || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="grab"></div>' + body + '</div>';
    }
    function amount(v, unit) { return (v >= 100 ? fmt(v) : v >= 10 ? fmt(v, 1) : fmt(v, v >= 1 ? 1 : 2)) + ' ' + unit; }

    /* ---------- Find a food ---------- */
    function resultRow(f) {
      var b = FD.badge(f), per = f.per === 'ml' ? 'ml' : 'g';
      var serving = f.serving_g ? ' · ' + esc(f.serving_label || fmt(f.serving_g) + ' ' + per) + ' = ' + fmt(Number(f.kcal) * f.serving_g / 100) + ' kcal' : '';
      return '<button type="button" class="item food" data-a="food" data-v="' + esc(f.id) + '"><span><span class="t">' + esc(f.name) + '</span>' +
        '<span class="s">' + (f.brand ? esc(f.brand) + ' · ' : '') + fmt(Number(f.kcal)) + ' kcal · P ' + fmt(Number(f.protein_g), 1) + ' g per 100 ' + per + serving + '</span></span>' +
        '<span class="badge ' + b.kind + '">' + b.text + '</span></button>';
    }
    /** "Search online" (Open Food Facts), on request: a button, or its results for this query. */
    function onlineHtml(prominent) {
      var a = S.sheet, o = a.online;
      if (o && o.q === a.q.trim()) {
        if (o.loading) return '<span class="sec">Online · Open Food Facts</span><p class="small muted">' + (o.slow ? 'Still searching… Open Food Facts can be slow. This stops after about 25 seconds.' : 'Searching Open Food Facts…') + '</p>';
        if (o.error) return '<span class="sec">Online · Open Food Facts</span><p class="small warn">' + esc(o.error) + '</p><button type="button" class="btn ghost block" data-a="offsearch">Try again</button>';
        return '<span class="sec">Online · Open Food Facts</span>' + (o.results.length ? '<div class="list">' + o.results.map(resultRow).join('') + '</div><p class="small muted">' + esc(FD.OFF_ATTRIBUTION) + '</p>'
          : '<p class="small muted">Open Food Facts has nothing for "' + esc(a.q) + '" either. Create it from the label below.</p>');
      }
      return '<button type="button" class="btn ' + (prominent ? '' : 'ghost ') + 'block" data-a="offsearch">Search online (Open Food Facts)</button>' +
        (prominent ? '<p class="small muted">Searches Open Food Facts, a public database with millions of products. Only the words you typed are sent.</p>' : '');
    }
    function resultsHtml() {
      var a = S.sheet, mine = L.matchCustom(S.rows.customs, a.q);
      var own = mine.length ? '<span class="sec">Your foods</span><div class="list">' + mine.map(resultRow).join('') + '</div>' : '';
      var create = '<button type="button" class="btn ghost block" data-a="cfnew">Create a food</button>';
      if (a.error) return own + '<p class="small warn">' + esc(a.error) + '</p>' + onlineHtml(false) + create;
      if (a.q.trim().length < 2) return '<p class="small muted">Type at least 2 letters, or scan a barcode.</p>';
      if (a.loading && !a.results.length) return own + '<p class="small muted">Searching…</p>';
      if (!a.results.length) return own + '<p class="small muted">Not in Leanward\'s catalog yet.</p>' + onlineHtml(true) + create;
      return own + (own ? '<span class="sec">Catalog</span>' : '') + '<div class="list">' + a.results.map(resultRow).join('') + '</div>' +
        '<p class="small muted">USDA data is public domain (FoodData Central). Not seeing it?</p>' + onlineHtml(false) + create;
    }
    function where() { var a = S.sheet; return ctx.slotLabel(a.slot) + (a.date !== ctx.today() ? ', ' + ctx.dayName(a.date) : ''); }
    function recentHtml() {
      var all = S.rows.diary || [], rec = DY.recents(all, 12), freq = DY.frequents(all, ctx.today(), 30, 5);
      var mine = L.matchCustom(S.rows.customs, '');
      var own = '<span class="sec">Your foods</span>' + (mine.length ? '<div class="list">' + mine.slice(0, 8).map(resultRow).join('') + '</div>' : '<p class="small muted">Foods you create from a label (or copy and correct) are private to you.</p>') +
        '<button type="button" class="btn ghost block" data-a="cfnew">Create a food</button>';
      if (!rec.length) return '<p class="small muted">Foods you log show up here, so you can add them again in one tap, even offline.</p>' + own;
      var row = function (e, extra) {
        return '<button type="button" class="item food" data-a="recent" data-v="' + esc(e.id) + '"><span><span class="t">' + esc(e.name) + '</span><span class="s">' + esc(e.unit || '') + ' · ' + fmt(Number(e.kcal)) + ' kcal' + (extra || '') + '</span></span><span class="badge">+</span></button>';
      };
      return (freq.length ? '<span class="sec">Frequent</span><div class="list">' + freq.map(function (f) { return row(f.entry, ' · ' + f.count + '× this month'); }).join('') + '</div>' : '') +
        '<span class="sec">Recent</span><div class="list">' + rec.map(function (e) { return row(e); }).join('') + '</div>' + own;
    }
    function quickHtml() {
      var a = S.sheet;
      return '<p class="small muted">For when you just know the numbers. Quick adds have no vitamins or minerals.</p>' +
        '<div class="field"><label for="qa-l">Label (optional)</label><input type="text" id="qa-l" data-q="label" placeholder="e.g. Team lunch" value="' + esc(a.qa.label || '') + '"></div>' +
        '<div class="field"><label for="qa-k">Calories</label><input type="number" id="qa-k" inputmode="decimal" data-q="kcal" value="' + (a.qa.kcal == null ? '' : a.qa.kcal) + '"></div>' +
        '<div class="grid3"><div class="field"><label for="qa-p">Protein g</label><input type="number" id="qa-p" inputmode="decimal" data-q="protein_g" value="' + (a.qa.protein_g == null ? '' : a.qa.protein_g) + '"></div>' +
        '<div class="field"><label for="qa-c">Carbs g</label><input type="number" id="qa-c" inputmode="decimal" data-q="carbs_g" value="' + (a.qa.carbs_g == null ? '' : a.qa.carbs_g) + '"></div>' +
        '<div class="field"><label for="qa-f">Fat g</label><input type="number" id="qa-f" inputmode="decimal" data-q="fat_g" value="' + (a.qa.fat_g == null ? '' : a.qa.fat_g) + '"></div></div>' +
        slotField(a.slot, 'qa') + '<button type="button" class="btn block" data-a="qadd">Add to ' + esc(where()) + '</button>';
    }
    function slotField(cur, prefix) {
      return '<div class="field"><label for="' + prefix + '-slot">Meal</label><select id="' + prefix + '-slot" data-s="slot">' + ctx.slotOptions(cur) + '</select></div>';
    }
    function addView() {
      var a = S.sheet, online = root.navigator.onLine !== false;
      var tabs = '<div class="seg">' + [['foods', 'Foods'], ['meals', 'Meals'], ['quick', 'Quick add']].map(function (t) { return '<button type="button" data-a="addtab" data-v="' + t[0] + '" aria-pressed="' + (a.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
      if (a.tab === 'quick') return wrap('Quick add', '<div class="row"><h2>Add to ' + esc(where()) + '</h2></div>' + tabs + quickHtml(), ' tall');
      if (a.tab === 'meals') return wrap('Saved meals', '<div class="row"><h2>Add to ' + esc(where()) + '</h2></div>' + tabs + mealsHtml(), ' tall');
      return wrap('Find a food',
        '<div class="row"><h2>Add to ' + esc(where()) + '</h2><button type="button" class="btn sm" data-a="scan">Scan barcode</button></div>' + tabs +
        '<input type="search" id="fd-q" placeholder="Search foods (e.g. greek yogurt, chicken breast cooked)" value="' + esc(a.q) + '" autocomplete="off" aria-label="Search foods" enterkeyhint="search">' +
        (online ? '' : '<p class="small warn">You\'re offline. Search needs a connection; your recent foods below still work.</p>') +
        '<div id="fd-results">' + (a.q.trim().length < 2 ? recentHtml() : resultsHtml()) + '</div>', ' tall');
    }
    function runSearch() {
      var a = S.sheet, my = ++seq, started = Date.now();
      a.loading = true; a.error = '';
      paint();
      FD.search(a.q).then(function (rows) {
        if (my !== seq || !S.sheet || S.sheet.kind !== 'add') return;
        a.results = rows; a.loading = false; a.ms = Date.now() - started; paint();
      }, function (e) {
        if (my !== seq || !S.sheet) return;
        a.loading = false; a.error = root.navigator.onLine === false ? 'You\'re offline. Food search needs a connection.' : 'Search didn\'t work: ' + (e && e.message); paint();
      });
    }
    function paint() { var box = doc.getElementById('fd-results'); if (box) box.innerHTML = S.sheet.q.trim().length < 2 ? recentHtml() : resultsHtml(); }

    /* ---------- Food detail ---------- */
    function detailView() {
      var d = S.sheet, f = d.food;
      if (!f) return wrap('Food', '<h2>Loading…</h2>' + (d.error ? '<p class="small warn">' + esc(d.error) + '</p>' : ''));
      var per = f.per === 'ml' ? 'ml' : 'g', useServing = d.basis === 'serving' && f.serving_g;
      var grams = useServing ? f.serving_g : 100, v = FD.scale(f, grams), b = FD.badge(f);
      var sl = f.serving_label || fmt(f.serving_g) + ' ' + per;
      var label = useServing ? (/\(\s*[\d.,]+\s*(g|ml)\s*\)\s*$/i.test(sl) ? sl : sl + ' (' + fmt(f.serving_g) + ' ' + per + ')') : '100 ' + per;
      var rows = NUTRIENTS.filter(function (n) { return v.nutrients[n[0]] != null; }).map(function (n) {
        return '<div class="status"><span>' + n[1] + '</span><span>' + amount(v.nutrients[n[0]], n[2]) + '</span></div>';
      }).join('');
      var src = FD.SOURCE_LABEL[f.source] || f.source;
      return wrap(f.name,
        '<div class="row"><span class="badge ' + b.kind + '">' + b.text + '</span>' + (f.brand ? '<span class="small muted">' + esc(f.brand) + '</span>' : '') + '</div>' +
        '<h2>' + esc(f.name) + '</h2>' +
        (f.serving_g ? '<div class="seg">' + [['100', 'Per 100 ' + per], ['serving', 'Per serving']].map(function (o) { return '<button type="button" data-a="fdbasis" data-v="' + o[0] + '" aria-pressed="' + ((d.basis || '100') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' : '') +
        '<p class="small muted">' + esc(label) + '</p>' +
        '<div class="targets"><div><b>' + fmt(v.kcal) + '</b><span>kcal</span></div><div><b>' + fmt(v.protein_g, 1) + '</b><span>protein g</span></div><div><b>' + fmt(v.carbs_g, 1) + '</b><span>carbs g</span></div><div><b>' + fmt(v.fat_g, 1) + '</b><span>fat g</span></div></div>' +
        (f.energy_derived ? '<p class="small muted">Calories worked out from protein, carbs and fat (the source didn\'t list them).</p>' : '') +
        (rows ? '<details' + (rows.length < 400 ? ' open' : '') + '><summary>Nutrients</summary>' + rows + '</details>' : '<p class="small muted">No vitamins or minerals listed for this food.</p>') +
        (f.servings && f.servings.length ? '<p class="small muted">Servings: ' + f.servings.map(function (s) { return esc(s.label) + ' = ' + fmt(s.g) + ' g'; }).join(' · ') + '</p>' : '') +
        '<p class="small muted">Source: ' + esc(src) + (f.source_id ? ' (FoodData Central #' + esc(f.source_id) + ')' : '') + (f.gtin ? ' · barcode ' + esc(f.gtin.replace(/^0+(?=\d{12})/, '')) : '') + '. ' +
          (/^usda/.test(f.source) ? 'USDA data: public domain.' : f.source === 'custom' ? 'Only you can see it.' : '') + '</p>' +
        (f.attribution ? '<p class="small muted">' + esc(f.attribution) + '</p>' : '') +
        logControls(d, f) +
        (f.source === 'custom' ? '<button type="button" class="btn ghost block" data-a="cfedit">Edit this food</button>'
          : (d.reporting ? reportForm() : '<div class="row" style="justify-content:flex-start;gap:16px"><button type="button" class="link" data-a="fdreport">Report a problem</button><button type="button" class="link" data-a="cfcopy">Make my own copy</button></div>')) +
        (d.back ? '<button type="button" class="btn ghost block" data-a="fdback">Back to results</button>' : ''), ' tall');
    }
    function logControls(d, f) {
      var units = DY.unitsFor(f), u = units[d.unitIdx || 0], qty = d.qty == null ? 1 : d.qty;
      return '<div class="card" style="display:grid;gap:10px"><div class="grid2"><div class="field"><label for="lg-q">Amount</label><input type="number" id="lg-q" inputmode="decimal" step="any" data-l="qty" value="' + qty + '"></div>' +
        '<div class="field"><label for="lg-u">Unit</label><select id="lg-u" data-l="unit">' + units.map(function (x, i) { return '<option value="' + i + '"' + (i === (d.unitIdx || 0) ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select></div></div>' +
        slotField(d.slot, 'lg') + '<p class="small muted" id="lg-out">' + preview(f, qty, u) + '</p>' +
        '<button type="button" class="btn block" data-a="logfood">Add to ' + esc(ctx.slotLabel(d.slot) + (d.date !== ctx.today() ? ', ' + ctx.dayName(d.date) : '')) + '</button></div>';
    }
    function preview(f, qty, u) {
      if (!(qty > 0) || !u) return 'Enter an amount.';
      var a = DY.amountsFor(f, qty * u.g);
      return fmt(qty * u.g) + ' ' + (f.per === 'ml' ? 'ml' : 'g') + ' = ' + fmt(a.kcal) + ' kcal · P ' + fmt(a.protein_g, 1) + ' g · C ' + fmt(a.carbs_g, 1) + ' g · F ' + fmt(a.fat_g, 1) + ' g';
    }
    function reportForm() {
      var d = S.sheet;
      return '<div class="card" style="display:grid;gap:8px"><b>What\'s wrong?</b><div class="chips2">' + ISSUES.map(function (i) { return '<button type="button" data-a="fdissue" data-v="' + i[0] + '" aria-pressed="' + (d.issue === i[0]) + '">' + i[1] + '</button>'; }).join('') + '</div>' +
        '<input type="text" id="fd-note" placeholder="Details (optional)" maxlength="500">' +
        '<button type="button" class="btn block" data-a="fdsend">Send report</button><p class="small muted">Reports are checked by hand. To fix it for yourself now, use "Make my own copy".</p></div>';
    }
    function openFood(id, back, ctxs) {
      if (/^custom:/.test(id)) {
        var row = (S.rows.customs || []).filter(function (r) { return 'custom:' + r.id === id; })[0];
        S.sheet = Object.assign({ kind: 'food', food: row ? L.foodOfCustom(row) : null, basis: row && row.servings && row.servings.length ? 'serving' : '100', back: back || null, error: row ? '' : 'This food was deleted.' }, ctxs);
        ctx.render(); return;
      }
      S.sheet = Object.assign({ kind: 'food', food: null, basis: '100', back: back || null }, ctxs);
      ctx.render();
      FD.get(id).then(function (f) { if (S.sheet && S.sheet.kind === 'food') { S.sheet.food = f || null; if (!f) S.sheet.error = 'This food is no longer in the catalog.'; ctx.render(); } },
        function (e) { if (S.sheet) { S.sheet.error = 'Couldn\'t load this food: ' + (e && e.message); ctx.render(); } });
    }

    /* ---------- your own foods (LOG-8, FDB-5) ---------- */
    var LABELS = {};
    NUTRIENTS.forEach(function (n) { LABELS[n[0]] = n; });
    function val(v) { return v == null ? '' : esc(String(v)); }
    function customView() {
      var c = S.sheet, f = c.form, per = f.per === 'ml' ? 'ml' : 'g';
      var num = function (id, k, label, unit) { return '<div class="field"><label for="' + id + '">' + label + (unit ? ' <span class="muted">' + unit + '</span>' : '') + '</label><input type="number" id="' + id + '" inputmode="decimal" step="any" data-c="' + k + '" value="' + val(k.slice(0, 2) === 'n:' ? f.nutrients[k.slice(2)] : f[k]) + '"></div>'; };
      var extra = Object.keys(f.nutrients || {}).filter(function (k) { return L.LABEL_NUTRIENTS.indexOf(k) < 0 && f.nutrients[k] != null; }).length;
      return wrap(c.editing ? 'Edit food' : 'Create a food',
        '<div class="row"><h2>' + (c.editing ? 'Edit your food' : c.copyOf ? 'Your copy' : 'Create a food') + '</h2><button type="button" class="btn ghost sm" data-a="cfcancel">Cancel</button></div>' +
        (c.copyOf ? '<p class="small muted">A private copy of "' + esc(c.copyOf) + '". Fix what\'s wrong; only you see it, and it comes first when you search or scan.</p>' : '<p class="small muted">Copy the numbers from the Nutrition Facts label. Only you see this food.</p>') +
        '<div class="field"><label for="cf-name">Name</label><input type="text" id="cf-name" data-c="name" maxlength="200" value="' + val(f.name) + '" placeholder="e.g. Chocolate protein bar"></div>' +
        '<div class="grid2"><div class="field"><label for="cf-brand">Brand <span class="muted">optional</span></label><input type="text" id="cf-brand" data-c="brand" maxlength="200" value="' + val(f.brand) + '"></div>' +
        '<div class="field"><label for="cf-code">Barcode <span class="muted">optional</span></label><input type="text" id="cf-code" inputmode="numeric" data-c="barcode" maxlength="14" value="' + val(f.barcode) + '"></div></div>' +
        '<span class="sec">Per serving</span>' +
        '<div class="grid2"><div class="field"><label for="cf-sl">Serving <span class="muted">as on label</span></label><input type="text" id="cf-sl" data-c="servingLabel" maxlength="60" value="' + val(f.servingLabel) + '" placeholder="e.g. 1 bar, 2 tbsp"></div>' +
        num('cf-ss', 'servingSize', 'Serving size', per) + '</div>' +
        '<div class="seg">' + [['g', 'Grams (food)'], ['ml', 'Millilitres (drink)']].map(function (o) { return '<button type="button" data-a="cfper" data-v="' + o[0] + '" aria-pressed="' + (per === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<div class="grid2">' + num('cf-k', 'kcal', 'Calories', '') + num('cf-p', 'protein_g', 'Protein', 'g') + num('cf-c', 'carbs_g', 'Total carbs', 'g') + num('cf-f', 'fat_g', 'Total fat', 'g') + '</div>' +
        '<p class="small muted" id="cf-check">' + esc(checkText(f)) + '</p>' +
        '<details' + (c.more ? ' open' : '') + '><summary>More from the label (optional)</summary><div class="grid2" style="margin-top:8px">' +
          L.LABEL_NUTRIENTS.map(function (k) { return num('cf-' + k, 'n:' + k, LABELS[k][1], LABELS[k][2]); }).join('') + '</div>' +
          (extra ? '<p class="small muted">Plus ' + extra + ' more nutrient' + (extra === 1 ? '' : 's') + ' kept from the original.</p>' : '') + '</details>' +
        '<button type="button" class="btn block" data-a="cfsave">' + (c.editing ? 'Save changes' : 'Save food') + '</button>' +
        (c.editing ? '<button type="button" class="btn ghost block" data-a="cfdelete">Delete this food</button><p class="small muted">Changes apply to future logs. Days you already logged keep their numbers.</p>' : ''), ' tall');
    }
    /** "Do the calories add up?" (4/4/9), said plainly; labels round, so only a big gap is mentioned. */
    function checkText(f) {
      var n = function (v) { return v === '' || v == null ? null : Number(v); };
      var c = L.energyCheck(n(f.kcal), n(f.protein_g), n(f.carbs_g), n(f.fat_g));
      if (!c) return 'Calories, protein, carbs and fat are needed; the rest is optional.';
      return c.off ? 'Check the numbers: protein × 4 + carbs × 4 + fat × 9 = ' + fmt(c.expected) + ' kcal, but the label says ' + fmt(Number(f.kcal)) + '. (Fiber and sugar alcohols can explain a small gap.)'
        : 'The calories add up (protein × 4 + carbs × 4 + fat × 9 ≈ ' + fmt(c.expected) + ').';
    }
    function blankForm(barcode) { return { name: '', brand: '', barcode: barcode || '', servingLabel: '', servingSize: null, per: 'g', kcal: null, protein_g: null, carbs_g: null, fat_g: null, nutrients: {} }; }
    function openCustom(form, extra) {
      var prev = S.sheet || {}, lc = logCtx();
      S.sheet = Object.assign({ kind: 'custom', form: form, slot: prev.slot || lc.slot, date: prev.date || lc.date, prev: prev }, extra || {});
      ctx.render();
    }

    /* ---------- saved meals (LOG-9) ---------- */
    function mealsHtml() {
      var list = (S.rows.meals || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      if (!list.length) return '<p class="small muted">No saved meals yet. In the Diary, log a meal once, then tap "Save as meal" under it.</p>';
      return '<div class="list">' + list.map(function (m) {
        var t = L.mealTotals(m, 1);
        return '<button type="button" class="item food" data-a="meal" data-v="' + esc(m.id) + '"><span><span class="t">' + esc(m.name) + '</span><span class="s">' + m.items.length + ' item' + (m.items.length === 1 ? '' : 's') + ' · P ' + fmt(t.protein_g) + ' g · C ' + fmt(t.carbs_g) + ' g · F ' + fmt(t.fat_g) + ' g</span></span><span class="k">' + fmt(t.kcal) + '<small>kcal</small></span></button>';
      }).join('') + '</div>';
    }
    var FACTORS = [[0.5, '½'], [1, '×1'], [1.5, '×1.5'], [2, '×2']];
    function mealView() {
      var m = S.sheet, meal = (S.rows.meals || []).filter(function (x) { return x.id === m.id; })[0];
      if (!meal) return wrap('Meal', '<h2>Meal deleted</h2><button type="button" class="btn ghost block" data-a="mealback">Back</button>');
      var fct = m.factor || 1, items = meal.items.map(function (it) { return L.scaleEntry(it, fct); }), t = DY.totals(items);
      return wrap(meal.name, '<h2>' + esc(meal.name) + '</h2>' +
        '<div class="seg">' + FACTORS.map(function (o) { return '<button type="button" data-a="mealfactor" data-v="' + o[0] + '" aria-pressed="' + (fct === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<div class="list">' + items.map(function (e) { return '<div class="item"><span><span class="t">' + esc(e.name) + '</span><span class="s">' + esc(e.unit || 'Quick add') + '</span></span><span class="k">' + fmt(Number(e.kcal)) + '<small>kcal</small></span></div>'; }).join('') + '</div>' +
        '<p class="small muted">' + fmt(t.kcal) + ' kcal · P ' + fmt(t.protein_g) + ' g · C ' + fmt(t.carbs_g) + ' g · F ' + fmt(t.fat_g) + ' g</p>' +
        slotField(m.slot, 'ml') +
        '<button type="button" class="btn block" data-a="logmeal">Add to ' + esc(where()) + '</button>' +
        '<button type="button" class="btn ghost block" data-a="mealback">Back to meals</button>' +
        '<p class="center"><button type="button" class="link" data-a="mealdelete">Delete this saved meal</button></p>', ' tall');
    }

    /* ---------- Scan ---------- */
    function scanView() {
      var s = S.sheet;
      return wrap('Scan a barcode',
        '<div class="row"><h2>Scan a barcode</h2><button type="button" class="btn ghost sm" data-a="scanstop">Cancel</button></div>' +
        (s.found === undefined ? '<div class="scanbox"><video id="fd-video" playsinline muted autoplay></video><i></i></div><p class="small muted center" id="fd-scanmsg">' + esc(s.msg || 'Starting the camera…') + '</p>'
          : notFound()), ' tall');
    }
    function notFound() {
      var s = S.sheet;
      if (s.looking) return '<div class="card"><b>Looking it up…</b><p class="small muted">Barcode ' + esc(s.code || '') + '</p></div>';
      return '<div class="card"><b>' + esc(s.reason || 'Not found') + '</b><p class="small muted">Barcode ' + esc(s.code || '') + (s.ms ? ' · read in ' + (s.ms / 1000).toFixed(1) + ' s' : '') + '</p>' +
        '<p class="small muted">Add it from the label once and it\'s yours: the next scan finds it, even offline.</p></div>' +
        (s.code && /^\d{8,14}$/.test(s.code) ? '<button type="button" class="btn block" data-a="cfscan">Create this food</button>' : '') +
        '<button type="button" class="btn ghost block" data-a="scan">Scan another</button><button type="button" class="btn ghost block" data-a="add">Search instead</button>';
    }
    function loadZxing() {
      if (root.ZXing) return Promise.resolve(root.ZXing);
      return new Promise(function (resolve, reject) {
        var t = doc.createElement('script'); t.src = 'js/vendor/zxing.min.js';
        t.onload = function () { resolve(root.ZXing); }; t.onerror = function () { reject(new Error('The barcode reader didn\'t load. Check your connection.')); };
        doc.head.appendChild(t);
      });
    }
    function startScan() {
      var log = logCtx();
      S.sheet = { kind: 'scan', msg: 'Starting the camera…', log: log };
      ctx.render();
      if (!(root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia)) { setMsg('This browser can\'t use the camera here. Open Leanward in Safari (or from the Home Screen icon) over https.'); return; }
      loadZxing().then(function (Z) {
        var hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
        reader = new Z.BrowserMultiFormatReader(hints, 150);
        var video = doc.getElementById('fd-video');
        if (!video || !S.sheet || S.sheet.kind !== 'scan') return;
        scanStart = Date.now();
        setMsg('Point the camera at the barcode. Hold it steady about a hand\'s width away.');
        return reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } }, video, function (result) {
          if (!result || !S.sheet || S.sheet.kind !== 'scan' || S.sheet.found !== undefined) return;
          var ms = Date.now() - scanStart, code = result.getText();
          stopCamera();
          S.sheet.found = null; S.sheet.code = code; S.sheet.ms = ms; S.sheet.reason = 'Looking it up…'; S.sheet.looking = true;
          ctx.render();
          var mine = L.customByBarcode(S.rows.customs, code);
          if (mine) { S.sheet = Object.assign({ kind: 'food', food: mine, basis: 'serving', scanMs: ms }, S.sheet.log, { via: 'barcode' }); ctx.render(); ctx.toast('Your food · read in ' + (ms / 1000).toFixed(1) + ' s'); return; }
          FD.byBarcode(code).then(function (r) {
            if (!S.sheet || S.sheet.kind !== 'scan') return;
            if (r.food) { S.sheet = Object.assign({ kind: 'food', food: r.food, basis: '100', scanMs: ms }, S.sheet.log, { via: 'barcode' }); ctx.render(); ctx.toast('Read in ' + (ms / 1000).toFixed(1) + ' s' + (r.source === 'off' ? ' · from Open Food Facts' : '')); return; }
            S.sheet.reason = r.reason; S.sheet.looking = false; ctx.render();
          }, function (e) { if (S.sheet) { S.sheet.looking = false; S.sheet.reason = root.navigator.onLine === false ? 'You\'re offline. Looking up a barcode needs a connection.' : 'Lookup failed: ' + (e && e.message); ctx.render(); } });
        });
      }).catch(function (e) {
        var denied = e && (e.name === 'NotAllowedError' || /permission|denied/i.test(String(e.message)));
        setMsg(denied ? 'Leanward needs camera access to scan. Allow it in Settings → Safari → Camera (or the prompt), then try again.' : (e && e.message) || 'The camera didn\'t start.');
      });
    }
    function setMsg(m) { if (S.sheet) S.sheet.msg = m; var el = doc.getElementById('fd-scanmsg'); if (el) el.textContent = m; }
    function stopCamera() { try { if (reader) reader.reset(); } catch (e) { /* already stopped */ } reader = null; }

    /* ---------- wiring ---------- */
    /** Where new entries go: the sheet's slot and date, or by time of day today. */
    function logCtx() {
      var sh = S.sheet || {};
      if (sh.slot && sh.date) return { slot: sh.slot, date: sh.date };
      if (sh.log) return sh.log;
      var now = new Date();
      return { slot: DY.slotForTime(now.getHours() * 60 + now.getMinutes()), date: ctx.today() };
    }
    function openAdd(slot, date, q) {
      stopCamera();
      var lc = logCtx();
      S.sheet = { kind: 'add', q: q || '', results: [], tab: 'foods', qa: {}, slot: slot || lc.slot, date: date || lc.date };
      ctx.render(); focusSearch();
    }
    var actions = {
      add: function () { var now = new Date(); S.sheet = false; openAdd(DY.slotForTime(now.getHours() * 60 + now.getMinutes()), S.tab === 'diary' && S.diaryDate ? S.diaryDate : ctx.today()); },
      addto: function (slot) { var now = new Date(); S.sheet = false; openAdd(slot || DY.slotForTime(now.getHours() * 60 + now.getMinutes()), S.tab === 'diary' && S.diaryDate ? S.diaryDate : ctx.today()); },
      addtab: function (v) { S.sheet.tab = v; ctx.render(); if (v === 'foods') focusSearch(); },
      food: function (id) { var a = S.sheet, back = a && a.kind === 'add' ? { q: a.q, results: a.results, online: a.online } : null; openFood(id, back, { slot: a.slot, date: a.date, via: 'search' }); },
      recent: function (id) {
        var a = S.sheet, e = (S.rows.diary || []).filter(function (x) { return x.id === id; })[0], f = e && DY.foodOfEntry(e);
        if (!f) return;
        var units = DY.unitsFor(f), lab = String(e.unit || '').replace(/^[\d.]+\s*(×\s*)?/, ''), ui = Math.max(0, units.map(function (u) { return u.label; }).indexOf(lab));
        S.sheet = { kind: 'food', food: f, basis: '100', back: { q: '', results: [] }, slot: a.slot, date: a.date, via: 'recent', qty: Number(e.qty) || 1, unitIdx: ui };
        ctx.render();
      },
      fdback: function () { var b = S.sheet.back, sh = S.sheet; S.sheet = { kind: 'add', q: b.q, results: b.results, online: b.online, tab: 'foods', qa: {}, slot: sh.slot, date: sh.date }; ctx.render(); },
      fdbasis: function (v) { S.sheet.basis = v; ctx.render(); },
      fdreport: function () { S.sheet.reporting = true; ctx.render(); },
      fdissue: function (v) { S.sheet.issue = v; ctx.render(); },
      fdsend: function () {
        var d = S.sheet, f = d.food, note = (doc.getElementById('fd-note') || {}).value || '';
        if (!d.issue) { ctx.toast('Choose what\'s wrong'); return; }
        var src = f.source === 'off' ? 'off' : f.source === 'custom' ? 'custom' : 'usda';
        ctx.save([['lw_food_reports', { id: root.LW.model.newId(), food_source: src, food_ref: String(f.id).slice(0, 64), issue: d.issue, note: note.trim().slice(0, 1000) || null }]])
          .then(function () { d.reporting = false; d.issue = null; ctx.toast('Thanks, report sent'); ctx.render(); }, function (e) { ctx.toast('Couldn\'t save the report: ' + (e && e.message)); });
      },
      logfood: function () {
        var d = S.sheet, f = d.food, units = DY.unitsFor(f), u = units[d.unitIdx || 0], qty = d.qty == null ? 1 : d.qty;
        if (!(qty > 0)) { ctx.toast('Enter an amount above zero'); return; }
        var e = DY.entryFromFood({ food: f, qty: qty, unit: u, date: d.date || ctx.today(), slot: d.slot || 'snacks', via: d.via || 'search' });
        ctx.save([['lw_diary_entries', e]]).then(function () { S.sheet = false; ctx.toast('Added to ' + ctx.slotLabel(e.slot)); ctx.render(); }, function (err) { ctx.toast('Couldn\'t save: ' + (err && err.message)); });
      },
      qadd: function () {
        var a = S.sheet, q = a.qa;
        if (!(q.kcal >= 0) || q.kcal === null) { ctx.toast('Enter the calories'); return; }
        var e;
        try { e = DY.quickAdd({ kcal: q.kcal, protein_g: q.protein_g, carbs_g: q.carbs_g, fat_g: q.fat_g, label: q.label, date: a.date, slot: a.slot }); }
        catch (err) { ctx.toast(err.message); return; }
        ctx.save([['lw_diary_entries', e]]).then(function () { S.sheet = false; ctx.toast('Added to ' + ctx.slotLabel(e.slot)); ctx.render(); });
      },
      cfnew: function () { var q = S.sheet && S.sheet.kind === 'add' ? S.sheet.q.trim() : ''; var f = blankForm(); f.name = q; openCustom(f); },
      cfscan: function () { var s = S.sheet, f = blankForm(s.code); S.sheet = Object.assign({}, s, s.log); openCustom(f); },
      cfcopy: function () { var d = S.sheet, f = L.labelOf(d.food); f.id = null; openCustom(f, { copyOf: d.food.name + (d.food.brand ? ' · ' + d.food.brand : '') }); },
      cfedit: function () { var d = S.sheet; openCustom(L.labelOf(d.food), { editing: d.food.rowId }); },
      cfper: function (v) { S.sheet.form.per = v; ctx.render(); },
      cfcancel: function () { var p = S.sheet.prev; S.sheet = p && p.kind ? p : false; if (!S.sheet) { openAdd(); return; } ctx.render(); },
      cfsave: function () {
        var c = S.sheet, row, old = c.editing && (S.rows.customs || []).filter(function (r) { return r.id === c.editing; })[0];
        var form = Object.assign({}, c.form, { id: c.editing || null });
        try { row = L.fromLabel(form); } catch (e) { ctx.toast(e.message); return; }
        if (old) row = Object.assign({}, old, row);
        ctx.save([['lw_custom_foods', row]]).then(function () {
          S.sheet = { kind: 'food', food: L.foodOfCustom(row), basis: 'serving', slot: c.slot, date: c.date, via: c.form.barcode ? 'barcode' : 'search', back: { q: '', results: [] } };
          ctx.toast(old ? 'Saved' : 'Food created'); ctx.render();
        }, function (e) { ctx.toast('Couldn\'t save: ' + (e && e.message)); });
      },
      cfdelete: function () {
        var c = S.sheet;
        if (!root.confirm('Delete this food? Days you already logged keep it.')) return;
        ctx.remove('lw_custom_foods', c.editing).then(function () { ctx.toast('Food deleted'); openAdd(c.slot, c.date); });
      },
      meal: function (id) { var a = S.sheet; S.sheet = { kind: 'meal', id: id, factor: 1, slot: a.slot, date: a.date }; ctx.render(); },
      mealfactor: function (v) { S.sheet.factor = Number(v); ctx.render(); },
      mealback: function () { var m = S.sheet; S.sheet = { kind: 'add', q: '', results: [], tab: 'meals', qa: {}, slot: m.slot, date: m.date }; ctx.render(); },
      logmeal: function () {
        var m = S.sheet, meal = (S.rows.meals || []).filter(function (x) { return x.id === m.id; })[0];
        if (!meal) return;
        var rows = L.entriesFromMeal(meal, m.factor || 1, m.date, m.slot).map(function (e) { return ['lw_diary_entries', e]; });
        ctx.save(rows).then(function () { S.sheet = false; ctx.toast(meal.name + ' added to ' + ctx.slotLabel(m.slot)); ctx.render(); });
      },
      mealdelete: function () {
        var m = S.sheet;
        if (!root.confirm('Delete this saved meal? Food you already logged stays.')) return;
        ctx.remove('lw_saved_meals', m.id).then(function () { ctx.toast('Meal deleted'); actions.mealback(); });
      },
      offsearch: function () {
        var a = S.sheet, q = a.q.trim();
        if (q.length < 2) return;
        if (root.navigator.onLine === false) { ctx.toast('You\'re offline. Searching online needs a connection.'); return; }
        a.online = { q: q, loading: true, results: [] }; paint();
        var mine = a.online;
        root.setTimeout(function () { if (S.sheet === a && a.online === mine && mine.loading) { mine.slow = true; paint(); } }, 4000);
        FD.offSearch(q).then(function (rows) {
          if (!S.sheet || S.sheet.kind !== 'add' || !a.online || a.online.q !== q) return;
          a.online = { q: q, results: rows }; paint();
        }, function (e) {
          if (!S.sheet || !a.online || a.online.q !== q) return;
          a.online = { q: q, results: [], error: (e && e.message) || 'Open Food Facts didn\'t answer. Try again.' }; paint();
        });
      },
      scan: function () { stopCamera(); startScan(); },
      scanstop: function () { var l = S.sheet && S.sheet.log; stopCamera(); S.sheet = false; openAdd(l && l.slot, l && l.date); }
    };
    function focusSearch() { root.setTimeout(function () { var i = doc.getElementById('fd-q'); if (i) i.focus(); }, 50); }

    function onInput(el) {
      var sh = S.sheet;
      if (!sh) return false;
      if (el.dataset.s === 'slot') { sh.slot = el.value; ctx.render(); return true; }
      if (el.dataset.c && sh.kind === 'custom') {
        var k = el.dataset.c, f = sh.form, text = { name: 1, brand: 1, barcode: 1, servingLabel: 1 };
        var v2 = text[k] ? el.value : (el.value.trim() === '' ? null : Number(el.value));
        if (k.slice(0, 2) === 'n:') { f.nutrients[k.slice(2)] = v2; sh.more = true; } else f[k] = v2;
        var chk = doc.getElementById('cf-check');
        if (chk) chk.textContent = checkText(f);
        return true;
      }
      if (el.dataset.q) { var v = el.value.trim(); sh.qa[el.dataset.q] = el.dataset.q === 'label' ? el.value : (v === '' ? null : Number(v)); return true; }
      if (el.dataset.l && sh.kind === 'food') {
        if (el.dataset.l === 'qty') sh.qty = el.value.trim() === '' ? null : Number(el.value);
        else sh.unitIdx = Number(el.value);
        var out = doc.getElementById('lg-out'), units = DY.unitsFor(sh.food);
        if (out) out.textContent = preview(sh.food, sh.qty == null ? 0 : sh.qty, units[sh.unitIdx || 0]);
        return true;
      }
      if (el.id !== 'fd-q' || sh.kind !== 'add') return false;
      S.sheet.q = el.value;
      root.clearTimeout(timer);
      if (el.value.trim().length < 2) { S.sheet.results = []; seq++; paint(); return true; }
      timer = root.setTimeout(runSearch, 250);
      return true;
    }
    function sheetView() {
      var k = S.sheet && S.sheet.kind;
      return k === 'add' ? addView() : k === 'food' ? detailView() : k === 'scan' ? scanView() : k === 'custom' ? customView() : k === 'meal' ? mealView() : null;
    }
    return { actions: actions, onInput: onInput, sheetView: sheetView, stop: stopCamera };
  }

  root.LW.foodui = { create: create, NUTRIENTS: NUTRIENTS };
})(this);
