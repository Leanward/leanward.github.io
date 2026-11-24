/* "What should I do next week?" (js/calc/progress.js nextStep) — the review's pattern table. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/calc/progress.js');

const weight = (actual, planned, status) => ({ id: 'weight', label: 'Weight trend', status, value: actual + '% a week', actual, planned });
const waist = (changeCm, status) => ({ id: 'waist', label: 'Waist', status: status || 'on-track', value: changeCm + ' cm', changeCm });
const lift = (pct, status) => ({ id: 'lift:Bench press', label: 'Bench press', status, value: 'Estimated 1RM ' + pct + '%', changePct: pct });
const step = (type, signals, q) => P.nextStep(type, { signals }, Object.assign({ loggedDays14: 13 }, q));

test('cut: weight and waist down, strength stable → keep going, no reason to cut further', () => {
  const s = step('cut', [weight(-0.5, -0.5, 'on-track'), waist(-1.2), lift(-1, 'on-track')]);
  assert.equal(s.kind, 'keep');
  assert.match(s.why.join(' '), /productive cut.*Strength is holding, so there's no reason to cut calories further/);
});

test('cut: losing fast and strength falling → recovery first, not a bigger deficit', () => {
  const s = step('cut', [weight(-1.2, -0.5, 'off-track'), waist(-1.5), lift(-12, 'off-track')]);
  assert.equal(s.kind, 'recovery');
  assert.match(s.why.join(' '), /faster than planned.*Bench press is down more than expected/); assert.match(s.evidence.join(' '), /Waist: -1.5 cm/);
});

test('cut: a hand-set target explains the fast pace (the 1,900 kcal case)', () => {
  const s = step('cut', [weight(-1.0, -0.5, 'watch')], { targetWeeklyPct: -0.98, manualTarget: true });
  assert.equal(s.kind, 'eat-more');
  assert.match(s.why.join(' '), /set by you\) works out to about 1\.0% a week.*planned 0\.5%.*Go back to calculated/);
});

test('cut: slow scale but waist falling → hold (possible recomp effect)', () => {
  assert.equal(step('cut', [weight(-0.1, -0.5, 'off-track'), waist(-1.0)]).kind, 'keep');
});

test('cut: slow scale, waist flat → tracking first at 10–11 of 14 days; a small change only with 12+', () => {
  const s = step('cut', [weight(-0.1, -0.5, 'off-track'), waist(0.1, 'watch')], { loggedDays14: 11 });
  assert.equal(s.kind, 'maintenance-check'); assert.match(s.title, /Don't cut calories yet/);
  const t = step('cut', [weight(-0.1, -0.5, 'off-track'), waist(0.1, 'watch')], { loggedDays14: 13 });
  assert.equal(t.kind, 'eat-less'); assert.match(t.why[0], /100–150 kcal less a day, or accept the maintenance check's suggestion if it offers one \(not both\)/);
});

test('step sizes: 100–150 routinely; 200–250 only when off track with 12+ days logged', () => {
  assert.match(step('cut', [weight(-0.8, -0.5, 'watch')]).why[0], /100–150 kcal more/);
  assert.match(step('cut', [weight(-1.2, -0.5, 'off-track')], { loggedDays14: 13 }).why[0], /200–250 kcal more/);
  assert.match(step('cut', [weight(-1.2, -0.5, 'off-track')], { loggedDays14: 11 }).why[0], /100–150 kcal more/);
  assert.match(step('bulk', [weight(0.7, 0.25, 'off-track')], { loggedDays14: 14 }).why[0], /200–250 kcal less/);
});

test('8+ weigh-ins in 14 days before any change', () => {
  const s = step('cut', [weight(-0.1, -0.5, 'off-track')], { weighIns14: 5 });
  assert.equal(s.kind, 'weigh-more'); assert.match(s.why[0], /^5 weigh-ins in the last 14 days/);
  assert.equal(step('cut', [weight(-0.5, -0.5, 'on-track')], { weighIns14: 8 }).kind, 'keep');
});

test('the waist supports but never changes calories on its own (lean bulk)', () => {
  const s = step('bulk', [weight(0.25, 0.25, 'on-track'), waist(2.5, 'off-track')]);
  assert.equal(s.kind, 'hold'); assert.match(s.title, /re-measure your waist/);
});

test('thin data comes first: too few logged days or weigh-ins → no change', () => {
  assert.equal(step('cut', [weight(-0.1, -0.5, 'off-track')], { loggedDays14: 6 }).kind, 'log-more');
  assert.equal(step('cut', [{ id: 'weight', label: 'Weight trend', status: 'collecting', value: 'Collecting data: 3 more weigh-ins' }]).kind, 'wait');
  assert.equal(P.nextStep('nutrition', { signals: [] }, {}), null);
});

test('recomp: weight flat, waist down → the recomp pattern; weight and waist up → trim', () => {
  const k = step('recomp', [weight(0.05, null, 'on-track'), waist(-1.0), lift(3, 'on-track')]);
  assert.equal(k.kind, 'keep'); assert.match(k.why.join(' '), /recomp pattern/);
  assert.equal(step('recomp', [weight(0.6, null, 'off-track'), waist(1.5, 'off-track')]).kind, 'eat-less');
});

test('bulk: gaining with strength rising → keep; too fast → eat less; too slow → eat more', () => {
  assert.equal(step('bulk', [weight(0.25, 0.25, 'on-track'), waist(0.3), lift(4, 'on-track')]).kind, 'keep');
  assert.equal(step('bulk', [weight(0.7, 0.25, 'off-track')]).kind, 'eat-less');
  assert.equal(step('bulk', [weight(0.05, 0.25, 'off-track')]).kind, 'eat-more');
});

test('maintenance: drifting → the maintenance check; stable → nothing changes', () => {
  assert.equal(step('maintenance', [{ id: 'weight', label: 'Weight trend', status: 'watch', value: '+2.1 lb', changePct: 2 }]).kind, 'maintenance-check');
  assert.equal(step('maintenance', [{ id: 'weight', label: 'Weight trend', status: 'on-track', value: '+0.3 lb', changePct: 0.2 }]).kind, 'keep');
});

test('maintenance check: confidence from logging and weigh-ins; caution when far below the old number', () => {
  const A = require('../js/calc/adaptive.js'), core = require('../js/calc/core.js');
  const end = '2026-11-21', start = core.addDays(end, -20);
  const mk = (loggedEvery, weighEvery) => {
    const intake = [], weights = [];
    for (let i = 0; i < 21; i++) {
      const d = core.addDays(start, i);
      if (i % loggedEvery === 0 || loggedEvery === 1) intake.push({ date: d, kcal: 2400, complete: true });
      if (weighEvery.includes(i % 7)) weights.push({ date: d, kg: 80 });
    }
    return { intake, weights };
  };
  // Flat weight on 2,400 kcal: maintenance ≈ 2,400. Every day logged, 7 weigh-ins a week → high.
  let r = A.estimate(Object.assign({ endDate: end, previousTdee: 2600 }, mk(1, [0, 1, 2, 3, 4, 5, 6])));
  assert.deepEqual([r.confidence, r.loggedDays, r.minWeighInsPerWeek, r.cautions.length], ['high', 21, 7, 0]);
  // 18 days, 4 weigh-ins a week: enough for a check, but moderate
  const thin = mk(1, [0, 2, 4, 6]); thin.intake = thin.intake.slice(0, 18);
  r = A.estimate(Object.assign({ endDate: end, previousTdee: 2600 }, thin));
  assert.deepEqual([r.confidence, r.loggedDays, r.minWeighInsPerWeek], ['moderate', 18, 4]);
  assert.deepEqual(r.confidenceWhy, ['a week with 4 weigh-ins (5+ for high)']);
  // The review's bar for high: 18 days and 5 weigh-ins a week are enough
  const ok = mk(1, [0, 1, 2, 4, 5]); ok.intake = ok.intake.slice(0, 18);
  assert.equal(A.estimate(Object.assign({ endDate: end, previousTdee: 2600 }, ok)).confidence, 'high');
  // 21 days logged but erratic: 11 days of 1,200 and 10 of 3,600 → mean 2,343, SD 1,199, CV 51% → not high, says why
  const odd = mk(1, [0, 1, 2, 3, 4, 5, 6]); odd.intake = odd.intake.map((d, i) => Object.assign({}, d, { kcal: i % 2 ? 3600 : 1200 }));
  r = A.estimate(Object.assign({ endDate: end, previousTdee: 2400 }, odd));
  assert.equal(r.confidence, 'moderate'); assert.match(r.confidenceWhy.join(), /varies a lot \(by 51%\)/);
  // Steady logging but weigh-ins swinging ±1.5 kg around the trend (water) → not high
  const wet = mk(1, [0, 1, 2, 3, 4, 5, 6]); wet.weights = wet.weights.map((w, i) => Object.assign({}, w, { kg: 80 + (i % 2 ? 1.5 : -1.5) }));
  r = A.estimate(Object.assign({ endDate: end, previousTdee: 2600 }, wet));
  assert.equal(r.confidence, 'moderate'); assert.match(r.confidenceWhy.join(), /swing a lot around the trend/);
  // Previous 3,200: 2,400 is 25% lower → caution about unlogged food (and the change is still capped at 150)
  r = A.estimate(Object.assign({ endDate: end, previousTdee: 3200 }, mk(1, [0, 1, 2, 3, 4, 5, 6])));
  assert.equal(r.cautions.length, 1); assert.match(r.cautions[0], /wasn't logged/); assert.equal(r.tdee, 3050);
});

test('first read (weeks 1–3): progress toward 14 days and 8 weigh-ins, with the earliest date', () => {
  const P = require('../js/calc/progress.js');
  let f = P.firstRead({ days: 9, weighIns: 5, today: '2026-11-24' });
  assert.deepEqual(f, { days: 9, daysOf: 14, weighIns: 5, weighInsOf: 8, date: '2026-11-29' });   // 5 more days is the longer wait
  f = P.firstRead({ days: 13, weighIns: 2, today: '2026-11-24' });
  assert.equal(f.date, '2026-11-30');                                                              // 6 more weigh-ins
  assert.equal(P.firstRead({ days: 20, weighIns: 12, today: '2026-11-24' }), null);                // enough: the read takes over
  assert.equal(P.firstRead({ days: 20, weighIns: 7, today: '2026-11-24' }).days, 14);
});
