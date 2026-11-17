/* Simulated users (audit testing plan, item 2): the maintenance check and the progress read run on
 * made-up 90-day histories whose true maintenance is known, with realistic noise. Deterministic: a
 * seeded random generator, so a failure always reproduces.
 *
 * Model (kept simple on purpose): true maintenance T is constant; the user eats their target ± 150 kcal;
 * weight moves (intake − T) ÷ 7,700 kg a day; each weigh-in adds water noise (SD σ); some days aren't
 * logged or weighed; an under-reporter logs (1 − u) of what they eat. The estimate then aims at
 * "maintenance as logged", T − u × intake, which is what targets built on the same logs need.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const MT = require('../js/maint.js');
const P = require('../js/calc/progress.js');
const core = require('../js/calc/core.js');

function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

const START = '2026-06-01';
/**
 * One user for `days` days. o: { seed, T, prev (the formula's starting maintenance), deficit, sigma,
 * logP, weighP, under, accept (true = accepts every suggestion), phaseStart?, waterDrop? {day, kg} }
 * Returns { checks: [{ day, state, from, to, estimate }], final (maintenance in use at the end) }.
 */
function simulate(o) {
  const r = rng(o.seed), diary = [], weights = [], recs = [], checks = [];
  let prev = o.prev, kg = 85, target = prev - o.deficit;
  for (let d = 0; d < o.days; d++) {
    const date = core.addDays(START, d);
    // a weekly check in the morning, before today's food
    if (d >= 21 && d % 7 === 0) {
      const c = MT.check({ today: date, diary, weights, targetOn: () => ({ kcal: target }), previousTdee: prev, recommendations: recs, units: 'metric', phaseStart: o.phaseStart || null });
      checks.push({ day: d, state: c.state, from: c.from, to: c.to, estimate: c.estimate });
      if (c.state === 'proposed' && o.accept) {
        recs.push({ type: 'maintenance-update', status: 'accepted', decided_at: date + 'T08:00:00Z', proposed: { from: c.from, to: c.to } });
        prev = c.to; target = prev - o.deficit;
      }
    }
    const ate = target + 150 * gauss(r);
    kg += (ate - o.T) / 7700;
    if (o.waterDrop && d >= o.waterDrop.day && d < o.waterDrop.day + 5) kg -= o.waterDrop.kg / 5;   // glycogen and water after a switch
    if (r() < o.logP) diary.push({ date, kcal: Math.round(ate * (1 - o.under)) });
    if (r() < o.weighP) weights.push({ date, kg: Math.round((kg + o.sigma * gauss(r)) * 10) / 10, measured_at: date + 'T07:00:00Z' });
  }
  return { checks, final: prev };
}
const runs = (n, make) => Array.from({ length: n }, (x, i) => simulate(make(1000 + i)));
const share = (xs, f) => xs.filter(f).length / xs.length;

test('clean logging: the estimate ends within 150 kcal of true maintenance in 90%+ of users', () => {
  // the formula is 300 kcal off either way; daily logging, 6 weigh-ins a week, water noise SD 0.8 kg
  const res = runs(120, (seed) => ({ seed, days: 112, T: 2600, prev: 2600 + (seed % 2 ? 300 : -300), deficit: 500, sigma: 0.8, logP: 0.97, weighP: 0.85, under: 0, accept: true }));
  const ok = share(res, (u) => Math.abs(u.final - 2600) <= 150);
  assert.ok(ok >= 0.9, `within 150 kcal: ${(ok * 100).toFixed(0)}%`);
  // every change is capped at 150 kcal and points toward the truth from where it started
  res.forEach((u) => u.checks.filter((c) => c.state === 'proposed').forEach((c) => assert.ok(Math.abs(c.to - c.from) <= 150, `${c.from} → ${c.to}`)));
});

test('steady under-reporting: the estimate tracks maintenance as logged, so targets stay consistent', () => {
  // logs 20% short; eats about 2,100 → "as logged" maintenance ≈ 2,600 − 0.2 × 2,100 = 2,180
  const res = runs(80, (seed) => ({ seed, days: 112, T: 2600, prev: 2600, deficit: 500, sigma: 0.8, logP: 0.97, weighP: 0.85, under: 0.2, accept: true }));
  const end = res.map((u) => u.final);
  const mean = end.reduce((a, x) => a + x, 0) / end.length;
  assert.ok(mean < 2450 && mean > 2150, `moves down toward 2,180 (capped at 150 a week): mean ${Math.round(mean)}`);
  assert.ok(end.every((x) => x <= 2600 + 50), 'never moves the wrong way');
});

test('thin data: suggestions only when the rules are met, and rare (half the days logged, or 2 weigh-ins a week)', () => {
  const thin = [...runs(60, (seed) => ({ seed, days: 84, T: 2600, prev: 2900, deficit: 500, sigma: 0.8, logP: 0.5, weighP: 0.85, under: 0, accept: false })),
    ...runs(60, (seed) => ({ seed, days: 84, T: 2600, prev: 2900, deficit: 500, sigma: 0.8, logP: 0.97, weighP: 0.28, under: 0, accept: false }))];
  const checks = thin.flatMap((u) => u.checks), proposed = checks.filter((c) => c.state === 'proposed');
  // by chance a thin logger sometimes reaches 17 of 21 days, which is allowed; it must still be rare
  proposed.forEach((c) => assert.ok(c.estimate.loggedDays >= 17 && c.estimate.minWeighInsPerWeek >= 4));
  assert.ok(proposed.length / checks.length < 0.03, `${proposed.length} of ${checks.length} checks`);
});


