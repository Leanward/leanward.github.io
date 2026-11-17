/* Leanward calculation engine — weight trend (PRD §8.5).
 *
 * Trend weight: an exponentially weighted moving average of daily weights with α = 0.1
 * (The Hacker's Diet). Each day uses its first weigh-in. Days without a weigh-in carry the trend
 * forward unchanged; nothing is interpolated.
 * Weekly average: the mean of that calendar week's daily weights.
 * Rate of change: the least-squares slope of the trend over the last 14 days (15 daily points).
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var core = node ? require('./core.js') : root.LW.calc.core;
  var fmt = core.fmt;

  var ALPHA = 0.1;
  var RATE_DAYS = 14;

  /**
   * One weight per day: the first weigh-in of each day.
   * entries: [{ date: 'YYYY-MM-DD', kg, at?: sortable time like '07:10' or an ISO timestamp }]
   * Entries without `at` keep their order within the day.
   */
  function dailyWeights(entries) {
    var byDay = {};
    entries.forEach(function (e, i) {
      core.parseDate(e.date); core.checkPositive('weight', e.kg);
      var cur = byDay[e.date], key = e.at == null ? '' : String(e.at);
      // Keep the earliest by time when both have one; otherwise the one that came first.
      if (!cur || (key && cur.key && key < cur.key)) byDay[e.date] = { kg: e.kg, key: key, i: i };
    });
    return Object.keys(byDay).sort().map(function (d) { return { date: d, kg: byDay[d].kg }; });
  }

  /**
   * The trend for every day from the first weigh-in to `endDate` (default: the last weigh-in).
   * Returns [{ date, kg (null if no weigh-in that day), trendKg }].
   */
  function trendSeries(entries, opts) {
    var days = dailyWeights(entries);
    if (!days.length) return [];
    var end = (opts && opts.endDate) || days[days.length - 1].date;
    var map = {}; days.forEach(function (d) { map[d.date] = d.kg; });
    var out = [], t = null;
    for (var d = days[0].date; d <= end; d = core.addDays(d, 1)) {
      var w = map[d] == null ? null : map[d];
      if (w != null) t = t == null ? w : t + ALPHA * (w - t);
      out.push({ date: d, kg: w, trendKg: t });
    }
    return out;
  }

  /** Monday (1) by default; pass weekStartsOn: 0 for Sunday. */
  function weekStart(iso, weekStartsOn) {
    var dow = new Date(core.parseDate(iso)).getUTCDay();
    var back = (dow - (weekStartsOn == null ? 1 : weekStartsOn) + 7) % 7;
    return core.addDays(iso, -back);
  }

  /** [{ weekStart, avgKg, count }] for each calendar week that has weigh-ins, oldest first. */
  function weeklyAverages(entries, opts) {
    var ws = opts && opts.weekStartsOn, groups = {};
    dailyWeights(entries).forEach(function (d) {
      var k = weekStart(d.date, ws);
      (groups[k] = groups[k] || []).push(d.kg);
    });
    return Object.keys(groups).sort().map(function (k) {
      var g = groups[k], sum = g.reduce(function (a, b) { return a + b; }, 0);
      return { weekStart: k, avgKg: sum / g.length, count: g.length };
    });
  }

  /**
   * Rate of change of the trend over the last 14 days, ending on the series' last day.
   * Returns null when the series covers fewer than 14 days; otherwise { kgPerWeek, pctPerWeek, steps }.
   */
  function rateOfChange(series, days) {
    var span = days || RATE_DAYS;
    if (series.length < span + 1) return null;
    var pts = series.slice(-(span + 1)), n = pts.length;
    var mx = (n - 1) / 2, my = pts.reduce(function (a, p) { return a + p.trendKg; }, 0) / n, sxy = 0, sxx = 0;
    pts.forEach(function (p, i) { sxy += (i - mx) * (p.trendKg - my); sxx += (i - mx) * (i - mx); });
    var perDay = sxy / sxx, perWeek = perDay * 7, latest = pts[n - 1].trendKg;
    var pct = perWeek / latest * 100;
    return {
      kgPerWeek: perWeek, pctPerWeek: pct, fromDate: pts[0].date, toDate: pts[n - 1].date,
      steps: ['Rate: the trend\'s slope over the last ' + span + ' days (' + pts[0].date + ' to ' + pts[n - 1].date + ') is ' + core.fmtSigned(perWeek, 2) + ' kg a week, ' + core.fmtSigned(pct, 2) + '% of your trend weight (' + fmt(latest, 1) + ' kg)']
    };
  }

  var api = { ALPHA: ALPHA, RATE_DAYS: RATE_DAYS, dailyWeights: dailyWeights, trendSeries: trendSeries, weekStart: weekStart, weeklyAverages: weeklyAverages, rateOfChange: rateOfChange };
  if (node) module.exports = api;
  else { root.LW.calc.trend = api; }
})(this);
