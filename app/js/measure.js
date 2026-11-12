/* Leanward — measurements and chart data (M6a; PRD MEA-1/2/3/6, PRG-1). Pure: no storage or DOM.
 *
 * Weigh-ins (lw_weights) and circumferences (lw_measurements) are stored in kg and cm; people type
 * them in their own units. The trend itself is calc/trend.js (§8.5); this file turns rows into
 * what the Progress tab draws: points in display units, a date range, a scale and a spoken summary.
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var core = node ? require('./calc/core.js') : root.LW.calc.core;
  var trend = node ? require('./calc/trend.js') : root.LW.calc.trend;
  var fmt = core.fmt, fmtS = core.fmtSigned;

  var SITES = [
    { id: 'waist', label: 'Waist', how: 'Stand relaxed, breathe out normally. Wrap the tape level around your bare waist at the navel, snug but not digging in. Same spot, same time of day (morning is best).' },
    { id: 'hip', label: 'Hips', how: 'Around the widest part of your buttocks, tape level, feet together.' },
    { id: 'chest', label: 'Chest', how: 'Around the fullest part of the chest, tape level, after a normal breath out.' },
    { id: 'arm', label: 'Arm', how: 'Around the middle of the upper arm, arm relaxed at your side. Always the same arm.' },
    { id: 'thigh', label: 'Thigh', how: 'Around the middle of the thigh, standing, weight on both feet. Always the same leg.' },
    { id: 'neck', label: 'Neck', how: 'Just below the Adam\'s apple, tape level, looking straight ahead.' }
  ];
  var RANGES = [{ id: '4w', label: '4 weeks', days: 28 }, { id: '12w', label: '12 weeks', days: 84 }, { id: '6m', label: '6 months', days: 182 }, { id: 'all', label: 'All', days: null }];

  function newId() { return root.LW && root.LW.model ? root.LW.model.newId() : (node ? require('crypto').randomUUID() : String(Math.random()).slice(2)); }
  function num(v) { return v === '' || v == null ? null : Number(v); }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function weightUnit(units) { return units === 'metric' ? 'kg' : 'lb'; }
  function lengthUnit(units) { return units === 'metric' ? 'cm' : 'in'; }
  function kgToUnits(kg, units) { return units === 'metric' ? kg : core.kgToLb(kg); }
  function cmToUnits(cm, units) { return units === 'metric' ? cm : core.cmToIn(cm); }

  /**
   * A weigh-in row (MEA-1). o: { id?, value (in the user's units), units: 'us' | 'metric', date, time: 'HH:MM', note?, today }
   * measured_at is the local date and time as an ISO instant; `date` stays the user's local day.
   */
  function weightRow(o) {
    var v = num(o.value);
    if (v == null || !(v > 0)) throw new Error('Enter your weight.');
    var kg = o.units === 'metric' ? v : core.lbToKg(v);
    if (kg < 20 || kg > 400) throw new Error('That weight looks off. Check the number (' + weightUnit(o.units) + ').');
    if (!isDate(o.date)) throw new Error('Choose the day.');
    if (o.today && o.date > o.today) throw new Error('That day hasn\'t happened yet.');
    var time = /^\d{2}:\d{2}$/.test(String(o.time || '')) ? o.time : '12:00';
    var at = new Date(o.date + 'T' + time + ':00');
    return { id: o.id || newId(), measured_at: at.toISOString(), date: o.date, kg: core.round(kg, 0.01), source: 'manual', note: String(o.note || '').trim().slice(0, 500) || null };
  }

  /** A circumference row (MEA-3). o: { id?, site, value (user's units), units, date, today } */
  function measurementRow(o) {
    var site = SITES.filter(function (s) { return s.id === o.site; })[0];
    if (!site) throw new Error('Choose what you measured.');
    var v = num(o.value);
    if (v == null || !(v > 0)) throw new Error('Enter the measurement.');
    var cm = o.units === 'metric' ? v : core.inToCm(v);
    if (cm < 10 || cm > 300) throw new Error('That measurement looks off. Check the number (' + lengthUnit(o.units) + ').');
    if (!isDate(o.date)) throw new Error('Choose the day.');
    if (o.today && o.date > o.today) throw new Error('That day hasn\'t happened yet.');
    return { id: o.id || newId(), date: o.date, site: site.id, cm: core.round(cm, 0.1), method: null };
  }

  /** The first day a range shows: `days` back from today, or the first data day for "all". */
  function rangeStart(rangeId, today, firstDate) {
    var r = RANGES.filter(function (x) { return x.id === rangeId; })[0] || RANGES[0];
    if (r.days == null) return firstDate && firstDate < today ? firstDate : core.addDays(today, -27);
    return core.addDays(today, -(r.days - 1));
  }

  function live(rows) { return (rows || []).filter(function (r) { return !r.deleted; }); }
  function forTrend(weights) { return live(weights).map(function (w) { return { date: w.date, kg: Number(w.kg), at: w.measured_at }; }); }

  /**
   * Weight for the chart and the header (MEA-2), in display units.
   * Returns { dots: [{date, v}] (each day's first weigh-in), trend: [{date, v}], latest, rate, weeks, first }.
   * The trend is worked out on all history, then cut to the range, so it doesn't restart at the edge.
   */
  function weightView(weights, units, from, today) {
    var entries = forTrend(weights);
    if (!entries.length) return { dots: [], trend: [], latest: null, rate: null, weeks: [], first: null };
    var series = trend.trendSeries(entries, { endDate: today }).filter(function (d) { return d.date <= today; });
    var inRange = series.filter(function (d) { return d.date >= from; });
    var last = series[series.length - 1], lastWeighed = series.filter(function (d) { return d.kg != null; }).pop();
    var rate = trend.rateOfChange(series);
    return {
      first: series[0].date,
      dots: inRange.filter(function (d) { return d.kg != null; }).map(function (d) { return { date: d.date, v: kgToUnits(d.kg, units) }; }),
      trend: inRange.map(function (d) { return { date: d.date, v: kgToUnits(d.trendKg, units) }; }),
      latest: lastWeighed ? { date: lastWeighed.date, v: kgToUnits(lastWeighed.kg, units), trend: kgToUnits(last.trendKg, units) } : null,
      rate: rate ? { perWeek: kgToUnits(rate.kgPerWeek, units), pct: rate.pctPerWeek } : null,
      weeks: trend.weeklyAverages(entries).slice(-6).reverse().map(function (w) { return { weekStart: w.weekStart, avg: kgToUnits(w.avgKg, units), count: w.count }; })
    };
  }

  /** One site's measurements in the range, in display units, oldest first (one per day: the latest entered). */
  function siteView(measures, site, units, from, today) {
    var byDay = {};
    live(measures).filter(function (m) { return m.site === site && m.date <= today; })
      .sort(function (a, b) { return String(a.created_at || '') < String(b.created_at || '') ? -1 : 1; })
      .forEach(function (m) { byDay[m.date] = Number(m.cm); });
    var all = Object.keys(byDay).sort().map(function (d) { return { date: d, v: cmToUnits(byDay[d], units) }; });
    var pts = all.filter(function (p) { return p.date >= from; });
    return { points: pts, all: all, change: pts.length >= 2 ? pts[pts.length - 1].v - pts[0].v : null };
  }

  /**
   * Calories and protein per logged day in the range (PRG-1), with each day's target.
   * targetOn(date) → { kcal, protein_g } or null. Days with nothing logged are left out, not counted as zero.
   */
  function intakeView(diary, from, today, targetOn) {
    var by = {};
    live(diary).forEach(function (e) {
      if (e.date < from || e.date > today) return;
      var d = by[e.date] = by[e.date] || { kcal: 0, protein: 0 };
      d.kcal += Number(e.kcal) || 0; d.protein += Number(e.protein_g) || 0;
    });
    var days = Object.keys(by).sort().map(function (date) {
      var t = targetOn ? targetOn(date) : null;
      return { date: date, kcal: by[date].kcal, protein: by[date].protein, kcalTarget: t ? Number(t.kcal) : null, proteinTarget: t ? Number(t.protein_g) : null };
    });
    var avg = function (k) { return days.length ? days.reduce(function (a, d) { return a + d[k]; }, 0) / days.length : null; };
    var withT = days.filter(function (d) { return d.kcalTarget != null; });
    var avgT = function (k) { return withT.length ? withT.reduce(function (a, d) { return a + d[k]; }, 0) / withT.length : null; };
    return { days: days, logged: days.length, avgKcal: avg('kcal'), avgProtein: avg('protein'), avgKcalTarget: avgT('kcalTarget'), avgProteinTarget: avgT('proteinTarget') };
  }

  /**
   * The scale for a chart: x by date across [from, to], y padded around the values in `series`
   * (arrays of {date, v}). Returns { x(date), y(v), yTicks: [v, v, v], min, max } for a w × h box
   * with the given padding { l, r, t, b }.
   */
  function scale(series, from, to, box) {
    var vals = [];
    series.forEach(function (s) { (s || []).forEach(function (p) { if (p.v != null && isFinite(p.v)) vals.push(p.v); }); });
    var lo = vals.length ? Math.min.apply(null, vals) : 0, hi = vals.length ? Math.max.apply(null, vals) : 1;
    var span = hi - lo, pad = span > 0 ? span * 0.12 : Math.max(Math.abs(hi) * 0.02, 1);
    lo -= pad; hi += pad;
    var days = Math.max(1, core.daysBetween(from, to));
    var iw = box.w - box.pad.l - box.pad.r, ih = box.h - box.pad.t - box.pad.b;
    return {
      min: lo, max: hi,
      x: function (date) { return box.pad.l + core.daysBetween(from, date) / days * iw; },
      y: function (v) { return box.pad.t + (hi - v) / (hi - lo) * ih; },
      yTicks: [hi - (hi - lo) * 0.1, (hi + lo) / 2, lo + (hi - lo) * 0.1]
    };
  }

  /** What a screen reader says for the weight chart (§9: each chart has a spoken summary). */
  function weightSummary(view, units, rangeLabel) {
    var u = weightUnit(units);
    if (!view.latest) return 'No weigh-ins yet.';
    var s = 'Weight, ' + rangeLabel + '. ' + view.dots.length + ' weigh-in' + (view.dots.length === 1 ? '' : 's') + '. Latest ' + fmt(view.latest.v, 1) + ' ' + u + ' on ' + view.latest.date + '; trend ' + fmt(view.latest.trend, 1) + ' ' + u + '.';
    if (view.trend.length >= 2) s += ' Trend changed ' + fmtS(view.trend[view.trend.length - 1].v - view.trend[0].v, 1) + ' ' + u + ' over this range.';
    if (view.rate) s += ' Last 14 days: ' + fmtS(view.rate.perWeek, 2) + ' ' + u + ' a week.';
    return s;
  }

  var api = { SITES: SITES, RANGES: RANGES, weightUnit: weightUnit, lengthUnit: lengthUnit, kgToUnits: kgToUnits, cmToUnits: cmToUnits,
    weightRow: weightRow, measurementRow: measurementRow, rangeStart: rangeStart, weightView: weightView, siteView: siteView, intakeView: intakeView,
    scale: scale, weightSummary: weightSummary };
  if (node) module.exports = api;
  else { root.LW.measure = api; }
})(this);
