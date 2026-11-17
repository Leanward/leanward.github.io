/* Audit fixes, PR A (coaching safety): C1 floor-aware advice, C2 care steps, C3 lifts from several
 * sessions, C4 phase-aware maintenance window and the 100 kcal minimum. Arithmetic in the comments. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/calc/progress.js');
const T = require('../js/calc/trend.js');
const MT = require('../js/maint.js');
const core = require('../js/calc/core.js');

const weight = (actual, planned, status) => ({ id: 'weight', label: 'Weight trend', status, value: actual + '% a week', actual, planned });
const waist = (changeCm, status) => ({ id: 'waist', label: 'Waist', status: status || 'on-track', value: changeCm + ' cm', changeCm });
const step = (type, signals, q) => P.nextStep(type, { signals }, Object.assign({ loggedDays14: 13, weighIns14: 12 }, q));

test('C1: a stalled cut at the safety floor holds; it never suggests eating less', () => {
  // floor 1,780; target 1,800: 1,800 − 100 = 1,700 < 1,780 → at the floor
  const s = step('cut', [weight(-0.1, -0.5, 'off-track'), waist(0.1, 'watch')], { floorKcal: 1780, targetKcal: 1800 });
  assert.equal(s.kind, 'hold'); assert.doesNotMatch(s.why.join(' '), /less a day/);
  assert.match(s.why[0], /target \(1,800 kcal\) is at your safety floor \(1,780 kcal\), so Leanward won't suggest eating less/);
  // 2,000 − 100 = 1,900 ≥ 1,780 → room for a small change
  assert.equal(step('cut', [weight(-0.1, -0.5, 'off-track'), waist(0.1, 'watch')], { floorKcal: 1780, targetKcal: 2000 }).kind, 'eat-less');
  // recomp with weight and waist rising, at the floor → hold too
  assert.equal(step('recomp', [weight(0.6, null, 'off-track'), waist(1.5, 'off-track')], { floorKcal: 1500, targetKcal: 1550 }).kind, 'hold');
});

test('C2: 5 of 7 days logged under the floor → a care step, before anything else', () => {
  const s = step('cut', [weight(-0.5, -0.5, 'on-track')], { floorKcal: 1500, targetKcal: 1900, belowFloorDays7: 5 });
  assert.equal(s.kind, 'care'); assert.match(s.why.join(' '), /5 of the last 7 days were logged under 1,500 kcal.*registered dietitian or your doctor/);
  // it shows even while the weight read is still collecting
  assert.equal(P.nextStep('cut', { signals: [{ id: 'weight', status: 'collecting', value: 'Collecting data: 3 more weigh-ins' }] }, { belowFloorDays7: 6, floorKcal: 1500 }).kind, 'care');
  assert.notEqual(step('cut', [weight(-0.5, -0.5, 'on-track')], { floorKcal: 1500, belowFloorDays7: 4 }).kind, 'care');
});

test('C2: losing more than 1.5% a week over 21 days → a care step (not for a lean bulk)', () => {
  const s = step('cut', [weight(-1.8, -0.5, 'off-track')], { rate21Pct: -1.8 });
  assert.equal(s.kind, 'care'); assert.match(s.why[0], /about 1\.8% of body weight a week over the last 21 days/);
  assert.notEqual(step('cut', [weight(-1.2, -0.5, 'off-track')], { rate21Pct: -1.4 }).kind, 'care');
  assert.notEqual(step('bulk', [weight(0.3, 0.25, 'on-track')], { rate21Pct: -1.6 }).kind, 'care');
});

test('rate over a chosen window: 21 days of a steady 0.1 kg/day loss = 0.7 kg a week', () => {
  const w = []; for (let i = 0; i < 60; i++) w.push({ date: core.addDays('2026-09-01', i), kg: 90 - 0.1 * i });
  const s = T.trendSeries(w, { endDate: '2026-10-30' });
  const r = T.rateOfChange(s, 21);
  assert.ok(Math.abs(r.kgPerWeek + 0.7) < 0.01, String(r.kgPerWeek)); assert.equal(r.fromDate, '2026-10-09');
  assert.equal(T.rateOfChange(s.slice(0, 10), 21), null);
});

test('C3: one bad last session does not read as strength loss; a sustained drop does', () => {
  const w = []; for (let i = 0; i < 20; i++) w.push({ date: core.addDays('2026-09-01', i), kg: 90 - 0.06 * i });
  const read = (e1rms) => P.read({ phase: { type: 'cut', startDate: '2026-09-01', expectedWeeklyPct: -0.5 }, today: '2026-09-20', weights: w, waist: [],
    lifts: { Bench: e1rms.map((v, i) => ({ date: core.addDays('2026-09-02', i * 3), e1rm: v })) } }).signals.find((s) => s.id === 'lift:Bench');
  // 6 sessions, the last one bad (85): best of the first 3 = 100, of the last 3 = 100 → 0%, on track
  assert.equal(read([100, 99, 100, 100, 99, 85]).status, 'on-track');
  // every recent session down: best of the last 3 = 88 → −12%, off track
  assert.equal(read([100, 99, 100, 88, 87, 86]).status, 'off-track');
  // fewer than 4 sessions → still collecting
  assert.equal(read([100, 99, 85]).status, 'collecting');
});

test('C4: the maintenance check skips the first 14 days of a phase; changes under 100 kcal match', () => {
  const end = '2026-11-20', start = core.addDays(end, -20), diary = [], weights = [];
  for (let i = 0; i < 21; i++) { const d = core.addDays(start, i); diary.push({ date: d, kcal: 2500 }); weights.push({ date: d, kg: 80, measured_at: d + 'T07:00:00Z' }); }
  const input = { today: '2026-11-21', diary, weights, targetOn: () => ({ kcal: 2400 }), previousTdee: 2560, recommendations: [], units: 'metric' };
  // flat weight on 2,500 → raw 2,500; blended 0.7 × 2,500 + 0.3 × 2,560 = 2,518 → −42 kcal → matches (under 100)
  assert.equal(MT.check(input).state, 'matches');
  // previous 2,700 → 0.7 × 2,500 + 0.3 × 2,700 = 2,560 → −140 → proposed
  assert.equal(MT.check(Object.assign({}, input, { previousTdee: 2700 })).state, 'proposed');
  // the same data, but the phase began 10 days before the window → skipped, with the date of the first check
  const r = MT.check(Object.assign({}, input, { previousTdee: 2700, phaseStart: core.addDays(start, -10) }));
  assert.deepEqual([r.state, r.newPhase, r.from], ['collecting', true, core.addDays(core.addDays(start, 4), 21)]);
  // a phase that began 14+ days before the window start is fine
  assert.equal(MT.check(Object.assign({}, input, { previousTdee: 2700, phaseStart: core.addDays(start, -14) })).state, 'proposed');
});

test('D4: the waist averages 2 readings at each end; under 1 cm is flat', () => {
  const w = []; for (let i = 0; i < 20; i++) w.push({ date: core.addDays('2026-09-01', i), kg: 80 });
  const read = (cms) => P.read({ phase: { type: 'cut', startDate: '2026-09-01', expectedWeeklyPct: -0.5 }, today: '2026-09-20', weights: w, lifts: {},
    waist: cms.map((cm, i) => ({ date: core.addDays('2026-09-01', i * 5), cm })) }).signals.find((s) => s.id === 'waist');
  // one off reading at the end (89): (90 + 90) / 2 = 90 → (90.2 + 89) / 2 = 89.6 → −0.4 cm → flat (watch on a cut), not "falling"
  const one = read([90, 90, 90.2, 89]);
  assert.ok(Math.abs(one.changeCm + 0.4) < 1e-9, String(one.changeCm)); assert.equal(one.status, 'watch'); assert.match(one.value, /average of 2 readings at each end/);
  // a real drop: (90 + 89.8) / 2 = 89.9 → (88.6 + 88.4) / 2 = 88.5 → −1.4 cm → on track
  assert.equal(read([90, 89.8, 88.6, 88.4]).status, 'on-track');
  // two readings, 0.8 cm apart: under the 1 cm tape noise → flat
  assert.equal(read([90, 89.2]).status, 'watch');
});

test('wording: gentle "log more", and a welcome back after 5+ days away', () => {
  const s = step('cut', [weight(-0.1, -0.5, 'off-track')], { loggedDays14: 7 });
  assert.equal(s.title, 'More complete days will sharpen this');
  assert.match(s.why[0], /^Your logs cover 7 of the last 14 days\. More complete days make this advice more accurate/);
  const H = require('../js/home.js');
  const tg = { kcal: 2000, protein_g: 150, fiber_g: 28 }, none = { entries: 0, protein_g: 0, nutrients: {}, coverage: {} };
  const wb = H.insight({ today: '2026-11-20', minutes: 9 * 60, totals: none, target: tg, lastLogDate: '2026-11-14', lastWeighDate: '2026-11-19' });
  assert.equal(wb.id, 'welcome-back'); assert.match(wb.text, /nothing to catch up on/);
  // 4 days away, or something already logged today → no welcome back
  assert.equal(H.insight({ today: '2026-11-20', minutes: 9 * 60, totals: none, target: tg, lastLogDate: '2026-11-16', lastWeighDate: '2026-11-19' }), null);
  assert.equal(H.insight({ today: '2026-11-20', minutes: 9 * 60, totals: { entries: 1, protein_g: 30, nutrients: {}, coverage: {} }, target: tg, lastLogDate: '2026-11-10', lastWeighDate: '2026-11-19' }), null);
});
