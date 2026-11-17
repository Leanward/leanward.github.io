/* Leanward — the Today tab: the day's hero and food diary (LOG-1, NUT-1, HOM-1), editing, moving and deleting entries (LOG-11),
 * copying yesterday, a meal or yesterday's breakfast (LOG-10), saving a meal (LOG-9), meal names,
 * order and visibility (LOG-1), the Nutrient review (NUT-6, NUT-7) and the Home "today" card.
 * Over target is shown neutrally (LOG-13). Logic lives in js/diary.js; flows follow the prototype.
 */
(function (root) {
  'use strict';

  var DY = root.LW.diary, M = root.LW.model, L = root.LW.library, RV = root.LW.review, fmt = root.LW.calc.core.fmt;
  var DRI = root.LW.calc.dri;

  function create(ctx) {
    var S = ctx.state, esc = ctx.esc;

    function entriesOn(date) { return (S.rows.diary || []).filter(function (e) { return !e.deleted && e.date === date; }); }
    function targetsFor(date) {
      return M.targetsFor(S.rows.phases, S.rows.sets, date, ctx.today());
    }
    function dayName(date) {
      var t = ctx.today();
      if (date === t) return 'Today';
      if (date === DY.addDays(t, -1)) return 'Yesterday';
      return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }
    /** The six slots in the user's order, with their names (LOG-1). */
    function slots() { return L.slotsFor(S.rows.profile && S.rows.profile.preferences); }
    function slotLabel(id) { var s = slots().filter(function (x) { return x.id === id; })[0]; return s ? s.label : id; }
    /** Options for a meal picker: visible slots, plus the current one if it's hidden. */
    function slotOptions(cur) {
      return slots().filter(function (s) { return !s.hidden || s.id === cur; }).map(function (s) { return '<option value="' + s.id + '"' + (s.id === cur ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('');
    }
    function wrap(title, body) { return '<div class="scrim" data-a="close"></div><div class="sheet tall" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="grab"></div>' + body + '</div>'; }

    /**
     * The day's hero (HOM-1, NUT-1): a ring of calories eaten against the target in the phase color,
     * with what's left in the middle, and protein, carbs and fat beside it. Over target is shown
     * plainly ("over"), in the same calm color (LOG-13).
     */
    function heroCard(date) {
      var t = DY.totals(entriesOn(date)), tg = targetsFor(date), v = DY.versusTarget(t, tg);
      if (!v) return '<section class="card"><b style="font-size:22px">' + fmt(t.kcal) + ' kcal</b><p class="small muted">No targets for this day.</p></section>';
      var C = 2 * Math.PI * 50, share = tg.kcal ? Math.min(1, t.kcal / tg.kcal) : 0, over = v.kcal.left < 0;
      // mark: where "enough" protein sits on the bar (1.6 g/kg); ✓ shows from there, the target stays the aim.
      var bar = function (eaten, target, mark) { return '<div class="bar' + (mark ? ' marked' : '') + '"' + (mark ? ' title="Enough from ' + fmt(mark) + ' g"' : '') + '><i style="width:' + Math.min(100, target ? eaten / target * 100 : 0) + '%"></i>' + (mark ? '<b style="left:' + (mark / target * 100).toFixed(1) + '%"></b>' : '') + '</div>'; };
      var ci = tg.calc_inputs || {}, enough = root.LW.calc.macros.proteinEnough(Number(tg.protein_g), Number(ci.kg), Number(ci.cm));
      var macro = function (label, m) { var met = m.target > 0 && (label === 'Fiber' && m.eaten >= m.target || label === 'Protein' && m.eaten >= (enough || m.target)); return '<div class="hm"><div class="row"><span class="small muted">' + label + (met ? ' <span class="met" aria-label="' + (label === 'Protein' && m.eaten < m.target ? 'enough protein' : 'target met') + '">✓</span>' : '') + '</span><span class="small"><b>' + fmt(m.eaten) + '</b><span class="muted"> / ' + fmt(m.target) + ' g</span></span></div>' + bar(m.eaten, m.target, label === 'Protein' && enough < m.target ? enough : null) + '</div>'; };
      var said = fmt(Math.abs(v.kcal.left)) + ' calories ' + (over ? 'over' : 'left') + '. ' + fmt(t.kcal) + ' eaten of ' + fmt(tg.kcal) + '.';
      return '<section class="card hero"><div class="herogrid">' +
        '<div class="ring" role="img" aria-label="' + esc(said) + '"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--g1)"/><stop offset="1" style="stop-color:var(--g2)"/></linearGradient></defs>' +
          '<circle class="rt" cx="60" cy="60" r="50"/><circle class="rp" cx="60" cy="60" r="50" stroke="url(#ring-g)" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - share)).toFixed(1) + '" transform="rotate(-90 60 60)"/></svg>' +
          '<div class="ringtxt"><b>' + fmt(Math.abs(v.kcal.left)) + '</b><span>kcal ' + (over ? 'over' : 'left') + '</span></div></div>' +
        '<div class="heromacros">' + macro('Protein', v.protein) + macro('Carbs', v.carbs) + macro('Fat', v.fat) + macro('Fiber', v.fiber) + '</div></div>' +
        '<div class="row herofoot"><span class="small muted">' + (t.entries && Math.abs(v.kcal.left) <= tg.kcal * 0.05 ? '<b class="ontarget">On target</b> · ' : '') + fmt(t.kcal) + ' eaten · target ' + fmt(tg.kcal) +
          (t.entries && !(t.coverage.fiber >= 1) ? ' · fiber known for ' + Math.round((t.coverage.fiber || 0) * 100) + '%' : '') + '</span>' +
          (t.entries ? '<button type="button" class="link" data-a="nutrients">Nutrients</button>' : '') + '</div></section>';
    }

    /** What a meal adds to the day (NUT-8): its share of the protein target and its fiber, when there are targets. */
    function mealLine(t, date) {
      var tg = targetsFor(date), bits = [];
      if (tg && tg.protein_g > 0 && t.protein_g >= 1) bits.push(Math.round(t.protein_g / tg.protein_g * 100) + '% of protein');
      if (t.nutrients.fiber >= 1) bits.push(fmt(t.nutrients.fiber) + ' g fiber');
      return bits.length ? '<span class="small muted mealline">' + bits.join(' · ') + '</span>' : '';
    }
    function entryRow(e) {
      var badge = e.food_source === 'quick' ? 'Quick add' : e.food_source === 'off' ? 'Community' : e.food_source === 'custom' ? 'Yours' : 'USDA';
      var amt = DY.amountText(e);
      return '<button type="button" class="item food" data-a="entry" data-v="' + esc(e.id) + '"><span><span class="t">' + esc(DY.calmName(e.name)) + '</span>' +
        '<span class="s">' + (amt ? esc(amt) + ' · ' : '') + badge + '</span></span>' +
        '<span class="k">' + fmt(Number(e.kcal)) + '<small>' + (e.protein_g != null ? 'P ' + fmt(Number(e.protein_g)) + ' g' : '') + '</small></span></button>';
    }

    function longDate(date) { return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
    function view() {
      var date = S.diaryDate || ctx.today(), today = ctx.today(), es = entriesOn(date), y = DY.addDays(date, -1), yEntries = entriesOn(y);
      var named = date === today || date === DY.addDays(today, -1);
      var out = '<header class="top row"><button type="button" class="iconbtn" data-a="day" data-v="-1" aria-label="Previous day">‹</button>' +
        '<div class="daytitle"><h1>' + esc(named ? dayName(date) : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })) + '</h1>' +
          '<span class="small muted">' + esc(named ? longDate(date) : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })) + '</span></div>' +
        '<button type="button" class="iconbtn" data-a="day" data-v="1" aria-label="Next day"' + (date >= today ? ' disabled style="opacity:.35"' : '') + '>›</button></header>' +
        heroCard(date);
      // Today only: the phase and weight tiles, at most one tip, and quick log for the time of day.
      if (date === today) out += (ctx.tiles ? ctx.tiles() : '') + insightCard() + quickLog();
      if (!es.length) {
        out += yEntries.length
          ? '<section class="card slim"><div class="row"><span class="small">Nothing logged ' + (date === today ? 'yet today' : 'this day') + '.</span><button type="button" class="btn sm" data-a="copyday">Copy ' + (y === DY.addDays(today, -1) ? 'yesterday' : 'the day before') + '</button></div></section>'
          : '<section class="card slim empty"><b>Nothing logged ' + (date === today ? 'yet' : 'this day') + '</b><span class="small muted">Tap + to add a food, scan a barcode or quick add. Foods you log often show up for one-tap logging.</span></section>';
      }
      // Meals: a card when it has food; a slim row when it doesn't.
      out += '<div class="meals">';
      slots().forEach(function (sl) {
        var se = es.filter(function (e) { return e.slot === sl.id; });
        if (sl.hidden && !se.length) return;
        var add = '<button type="button" class="iconbtn" data-a="addto" data-v="' + sl.id + '" aria-label="Add to ' + esc(sl.label) + '">+</button>';
        if (!se.length) {
          var repeat = sl.id === 'breakfast' && yEntries.some(function (e) { return e.slot === 'breakfast'; });
          out += '<section class="mealrow"><h2>' + esc(sl.label) + '</h2><span class="row" style="gap:8px">' +
            (repeat ? '<button type="button" class="link" data-a="repeatbf">Repeat yesterday\'s</button>' : '') + add + '</span></section>';
          return;
        }
        var t = DY.totals(se);
        // The meal's header is set apart from its foods: a larger title with the total beside it, on its own band.
        out += '<section class="card meal"><header class="mealhead"><div><h2>' + esc(sl.label) + '</h2>' +
          '<span class="small muted">P ' + fmt(t.protein_g) + ' · C ' + fmt(t.carbs_g) + ' · F ' + fmt(t.fat_g) + ' g</span>' + mealLine(t, date) + '</div>' +
          '<span class="mealkcal"><b>' + fmt(t.kcal) + '</b><small>kcal</small></span>' +
          '<span class="row" style="gap:6px"><button type="button" class="iconbtn" data-a="mealmenu" data-v="' + sl.id + '" aria-label="More for ' + esc(sl.label) + '">⋯</button>' + add + '</span></header>' +
          '<div class="list">' + se.map(entryRow).join('') + '</div></section>';
      });
      return out + '</div><p class="center"><button type="button" class="link" data-a="slots">Rename, reorder or hide meals</button></p>';
    }
    /** The ⋯ menu for a meal that has food: save it as a meal, or copy it elsewhere. */
    function mealMenuSheet() {
      var sh = S.sheet, list = entriesOn(sh.date).filter(function (e) { return e.slot === sh.slot; }), t = DY.totals(list);
      return '<div class="scrim" data-a="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(slotLabel(sh.slot)) + '"><div class="grab"></div>' +
        '<h2>' + esc(slotLabel(sh.slot)) + '</h2><p class="small muted">' + list.length + ' item' + (list.length === 1 ? '' : 's') + ' · ' + fmt(t.kcal) + ' kcal</p>' +
        '<button type="button" class="btn ghost block" data-a="savemeal" data-v="' + sh.slot + '">Save as a meal</button>' +
        '<button type="button" class="btn ghost block" data-a="copymeal" data-v="' + sh.slot + '">Copy to another day or meal</button></div>';
    }

    /** Quick log (HOM-3): the foods you most often log at this time of day, one tap each. */
    function quickLog() {
      var now = new Date(), slot = DY.slotForTime(now.getHours() * 60 + now.getMinutes());
      var picks = DY.quickPicks(S.rows.diary || [], slot, ctx.today(), 5);
      if (!picks.length) return '';
      return '<section class="card slim"><span class="sec" style="display:block;margin:0 0 8px">Quick log · ' + esc(slotLabel(slot)) + '</span><div class="chips2">' + picks.map(function (e) {
        return '<button type="button" data-a="quicklog" data-v="' + esc(e.id) + '" aria-label="Log ' + esc(e.name) + ', ' + fmt(Number(e.kcal)) + ' kcal, to ' + esc(slotLabel(slot)) + '">+ ' + esc(String(e.name).split(' · ')[0].slice(0, 28)) + ' <span class="muted">' + fmt(Number(e.kcal)) + '</span></button>';
      }).join('') + '</div></section>';
    }
    /** Home (HOM-4): at most one insight card. */
    function insightCard() {
      var today = ctx.today(), now = new Date();
      var lastW = (S.rows.weights || []).filter(function (w) { return !w.deleted; }).map(function (w) { return w.date; }).sort().pop() || null;
      var first = (S.rows.phases || []).filter(function (p) { return !p.deleted; }).map(function (p) { return p.start_date; }).sort()[0] || null;
      var i = root.LW.home.insight({ minutes: now.getHours() * 60 + now.getMinutes(), today: today, totals: DY.totals(entriesOn(today)), target: targetsFor(today), lastWeighDate: lastW, firstUseDate: first });
      if (!i) return '';
      return '<section class="card slim tip"><span class="chip"><i></i>Tip</span><div><b>' + esc(i.title) + '</b><p class="small muted">' + esc(i.text) + '</p></div></section>';
    }

    /* ---------- edit an entry (LOG-11) ---------- */
    function entrySheet() {
      var sh = S.sheet, e = (S.rows.diary || []).filter(function (x) { return x.id === sh.id; })[0];
      if (!e) return '';
      var food = DY.foodOfEntry(e), units = food ? DY.unitsFor(food) : [], isQuick = e.food_source === 'quick';
      var curSlot = sh.slot || e.slot, ui = sh.unit != null ? sh.unit : unitIndex(units, e);
      var slotSel = '<div class="field"><span class="lab">Meal</span><div class="chips2" role="group" aria-label="Meal">' + slots().filter(function (x) { return !x.hidden || x.id === curSlot; }).map(function (x) {
        return '<button type="button" data-a="enslot" data-v="' + x.id + '" aria-pressed="' + (x.id === curSlot) + '">' + esc(x.label) + '</button>'; }).join('') + '</div></div>';
      var dateIn = '<div class="field"><label for="en-date">Day</label><input type="date" id="en-date" data-x="date" value="' + esc(sh.date || e.date) + '" max="' + ctx.today() + '"></div>';
      var amount = isQuick
        ? '<div class="grid2"><div class="field"><label for="en-k">Calories</label><input type="number" id="en-k" inputmode="decimal" data-x="kcal" value="' + (sh.kcal != null ? sh.kcal : e.kcal) + '"></div><div class="field"><label for="en-l">Label</label><input type="text" id="en-l" data-x="label" value="' + esc(sh.label != null ? sh.label : e.name) + '"></div></div>'
        : (food ? '<div class="amount"><div class="field"><label for="en-q">Amount</label><input type="number" id="en-q" inputmode="decimal" step="any" data-x="qty" value="' + (sh.qty != null ? sh.qty : e.qty) + '"></div>' +
          '<div class="field"><span class="lab">Unit</span><div class="chips2" role="group" aria-label="Unit">' + units.map(function (u, i) { return '<button type="button" data-a="enunit" data-v="' + i + '" aria-pressed="' + (i === ui) + '">' + esc(u.label) + '</button>'; }).join('') + '</div></div></div>' : '');
      return '<div class="scrim" data-a="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="Edit entry"><div class="grab"></div>' +
        '<h2>' + esc(e.name) + '</h2><p class="small muted">' + fmt(Number(e.kcal)) + ' kcal' + (e.protein_g != null ? ' · P ' + fmt(Number(e.protein_g)) + ' g · C ' + fmt(Number(e.carbs_g)) + ' g · F ' + fmt(Number(e.fat_g)) + ' g' : '') + '</p>' +
        amount + slotSel + dateIn +
        '<button type="button" class="btn block" data-a="entrysave">Save</button><p class="center"><button type="button" class="link quietdanger" data-a="entrydelete">Delete this entry</button></p></div>';
    }
    function unitIndex(units, e) {
      // The entry's unit label looks like "1.5 × 1 container" or "150 g".
      var lab = DY.unitLabelOf(e);
      var i = units.map(function (u) { return u.label; }).indexOf(lab);
      return i < 0 ? units.length - 1 : i;
    }
    function onInput(el) {
      var sh = S.sheet, kinds = { entry: 1, savemeal: 1, copymeal: 1, slots: 1 };
      if (!sh || !kinds[sh.kind] || !el.dataset.x) return false;
      var k = el.dataset.x, v = el.value;
      if (/^label:\d+$/.test(k)) { sh.list[Number(k.slice(6))].label = v; return true; }
      sh[k] = (k === 'qty' || k === 'kcal') ? (v === '' ? null : Number(v)) : k === 'unit' ? Number(v) : v;
      return true;
    }

    /* ---------- save a meal (LOG-9) and copy a meal (LOG-10) ---------- */
    function slotEntries(sh) { return entriesOn(sh.date).filter(function (e) { return e.slot === sh.slot; }); }
    function itemList(list) {
      return '<div class="list">' + list.map(function (e) { return '<div class="item"><span><span class="t">' + esc(e.name) + '</span><span class="s">' + esc(e.unit || 'Quick add') + '</span></span><span class="k">' + fmt(Number(e.kcal)) + '<small>kcal</small></span></div>'; }).join('') + '</div>';
    }
    function saveMealSheet() {
      var sh = S.sheet, list = slotEntries(sh);
      return wrap('Save as meal', '<h2>Save ' + esc(slotLabel(sh.slot)) + ' as a meal</h2>' +
        '<p class="small muted">Log the same foods again in one tap, at any size (half, double). Find saved meals under + › Meals.</p>' + itemList(list) +
        '<div class="field"><label for="sm-name">Name</label><input type="text" id="sm-name" data-x="name" maxlength="60" value="' + esc(sh.name || '') + '" placeholder="e.g. Usual breakfast"></div>' +
        '<button type="button" class="btn block" data-a="savemealgo">Save meal</button>');
    }
    function copyMealSheet() {
      var sh = S.sheet, list = slotEntries(sh);
      return wrap('Copy meal', '<h2>Copy ' + esc(slotLabel(sh.slot)) + '</h2><p class="small muted">From ' + esc(dayName(sh.date)) + '. ' + list.length + ' item' + (list.length === 1 ? '' : 's') + '.</p>' + itemList(list) +
        '<div class="grid2"><div class="field"><label for="cm-date">To day</label><input type="date" id="cm-date" data-x="to" value="' + esc(sh.to) + '" max="' + ctx.today() + '"></div>' +
        '<div class="field"><label for="cm-slot">Meal</label><select id="cm-slot" data-x="toSlot">' + slotOptions(sh.toSlot) + '</select></div></div>' +
        '<button type="button" class="btn block" data-a="copymealgo">Copy</button>');
    }

    /* ---------- meal names, order and visibility (LOG-1) ---------- */
    function slotsSheet() {
      var list = S.sheet.list;
      return wrap('Meals', '<h2>Meals</h2><p class="small muted">Rename, reorder or hide meals. Hidden meals still show on a day that has food in them. Renaming never moves food you\'ve logged.</p>' +
        list.map(function (s, i) {
          return '<div class="card" style="display:grid;gap:8px;padding:12px"><div class="row" style="gap:8px"><input type="text" data-x="label:' + i + '" value="' + esc(s.label) + '" maxlength="30" aria-label="Name for ' + esc(s.standard) + '">' +
            '<button type="button" class="iconbtn" data-a="slotmove" data-v="' + i + ':-1" aria-label="Move up"' + (i === 0 ? ' disabled style="opacity:.35"' : '') + '>↑</button>' +
            '<button type="button" class="iconbtn" data-a="slotmove" data-v="' + i + ':1" aria-label="Move down"' + (i === list.length - 1 ? ' disabled style="opacity:.35"' : '') + '>↓</button></div>' +
            '<div class="chips2"><button type="button" data-a="slothide" data-v="' + i + '" aria-pressed="' + !!s.hidden + '">' + (s.hidden ? 'Hidden' : 'Hide') + '</button>' + (s.label !== s.standard ? '<span class="small muted">was ' + esc(s.standard) + '</span>' : '') + '</div></div>';
        }).join('') +
        '<button type="button" class="btn block" data-a="slotsave">Save</button><button type="button" class="btn ghost block" data-a="slotreset">Back to the standard six</button>');
    }

    /* ---------- Nutrient review (NUT-6, NUT-7) ---------- */
    function amount(v, unit) { if (!v) return '0 ' + unit; return (v >= 100 ? fmt(v) : v >= 10 ? fmt(v, 1) : fmt(v, v >= 1 ? 1 : 2)) + ' ' + unit; }
    function ageOn(dob, date) { if (!dob) return null; var a = +date.slice(0, 4) - +dob.slice(0, 4); if (date.slice(5) < dob.slice(5)) a--; return a; }
    /** DRI targets for this person, only once the tables are verified against their source (dri.VERIFIED). */
    function driTargets(date) {
      var p = S.rows.profile, age = p && ageOn(p.dob, date);
      if (!DRI || !DRI.VERIFIED || !p || !(age >= 14)) return null;
      try { return DRI.targetsFor({ age: age, sex: p.sex || 'unspecified', reproductive: p.pregnant_or_breastfeeding ? 'either' : null }); } catch (e) { return null; }
    }
    function latestKg() {
      var w = (S.rows.weights || []).filter(function (x) { return !x.deleted; }).sort(function (a, b) { return a.measured_at < b.measured_at ? 1 : -1; })[0];
      return w ? Number(w.kg) : null;
    }
    function nutrientsSheet() {
      var sh = S.sheet, week = sh.span === 'week', all = S.rows.diary || [];
      var dates = week ? RV.week(sh.date) : [sh.date];
      var es = all.filter(function (e) { return !e.deleted && dates.indexOf(e.date) >= 0; });
      var t = week ? RV.average(es, dates) : DY.totals(es), targets = driTargets(sh.date);
      var groups = RV.rows(t, targets), q = RV.quality(t, latestKg());
      var fmtDay = function (d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
      var sub = week ? (t.days ? 'Average of ' + t.days + ' logged day' + (t.days === 1 ? '' : 's') + ', ' + fmtDay(dates[0]) + ' – ' + fmtDay(dates[6]) + '. Days with nothing logged don\'t count.' : 'Nothing logged in these 7 days.') : dayName(sh.date);
      var row = function (r) {
        var bits = [], m = RV.meter(r), pctTxt = r.pct != null ? fmt(r.pct) + '%' : '';
        if (r.limit != null) bits.push('aim ' + amount(r.target, r.unit) + ', keep under ' + amount(r.limit, r.unit) + (r.flags.indexOf('over-limit') >= 0 ? ' (over)' : ''));
        else if (r.pct != null) bits.push((r.kind === 'AI' ? 'AI' : 'RDA') + ' ' + amount(r.target, r.unit));
        if (r.flags.indexOf('above-ul') >= 0) bits.push('above UL');
        if (r.coverage < 1) bits.push('known for ' + Math.round(r.coverage * 100) + '% of calories');
        var open = sh.open === r.id, top = open ? RV.contributors(es, r.id, 3) : [];
        var bar = m ? '<span class="dv ' + m.tone + '" aria-hidden="true"><i style="width:' + (m.fill * 100).toFixed(1) + '%"></i>' + (m.mark != null ? '<b style="left:' + (m.mark * 100).toFixed(1) + '%"></b>' : '') + '</span>' : '';
        var say = r.label + ', ' + amount(r.amount, r.unit) + (pctTxt ? ', ' + pctTxt + ' of target' : '') + (m && m.tone === 'met' ? ', met' : m && m.tone === 'over' ? ', over' : '');
        return '<button type="button" class="item food nut" data-a="nutrow" data-v="' + r.id + '" aria-expanded="' + open + '" aria-label="' + esc(say) + '"><span><span class="t">' + esc(r.label) + '</span>' + bar + (bits.length ? '<span class="s">' + esc(bits.join(' · ')) + '</span>' : '') + '</span>' +
          '<span class="k">' + (pctTxt ? '<span class="dvp ' + (m ? m.tone : '') + '">' + (m && m.tone === 'met' ? '✓ ' : '') + pctTxt + '</span><small>' + amount(r.amount, r.unit) + '</small>' : amount(r.amount, r.unit)) + '</span></button>' +
          (open ? '<div class="small muted" style="padding:0 0 10px">' + (top.length ? 'Most from: ' + top.map(function (c) { return esc(c.name) + ' (' + Math.round(c.share * 100) + '%)'; }).join(', ') : 'No food listed it.') + (r.ulNote ? '<br>' + esc(r.ulNote) : '') + '</div>' : '');
      };
      var flat = [];
      groups.forEach(function (g) { flat = flat.concat(g.rows); });
      var far = targets ? root.LW.calc.nutrients.furthestFromTarget(flat.filter(function (r) { return r.pct != null; }), q, 4) : [];
      return wrap('Nutrients', '<div class="row"><h2>Nutrients</h2><button type="button" class="btn ghost sm" data-a="close">Done</button></div>' +
        '<div class="seg">' + [['day', 'Day'], ['week', '7-day average']].map(function (o) { return '<button type="button" data-a="nutspan" data-v="' + o[0] + '" aria-pressed="' + ((sh.span || 'day') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
        '<p class="small muted">' + esc(sub) + '</p>' +
        (targets && groups.length ? '<p class="small muted dvkey"><span class="dv part" aria-hidden="true"><i style="width:60%"></i></span> Bars show % of your daily target. <span class="met">Green</span> means met; <span class="warn">amber</span> means over a limit. For sodium the bar ends at the limit; the tick is the target.</p>' : '') +
        (targets ? (far.length ? '<section class="card"><b>Furthest from target</b><p class="small muted">' + far.map(function (r) { return esc(r.label) + (r.flags && r.flags.indexOf('over-limit') >= 0 ? ' (over the limit)' : r.flags && r.flags.indexOf('above-ul') >= 0 ? ' (above UL)' : r.pct != null ? ' ' + fmt(r.pct) + '%' : ''); }).join(' · ') + '</p></section>' : '')
          : '<p class="small muted">Vitamin and mineral targets need your date of birth. For now you see your amounts and how complete the data is.</p>') +
        groups.map(function (g) { return '<span class="sec">' + esc(g.label) + '</span><div class="list">' + g.rows.map(row).join('') + '</div>'; }).join('') +
        (q.length ? '<span class="sec">Ratios and quality</span><section class="card">' + q.map(function (x) { return '<div class="status" style="display:block"><b>' + esc(x.label) + '</b><span class="small muted" style="display:block">' + esc(x.text) + '</span></div>'; }).join('') +
          '<p class="small muted">Limits from the Dietary Guidelines for Americans 2020–2025. A total is only as complete as the foods that list it.</p></section>' : '') +
        (targets ? '<p class="small muted">Targets are the RDA, or the AI where no RDA exists, for your age and sex (National Academies). A low number may be missing data: check "known for". Tap a nutrient to see where it came from.</p>' : '') +
        (groups.length ? '' : '<p class="small muted">Log some food to see its nutrients.</p>'));
    }

    function sheetView() {
      var k = S.sheet && S.sheet.kind;
      return k === 'entry' ? entrySheet() : k === 'mealmenu' ? mealMenuSheet() : k === 'savemeal' ? saveMealSheet() : k === 'copymeal' ? copyMealSheet() : k === 'slots' ? slotsSheet() : k === 'nutrients' ? nutrientsSheet() : null;
    }

    var actions = {
      day: function (v) {
        var d = DY.addDays(S.diaryDate || ctx.today(), Number(v));
        if (d > ctx.today()) return;
        S.diaryDate = d; ctx.render();
      },
      enslot: function (v) { S.sheet.slot = v; ctx.render(); },
      enunit: function (v) { S.sheet.unit = Number(v); ctx.render(); },
      entry: function (id) { S.sheet = { kind: 'entry', id: id }; ctx.render(); },
      entrysave: function () {
        var sh = S.sheet, e = S.rows.diary.filter(function (x) { return x.id === sh.id; })[0];
        if (!e) return;
        var next;
        if (e.food_source === 'quick') {
          next = Object.assign({}, e, { kcal: sh.kcal != null ? sh.kcal : e.kcal, name: (sh.label != null ? sh.label : e.name) || 'Quick add', slot: sh.slot || e.slot, date: sh.date || e.date });
          if (!(next.kcal >= 0)) { ctx.toast('Enter the calories'); return; }
        } else {
          var food = DY.foodOfEntry(e), units = food ? DY.unitsFor(food) : [];
          var change = { slot: sh.slot, date: sh.date };
          if (food && (sh.qty != null || sh.unit != null)) {
            change.qty = sh.qty != null ? sh.qty : Number(e.qty) || 1;
            change.unit = units[sh.unit != null ? sh.unit : unitIndex(units, e)];
            if (!(change.qty > 0)) { ctx.toast('Enter an amount above zero'); return; }
          }
          next = DY.updateEntry(e, change);
        }
        if (next.date > ctx.today()) { ctx.toast('That day hasn\'t happened yet'); return; }
        ctx.save([['lw_diary_entries', next]]).then(function () { S.sheet = false; ctx.toast(next.date !== e.date || next.slot !== e.slot ? 'Moved to ' + slotLabel(next.slot) + ', ' + dayName(next.date) : 'Saved'); ctx.render(); });
      },
      entrydelete: function () {
        var id = S.sheet.id;
        ctx.remove('lw_diary_entries', id).then(function () { S.sheet = false; ctx.toast('Deleted'); ctx.render(); });
      },
      copyday: function () {
        var date = S.diaryDate || ctx.today();
        var rows = DY.copyEntries(entriesOn(DY.addDays(date, -1)), date).map(function (r) { return ['lw_diary_entries', r]; });
        ctx.save(rows).then(function () { ctx.toast('Copied ' + rows.length + ' item' + (rows.length === 1 ? '' : 's')); ctx.render(); });
      },
      mealmenu: function (slot) { S.sheet = { kind: 'mealmenu', slot: slot, date: S.diaryDate || ctx.today() }; ctx.render(); },
      savemeal: function (slot) { var d = S.diaryDate || ctx.today(); S.sheet = { kind: 'savemeal', slot: slot, date: d, name: slotLabel(slot) }; ctx.render(); },
      savemealgo: function () {
        var sh = S.sheet, meal;
        try { meal = L.mealFromEntries(sh.name, slotEntries(sh)); } catch (e) { ctx.toast(e.message); return; }
        ctx.save([['lw_saved_meals', meal]]).then(function () { S.sheet = false; ctx.toast('Saved "' + meal.name + '"'); ctx.render(); });
      },
      copymeal: function (slot) { var d = S.diaryDate || ctx.today(); S.sheet = { kind: 'copymeal', slot: slot, date: d, to: d < ctx.today() ? ctx.today() : d, toSlot: slot }; ctx.render(); },
      copymealgo: function () {
        var sh = S.sheet;
        if (!sh.to || sh.to > ctx.today()) { ctx.toast('Choose today or an earlier day'); return; }
        var rows = DY.copyEntries(slotEntries(sh), sh.to, sh.toSlot).map(function (r) { return ['lw_diary_entries', r]; });
        ctx.save(rows).then(function () { S.sheet = false; ctx.toast('Copied to ' + slotLabel(sh.toSlot) + ', ' + dayName(sh.to)); ctx.render(); });
      },
      slots: function () { S.sheet = { kind: 'slots', list: slots().map(function (s) { return Object.assign({}, s); }) }; ctx.render(); },
      slotmove: function (v) {
        var p = String(v).split(':'), i = Number(p[0]), j = i + Number(p[1]), l = S.sheet.list;
        if (j < 0 || j >= l.length) return;
        var x = l[i]; l[i] = l[j]; l[j] = x; ctx.render();
      },
      slothide: function (v) { var s = S.sheet.list[Number(v)]; s.hidden = !s.hidden; ctx.render(); },
      slotreset: function () { S.sheet.list = L.slotsFor({}); ctx.render(); },
      slotsave: function () {
        var p = S.rows.profile, prefs;
        if (!p) return;
        try { prefs = L.withSlots(p.preferences, S.sheet.list); } catch (e) { ctx.toast(e.message); return; }
        ctx.save([['lw_profiles', Object.assign({}, p, { preferences: prefs })]]).then(function () { S.sheet = false; ctx.toast('Meals saved'); ctx.render(); });
      },
      nutrients: function () { S.sheet = { kind: 'nutrients', date: S.diaryDate || ctx.today(), span: 'day', open: null }; ctx.render(); },
      nutspan: function (v) { S.sheet.span = v; S.sheet.open = null; ctx.render(); },
      nutrow: function (id) { S.sheet.open = S.sheet.open === id ? null : id; ctx.render(); },
      quicklog: function (id) {
        var e = (S.rows.diary || []).filter(function (x) { return x.id === id; })[0];
        if (!e) return;
        var now = new Date(), slot = DY.slotForTime(now.getHours() * 60 + now.getMinutes());
        var rows = DY.copyEntries([e], ctx.today(), slot).map(function (r) { r.logged_via = 'recent'; return ['lw_diary_entries', r]; });
        ctx.save(rows).then(function () { ctx.toast('Added to ' + slotLabel(slot) + '. Tap it below to change it.'); ctx.render(); });
      },
      repeatbf: function () {
        var date = S.diaryDate || ctx.today();
        var src = entriesOn(DY.addDays(date, -1)).filter(function (e) { return e.slot === 'breakfast'; });
        ctx.save(DY.copyEntries(src, date).map(function (r) { return ['lw_diary_entries', r]; })).then(function () { ctx.toast('Breakfast repeated'); ctx.render(); });
      }
    };

    return { view: view, insightCard: insightCard, sheetView: sheetView, onInput: onInput, actions: actions, entriesOn: entriesOn, slots: slots, slotOptions: slotOptions, slotLabel: slotLabel, dayName: dayName };
  }

  root.LW.diaryui = { create: create };
})(this);
