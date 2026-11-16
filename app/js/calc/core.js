/* Leanward calculation engine — shared constants, units, rounding, dates and number formatting.
 *
 * Every module in js/calc is pure: no DOM, no network, no storage, no clock (dates are passed in).
 * All calculations work in metric (kg, cm, kcal); convert at the edges with the helpers here.
 * Loaded as a plain script in the browser (window.LW.calc.core) and with require() in Node tests.
 */
(function (root) {
  'use strict';

  /** Stored on every phase and target set (PRD §11) so old targets can be explained later. */
  var CALC_VERSION = '1.0.0';

  // Exact by definition (international yard and pound agreement, 1959).
  var KG_PER_LB = 0.45359237;
  var LB_PER_KG = 1 / KG_PER_LB;
  var CM_PER_IN = 2.54;
  var IN_PER_FT = 12;
  var ML_PER_US_FL_OZ = 29.5735295625;

  /* ---------- rounding ----------
   * Policy: calories to the nearest 10 kcal for targets, 1 kcal for BMR and maintenance;
   * grams to the nearest 1 g; body weight to 0.1 (kg or lb); height to 1 cm or 1 in;
   * percentages to 0.01 internally and 0.1 or 0.01 on screen.
   * Halves round away from zero, so the same number always rounds the same way. */
  function round(x, step) {
    step = step || 1;
    var q = Math.abs(x) / step;
    // A tiny nudge so values like 2.675 (stored as 2.67499…) still round up.
    var r = Math.floor(q + 0.5 + 1e-9) * step;
    r = x < 0 ? -r : r;
    // Clean float noise (e.g. 0.30000000000000004) based on the step's decimals.
    var d = decimals(step);
    return Number(r.toFixed(d));
  }
  function ceilTo(x, step) { return Number((Math.ceil(x / step - 1e-9) * step).toFixed(decimals(step))); }
  function decimals(step) { var s = String(step); var i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }

  /* ---------- units ---------- */
  function lbToKg(lb) { return lb * KG_PER_LB; }
  function kgToLb(kg) { return kg * LB_PER_KG; }
  function inToCm(inches) { return inches * CM_PER_IN; }
  function cmToIn(cm) { return cm / CM_PER_IN; }
  function ftInToCm(ft, inches) { return inToCm(ft * IN_PER_FT + (inches || 0)); }
  /** 175 cm → { ft: 5, in: 9 } (inches rounded to whole, carried into feet at 12). */
  function cmToFtIn(cm) {
    var total = round(cmToIn(cm));
    return { ft: Math.floor(total / IN_PER_FT), in: total % IN_PER_FT };
  }
  function flOzToMl(oz) { return oz * ML_PER_US_FL_OZ; }

  /* ---------- body ---------- */
  function bmi(kg, cm) { var m = cm / 100; return kg / (m * m); }
  /** Weight (kg) that gives a BMI for a height. */
  function weightAtBmi(targetBmi, cm) { var m = cm / 100; return targetBmi * m * m; }

  /* ---------- dates (ISO 'YYYY-MM-DD', calendar days, no time zones) ---------- */
  function parseDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    if (!m) throw new Error('Expected a date like 2026-11-03, got ' + iso);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  function formatDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(iso, n) { return formatDate(parseDate(iso) + n * 86400000); }
  function daysBetween(fromIso, toIso) { return Math.round((parseDate(toIso) - parseDate(fromIso)) / 86400000); }
  /** Whole years from date of birth to a given day (birthday counts on the day itself). */
  function ageOn(dobIso, onIso) {
    var b = new Date(parseDate(dobIso)), d = new Date(parseDate(onIso));
    var age = d.getUTCFullYear() - b.getUTCFullYear();
    if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--;
    return age;
  }

  /* ---------- formatting for explanations ---------- */
  /** 2759.5 → "2,760"; fmt(80.25, 1) → "80.3". */
  function fmt(x, dp) {
    var v = round(x, dp ? Math.pow(10, -dp) : 1);
    var parts = Math.abs(v).toFixed(dp || 0).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '−' : '') + parts.join('.');
  }
  /** Signed: +440 / −440. */
  function fmtSigned(x, dp) { return (x > 0 ? '+' : x < 0 ? '' : '±') + fmt(x, dp); }

  var SEXES = ['male', 'female', 'unspecified'];
  function checkSex(sex) { if (SEXES.indexOf(sex) < 0) throw new Error('sex must be male, female or unspecified'); return sex; }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** '2026-10-07' → 'Oct 7, 2026' (or 'Oct 7' when the year is the same as `thisYear`). The space before the day doesn't break. */
  function niceDate(iso, thisYear) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    var txt = MONTHS[+m[2] - 1] + '\u00a0' + (+m[3]);
    return thisYear != null && String(thisYear) === m[1] ? txt : txt + ', ' + m[1];
  }
  function checkPositive(name, x) { if (!(typeof x === 'number' && isFinite(x) && x > 0)) throw new Error(name + ' must be a positive number'); return x; }

  var api = {
    CALC_VERSION: CALC_VERSION, KG_PER_LB: KG_PER_LB, LB_PER_KG: LB_PER_KG, CM_PER_IN: CM_PER_IN, ML_PER_US_FL_OZ: ML_PER_US_FL_OZ,
    round: round, ceilTo: ceilTo,
    lbToKg: lbToKg, kgToLb: kgToLb, inToCm: inToCm, cmToIn: cmToIn, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, flOzToMl: flOzToMl,
    bmi: bmi, weightAtBmi: weightAtBmi,
    parseDate: parseDate, formatDate: formatDate, addDays: addDays, daysBetween: daysBetween, ageOn: ageOn,
    fmt: fmt, fmtSigned: fmtSigned, niceDate: niceDate, SEXES: SEXES, checkSex: checkSex, checkPositive: checkPositive
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LW = root.LW || {}; root.LW.calc = root.LW.calc || {}; root.LW.calc.core = api; }
})(this);
