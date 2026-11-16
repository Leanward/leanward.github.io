/* Leanward — appearance (ACC-6): palette, "change color with my phase", and Dark / Light / Match
 * iPhone. The palettes are the ones agreed in prototype/appearance/. The choice is saved with the
 * profile and mirrored on the phone so the right colors show before the account has loaded.
 *
 * Default: Aurora, color follows the phase, mode Match iPhone. (PRD ACC-6 says Dark; the app has
 * followed the phone's setting since M0, and changing that under people would be a surprise.)
 */
(function (root) {
  'use strict';

  var node = typeof module === 'object' && module.exports;

  // Each palette gives every phase its own pair of colors; `sig` is the one used when color doesn't follow the phase.
  var PALETTES = [
    { id: 'aurora', name: 'Aurora', note: 'Balanced', sig: 'recomp',
      c: { cut: ['#5fa8e8', '#7fe0f0'], recomp: ['#8a7cf8', '#e37bb3'], bulk: ['#f0954a', '#f2c14e'], maintenance: ['#5dbb8a', '#a6d9a0'], nutrition: ['#f07f7f', '#f5a97f'] } },
    { id: 'ocean', name: 'Ocean', note: 'Cool blues and teals', sig: 'cut',
      c: { cut: ['#3e7bfa', '#53c7f0'], recomp: ['#2fb8a8', '#5e8bff'], bulk: ['#27c2b0', '#b8e986'], maintenance: ['#5b8fd0', '#9fc3e8'], nutrition: ['#3ba7c9', '#7fdbda'] } },
    { id: 'sunset', name: 'Sunset', note: 'Warm coral and gold', sig: 'bulk',
      c: { cut: ['#ff7a7a', '#ffb26b'], recomp: ['#e0569b', '#ff9466'], bulk: ['#ff9f1c', '#ffd166'], maintenance: ['#e8a87c', '#f3d9a4'], nutrition: ['#f25f5c', '#f7b267'] } },
    { id: 'moss', name: 'Moss', note: 'Greens and earth', sig: 'maintenance',
      c: { cut: ['#4c9a8c', '#9bd3ae'], recomp: ['#7a9a52', '#c9d86b'], bulk: ['#c08d3e', '#e8c468'], maintenance: ['#5e9c66', '#a9c5a0'], nutrition: ['#8faa5b', '#d7e3a0'] } },
    { id: 'mono', name: 'Mono', note: 'No color, calmest', sig: 'recomp',
      c: { cut: ['#c9cdd8', '#8e94a8'], recomp: ['#c9cdd8', '#8e94a8'], bulk: ['#c9cdd8', '#8e94a8'], maintenance: ['#c9cdd8', '#8e94a8'], nutrition: ['#c9cdd8', '#8e94a8'] } }
  ];
  var MODES = [['match', 'Match iPhone'], ['dark', 'Dark'], ['light', 'Light']];
  // Text size (§9, accessibility): the whole app scales, so nothing is cut off at the larger sizes.
  var TEXT = [['default', 'Default', 1], ['large', 'Large', 1.12], ['larger', 'Larger', 1.25]];
  var DEFAULT = { palette: 'aurora', follow: true, mode: 'match', text: 'default' };

  /** A saved choice made safe: unknown values fall back to the defaults. */
  function normalize(a) {
    a = a || {};
    return {
      palette: PALETTES.some(function (p) { return p.id === a.palette; }) ? a.palette : DEFAULT.palette,
      follow: a.follow == null ? DEFAULT.follow : !!a.follow,
      mode: MODES.some(function (m) { return m[0] === a.mode; }) ? a.mode : DEFAULT.mode,
      text: TEXT.some(function (t) { return t[0] === a.text; }) ? a.text : DEFAULT.text
    };
  }
  /** The two colors for a choice and the current phase type ('cut', 'recomp', 'bulk', 'maintenance', 'nutrition'). */
  function colors(choice, phaseType) {
    var a = normalize(choice), pal = PALETTES.filter(function (p) { return p.id === a.palette; })[0];
    return pal.c[a.follow && pal.c[phaseType] ? phaseType : pal.sig];
  }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255); }
  /** WCAG contrast ratio between two hex colors (for the test: button text on the palette colors). */
  function contrast(h1, h2) {
    var lum = function (hex) { return hex.slice(1).match(/../g).map(function (x) { var v = parseInt(x, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); };
    var a = lum(h1), b = lum(h2);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function textScale(choice) { var a = normalize(choice); return TEXT.filter(function (t) { return t[0] === a.text; })[0][2]; }

  var api = { PALETTES: PALETTES, MODES: MODES, TEXT: TEXT, textScale: textScale, DEFAULT: DEFAULT, normalize: normalize, colors: colors, rgb: rgb, contrast: contrast };
  if (node) { module.exports = api; return; }

  /* ---------- browser ---------- */
  var KEY = root.LW.config.STORAGE_PREFIX + 'appearance';
  /** The last choice made on this phone, with the phase type it was shown for. */
  function saved() {
    var s = {};
    try { s = JSON.parse(root.localStorage.getItem(KEY) || 'null') || {}; } catch (e) { s = {}; }
    var n = normalize(s); n.phase = s.phase || null;
    return n;
  }
  /** Applies a choice to the page and remembers it on this phone. phaseType may be null before the account loads. */
  function apply(choice, phaseType) {
    var a = normalize(choice), el = root.document.documentElement, phase = phaseType || saved().phase, pair = colors(a, phase);
    if (a.mode === 'match') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', a.mode);
    var scale = textScale(a);
    el.style.zoom = scale === 1 ? '' : String(scale);
    el.style.setProperty('--g1-rgb', rgb(pair[0])); el.style.setProperty('--g2-rgb', rgb(pair[1]));
    var dark = a.mode === 'dark' || (a.mode === 'match' && !(root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches));
    var meta = root.document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', dark ? '#0b0c12' : '#f5f6fa');
    try { root.localStorage.setItem(KEY, JSON.stringify(Object.assign({}, a, { phase: phase || null }))); } catch (e) { /* storage blocked */ }
  }
  // First paint: the last choice made on this phone.
  apply(saved(), saved().phase);

  api.apply = apply; api.saved = saved;
  root.LW.theme = api;
})(this);
