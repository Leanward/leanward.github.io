/* Leanward — shared visual pieces for the approved design (docs/design/handoff, v0.22): line icons,
 * the brand header, the phase pill, the progress ring and the "Leanward Intelligence" card shell.
 * Markup only: every number shown comes from the screens that call these. */
(function (root) {
  'use strict';

  // 24 × 24 line icons, drawn with the current color (stroke 1.8, round joins).
  var P = {
    calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    more: '<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12l7-7M16 5h3v3"/>',
    protein: '<path d="M7 19c-1.6-2.4-1.4-5.6.6-7.4 1-1 2-1.3 2.7-2.4.7-1.2.3-2.7 1.4-3.6 1.3-1 3.4-.4 4 1.1.5 1.3-.3 2.6-1.4 3.2 1.7.4 3.2 1.8 3.4 3.7.2 2.8-2.1 5.4-5.4 5.4H7z"/>',
    carbs: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M8 9c0-2 1.5-3 4-3s4 1 4 3"/>',
    fat: '<path d="M12 3c3 4 6 7.2 6 10.5A6 6 0 0 1 6 13.5C6 10.2 9 7 12 3z"/>',
    fiber: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l8-8"/>',
    scale: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9.5a4 4 0 0 1 6 0M12 10.5l1-1.5"/>',
    dumbbell: '<path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    trend: '<path d="M4 16l5-5 3 3 7-7"/><path d="M15 7h4v4"/>',
    clipboard: '<rect x="5" y="5" width="14" height="16" rx="3"/><path d="M9 4h6v3H9zM9 13l2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    scan: '<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 8v8M11 8v8M14 8v8M17 8v8"/>',
    meal: '<path d="M6 14h12M7 14a5 5 0 0 1 10 0M12 7v2"/><path d="M5 17h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    fork: '<path d="M8 3v8M6 3v5a2 2 0 0 0 4 0V3M8 11v10M16 21V3c-2 1-3 3.5-3 7h3"/>',
    person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5"/>',
    percent: '<path d="M18 6L6 18"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    tape: '<path d="M4 9c0-2 3.6-3.5 8-3.5s8 1.5 8 3.5v6c0 2-3.6 3.5-8 3.5S4 17 4 15z"/><path d="M4 9c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5M8 12v2M12 12.5v2.5M16 12v2"/>',
    lean: '<circle cx="13" cy="4.5" r="2"/><path d="M8 21l3-6-2-3 4-4 3 3 3 1M11 15l3 2 1 4"/>',
    bars: '<path d="M6 18v-3M10 18v-6M14 18v-9M18 18V6"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
    breakfast: '<path d="M4 17h16M7 17a5 5 0 0 1 10 0M12 6v3M5.6 9.6l1.8 1.8M18.4 9.6l-1.8 1.8"/>',
    lunch: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M9 8l1-3M13 8l1-3"/>',
    dinner: '<path d="M8 3v8M6 3v5a2 2 0 0 0 4 0V3M8 11v10M16 21V3c-2 1-3 3.5-3 7h3"/>',
    snacks: '<path d="M12 8c-3-2-7-.5-7 4.5S8 21 12 19c4 2 7-1.5 7-6.5S15 6 12 8z"/><path d="M12 8c0-2 1-3.5 3-4"/>',
    beverages: '<path d="M6 7h12l-1.5 13h-9zM6 11h12M10 3l1 4"/>',
    supplements: '<rect x="4" y="9" width="16" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M10 10l4 5"/>',
    plan: '<path d="M5 20V5m0 1h11l-2.5 3.5L16 13H5"/>'
  };
  function icon(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }

  /** The brand row: mark + wordmark on the left, actions (already-built buttons) on the right. */
  function brandbar(actions) {
    return '<div class="brandbar"><span class="wordmark"><svg viewBox="0 0 30 20" aria-hidden="true"><path d="M7 1h7L8 19H1z" fill="var(--g1)"/><path d="M19 1h7l-6 18h-7z" fill="var(--g2)"/></svg>Leanward</span>' +
      '<span class="brandacts">' + (actions || '') + '</span></div>';
  }
  /** A round icon button that does something (data-a). */
  function iconBtn(name, a, label, v) {
    return '<button type="button" class="roundbtn" data-a="' + a + '"' + (v != null ? ' data-v="' + v + '"' : '') + ' aria-label="' + label + '">' + icon(name) + '</button>';
  }
  /** "Cut · Week 4 of 12" for a phase and its dayOf() result. */
  function weekLabel(name, d) {
    var w = Math.ceil(d.day / 7), of = d.total ? Math.ceil(d.total / 7) : null;
    return name + ' · Week ' + w + (of ? ' of ' + of : '');
  }
  /** A ring: share 0–1 of a circle, in the coral gradient. */
  function ring(share, size, stroke, id) {
    var r = (size - stroke) / 2, c = 2 * Math.PI * r, s = Math.max(0, Math.min(1, share || 0));
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--g1)"/><stop offset="1" style="stop-color:var(--g2)"/></linearGradient></defs>' +
      '<circle class="rt" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '"/>' +
      '<circle class="rp" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '" stroke="url(#' + id + ')" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - s)).toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }
  /** A thin progress bar; share 0–1. */
  function bar(share, cls) { return '<span class="pbar' + (cls ? ' ' + cls : '') + '"><i style="width:' + (Math.max(0, Math.min(1, share || 0)) * 100).toFixed(1) + '%"></i></span>'; }
  /** The Intelligence card frame: data state (plain words, never a made-up percentage), title, text, and a footer row. */
  function intel(o) {
    return '<section class="card intel"' + (o.a ? ' data-a="' + o.a + '" role="button" tabindex="0"' : '') + '><div class="intelhead"><span class="inteltitle">' + icon('sparkle') + 'Leanward Intelligence<span class="beta">Beta</span></span>' +
      '<span class="intelstate">' + icon('bars') + o.state + '</span></div>' +
      '<h3>' + o.title + '</h3>' + (o.text ? '<p>' + o.text + '</p>' : '') + (o.foot ? '<div class="intelfoot">' + o.foot + '</div>' : '') + (o.extra || '') + '</section>';
  }

  var api = { icon: icon, brandbar: brandbar, iconBtn: iconBtn, weekLabel: weekLabel, ring: ring, bar: bar, intel: intel };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.LW = root.LW || {};
  root.LW.ui = api;
})(this);
