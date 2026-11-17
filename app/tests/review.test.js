/* The % daily value bar on the Nutrients sheet (js/review.js meter). */
const test = require('node:test');
const assert = require('node:assert/strict');

test('% daily value bar: fill to the target, green when met, amber when over (NUT-6)', () => {
  const RV = require('../js/review.js');
  assert.equal(RV.meter({ pct: null }), null);                                        // no target, no bar
  assert.deepEqual(RV.meter({ amount: 4.5, target: 9, pct: 50, flags: [] }), { fill: 0.5, mark: null, tone: 'part' });
  assert.deepEqual(RV.meter({ amount: 13.5, target: 9, pct: 150, flags: [] }), { fill: 1, mark: null, tone: 'met' });
  assert.equal(RV.meter({ amount: 3000, target: 1000, pct: 300, flags: ['above-ul'] }).tone, 'over');
  // sodium: the bar ends at the 2,300 mg limit; the 1,500 mg target sits at 1500 / 2300 = 0.652
  const na = RV.meter({ amount: 1150, target: 1500, limit: 2300, pct: 76.7, flags: [] });
  assert.equal(na.fill, 0.5); assert.ok(Math.abs(na.mark - 0.6522) < 1e-3); assert.equal(na.tone, 'part');
  assert.equal(RV.meter({ amount: 1800, target: 1500, limit: 2300, pct: 120, flags: [] }).tone, 'met');
  assert.deepEqual(RV.meter({ amount: 2800, target: 1500, limit: 2300, pct: 187, flags: ['over-limit'] }).fill, 1);
  assert.equal(RV.meter({ amount: 2800, target: 1500, limit: 2300, pct: 187, flags: ['over-limit'] }).tone, 'over');
});
