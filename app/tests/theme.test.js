/* ACC-6: palettes, color following the phase, and safe defaults (js/theme.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/theme.js');

test('five palettes, each with a distinct color per phase (Mono is one calm color)', () => {
  assert.deepEqual(T.PALETTES.map((p) => p.id), ['aurora', 'ocean', 'sunset', 'moss', 'mono']);
  const phases = ['cut', 'recomp', 'bulk', 'maintenance', 'nutrition'];
  T.PALETTES.forEach((p) => {
    assert.deepEqual(Object.keys(p.c), phases, p.id);
    const firsts = new Set(phases.map((ph) => p.c[ph][0]));
    assert.equal(firsts.size, p.id === 'mono' ? 1 : 5, p.id);
  });
});

test('the color follows the phase, or stays on the palette\'s signature color', () => {
  assert.deepEqual(T.colors({ palette: 'aurora', follow: true }, 'cut'), ['#5fa8e8', '#7fe0f0']);
  assert.deepEqual(T.colors({ palette: 'aurora', follow: false }, 'cut'), ['#8a7cf8', '#e37bb3']);   // Aurora's signature is recomp
  assert.deepEqual(T.colors({ palette: 'ocean', follow: false }, 'bulk'), ['#3e7bfa', '#53c7f0']);
  assert.deepEqual(T.colors({ palette: 'nope' }, 'unknown-phase'), ['#8a7cf8', '#e37bb3']);          // defaults
  assert.deepEqual(T.normalize({ palette: 'moss', follow: 0, mode: 'sepia' }), { palette: 'moss', follow: false, mode: 'match' });
  assert.deepEqual(T.normalize(null), { palette: 'aurora', follow: true, mode: 'match' });
  assert.equal(T.rgb('#8a7cf8'), '138, 124, 248');
});

test('button text (dark ink) stays readable on every palette color: at least 4.5:1', () => {
  const INK = '#10121c';
  T.PALETTES.forEach((p) => Object.keys(p.c).forEach((ph) => p.c[ph].forEach((hex) => {
    const r = T.contrast(INK, hex);
    assert.ok(r >= 4.5, `${p.id} ${ph} ${hex}: ${r.toFixed(2)}`);
  })));
});

test('entitlement switch (S4): everything is free today, and a feature can be made premium later', () => {
  const C = require('../js/config.js');
  assert.equal(C.can('export'), true); assert.equal(C.can('anything'), true);
  C.PREMIUM_FEATURES.push('labs');
  assert.equal(C.can('labs'), false); assert.equal(C.can('export'), true);
  C.PREMIUM_FEATURES.length = 0;
});
