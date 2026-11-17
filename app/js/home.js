/* Leanward — Home's daily insight (HOM-4) and the data export (ACC-2). Pure: no storage or DOM.
 *
 * Insight: at most one card a day, and only from this small set (PRD HOM-4). Rules (PRD §8.10):
 *   1. protein running low: from 6 pm, with food logged, protein under 60% of the day's target;
 *   2. fiber low: from 6 pm, fiber under 50% of target, when fiber is known for at least half the
 *      day's calories (so missing data isn't mistaken for low fiber);
 *   3. no weigh-in for 7 days (or none yet, from day 3 of using the app): a gentle nudge.
 * The first that applies is shown. The wording is plain and never judges.
 *
 * Export: everything the person has saved, as one JSON file and as one CSV per table. Deleted rows
 * and the phone's bookkeeping fields are left out.
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;
  var core = node ? require('./calc/core.js') : root.LW.calc.core;
  var fmt = core.fmt;

  var EVENING_MIN = 18 * 60, PROTEIN_LOW = 0.6, FIBER_LOW = 0.5, NO_WEIGH_DAYS = 7, AWAY_DAYS = 5;

  /**
   * i: { minutes (since midnight), today, totals (diary.totals), target ({ protein_g, fiber_g } or null),
   *      lastWeighDate (or null), firstUseDate (or null), lastLogDate? (last day with food logged before today) }
   * After 5+ days without logging, a one-off welcome back comes first, until something is logged today.
   * Returns { id, title, text, action: { a, label } } or null.
   */
  function insight(i) {
    var t = i.totals, tg = i.target;
    if (i.lastLogDate && (!t || !t.entries) && core.daysBetween(i.lastLogDate, i.today) >= AWAY_DAYS) {
      return { id: 'welcome-back', title: 'Welcome back',
        text: 'Pick up from today; there\'s nothing to catch up on. Days you didn\'t log simply don\'t count toward your averages.', action: { a: 'addto', label: 'Log food' } };
    }
    if (tg && t && t.entries > 0 && i.minutes >= EVENING_MIN) {
      if (tg.protein_g > 0 && t.protein_g < tg.protein_g * PROTEIN_LOW) {
        // Counted toward the adequate amount (1.6 g/kg) when it's known, the same line the ✓ uses (audit D5).
        var aim = i.adequateProtein > 0 && i.adequateProtein < tg.protein_g ? i.adequateProtein : tg.protein_g;
        var left = Math.round(aim - t.protein_g);
        return { id: 'protein-low', title: 'Protein is running low today',
          text: fmt(t.protein_g) + ' g so far. About ' + fmt(left) + ' g more reaches ' + (aim < tg.protein_g ? 'an adequate ' + fmt(aim) + ' g' : 'your ' + fmt(aim) + ' g target') + ': a serving of chicken, fish, Greek yogurt or a shake covers 20 to 40 g.',
          action: { a: 'addto', label: 'Log food' } };
      }
      var fiber = (t.nutrients && t.nutrients.fiber) || 0, cov = t.coverage && t.coverage.fiber != null ? t.coverage.fiber : 0;
      if (tg.fiber_g > 0 && cov >= 0.5 && fiber < tg.fiber_g * FIBER_LOW) {
        return { id: 'fiber-low', title: 'Fiber is low so far today',
          text: fmt(fiber) + ' of ' + fmt(tg.fiber_g) + ' g. Beans, lentils, berries, oats or vegetables with dinner would close most of the gap.',
          action: { a: 'addto', label: 'Log food' } };
      }
    }
    var since = i.lastWeighDate ? core.daysBetween(i.lastWeighDate, i.today) : null;
    if (since != null && since >= NO_WEIGH_DAYS) {
      return { id: 'no-weigh-in', title: 'No weigh-in for ' + since + ' days',
        text: 'A weigh-in or two this week keeps your trend and the progress read up to date. Any morning works.', action: { a: 'weigh', label: 'Log weight' } };
    }
    if (since == null && i.firstUseDate && core.daysBetween(i.firstUseDate, i.today) >= 2) {
      return { id: 'no-weigh-in', title: 'Add your first weigh-in',
        text: 'Weighing in most mornings lets Leanward draw your trend and tell you whether the phase is working.', action: { a: 'weigh', label: 'Log weight' } };
    }
    return null;
  }

  /* ---------- export (ACC-2) ---------- */
  var SKIP = ['rev', 'dirty', 'user_id', 'deleted'];
  function clean(row) { var o = {}; Object.keys(row).forEach(function (k) { if (SKIP.indexOf(k) < 0) o[k] = row[k]; }); return o; }
  function liveRows(rows) { return (rows || []).filter(function (r) { return r && !r.deleted; }).map(clean); }

  /** tables: { lw_diary_entries: [rows], ... }. Returns the export object (JSON.stringify it to save). */
  function toExport(tables, meta) {
    var out = { app: 'Leanward', version: meta && meta.version, exportedAt: meta && meta.exportedAt, account: meta && meta.email, tables: {} };
    Object.keys(tables).sort().forEach(function (t) { out.tables[t] = liveRows(tables[t]); });
    return out;
  }

  function cell(v) {
    if (v == null) return '';
    var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    // Spreadsheets run cells that start with = + - @ as formulas; a leading apostrophe keeps typed text as text.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = '\'' + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  /** One table as CSV text (RFC 4180): a header of every column that appears, then one line per row. */
  function toCsv(rows) {
    var list = liveRows(rows), cols = [];
    list.forEach(function (r) { Object.keys(r).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); }); });
    return [cols.join(',')].concat(list.map(function (r) { return cols.map(function (c) { return cell(r[c]); }).join(','); })).join('\r\n') + '\r\n';
  }
  /** [{ name: 'leanward-diary_entries.csv', text }] for every table that has rows. */
  function csvFiles(tables) {
    return Object.keys(tables).sort().filter(function (t) { return liveRows(tables[t]).length; })
      .map(function (t) { return { name: 'leanward-' + t.replace(/^lw_/, '') + '.csv', text: toCsv(tables[t]) }; });
  }

  var api = { insight: insight, toExport: toExport, toCsv: toCsv, csvFiles: csvFiles };
  if (node) module.exports = api;
  else { root.LW.home = api; }
})(this);
