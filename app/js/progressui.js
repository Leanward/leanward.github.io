/* Leanward — the Progress tab (M6a): weigh-ins with the trend (MEA-1, MEA-2), waist and other
 * circumferences with how-to-measure guidance (MEA-3), edit and delete (MEA-6), and charts for
 * weight, waist, calories and protein over 4 weeks / 12 weeks / 6 months / all, with phase starts
 * marked (PRG-1). Each chart carries a spoken summary. Logic lives in js/measure.js and calc/trend.js.
 */
(function (root) {
  'use strict';

  var ME = root.LW.measure, M = root.LW.model, core = root.LW.calc.core, fmt = core.fmt, fmtS = core.fmtSigned;
  var BOX = { w: 340, h: 150, pad: { l: 38, r: 8, t: 8, b: 18 } };
  var PHASE_NAME = { cut: 'Cut', recomp: 'Recomp', bulk: 'Lean bulk', maintenance: 'Maintenance', nutrition: 'Nutrition' };

  function create(ctx) {
    var S = ctx.state, esc = ctx.esc;

    function units() { return (S.rows.profile && S.rows.profile.units) || 'us'; }
    function range() { return S.progressRange || '4w'; }
    function rangeLabel() { var r = ME.RANGES.filter(function (x) { return x.id === range(); })[0]; return r.id === 'all' ? 'all time' : 'last ' + r.label; }
    function day(iso, long) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }); }
    function nowTime() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function timeOf(iso) { var d = new Date(iso); return isNaN(d) ? '12:00' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function targetOn(date) {
      var ph = (S.rows.phases || []).filter(function (p) { return !p.deleted && p.start_date <= date && (!p.end_date || p.end_date >= date); })
        .sort(function (a, b) { return a.start_date < b.start_date ? 1 : -1; })[0];
      return ph ? M.targetsOn(S.rows.sets, ph.id, date) : null;
    }
    function wrap(title, body) { return '<div class="scrim" data-a="close"></div><div class="sheet tall" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="grab"></div>' + body + '</div>'; }

    /* ---------- charts (hand-drawn SVG, PRG-1) ---------- */
    /** o: { from, to, dots?, line?, target?, dp, summary } — arrays of { date, v }. */
    function chart(o) {
      var sc = ME.scale([o.dots, o.line, o.target], o.from, o.to, BOX), p = BOX.pad;
      var pts = function (list) { return list.map(function (q) { return sc.x(q.date).toFixed(1) + ',' + sc.y(q.v).toFixed(1); }).join(' '); };
      var grid = sc.yTicks.map(function (v) {
        var y = sc.y(v).toFixed(1);
        return '<line class="grid" x1="' + p.l + '" x2="' + (BOX.w - p.r) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (p.l - 5) + '" y="' + (Number(y) + 3) + '" text-anchor="end">' + fmt(v, o.dp || 0) + '</text>';
      }).join('');
      var phases = (S.rows.phases || []).filter(function (ph) { return !ph.deleted && ph.start_date > o.from && ph.start_date <= o.to; }).map(function (ph) {
        var x = sc.x(ph.start_date).toFixed(1);
        return '<line class="phase" x1="' + x + '" x2="' + x + '" y1="' + p.t + '" y2="' + (BOX.h - p.b) + '"/><text x="' + (Number(x) + 3) + '" y="' + (p.t + 8) + '">' + esc(PHASE_NAME[ph.type] || '') + '</text>';
      }).join('');
      return '<svg class="chart" viewBox="0 0 ' + BOX.w + ' ' + BOX.h + '" role="img" aria-label="' + esc(o.summary) + '">' + grid + phases +
        (o.target && o.target.length > 1 ? '<polyline class="target" points="' + pts(o.target) + '"/>' : '') +
        (o.line && o.line.length > 1 ? '<polyline class="trend" points="' + pts(o.line) + '"/>' : '') +
        (o.dots || []).map(function (q) { return '<circle class="dot" cx="' + sc.x(q.date).toFixed(1) + '" cy="' + sc.y(q.v).toFixed(1) + '" r="' + ((o.dots.length > 60) ? 1.6 : 2.4) + '"/>'; }).join('') +
        '<text x="' + p.l + '" y="' + (BOX.h - 4) + '">' + esc(day(o.from)) + '</text><text x="' + (BOX.w - p.r) + '" y="' + (BOX.h - 4) + '" text-anchor="end">' + esc(day(o.to)) + '</text></svg>';
    }
    function legend(items) { return '<p class="legend small muted">' + items.map(function (i) { return '<span><i class="' + i[0] + '"></i>' + i[1] + '</span>'; }).join('') + '</p>'; }

    /* ---------- the tab ---------- */
    function weightCard(from, today) {
      var u = ME.weightUnit(units()), v = ME.weightView(S.rows.weights, units(), from, today);
      var head = '<div class="row"><h2 style="margin:0">Weight</h2><button type="button" class="btn sm" data-a="weigh">Log weight</button></div>';
      if (!v.latest) return '<section class="card">' + head + '<p class="small muted">No weigh-ins yet. Weigh in most mornings, before eating: the trend line smooths out the daily ups and downs from water and food.</p></section>';
      var list = (S.rows.weights || []).filter(function (w) { return !w.deleted; }).sort(function (a, b) { return a.measured_at < b.measured_at ? 1 : -1; });
      var shown = S.progressAllWeights ? list : list.slice(0, 5);
      return '<section class="card">' + head +
        '<div class="row" style="margin-top:8px;align-items:flex-end"><span><b style="font-size:26px">' + fmt(v.latest.trend, 1) + '</b> <span class="small muted">' + u + ' trend (derived)</span></span>' +
        '<span class="small muted" style="text-align:right">Last weigh-in ' + fmt(v.latest.v, 1) + ' ' + u + '<br>' + esc(day(v.latest.date, true)) + '</span></div>' +
        '<p class="small muted">' + (v.rate ? 'Last 14 days: ' + fmtS(v.rate.perWeek, 2) + ' ' + u + ' a week (' + fmtS(v.rate.pct, 2) + '% of body weight).' : 'The weekly rate shows after 14 days of trend.') + '</p>' +
        chart({ from: from, to: today, dots: v.dots, line: v.trend, dp: 1, summary: ME.weightSummary(v, units(), rangeLabel()) }) +
        legend([['k-dot', 'Weigh-in (first of the day)'], ['k-trend', 'Trend']]) +
        '<details><summary>Weekly averages</summary><div class="list">' + v.weeks.map(function (w) {
          return '<div class="item"><span><span class="t">Week of ' + esc(day(w.weekStart)) + '</span><span class="s">' + w.count + ' weigh-in' + (w.count === 1 ? '' : 's') + '</span></span><span class="k">' + fmt(w.avg, 1) + '<small>' + u + '</small></span></div>';
        }).join('') + '</div><p class="small muted">The trend is a moving average: each day it moves 10% of the way toward that day\'s first weigh-in.</p></details>' +
        '<span class="sec">Weigh-ins</span><div class="list">' + shown.map(function (w) {
          return '<button type="button" class="item food" data-a="weighedit" data-v="' + esc(w.id) + '"><span><span class="t">' + esc(day(w.date, true)) + '</span><span class="s">' + esc(timeOf(w.measured_at)) + (w.note ? ' · ' + esc(w.note) : '') + '</span></span>' +
            '<span class="k">' + fmt(ME.kgToUnits(Number(w.kg), units()), 1) + '<small>' + u + '</small></span></button>';
        }).join('') + '</div>' +
        (list.length > 5 ? '<button type="button" class="link" data-a="weighall">' + (S.progressAllWeights ? 'Show fewer' : 'Show all ' + list.length) + '</button>' : '') + '</section>';
    }

    function measureCard(from, today) {
      var u = ME.lengthUnit(units()), all = (S.rows.measures || []).filter(function (m) { return !m.deleted; });
      var w = ME.siteView(all, 'waist', units(), from, today);
      var head = '<div class="row"><h2 style="margin:0">Waist and measurements</h2><button type="button" class="btn sm" data-a="measure">Add</button></div>';
      if (!all.length) return '<section class="card">' + head + '<p class="small muted">Waist is the simplest sign of fat change when the scale barely moves, as in a recomp. Measure every week or two, same spot and time of day.</p></section>';
      var last = w.all[w.all.length - 1];
      var summary = 'Waist, ' + rangeLabel() + '. ' + w.points.length + ' measurement' + (w.points.length === 1 ? '' : 's') + (last ? '. Latest ' + fmt(last.v, 1) + ' ' + u + ' on ' + last.date : '') + (w.change != null ? '. Change over this range ' + fmtS(w.change, 1) + ' ' + u : '') + '.';
      var others = ME.SITES.slice(1).map(function (s) {
        var v = ME.siteView(all, s.id, units(), from, today), l = v.all[v.all.length - 1];
        return l ? '<div class="item"><span><span class="t">' + s.label + '</span><span class="s">' + esc(day(l.date)) + (v.change != null ? ' · ' + fmtS(v.change, 1) + ' ' + u + ' over this range' : '') + '</span></span><span class="k">' + fmt(l.v, 1) + '<small>' + u + '</small></span></div>' : '';
      }).join('');
      var list = all.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (String(a.created_at || '') < String(b.created_at || '') ? 1 : -1); }).slice(0, S.progressAllMeasures ? 500 : 5);
      return '<section class="card">' + head +
        (last ? '<div class="row" style="margin-top:8px"><span><b style="font-size:26px">' + fmt(last.v, 1) + '</b> <span class="small muted">' + u + ' waist</span></span><span class="small muted">' + (w.change != null ? fmtS(w.change, 1) + ' ' + u + ' over the ' + esc(rangeLabel()) : esc(day(last.date, true))) + '</span></div>' +
          (w.points.length ? chart({ from: from, to: today, dots: w.points, line: w.points, dp: 1, summary: summary }) : '<p class="small muted">No waist measurements in this range.</p>') : '') +
        (others ? '<div class="list">' + others + '</div>' : '') +
        '<span class="sec">Entries</span><div class="list">' + list.map(function (m) {
          var s = ME.SITES.filter(function (x) { return x.id === m.site; })[0];
          return '<button type="button" class="item food" data-a="measureedit" data-v="' + esc(m.id) + '"><span><span class="t">' + (s ? s.label : esc(m.site)) + '</span><span class="s">' + esc(day(m.date, true)) + '</span></span><span class="k">' + fmt(ME.cmToUnits(Number(m.cm), units()), 1) + '<small>' + u + '</small></span></button>';
        }).join('') + '</div>' +
        (all.length > 5 ? '<button type="button" class="link" data-a="measureall">' + (S.progressAllMeasures ? 'Show fewer' : 'Show all ' + all.length) + '</button>' : '') + '</section>';
    }

    function intakeCard(from, today) {
      var v = ME.intakeView(S.rows.diary, from, today, targetOn);
      var head = '<h2 style="margin:0">Calories and protein</h2>';
      if (!v.logged) return '<section class="card">' + head + '<p class="small muted">Nothing logged in the ' + esc(rangeLabel()) + '.</p></section>';
      var vs = function (avg, target, unit) { return fmt(avg) + (target != null ? ' <span class="small muted">/ ' + fmt(target) + ' ' + unit + '</span>' : ' <span class="small muted">' + unit + '</span>'); };
      var kc = v.days.map(function (d) { return { date: d.date, v: d.kcal }; }), kt = v.days.filter(function (d) { return d.kcalTarget != null; }).map(function (d) { return { date: d.date, v: d.kcalTarget }; });
      var pr = v.days.map(function (d) { return { date: d.date, v: d.protein }; }), pt = v.days.filter(function (d) { return d.proteinTarget != null; }).map(function (d) { return { date: d.date, v: d.proteinTarget }; });
      var said = function (name, avg, target, unit) { return name + ', ' + rangeLabel() + '. Average ' + fmt(avg) + ' ' + unit + ' on ' + v.logged + ' logged day' + (v.logged === 1 ? '' : 's') + (target != null ? ', against a target of ' + fmt(target) + ' ' + unit : '') + '.'; };
      return '<section class="card">' + head +
        '<p class="small muted">Averages over the ' + v.logged + ' day' + (v.logged === 1 ? '' : 's') + ' you logged in the ' + esc(rangeLabel()) + '. Days with nothing logged don\'t count.</p>' +
        '<div class="grid2"><div><span class="small muted">Calories a day</span><b style="display:block;font-size:20px">' + vs(v.avgKcal, v.avgKcalTarget, 'kcal') + '</b></div>' +
        '<div><span class="small muted">Protein a day</span><b style="display:block;font-size:20px">' + vs(v.avgProtein, v.avgProteinTarget, 'g') + '</b></div></div>' +
        chart({ from: from, to: today, dots: kc, target: kt, summary: said('Calories', v.avgKcal, v.avgKcalTarget, 'kcal') }) +
        chart({ from: from, to: today, dots: pr, target: pt, summary: said('Protein', v.avgProtein, v.avgProteinTarget, 'grams') }) +
        legend([['k-dot', 'Logged day (calories above, protein below)'], ['k-target', 'Target']]) + '</section>';
    }

    function view() {
      var today = ctx.today(), first = (S.rows.weights || []).filter(function (w) { return !w.deleted; }).map(function (w) { return w.date; }).sort()[0];
      var from = ME.rangeStart(range(), today, first);
      return '<header class="top"><h1>Progress</h1></header>' +
        '<div class="seg">' + ME.RANGES.map(function (r) { return '<button type="button" data-a="prange" data-v="' + r.id + '" aria-pressed="' + (range() === r.id) + '">' + r.label + '</button>'; }).join('') + '</div>' +
        weightCard(from, today) + measureCard(from, today) + intakeCard(from, today) +
        '<p class="small muted center">Dashed lines mark where a phase started. Is the phase working? See the Phase tab. Key lifts arrive with the PR Forge connection.</p>';
    }

    function homeCard() {
      var today = ctx.today(), u = ME.weightUnit(units()), v = ME.weightView(S.rows.weights, units(), core.addDays(today, -27), today);
      var weighed = (S.rows.weights || []).some(function (w) { return !w.deleted && w.date === today; });
      return '<section class="card"><div class="row"><h2 style="margin:0">Weight</h2>' + (weighed ? '<span class="pill ok">Weighed in today</span>' : '<button type="button" class="btn sm" data-a="weigh">Log weight</button>') + '</div>' +
        (v.latest ? '<p class="small muted" style="margin-bottom:0">Trend ' + fmt(v.latest.trend, 1) + ' ' + u + (v.rate ? ' · ' + fmtS(v.rate.perWeek, 2) + ' ' + u + ' a week' : '') + ' · last ' + fmt(v.latest.v, 1) + ' ' + u + ' on ' + esc(day(v.latest.date)) + '</p>'
          : '<p class="small muted" style="margin-bottom:0">Weigh in most mornings to see your trend.</p>') + '</section>';
    }

    /* ---------- sheets ---------- */
    function weighSheet() {
      var sh = S.sheet, u = ME.weightUnit(units());
      return wrap(sh.id ? 'Edit weigh-in' : 'Log weight', '<h2>' + (sh.id ? 'Edit weigh-in' : 'Log weight') + '</h2>' +
        '<div class="field"><label for="we-v">Weight <span class="muted">' + u + '</span></label><input type="number" id="we-v" inputmode="decimal" step="any" data-m="value" value="' + (sh.value == null ? '' : esc(String(sh.value))) + '"></div>' +
        '<div class="grid2"><div class="field"><label for="we-d">Day</label><input type="date" id="we-d" data-m="date" value="' + esc(sh.date) + '" max="' + ctx.today() + '"></div>' +
        '<div class="field"><label for="we-t">Time</label><input type="time" id="we-t" data-m="time" value="' + esc(sh.time) + '"></div></div>' +
        '<div class="field"><label for="we-n">Note <span class="muted">optional</span></label><input type="text" id="we-n" data-m="note" maxlength="200" value="' + esc(sh.note || '') + '" placeholder="e.g. after travel"></div>' +
        '<p class="small muted">Same scale, same time of day, before eating if you can. More than one a day is fine: the trend uses the first.</p>' +
        '<button type="button" class="btn block" data-a="weighsave">Save</button>' + (sh.id ? '<button type="button" class="btn ghost block" data-a="weighdelete">Delete</button>' : ''));
    }
    function measureSheet() {
      var sh = S.sheet, u = ME.lengthUnit(units()), site = ME.SITES.filter(function (s) { return s.id === sh.site; })[0] || ME.SITES[0];
      return wrap(sh.id ? 'Edit measurement' : 'Add a measurement', '<h2>' + (sh.id ? 'Edit measurement' : 'Add a measurement') + '</h2>' +
        '<div class="chips2">' + ME.SITES.map(function (s) { return '<button type="button" data-a="measuresite" data-v="' + s.id + '" aria-pressed="' + (s.id === site.id) + '">' + s.label + '</button>'; }).join('') + '</div>' +
        '<p class="small muted"><b>How to measure:</b> ' + esc(site.how) + '</p>' +
        '<div class="grid2"><div class="field"><label for="ms-v">' + site.label + ' <span class="muted">' + u + '</span></label><input type="number" id="ms-v" inputmode="decimal" step="any" data-m="value" value="' + (sh.value == null ? '' : esc(String(sh.value))) + '"></div>' +
        '<div class="field"><label for="ms-d">Day</label><input type="date" id="ms-d" data-m="date" value="' + esc(sh.date) + '" max="' + ctx.today() + '"></div></div>' +
        '<button type="button" class="btn block" data-a="measuresave">Save</button>' + (sh.id ? '<button type="button" class="btn ghost block" data-a="measuredelete">Delete</button>' : ''));
    }
    function sheetView() { var k = S.sheet && S.sheet.kind; return k === 'weigh' ? weighSheet() : k === 'measure' ? measureSheet() : null; }
    function focus(id) { root.setTimeout(function () { var i = root.document.getElementById(id); if (i) i.focus(); }, 50); }

    function onInput(el) {
      var sh = S.sheet;
      if (!sh || (sh.kind !== 'weigh' && sh.kind !== 'measure') || !el.dataset.m) return false;
      sh[el.dataset.m] = el.value;
      return true;
    }

    var actions = {
      prange: function (v) { S.progressRange = v; ctx.render(); },
      weighall: function () { S.progressAllWeights = !S.progressAllWeights; ctx.render(); },
      measureall: function () { S.progressAllMeasures = !S.progressAllMeasures; ctx.render(); },
      weigh: function () { S.sheet = { kind: 'weigh', value: null, date: ctx.today(), time: nowTime(), note: '' }; ctx.render(); focus('we-v'); },
      weighedit: function (id) {
        var w = (S.rows.weights || []).filter(function (x) { return x.id === id; })[0];
        if (!w) return;
        S.sheet = { kind: 'weigh', id: id, value: core.round(ME.kgToUnits(Number(w.kg), units()), 0.1), date: w.date, time: timeOf(w.measured_at), note: w.note || '' }; ctx.render();
      },
      weighsave: function () {
        var sh = S.sheet, row, old = sh.id && (S.rows.weights || []).filter(function (x) { return x.id === sh.id; })[0];
        try { row = ME.weightRow({ id: sh.id, value: sh.value, units: units(), date: sh.date, time: sh.time, note: sh.note, today: ctx.today() }); } catch (e) { ctx.toast(e.message); return; }
        if (old) row = Object.assign({}, old, row, { source: old.source });
        ctx.save([['lw_weights', row]]).then(function () { S.sheet = false; ctx.toast(old ? 'Saved' : 'Weigh-in logged'); ctx.render(); }, function (e) { ctx.toast('Couldn\'t save: ' + (e && e.message)); });
      },
      weighdelete: function () { var id = S.sheet.id; ctx.remove('lw_weights', id).then(function () { S.sheet = false; ctx.toast('Deleted'); ctx.render(); }); },
      measure: function () { S.sheet = { kind: 'measure', site: 'waist', value: null, date: ctx.today() }; ctx.render(); focus('ms-v'); },
      measuresite: function (v) { S.sheet.site = v; ctx.render(); },
      measureedit: function (id) {
        var m = (S.rows.measures || []).filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        S.sheet = { kind: 'measure', id: id, site: m.site, value: core.round(ME.cmToUnits(Number(m.cm), units()), 0.1), date: m.date }; ctx.render();
      },
      measuresave: function () {
        var sh = S.sheet, row, old = sh.id && (S.rows.measures || []).filter(function (x) { return x.id === sh.id; })[0];
        try { row = ME.measurementRow({ id: sh.id, site: sh.site, value: sh.value, units: units(), date: sh.date, today: ctx.today() }); } catch (e) { ctx.toast(e.message); return; }
        if (old) row = Object.assign({}, old, row);
        ctx.save([['lw_measurements', row]]).then(function () { S.sheet = false; ctx.toast(old ? 'Saved' : 'Measurement added'); ctx.render(); }, function (e) { ctx.toast('Couldn\'t save: ' + (e && e.message)); });
      },
      measuredelete: function () { var id = S.sheet.id; ctx.remove('lw_measurements', id).then(function () { S.sheet = false; ctx.toast('Deleted'); ctx.render(); }); }
    };

    return { view: view, homeCard: homeCard, sheetView: sheetView, onInput: onInput, actions: actions };
  }

  root.LW.progressui = { create: create };
})(this);
