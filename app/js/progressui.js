/* Leanward — the Progress tab (M6a): weigh-ins with the trend (MEA-1, MEA-2), waist and other
 * circumferences with how-to-measure guidance (MEA-3), edit and delete (MEA-6), and charts for
 * weight, waist, calories and protein over 4 weeks / 12 weeks / 6 months / all, with phase starts
 * marked (PRG-1). Key lifts come from PR Forge, read-only (MEA-5, js/prforge.js). Each chart carries
 * a spoken summary. Logic lives in js/measure.js and calc/trend.js.
 */
(function (root) {
  'use strict';

  var ME = root.LW.measure, PF = root.LW.prforge, M = root.LW.model, core = root.LW.calc.core, fmt = core.fmt, fmtS = core.fmtSigned;
  var BOX = { w: 340, h: 160, pad: { l: 38, r: 12, t: 10, b: 20 } }, chartSeq = 0;
  var PHASE_NAME = { cut: 'Cut', recomp: 'Recomp', bulk: 'Lean bulk', maintenance: 'Maintenance', nutrition: 'Nutrition' };

  function create(ctx) {
    var S = ctx.state, esc = ctx.esc;

    function units() { return (S.rows.profile && S.rows.profile.units) || 'us'; }
    function range() { return S.progressRange || '30d'; }
    function rangeLabel() { var r = ME.RANGES.filter(function (x) { return x.id === range(); })[0]; if (r.name) return r.name; return r.id === 'all' ? 'all time' : 'last ' + r.label; }
    function day(iso, long) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }).replace(/(\w{3}) (\d)/, '$1\u00a0$2'); }
    function nowTime() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function timeOf(iso) { var d = new Date(iso); return isNaN(d) ? '12:00' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function targetOn(date) {
      return M.targetsFor(S.rows.phases, S.rows.sets, date, ctx.today());
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
      var line = o.line && o.line.length > 1 ? o.line : null, base = (BOX.h - p.b).toFixed(1);
      var area = line && o.area !== false ? '<polygon class="area" points="' + sc.x(line[0].date).toFixed(1) + ',' + base + ' ' + pts(line) + ' ' + sc.x(line[line.length - 1].date).toFixed(1) + ',' + base + '"/>' : '';
      var lastSrc = line || (o.dots && o.dots.length ? o.dots : null), last = lastSrc ? lastSrc[lastSrc.length - 1] : null;
      var gid = 'cg' + (++chartSeq);
      return '<svg class="chart" viewBox="0 0 ' + BOX.w + ' ' + BOX.h + '" role="img" aria-label="' + esc(o.summary) + '">' +
        '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--g1);stop-opacity:.28"/><stop offset="1" style="stop-color:var(--g1);stop-opacity:0"/></linearGradient></defs>' +
        grid + phases + area.replace('class="area"', 'class="area" fill="url(#' + gid + ')"') +
        (o.target && o.target.length > 1 ? '<polyline class="target" points="' + pts(o.target) + '"/>' : '') +
        (line ? '<polyline class="trend" points="' + pts(line) + '"/>' : '') +
        (o.dots || []).map(function (q) { return '<circle class="dot" cx="' + sc.x(q.date).toFixed(1) + '" cy="' + sc.y(q.v).toFixed(1) + '" r="' + ((o.dots.length > 60) ? 1.5 : 2.2) + '"/>'; }).join('') +
        (last ? '<circle class="lasthalo" cx="' + sc.x(last.date).toFixed(1) + '" cy="' + sc.y(last.v).toFixed(1) + '" r="7"/><circle class="last" cx="' + sc.x(last.date).toFixed(1) + '" cy="' + sc.y(last.v).toFixed(1) + '" r="3.6"/>' : '') +
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
        '<details data-keep="weekly"' + (S.open_weekly ? ' open' : '') + '><summary>Weekly averages</summary><div class="list">' + v.weeks.map(function (w) {
          return '<div class="item"><span><span class="t">Week of ' + esc(day(w.weekStart)) + '</span><span class="s">' + w.count + ' weigh-in' + (w.count === 1 ? '' : 's') + '</span></span><span class="k">' + fmt(w.avg, 1) + '<small>' + u + '</small></span></div>';
        }).join('') + '</div><p class="small muted">The trend is a moving average: each day it moves 10% of the way toward that day\'s first weigh-in.</p></details>' +
        '<details data-keep="weighins"' + (S.open_weighins ? ' open' : '') + '><summary>History (' + list.length + ' weigh-in' + (list.length === 1 ? '' : 's') + ')</summary><div class="list">' + shown.map(function (w) {
          return '<button type="button" class="item food" data-a="weighedit" data-v="' + esc(w.id) + '"><span><span class="t">' + esc(day(w.date, true)) + '</span><span class="s">' + esc(timeOf(w.measured_at)) + (w.note ? ' · ' + esc(w.note) : '') + '</span></span>' +
            '<span class="k">' + fmt(ME.kgToUnits(Number(w.kg), units()), 1) + '<small>' + u + '</small></span></button>';
        }).join('') + '</div>' +
        (list.length > 5 ? '<button type="button" class="link" data-a="weighall">' + (S.progressAllWeights ? 'Show fewer' : 'Show all ' + list.length) + '</button>' : '') + '</details></section>';
    }

    function measureCard(from, today) {
      var u = ME.lengthUnit(units()), all = (S.rows.measures || []).filter(function (m) { return !m.deleted; });
      var w = ME.siteView(all, 'waist', units(), from, today);
      var head = '<div class="row"><h2 style="margin:0">Waist and measurements</h2><button type="button" class="btn sm" data-a="measure">Add</button></div>';
      if (!all.length && !(S.rows.bodyfat || []).some(function (x) { return !x.deleted; })) return '<section class="card">' + head + '<p class="small muted">Waist is the simplest sign of fat change when the scale barely moves, as in a recomp. Measure every week or two, same spot and time of day.</p></section>';
      var last = w.all[w.all.length - 1];
      var summary = 'Waist, ' + rangeLabel() + '. ' + w.points.length + ' measurement' + (w.points.length === 1 ? '' : 's') + (last ? '. Latest ' + fmt(last.v, 1) + ' ' + u + ' on ' + last.date : '') + (w.change != null ? '. Change over this range ' + fmtS(w.change, 1) + ' ' + u : '') + '.';
      var others = ME.SITES.slice(1).map(function (s) {
        var v = ME.siteView(all, s.id, units(), from, today), l = v.all[v.all.length - 1];
        return l ? '<div class="item"><span><span class="t">' + s.label + '</span><span class="s">' + esc(day(l.date)) + (v.change != null ? ' · ' + fmtS(v.change, 1) + ' ' + u + ' over this range' : '') + '</span></span><span class="k">' + fmt(l.v, 1) + '<small>' + u + '</small></span></div>' : '';
      }).join('');
      var bf = (S.rows.bodyfat || []).filter(function (x) { return !x.deleted; });
      var bfLast = bf.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
      if (bfLast) others += '<div class="item"><span><span class="t">Body fat <span class="muted">(estimate)</span></span><span class="s">' + esc(day(bfLast.date)) + ' · ' + esc(methodLabel(bfLast.method)) + '</span></span><span class="k">' + fmt(Number(bfLast.pct), 1) + '<small>%</small></span></div>';
      var merged = all.concat(bf.map(function (x) { return Object.assign({ bf: true }, x); }));
      var list = merged.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (String(a.created_at || '') < String(b.created_at || '') ? 1 : -1); }).slice(0, S.progressAllMeasures ? 500 : 5);
      return '<section class="card">' + head +
        (last ? '<div class="row" style="margin-top:8px"><span><b style="font-size:26px">' + fmt(last.v, 1) + '</b> <span class="small muted">' + u + ' waist</span></span><span class="small muted">' + (w.change != null ? fmtS(w.change, 1) + ' ' + u + ' over the ' + esc(rangeLabel()) : esc(day(last.date, true))) + '</span></div>' +
          (w.points.length ? chart({ from: from, to: today, dots: w.points, line: w.points, dp: 1, summary: summary }) : '<p class="small muted">No waist measurements in this range.</p>') : '') +
        (others ? '<div class="list">' + others + '</div>' : '') +
        '<details data-keep="measures"' + (S.open_measures ? ' open' : '') + '><summary>History (' + merged.length + ' entr' + (merged.length === 1 ? 'y' : 'ies') + ')</summary><div class="list">' + list.map(function (m) {
          if (m.bf) return '<button type="button" class="item food" data-a="bfedit" data-v="' + esc(m.id) + '"><span><span class="t">Body fat (estimate)</span><span class="s">' + esc(day(m.date, true)) + ' · ' + esc(methodLabel(m.method)) + '</span></span><span class="k">' + fmt(Number(m.pct), 1) + '<small>%</small></span></button>';
          var s = ME.SITES.filter(function (x) { return x.id === m.site; })[0];
          return '<button type="button" class="item food" data-a="measureedit" data-v="' + esc(m.id) + '"><span><span class="t">' + (s ? s.label : esc(m.site)) + '</span><span class="s">' + esc(day(m.date, true)) + '</span></span><span class="k">' + fmt(ME.cmToUnits(Number(m.cm), units()), 1) + '<small>' + u + '</small></span></button>';
        }).join('') + '</div>' +
        (merged.length > 5 ? '<button type="button" class="link" data-a="measureall">' + (S.progressAllMeasures ? 'Show fewer' : 'Show all ' + merged.length) + '</button>' : '') + '</details></section>';
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

    /* ---------- key lifts from PR Forge (MEA-5) ---------- */
    function picks() { return ((S.rows.profile && S.rows.profile.preferences) || {}).keyLifts || []; }
    function liftsCard(from, today) {
      var pf = S.pf || {}, u = ME.weightUnit(units()), data = pf.data, on = pf.status === 'on';
      var head = '<div class="row"><h2 style="margin:0">Key lifts</h2>' + (data ? '<button type="button" class="btn sm" data-a="liftspick">Choose lifts</button>' : '') + '</div>';
      if (!data) {
        return '<section class="card">' + head +
          '<p class="small muted">Strength is the sign the scale can\'t give: lifts holding or rising means you\'re keeping or building muscle. Leanward can read your lifts from PR Forge. It only reads; it never changes anything there.</p>' +
          (pf.error ? '<p class="small warn">' + esc(pf.error) + '</p>' : '') +
          (pf.status === 'checking' || pf.busy ? '<p class="small muted">' + (pf.busy ? 'Reading your PR Forge workouts…' : 'Checking the PR Forge connection…') + '</p>'
            : on ? '<button type="button" class="btn ghost block" data-a="pfrefresh">Read my PR Forge workouts</button>'
            : '<button type="button" class="btn ghost block" data-a="pfconnect">Connect PR Forge</button><p class="small muted">You\'ll sign in to PR Forge with Google once. Use the same Google account you use there.</p>') + '</section>';
      }
      var lifts = PF.series(data.exercises, picks(), units());
      var body = !lifts.length
        ? '<p class="small muted">' + (data.exercises.length ? 'Pick up to ' + PF.MAX_LIFTS + ' lifts to follow, such as your main squat, press and pull.' : 'No finished PR Forge workouts with weighted sets yet.') + '</p>'
        : lifts.map(function (l) {
          if (l.missing || !l.points.length) return '<div class="sig"><b style="font-size:13.5px">' + esc(l.name) + '</b><p>No sets found in PR Forge for this lift.</p></div>';
          var inRange = l.points.filter(function (p) { return p.date >= from && p.date <= today; }), last = l.points[l.points.length - 1];
          var change = inRange.length >= 2 ? inRange[inRange.length - 1].v - inRange[0].v : null;
          var said = l.name + ' estimated one-rep max, ' + rangeLabel() + '. ' + inRange.length + ' session' + (inRange.length === 1 ? '' : 's') + '. Latest ' + fmt(last.v) + ' ' + u + ' on ' + last.date + (change != null ? '. Change over this range ' + fmtS(change) + ' ' + u : '') + '.';
          return '<div class="lift"><div class="row"><b style="font-size:14px">' + esc(l.name) + '</b><span class="small muted">' + (change != null ? fmtS(change) + ' ' + u + ' over the ' + esc(rangeLabel()) : '') + '</span></div>' +
            '<div><b style="font-size:22px">' + fmt(last.v) + '</b> <span class="small muted">' + u + ' est. 1RM · best set ' + fmt(last.weight, last.weight % 1 ? 1 : 0) + ' × ' + last.reps + ' on ' + esc(day(last.date)) + '</span></div>' +
            (inRange.length ? chart({ from: from, to: today, dots: inRange, line: inRange, summary: said }) : '<p class="small muted">No sessions in this range.</p>') + '</div>';
        }).join('');
      return '<section class="card">' + head + body +
        (pf.error ? '<p class="small warn">' + esc(pf.error) + '</p>' : '') +
        '<p class="small muted">From PR Forge, read-only' + (data.at ? ' · updated ' + esc(new Date(data.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : '') + '. Estimated 1RM = weight × (1 + reps ÷ 30), from each day\'s best set of 12 reps or fewer.</p>' +
        '<div class="row" style="justify-content:flex-start;gap:16px">' +
          (on ? '<button type="button" class="link" data-a="pfrefresh">' + (pf.busy ? 'Updating…' : 'Update now') + '</button><button type="button" class="link" data-a="pfdisconnect">Disconnect PR Forge</button>'
            : '<button type="button" class="link" data-a="pfconnect">Reconnect PR Forge</button>') + '</div></section>';
    }
    function liftsSheet() {
      var sh = S.sheet, list = ((S.pf && S.pf.data && S.pf.data.exercises) || []);
      var chosen = sh.picks.map(function (p) { return p.id; });
      return wrap('Choose key lifts', '<div class="row"><h2>Key lifts</h2><span class="small muted">' + sh.picks.length + ' of ' + PF.MAX_LIFTS + '</span></div>' +
        '<p class="small muted">Pick the lifts that best show your strength, up to ' + PF.MAX_LIFTS + '. These are the exercises you\'ve logged in PR Forge with weight, most often first.</p>' +
        '<div class="list">' + list.map(function (e) {
          var on = chosen.indexOf(e.id) >= 0, last = e.sessions[e.sessions.length - 1];
          return '<button type="button" class="item food" data-a="lifttoggle" data-v="' + esc(e.id) + '" aria-pressed="' + on + '"><span><span class="t">' + esc(e.name) + '</span><span class="s">' + e.sessions.length + ' session' + (e.sessions.length === 1 ? '' : 's') + ' · last ' + esc(day(last.date)) + '</span></span><span class="badge' + (on ? ' verified' : '') + '">' + (on ? '✓ Following' : 'Add') + '</span></button>';
        }).join('') + '</div><button type="button" class="btn block" data-a="liftssave">Save</button>');
    }

    /* ---------- the tab (approved design): sub-tabs, Overview first ---------- */
    var SUBTABS = [['overview', 'Overview', 'grid'], ['weight', 'Weight', 'trend'], ['strength', 'Strength', 'dumbbell'], ['nutrition', 'Nutrition', 'fork'], ['body', 'Body Comp', 'person']];
    function sub() { return S.progressTab || 'overview'; }
    function rangeSeg() {
      return '<div class="rangeseg" role="group" aria-label="Time range">' + [['7d', '7D'], ['30d', '30D'], ['90d', '90D'], ['all', 'ALL']].map(function (r) {
        return '<button type="button" data-a="prange" data-v="' + r[0] + '" aria-pressed="' + (range() === r[0]) + '">' + r[1] + '</button>'; }).join('') + '</div>';
    }
    function view() {
      var UI = root.LW.ui, today = ctx.today(), first = (S.rows.weights || []).filter(function (w) { return !w.deleted; }).map(function (w) { return w.date; }).sort()[0];
      var from = ME.rangeStart(range(), today, first), c = ctx.coach ? ctx.coach() : null, t = sub();
      var head = UI.brandbar(UI.iconBtn('more', 'progmenu', 'More for Progress')) +
        '<div class="ttlrow"><div><h1>Progress</h1><span class="sub">' + esc(c ? c.week : 'No phase yet') + '</span></div></div>' +
        '<div class="subnav" role="tablist" aria-label="Progress sections">' + SUBTABS.map(function (x) {
          return '<button type="button" role="tab" data-a="ptab" data-v="' + x[0] + '" aria-pressed="' + (t === x[0]) + '" aria-selected="' + (t === x[0]) + '">' + UI.icon(x[2]) + x[1] + '</button>'; }).join('') + '</div>';
      if (t === 'weight') return head + '<div class="row" style="justify-content:flex-end">' + rangeSeg() + '</div>' + weightCard(from, today);
      if (t === 'strength') return head + '<div class="row" style="justify-content:flex-end">' + rangeSeg() + '</div>' + liftsCard(from, today);
      if (t === 'nutrition') return head + '<div class="row" style="justify-content:flex-end">' + rangeSeg() + '</div>' + intakeCard(from, today);
      if (t === 'body') return head + '<div class="row" style="justify-content:flex-end">' + rangeSeg() + '</div>' + measureCard(from, today);
      return head + summaryCard(c, today) + overviewChart(from, today) + intelProgress(c) +
        '<div class="pairs">' + bodyCompCard() + trainingCard() + '</div>' + nutritionCard(c, today);
    }
    /** Current weight (the trend) and the phase's target pace. */
    function summaryCard(c, today) {
      var u = ME.weightUnit(units()), start = c ? c.phase.start_date : core.addDays(today, -27);
      var v = ME.weightView(S.rows.weights, units(), start, today);
      if (!v.latest) return '<section class="card sumcard"><div><span class="lab">Current weight</span><div class="big">—</div><span class="small muted">No weigh-ins yet</span></div><span class="vr"></span>' + phaseBlock(c, null) + '</section>';
      var since = v.latest.trend - v.trend[0].v, good = c && ((c.phase.type === 'cut' && since < 0) || (c.phase.type === 'bulk' && since > 0));
      return '<section class="card sumcard"><div><span class="lab">Current weight</span><div class="big">' + fmt(v.latest.trend, 1) + '<small>' + u + '</small></div>' +
        '<span class="small' + (good ? ' good' : ' muted') + '">' + (Math.abs(since) < 0.05 ? 'No change' : (since < 0 ? '↓ ' : '↑ ') + fmt(Math.abs(since), 1) + ' ' + u) + '</span> <span class="small muted">since start</span></div>' +
        '<span class="vr"></span>' + phaseBlock(c, v.latest.trend) + '</section>';
    }
    function phaseBlock(c, trendNow) {
      if (!c) return '<div><span class="lab">Phase target</span><div class="small muted">Set up a phase</div></div>';
      var u = ME.weightUnit(units()), pace = c.plannedPct && trendNow ? c.plannedPct / 100 * trendNow : null;
      var line = pace ? '≈ ' + fmtS(pace, 1) + ' ' + u + ' / week' : c.phase.type === 'recomp' ? 'About flat; waist down' : c.phase.type === 'maintenance' ? 'Hold steady' : 'Eat well, weight steady';
      return '<button type="button" data-a="tab" data-v="phase" aria-label="Phase target: ' + esc(c.phaseName + ', ' + line) + '. Open Plan."><span class="lab">Phase target</span><span class="phase">' + esc(c.phaseName) + '</span><span class="small muted">' + esc(line) + '</span></button>';
    }
    function overviewChart(from, today) {
      var UI = root.LW.ui, v = ME.weightView(S.rows.weights, units(), from, today);
      var body = v.latest ? chart({ from: from, to: today, dots: v.dots, line: v.trend, dp: 1, summary: ME.weightSummary(v, units(), rangeLabel()) }) + legend([['k-dot', 'Weigh-in'], ['k-trend', 'Trend (smoothed)']])
        : '<p class="small muted">No weigh-ins yet. Weigh in most mornings; the trend line smooths out water and food.</p><button type="button" class="btn sm" data-a="weigh">Log weight</button>';
      return '<section class="card"><div class="cardhead"><h2>' + UI.icon('trend') + '<span>Weight Trend<span class="sub">' + (v.rate ? fmtS(v.rate.perWeek, 2) + ' ' + ME.weightUnit(units()) + '/week · last 14 days' : 'Building baseline') + '</span></span></h2>' + rangeSeg() + '</div>' + body + '</section>';
    }
    /** Leanward Intelligence on Progress: the read in one line, and the state of each kind of data. */
    function intelProgress(c) {
      var UI = root.LW.ui;
      if (!c) return '';
      var step = c.step, r = c.read, w = r ? r.signals.filter(function (x) { return x.id === 'weight'; })[0] : null, q = c.q, td = ctx.training ? ctx.training() : null;
      var title = c.state === 'Collecting data' ? 'Building your baseline' : step ? step.title : (r ? r.summary : 'Building your baseline');
      var text = step ? step.why[0] : 'Leanward is collecting data to judge your rate of progress, training and nutrition.';
      var SIG = { 'on-track': 'On track', watch: 'Watch', 'off-track': 'Needs a look', collecting: 'Collecting data' };
      var wTxt = w ? SIG[w.status] || 'Collecting data' : 'Collecting data', wShare = w && w.status !== 'collecting' ? 1 : Math.min(1, (q.weighIns14 || 0) / 8);
      var tTxt = td ? td.week + ' of ' + (td.weekAim || '—') + ' this week' : 'Connect PR Forge', tShare = td && td.weekAim ? td.week / td.weekAim : 0;
      var nShare = (q.loggedDays14 || 0) / 14;
      var foot = '<div>' + UI.icon('scale') + '<span><b>Weight</b>' + wTxt + UI.bar(wShare) + '</span></div>' +
        '<div' + (td ? '' : ' role="button" tabindex="0" data-a="ptab" data-v="strength"') + '>' + UI.icon('dumbbell') + '<span><b>Training</b>' + tTxt + UI.bar(tShare) + '</span></div>' +
        '<div>' + UI.icon('fork') + '<span><b>Nutrition</b>' + Math.round(nShare * 100) + '% logged' + UI.bar(nShare) + '</span></div>';
      var more = ctx.readCard ? '<details data-keep="fullread"' + (S.open_fullread ? ' open' : '') + '><summary>The full read and how it\'s judged</summary>' + ctx.readCard() + '</details>' : '';
      return UI.intel({ state: esc(c.state), title: esc(title), text: esc(text), foot: foot, extra: more });
    }
    /** Body composition: only what was actually measured. Lean mass only with a body-fat entry (never estimated from weight). */
    function bodyCompCard() {
      var UI = root.LW.ui, lu = ME.lengthUnit(units()), wu = ME.weightUnit(units());
      var waist = (S.rows.measures || []).filter(function (m) { return !m.deleted && m.site === 'waist'; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
      var bf = (S.rows.bodyfat || []).filter(function (x) { return !x.deleted; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
      var v = ME.weightView(S.rows.weights, units(), core.addDays(ctx.today(), -27), ctx.today());
      var lean = bf && v.latest ? v.latest.trend * (1 - Number(bf.pct) / 100) : null;
      var row = function (ic, label, val, a, said) {
        return '<div class="kv">' + UI.icon(ic) + '<span class="kvl">' + label + '<span class="val' + (val == null ? ' na' : '') + '">' + (val == null ? '—' : val) + '</span></span>' +
          '<button type="button" class="addpill" data-a="' + a + '" aria-label="' + said + '">' + (val == null ? 'Add' : 'Update') + '</button></div>';
      };
      return '<section class="card minicard"><div class="cardhead"><h2>' + UI.icon('person') + 'Body Composition</h2><button type="button" class="chev" data-a="ptab" data-v="body" aria-label="Open body composition">' + UI.icon('chevron') + '</button></div>' +
        row('tape', 'Waist', waist ? fmt(ME.cmToUnits ? ME.cmToUnits(Number(waist.cm), units()) : (units() === 'metric' ? Number(waist.cm) : Number(waist.cm) / 2.54), 1) + ' ' + lu : null, 'measure', 'Add a waist measurement') +
        row('percent', 'Body fat', bf ? fmt(Number(bf.pct), 1) + '%' : null, 'bfadd', 'Add a body-fat measurement') +
        row('lean', 'Lean Mass', lean != null ? fmt(lean, 1) + ' ' + wu : null, 'bfadd', 'Lean mass needs a body-fat measurement: add one') +
        (bf ? '<p class="small muted" style="margin:0">Lean mass uses your ' + esc(day(bf.date)) + ' body-fat entry; it\'s an estimate.</p>' : '') + '</section>';
    }
    function trainingCard() {
      var UI = root.LW.ui, td = ctx.training ? ctx.training() : null;
      var head = '<div class="cardhead"><h2>' + UI.icon('dumbbell') + 'Training &amp; Strength</h2><button type="button" class="chev" data-a="ptab" data-v="strength" aria-label="Open strength">' + UI.icon('chevron') + '</button></div>';
      if (!td) return '<section class="card minicard">' + head + '<p class="small muted" style="margin:0">Connect PR Forge to see your sessions and key lifts here.</p><button type="button" class="btn sm" data-a="ptab" data-v="strength">Connect</button></section>';
      var aim = td.weekAim, consist = aim ? Math.min(100, Math.round(td.sessions28 / (aim * 4) * 100)) : null;
      return '<section class="card minicard">' + head +
        '<div class="ringstat"><div class="ring">' + UI.ring(aim ? td.week / aim : 0, 64, 6, 'ring-t') + '<div class="ringtxt">' + td.week + '/' + (aim || '—') + '</div></div>' +
        '<span class="small"><b>Sessions</b><br><span class="muted">this week' + (aim ? ', of ' + aim + ' usual' : '') + '</span></span></div>' +
        (consist != null ? '<span class="small muted">' + consist + '% consistency, last 4 weeks</span>' : '') +
        '<button type="button" class="linkrow2" data-a="ptab" data-v="strength"><span>' + UI.icon('trend') + 'Key Lifts</span>' + UI.icon('chevron') + '</button></section>';
    }
    function nutritionCard(c, today) {
      var UI = root.LW.ui, from = core.addDays(today, -13), v = ME.intakeView(S.rows.diary, from, today, targetOn);
      var logged = c ? c.q.loggedDays14 || 0 : v.logged, share = logged / 14;
      var row = function (label, avg, target, unit) {
        var p = target ? Math.round(avg / target * 100) : null;
        return '<div class="nutrow"><div class="top"><span>' + label + '</span><span class="v"><b>' + (avg == null ? '—' : fmt(avg)) + '</b><small>' + (target ? ' / ' + fmt(target) + ' ' + unit : ' ' + unit) + '</small></span></div>' +
          UI.bar(p ? p / 100 : 0) + '<span class="pct">' + (p != null ? p + '%' : '') + '</span></div>';
      };
      return '<section class="card"><div class="cardhead"><h2>' + UI.icon('fork') + '<span>Nutrition<span class="sub">Average of logged days, last 14 days</span></span></h2><button type="button" class="chev" data-a="ptab" data-v="nutrition" aria-label="Open nutrition">' + UI.icon('chevron') + '</button></div>' +
        '<div class="nutgrid"><div>' + row('Calories', v.avgKcal, v.avgKcalTarget, 'kcal') + row('Protein', v.avgProtein, v.avgProteinTarget, 'g') + '</div>' +
        '<div class="consist"><span class="ctext">' + UI.icon('calendar') + '<b>Logging consistency</b><span class="muted">' + logged + ' of 14 days</span></span>' +
        '<div class="ringstat"><div class="ring">' + UI.ring(share, 64, 6, 'ring-n') + '<div class="ringtxt">' + Math.round(share * 100) + '%</div></div></div></div></div></section>';
    }

    /** Today: the weight-trend and training cards (approved design). */
    function minis() {
      var UI = root.LW.ui, today = ctx.today(), u = ME.weightUnit(units()), c = ctx.coach ? ctx.coach() : null;
      var start = c ? c.phase.start_date : core.addDays(today, -27), from28 = core.addDays(today, -27);
      var v = ME.weightView(S.rows.weights, units(), start > from28 ? start : from28, today), vs = ME.weightView(S.rows.weights, units(), start, today);
      var wCard;
      if (!v.latest) {
        wCard = '<button type="button" class="mini" data-a="weigh"><span class="mhead">' + UI.icon('scale') + 'Weight Trend</span><span class="big">—</span><span class="sub">Log your first weigh-in</span></button>';
      } else {
        var since = vs.latest.trend - vs.trend[0].v, good = c && ((c.phase.type === 'cut' && since < 0) || (c.phase.type === 'bulk' && since > 0));
        var pts = v.trend, lo = Math.min.apply(null, pts.map(function (p) { return p.v; })), hi = Math.max.apply(null, pts.map(function (p) { return p.v; })), span = hi - lo || 1;
        var xy = pts.map(function (p, i) { return [(4 + i / Math.max(1, pts.length - 1) * 92).toFixed(1), (26 - (p.v - lo) / span * 20).toFixed(1)]; });
        var path = xy.map(function (q, i) { return (i ? 'L' : 'M') + q[0] + ' ' + q[1]; }).join(' '), end = xy[xy.length - 1];
        wCard = '<button type="button" class="mini" data-a="ptab" data-v="weight" aria-label="Weight trend ' + fmt(v.latest.trend, 1) + ' ' + u + ', ' + (since < 0 ? 'down ' : 'up ') + fmt(Math.abs(since), 1) + ' since the phase started. Open weight.">' +
          '<span class="mhead">' + UI.icon('scale') + 'Weight Trend' + UI.icon('chevron') + '</span><span class="big">' + fmt(v.latest.trend, 1) + '<small>' + u + '</small></span>' +
          '<span class="sub' + (good ? ' good' : '') + '">' + (Math.abs(since) < 0.05 ? 'No change' : (since < 0 ? '↓ ' : '↑ ') + fmt(Math.abs(since), 1) + ' ' + u) + ' since start</span>' +
          (pts.length > 1 ? '<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="' + path + '" vector-effect="non-scaling-stroke"/><circle cx="' + end[0] + '" cy="' + end[1] + '" r="2.6"/></svg>' : '') + '</button>';
      }
      var td = ctx.training ? ctx.training() : null, tCard;
      if (!td) tCard = '<button type="button" class="mini" data-a="ptab" data-v="strength"><span class="mhead">' + UI.icon('dumbbell') + 'Training' + UI.icon('chevron') + '</span><span class="big">—</span><span class="sub">Connect PR Forge to see sessions</span></button>';
      else {
        var aim = Math.min(7, td.weekAim || 0), boxes = '';
        for (var i = 0; i < Math.max(aim, td.week); i++) boxes += '<i class="' + (i < td.week ? 'on' : '') + '"></i>';
        tCard = '<button type="button" class="mini" data-a="ptab" data-v="strength" aria-label="Training: ' + td.week + ' of ' + (aim || 'no usual number of') + ' sessions this week. Open strength.">' +
          '<span class="mhead">' + UI.icon('dumbbell') + 'Training' + UI.icon('chevron') + '</span><span class="big">' + td.week + (aim ? '<small>/ ' + aim + ' sessions</small>' : '<small>sessions</small>') + '</span>' +
          '<span class="sub">This week · PR Forge</span>' + (boxes ? '<span class="sess">' + boxes + '</span>' : '') + '</button>';
      }
      return '<div class="minis">' + wCard + tCard + '</div>';
    }

    /** Today: a small weight tile with the trend; tap to log (or shows that today is done). */
    function weightTile() {
      var today = ctx.today(), u = ME.weightUnit(units()), v = ME.weightView(S.rows.weights, units(), core.addDays(today, -27), today);
      var weighed = (S.rows.weights || []).some(function (w) { return !w.deleted && w.date === today; });
      return '<button type="button" class="card tile cardbtn" data-a="weigh" aria-label="Weight' + (v.latest ? ', trend ' + fmt(v.latest.trend, 1) + ' ' + u : '') + '. Log a weigh-in.">' +
        '<span class="small muted">Weight' + (v.latest ? ' trend' : '') + '</span><b>' + (v.latest ? fmt(v.latest.trend, 1) + ' ' + u : 'No weigh-ins') + '</b>' +
        '<span class="small muted">' + (v.rate ? fmtS(v.rate.perWeek, 2) + ' ' + u + ' a week' : v.latest ? 'last ' + esc(day(v.latest.date)) : 'Weigh in most mornings') + '</span>' +
        '<span class="pill ' + (weighed ? 'dot ok' : '') + '">' + (weighed ? 'Weighed in' : 'Log weight') + '</span></button>';
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
        '<button type="button" class="btn block" data-a="weighsave">Save</button>' + (sh.id ? '<p class="center"><button type="button" class="link quietdanger" data-a="weighdelete">Delete this weigh-in</button></p>' : ''));
    }
    function methodLabel(id) { var m = ME.BF_METHODS.filter(function (x) { return x[0] === id; })[0]; return m ? m[1] : id; }
    function measureSheet() {
      var sh = S.sheet, u = ME.lengthUnit(units()), site = ME.SITES.filter(function (s) { return s.id === sh.site; })[0] || ME.SITES[0];
      var chips = '<div class="chips2">' + ME.SITES.map(function (s) { return '<button type="button" data-a="measuresite" data-v="' + s.id + '" aria-pressed="' + (sh.site === s.id) + '">' + s.label + '</button>'; }).join('') +
        '<button type="button" data-a="measuresite" data-v="bodyfat" aria-pressed="' + (sh.site === 'bodyfat') + '">Body fat %</button></div>';
      if (sh.site === 'bodyfat') {
        return wrap(sh.id ? 'Edit body fat' : 'Add body fat', '<h2>' + (sh.id ? 'Edit body fat' : 'Add a measurement') + '</h2>' + (sh.id ? '' : chips) +
          '<p class="small muted">Body-fat numbers are estimates. Smart scales and calipers can be several points off, so watch the direction over weeks, measured the same way, more than any single reading.</p>' +
          '<div class="grid2"><div class="field"><label for="ms-v">Body fat <span class="muted">%</span></label><input type="number" id="ms-v" inputmode="decimal" step="any" data-m="value" value="' + (sh.value == null ? '' : esc(String(sh.value))) + '"></div>' +
          '<div class="field"><label for="ms-d">Day</label><input type="date" id="ms-d" data-m="date" value="' + esc(sh.date) + '" max="' + ctx.today() + '"></div></div>' +
          '<div class="field"><label for="ms-m">How it was measured</label><select id="ms-m" data-m="method">' + ME.BF_METHODS.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === (sh.method || 'scale') ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select></div>' +
          '<button type="button" class="btn block" data-a="bfsave">Save</button>' + (sh.id ? '<p class="center"><button type="button" class="link quietdanger" data-a="bfdelete">Delete this entry</button></p>' : ''));
      }
      return wrap(sh.id ? 'Edit measurement' : 'Add a measurement', '<h2>' + (sh.id ? 'Edit measurement' : 'Add a measurement') + '</h2>' +
        (sh.id ? '' : chips) +
        '<p class="small muted"><b>How to measure:</b> ' + esc(site.how) + '</p>' +
        '<div class="grid2"><div class="field"><label for="ms-v">' + site.label + ' <span class="muted">' + u + '</span></label><input type="number" id="ms-v" inputmode="decimal" step="any" data-m="value" value="' + (sh.value == null ? '' : esc(String(sh.value))) + '"></div>' +
        '<div class="field"><label for="ms-d">Day</label><input type="date" id="ms-d" data-m="date" value="' + esc(sh.date) + '" max="' + ctx.today() + '"></div></div>' +
        '<button type="button" class="btn block" data-a="measuresave">Save</button>' + (sh.id ? '<p class="center"><button type="button" class="link quietdanger" data-a="measuredelete">Delete this measurement</button></p>' : ''));
    }
    function progMenuSheet() {
      var b = function (a, label, v, primary) { return '<button type="button" class="btn ' + (primary ? '' : 'ghost ') + 'block" data-a="' + a + '"' + (v != null ? ' data-v="' + v + '"' : '') + '>' + label + '</button>'; };
      return '<div class="scrim" data-a="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="More for Progress"><div class="grab"></div><h2>Progress</h2>' +
        b('weigh', 'Log weight', null, true) + b('measure', 'Add a measurement') + b('bfadd', 'Add body fat %') +
        (ctx.training && ctx.training() ? b('liftspick', 'Choose key lifts') + b('pfrefresh', 'Update from PR Forge') : b('ptab', 'Connect PR Forge', 'strength')) + '</div>';
    }
    function sheetView() { var k = S.sheet && S.sheet.kind; if (k === 'progmenu') return progMenuSheet(); return k === 'weigh' ? weighSheet() : k === 'measure' ? measureSheet() : k === 'lifts' ? liftsSheet() : null; }
    function focus(id) { root.setTimeout(function () { var i = root.document.getElementById(id); if (i) i.focus(); }, 50); }

    function onInput(el) {
      var sh = S.sheet;
      if (!sh || (sh.kind !== 'weigh' && sh.kind !== 'measure') || !el.dataset.m) return false;
      sh[el.dataset.m] = el.value;
      return true;
    }

    var actions = {
      prange: function (v) { S.progressRange = v; ctx.render(); },
      ptab: function (v) { if (S.sheet) S.sheet = false; S.progressTab = v; S.tab = 'progress'; ctx.render(); root.scrollTo(0, 0); },
      bfadd: function () { S.sheet = { kind: 'measure', site: 'bodyfat', value: null, date: ctx.today(), method: 'scale' }; ctx.render(); focus('ms-v'); },
      progmenu: function () { S.sheet = { kind: 'progmenu' }; ctx.render(); },
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
      pfconnect: function () { ctx.pf.connect(); },
      pfrefresh: function () { if (S.sheet && S.sheet.kind === 'progmenu') S.sheet = false; ctx.pf.refresh(true); },
      pfdisconnect: function () { ctx.pf.disconnect(); },
      liftspick: function () { S.sheet = { kind: 'lifts', picks: picks().slice() }; ctx.render(); },
      lifttoggle: function (id) {
        var ex = ((S.pf && S.pf.data && S.pf.data.exercises) || []).filter(function (e) { return e.id === id; })[0];
        if (!ex) return;
        try { S.sheet.picks = PF.toggle(S.sheet.picks, ex); } catch (e) { ctx.toast(e.message); return; }
        var box = root.document.querySelector('.sheet'), y = box ? box.scrollTop : 0;
        ctx.render();
        box = root.document.querySelector('.sheet'); if (box) box.scrollTop = y;
      },
      liftssave: function () {
        var p = S.rows.profile;
        if (!p) return;
        var prefs = Object.assign({}, p.preferences || {}, { keyLifts: S.sheet.picks.slice(0, PF.MAX_LIFTS) });
        ctx.save([['lw_profiles', Object.assign({}, p, { preferences: prefs })]]).then(function () { S.sheet = false; ctx.toast('Key lifts saved'); ctx.render(); });
      },
      bfedit: function (id) {
        var x = (S.rows.bodyfat || []).filter(function (r) { return r.id === id; })[0];
        if (!x) return;
        S.sheet = { kind: 'measure', site: 'bodyfat', id: id, value: Number(x.pct), date: x.date, method: x.method }; ctx.render();
      },
      bfsave: function () {
        var sh = S.sheet, row, old = sh.id && (S.rows.bodyfat || []).filter(function (x) { return x.id === sh.id; })[0];
        try { row = ME.bodyFatRow({ id: sh.id, value: sh.value, method: sh.method || 'scale', date: sh.date, today: ctx.today() }); } catch (e) { ctx.toast(e.message); return; }
        if (old) row = Object.assign({}, old, row);
        ctx.save([['lw_body_fat', row]]).then(function () { S.sheet = false; ctx.toast(old ? 'Saved' : 'Body fat added'); ctx.render(); }, function (e) { ctx.toast('Couldn\'t save: ' + (e && e.message)); });
      },
      bfdelete: function () { var id = S.sheet.id; ctx.remove('lw_body_fat', id).then(function () { S.sheet = false; ctx.toast('Deleted'); ctx.render(); }); },
      measuredelete: function () { var id = S.sheet.id; ctx.remove('lw_measurements', id).then(function () { S.sheet = false; ctx.toast('Deleted'); ctx.render(); }); }
    };

    return { view: view, weightTile: weightTile, minis: minis, sheetView: sheetView, onInput: onInput, actions: actions };
  }

  root.LW.progressui = { create: create };
})(this);