test('when the formula is already right, false suggestions are rare (under 5% of checks, noisy weigh-ins)', () => {
  const res = runs(100, (seed) => ({ seed, days: 84, T: 2600, prev: 2600, deficit: 500, sigma: 0.8, logP: 0.97, weighP: 0.85, under: 0, accept: false }));
  const all = res.flatMap((u) => u.checks.filter((c) => c.state === 'matches' || c.state === 'proposed'));
  const falseRate = share(all, (c) => c.state === 'proposed');
  // measured: 16% with a 100 kcal minimum, 3% with 150 (the rule now)
  assert.ok(falseRate < 0.05, `false suggestions: ${(falseRate * 100).toFixed(1)}% of ${all.length} checks`);
});

test('noisy weigh-ins (water swings SD 1.5 kg) lower confidence instead of driving big wrong changes', () => {
  const res = runs(60, (seed) => ({ seed, days: 84, T: 2600, prev: 2600, deficit: 500, sigma: 1.5, logP: 0.97, weighP: 0.85, under: 0, accept: false }));
  const ests = res.flatMap((u) => u.checks.map((c) => c.estimate).filter(Boolean));
  assert.ok(share(ests, (e) => e.confidence === 'moderate') >= 0.9, 'mostly moderate confidence');
  // without acceptance nothing compounds; each suggestion is still within the 150 kcal cap
  res.forEach((u) => u.checks.filter((c) => c.state === 'proposed').forEach((c) => assert.ok(Math.abs(c.to - c.from) <= 150)));
});

test('a phase switch with a 1.5 kg water drop: no suggestion from the first 14 days of the phase', () => {
  // new cut on day 28; without the skip the drop would read as about 1.5 × 7,700 ÷ 20 ≈ 580 kcal a day of extra deficit
  const res = runs(60, (seed) => ({ seed, days: 98, T: 2600, prev: 2600, deficit: 500, sigma: 0.8, logP: 0.97, weighP: 0.85, under: 0, accept: false,
    phaseStart: core.addDays(START, 28), waterDrop: { day: 28, kg: 1.5 } }));
  res.forEach((u) => u.checks.filter((c) => c.day < 28 + 14 + 21).forEach((c) => assert.equal(c.state, 'collecting', `day ${c.day}`)));
  // once the window is clear of the drop, estimates sit near the truth
  const later = res.flatMap((u) => u.checks.filter((c) => c.day >= 63 && c.estimate)).map((c) => c.estimate.rawTdee);
  const mean = later.reduce((a, x) => a + x, 0) / later.length;
  assert.ok(Math.abs(mean - 2600) < 120, `raw estimate after the skip: ${Math.round(mean)}`);
});

test('progress read: an on-plan cut is never called slow before day 28, and reads on track after it', () => {
  // planned −0.5%/wk at 85 kg = −0.425 kg/wk, 6 weigh-ins a week. Measured before the day-28 rule:
  // 28–37% of on-plan users read "slow" on day 21 (the trend lags at the start of a phase).
  const read = (seed, sigma, day) => {
    const r = rng(seed), w = [];
    for (let d = 0; d < day; d++) if (r() < 0.85) w.push({ date: core.addDays(START, d), kg: 85 - 0.425 / 7 * d + sigma * gauss(r) });
    return P.read({ phase: { type: 'cut', startDate: START, expectedWeeklyPct: -0.5 }, today: core.addDays(START, day - 1), weights: w, waist: [], lifts: {} });
  };
  const n = 150, at = (sigma, day) => Array.from({ length: n }, (x, i) => read(5000 + i, sigma, day));
  at(0.8, 21).forEach((res) => { const s = res.signals[0]; assert.ok(s.status === 'on-track' || s.early || s.actual < s.planned, 'never a slow verdict on day 21'); });
  assert.ok(share(at(0.5, 28), (res) => res.signals[0].status === 'on-track') >= 0.9, 'typical weigh-in noise: 90%+ on track on day 28');
  assert.ok(share(at(0.8, 42), (res) => res.signals[0].status === 'on-track') >= 0.85, 'noisy weigh-ins: 85%+ on track on day 42');
  // the advice: across days 28–56 with noisy weigh-ins, an on-plan user is told to eat less under 3% of the time
  const steps = [28, 35, 42, 49, 56].flatMap((day) => at(0.8, day).map((res) => P.nextStep('cut', res, { loggedDays14: 13, weighIns14: 12, floorKcal: 1500, targetKcal: 2100 })));
  assert.ok(share(steps, (st) => st.kind === 'eat-less') < 0.03, `eat less: ${(share(steps, (st) => st.kind === 'eat-less') * 100).toFixed(1)}%`);
});
