/* M1b calculation engine: DRIs (§8.8, NUT-3), nutrient limits and ratios (NUT-6/7), the phase
 * progress read (PRG-2/3/4) and adaptive maintenance (§8.6). Expected values are worked by hand. */
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/calc/core.js');
const D = require('../js/calc/dri.js');
const N = require('../js/calc/nutrients.js');
const P = require('../js/calc/progress.js');
const A = require('../js/calc/adaptive.js');

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);
const days = (start, n, fn) => Array.from({ length: n }, (_, i) => fn(core.addDays(start, i), i));

/* ---------- DRIs ---------- */

test('DRI examples from PRD §8.8 (adults 19–50)', () => {
  const m = D.targetsFor({ age: 35, sex: 'male' }), f = D.targetsFor({ age: 35, sex: 'female' });
  assert.equal(m.magnesium.target, 420); assert.equal(f.magnesium.target, 320);   // 31–50
  assert.equal(D.targetsFor({ age: 25, sex: 'male' }).magnesium.target, 400);    // 19–30
  assert.equal(D.targetsFor({ age: 25, sex: 'female' }).magnesium.target, 310);
  assert.equal(m.iron.target, 8); assert.equal(f.iron.target, 18);
  assert.equal(m.vitaminD.target, 15); assert.equal(m.vitaminB12.target, 2.4); assert.equal(m.folate.target, 400);
});

test('RDA where one exists, otherwise AI', () => {
  const t = D.targetsFor({ age: 40, sex: 'female' });
  ['potassium', 'vitaminK', 'choline', 'ala', 'sodium'].forEach((k) => assert.equal(t[k].kind, 'AI', k));
  ['calcium', 'iron', 'vitaminC', 'folate'].forEach((k) => assert.equal(t[k].kind, 'RDA', k));
});

test('life stages: an 18-year-old is in 14–18; 51+ and 71+ change some targets', () => {
  assert.equal(D.targetsFor({ age: 18, sex: 'male' }).calcium.target, 1300);
  assert.equal(D.targetsFor({ age: 19, sex: 'male' }).calcium.target, 1000);
  assert.equal(D.targetsFor({ age: 51, sex: 'female' }).calcium.target, 1200);
  assert.equal(D.targetsFor({ age: 51, sex: 'male' }).calcium.target, 1000);
  assert.equal(D.targetsFor({ age: 71, sex: 'male' }).calcium.target, 1200);
  assert.equal(D.targetsFor({ age: 51, sex: 'female' }).iron.target, 8);
  assert.equal(D.targetsFor({ age: 71, sex: 'female' }).vitaminD.target, 20);
  assert.equal(D.targetsFor({ age: 51, sex: 'male' }).vitaminB6.target, 1.7);
  assert.equal(D.targetsFor({ age: 71, sex: 'male' }).phosphorus.ul, 3000);
});

test('pregnancy and lactation targets', () => {
  const p = D.targetsFor({ age: 30, sex: 'female', reproductive: 'pregnant' });
  assert.equal(p.iron.target, 27); assert.equal(p.folate.target, 600); assert.equal(p.choline.target, 450);
  assert.equal(p.phosphorus.ul, 3500);
  const l = D.targetsFor({ age: 30, sex: 'female', reproductive: 'lactating' });
  assert.equal(l.vitaminA.target, 1300); assert.equal(l.iron.target, 9); assert.equal(l.phosphorus.ul, 4000);
  // One "pregnant or breastfeeding" answer: the higher target of the two and the lower UL
  const e = D.targetsFor({ age: 30, sex: 'female', reproductive: 'either' });
  assert.deepEqual([e.iron.target, e.folate.target, e.vitaminA.target, e.choline.target, e.phosphorus.ul], [27, 600, 1300, 550, 3500]);
});

test('"prefer not to say" takes the higher target of the two', () => {
  const u = D.targetsFor({ age: 35, sex: 'unspecified' });
  assert.equal(u.iron.target, 18);        // female 18 > male 8
  assert.equal(u.magnesium.target, 420);  // male 420 > female 320
  assert.equal(u.vitaminK.target, 120);
});

test('ULs that only apply to supplements say so (§8.8)', () => {
  const t = D.targetsFor({ age: 35, sex: 'male' });
  ['magnesium', 'niacin', 'vitaminE', 'folate'].forEach((k) => assert.ok(t[k].ulNote, k));
  assert.match(t.vitaminA.ulNote, /preformed/);
  assert.equal(t.calcium.ulNote, null);
  assert.equal(t.potassium.ul, null);
});

test('every nutrient has a target for every life stage, and ULs sit above targets', () => {
  [18, 25, 40, 60, 80].forEach((age) => ['male', 'female', 'unspecified'].forEach((sex) => {
    const t = D.targetsFor({ age, sex });
    Object.entries(t).forEach(([k, v]) => {
      assert.ok(v.target > 0, `${k} ${age} ${sex}`);
      if (v.ul != null && !v.ulNote) assert.ok(v.ul > v.target, `${k} UL ${age} ${sex}`);
    });
  }));
  assert.equal(D.VERIFIED, true, 'checked against NASEM Appendix J on 2026-11-06 (docs/decisions.md)');
});

/* ---------- nutrient review ---------- */

test('a nutrient against its target, above UL, and the supplement-only note', () => {
  const t = D.targetsFor({ age: 35, sex: 'female' });
  // iron 9 of 18 = 50%
  const iron = N.evaluate('iron', 9, t.iron, 0.9);
  close(iron.pct, 50); assert.deepEqual(iron.flags, []); assert.equal(iron.coverage, 0.9);
  // magnesium 400 > UL 350, but that UL is supplements-only → a neutral note, not a food flag
  assert.deepEqual(N.evaluate('magnesium', 400, t.magnesium).flags, ['above-ul-supplements-only']);
  // vitamin C 2100 > 2000
  assert.deepEqual(N.evaluate('vitaminC', 2100, t.vitaminC).flags, ['above-ul']);
  // sodium 2600 > 2300 CDRR
  assert.deepEqual(N.evaluate('sodium', 2600, t.sodium).flags, ['over-limit']);
});

test('limits, guideline and ratios', () => {
  // 2000 kcal; sat fat 25 g × 9 = 225 → 11.25%; added sugar 40 g × 4 = 160 → 8%
  // Na:K 2300 ÷ 3000 = 0.77; fiber 24 ÷ 2000 × 1000 = 12 g; EPA+DHA 150 mg
  // split: 150 g × 4 = 600 (30%), 70 × 9 = 630 (31.5%), 192 × 4 = 768 (38.4%); protein 150 ÷ 75 = 2.0 g/kg
  const q = N.quality({ kcal: 2000, satFatG: 25, addedSugarG: 40, sodiumMg: 2300, potassiumMg: 3000, fiberG: 24, epaDhaMg: 150, proteinG: 150, fatG: 70, carbsG: 192 }, { kg: 75 });
  const by = Object.fromEntries(q.map((x) => [x.id, x]));
  close(by.satFatPct.value, 11.25); assert.deepEqual(by.satFatPct.flags, ['over-limit']);
  close(by.addedSugarPct.value, 8); assert.deepEqual(by.addedSugarPct.flags, []);
  close(by.naK.value, 2300 / 3000);
  close(by.fiberPer1000.value, 12); assert.deepEqual(by.fiberPer1000.flags, ['below-target']);
  assert.deepEqual(by.epaDha.flags, ['below-guideline']); assert.match(by.epaDha.text, /not a DRI/);
  close(by.split.value.proteinPct, 30); close(by.split.value.fatPct, 31.5); close(by.split.value.carbsPct, 38.4);
  close(by.proteinPerKg.value, 2);
});

test('furthest from target: over-limit items first, then lowest %, skipping low coverage', () => {
  const t = D.targetsFor({ age: 35, sex: 'female' });
  const rows = [
    N.evaluate('iron', 9, t.iron),                 // 50%
    N.evaluate('vitaminD', 3, t.vitaminD),         // 20%
    N.evaluate('vitaminK', 10, t.vitaminK, 0.3),   // 11%, but only 30% coverage → skipped
    N.evaluate('calcium', 1100, t.calcium),        // 110% → not below
    N.evaluate('sodium', 2600, t.sodium)           // over the 2,300 limit
  ];
  const q = N.quality({ kcal: 2000, satFatG: 25 });
  assert.deepEqual(N.furthestFromTarget(rows, q).map((r) => r.id), ['sodium', 'satFatPct', 'vitaminD', 'iron']);
});

/* ---------- progress read ---------- */

test('recomp: the PRD example sentence', () => {
  // Weight oscillates around 80 kg (flat); waist 86 → 84.2 (−1.8); squat 140 → 145.6 (+4%)
  const w = days('2026-10-01', 28, (date, i) => ({ date, kg: 80 + 0.3 * Math.sin(i) }));
  const r = P.read({ phase: { type: 'recomp', startDate: '2026-10-01' }, today: '2026-10-28', weights: w,
    waist: [{ date: '2026-10-01', cm: 86 }, { date: '2026-10-28', cm: 84.2 }],
    lifts: { 'Back squat': [{ date: '2026-10-02', e1rm: 140 }, { date: '2026-10-26', e1rm: 145.6 }] } });
  assert.equal(r.summary, 'Weight flat, waist −1.8 cm, back squat e1RM +4%: consistent with a successful recomp.');
  assert.deepEqual(r.signals.map((s) => s.status), ['on-track', 'on-track', 'on-track']);
  assert.equal(r.dayOfPhase, 28);
});

test('collecting data until 14 days and 8 weigh-ins', () => {
  const w = days('2026-10-25', 6, (date) => ({ date, kg: 90 }));
  const r = P.read({ phase: { type: 'cut', startDate: '2026-10-25', expectedWeeklyPct: -0.5 }, today: '2026-10-30', weights: w });
  // day 6 of the phase: 8 more days; 6 weigh-ins: 2 more
  assert.equal(r.signals[0].status, 'collecting');
  assert.equal(r.signals[0].value, 'Collecting data: 8 more days and 2 more weigh-ins');
  assert.match(r.summary, /^Still collecting data for your cut/);
});

test('cut: on track within ±50% of plan, watch to ±100%, off track beyond', () => {
  // Weights fall 0.07 kg a day from 90 for 40 days. The trend's 14-day slope settles near −0.49 kg a week,
  // about −0.55% of body weight: within ±50% of a −0.5% plan.
  const w = days('2026-09-01', 40, (date, i) => ({ date, kg: 90 - 0.07 * i }));
  const base = { today: '2026-10-10', weights: w };
  const onPlan = P.read(Object.assign({ phase: { type: 'cut', startDate: '2026-09-01', expectedWeeklyPct: -0.5 } }, base)).signals[0];
  assert.equal(onPlan.status, 'on-track');
  assert.ok(onPlan.actual < -0.45 && onPlan.actual > -0.65, String(onPlan.actual));
  // Against a −0.25% plan the same −0.54% is ~115% faster than planned → off track
  assert.equal(P.read(Object.assign({ phase: { type: 'cut', startDate: '2026-09-01', expectedWeeklyPct: -0.25 } }, base)).signals[0].status, 'off-track');
  // Against a −1.0% plan it is ~46% slower → still on track
  assert.equal(P.read(Object.assign({ phase: { type: 'cut', startDate: '2026-09-01', expectedWeeklyPct: -1.0 } }, base)).signals[0].status, 'on-track');
});

test('cut: waist and lifts', () => {
  const w = days('2026-09-01', 20, (date, i) => ({ date, kg: 90 - 0.07 * i }));
  const r = P.read({ phase: { type: 'cut', startDate: '2026-09-01', expectedWeeklyPct: -0.5 }, today: '2026-09-20', weights: w,
    waist: [{ date: '2026-09-01', cm: 95 }, { date: '2026-09-20', cm: 95.2 }],                 // +0.2 cm: flat → watch
    lifts: { Bench: [{ date: '2026-09-02', e1rm: 100 }, { date: '2026-09-19', e1rm: 96 }],    // −4% → on track
             Deadlift: [{ date: '2026-09-02', e1rm: 200 }, { date: '2026-09-19', e1rm: 182 }] } }); // −9% → watch
  const by = Object.fromEntries(r.signals.map((s) => [s.id, s.status]));
  assert.deepEqual(by, { weight: 'on-track', waist: 'watch', 'lift:Bench': 'on-track', 'lift:Deadlift': 'watch' });
  assert.match(r.summary, /Worth a look: waist, deadlift\.$/);
});

test('lean bulk waist: no faster than 1 cm per kg gained', () => {
  // +0.05 kg a day for 30 days: trend gain ≈ 1.2 kg by day 30 (it lags the raw +1.45 kg)
  const w = days('2026-09-01', 30, (date, i) => ({ date, kg: 75 + 0.05 * i }));
  const read = (cm) => P.read({ phase: { type: 'bulk', startDate: '2026-09-01', expectedWeeklyPct: 0.25 }, today: '2026-09-30', weights: w,
    waist: [{ date: '2026-09-01', cm: 80 }, { date: '2026-09-30', cm }] }).signals.find((s) => s.id === 'waist');
  const ok = read(81);
  assert.equal(ok.status, 'on-track');          // +1 cm ≤ ~1.2 kg × 1 cm + 0.5 cm noise
  assert.ok(ok.gainedKg > 1 && ok.gainedKg < 1.5, String(ok.gainedKg));
  assert.equal(read(83).status, 'off-track');    // +3 cm, well past 1.5 × the allowed ~1.7 cm
});

test('maintenance: within ±1.5% of the phase-start weight', () => {
  // Earlier weigh-ins at 80 seed the trend; then weight drifts to 81.5 (≈ +1.9% raw, trend lags)
  const before = days('2026-08-20', 12, (date) => ({ date, kg: 80 }));
  const during = days('2026-09-01', 30, (date, i) => ({ date, kg: 80 + 0.05 * i }));
  const r = P.read({ phase: { type: 'maintenance', startDate: '2026-09-01' }, today: '2026-09-30', weights: before.concat(during) });
  const s = r.signals[0];
  assert.ok(s.changePct > 0 && s.changePct < 1.5, String(s.changePct));
  assert.equal(s.status, 'on-track');
  assert.equal(r.signals.length, 1, 'no lift signals in maintenance');
});

test('nutrition optimization: logging and nutrients, no weight signals (PHS-7)', () => {
  const logged = days('2026-09-01', 30, (date, i) => (i % 5 === 0 ? null : date)).filter(Boolean);   // 4 of every 5 days
  const r = P.read({ phase: { type: 'nutrition', startDate: '2026-09-01' }, today: '2026-09-30', loggedDates: logged, nutrientsMet: 18, nutrientsTotal: 22 });
  // last 14 days 09-17..09-30: missing 09-21 and 09-26 → 12 of 14 = 85.7% → on track; nutrients 18/22 = 81.8% → on track
  assert.deepEqual(r.signals.map((s) => [s.id, s.status]), [['logging', 'on-track'], ['nutrients', 'on-track']]);
  assert.equal(r.signals[0].value, '12 of the last 14 days logged');
  assert.doesNotMatch(r.summary, /weight|deficit|surplus/i);
});

/* ---------- adaptive maintenance ---------- */

test('adaptive maintenance: a full window, blended and capped', () => {
  // 21 days ending 2026-10-21. Intake 2000 kcal every day. Weight flat at 80 for 30 days before and during.
  // Δ trend = 0 → raw = 2000; previous 2400 → blend 0.7 × 2000 + 0.3 × 2400 = 2120 (−280) → capped at −150 → 2250
  const weights = days('2026-09-20', 32, (date) => ({ date, kg: 80 }));
  const intake = days('2026-10-01', 21, (date) => ({ date, kcal: 2000, complete: true }));
  const r = A.estimate({ endDate: '2026-10-21', intake, weights, previousTdee: 2400 });
  assert.equal(r.status, 'proposed');
  close(r.rawTdee, 2000);
  assert.equal(r.tdee, 2250);
  assert.equal(r.recommendation.from, 2400); assert.equal(r.recommendation.to, 2250);
  assert.ok(r.steps.includes('Change limited to 150 kcal a week'));
});

test('adaptive maintenance: weight change moves the estimate', () => {
  // Weight steady at 80 for 3 weeks before, then exactly 0.05 kg a day down during the window.
  // Trend: compute the Δ the same way as the module, then raw = 2000 − Δ × 7700 ÷ 20.
  const before = days('2026-09-10', 21, (date) => ({ date, kg: 80 }));
  const during = days('2026-10-01', 21, (date, i) => ({ date, kg: 80 - 0.05 * i }));
  const intake = days('2026-10-01', 21, (date) => ({ date, kcal: 2000, complete: true }));
  const r = A.estimate({ endDate: '2026-10-21', intake, weights: before.concat(during), previousTdee: 2300 });
  assert.ok(r.trendChangeKg < 0);
  close(r.rawTdee, 2000 - r.trendChangeKg * 7700 / 20, 1e-9);
  // blend 0.7 × raw + 0.3 × 2300, change within ±150
  close(r.tdee, Math.round(2300 + Math.max(-150, Math.min(150, 0.7 * r.rawTdee + 0.3 * 2300 - 2300))), 0.5);
});

test('adaptive maintenance: not enough data keeps the previous estimate', () => {
  const weights = days('2026-10-01', 21, (date, i) => (i < 7 || i % 3 === 0 ? { date, kg: 80 } : null)).filter(Boolean);
  const intake = days('2026-10-01', 21, (date, i) => ({ date, kcal: 2000, complete: i < 15 }));   // 15 of 21 complete
  const r = A.estimate({ endDate: '2026-10-21', intake, weights, previousTdee: 2400 });
  assert.equal(r.status, 'not-enough-data');
  assert.equal(r.tdee, 2400);
  // weigh-ins: week 1 every day (7); weeks 2 and 3 only on days divisible by 3 (9, 12 | 15, 18) → 2 each
  assert.ok(r.reasons[0].startsWith('15 of 21 days fully logged (needs 17)'));
  assert.deepEqual(r.reasons.slice(1), ['week 2 has 2 weigh-ins (needs 4)', 'week 3 has 2 weigh-ins (needs 4)']);
});

test('the progress read speaks the user\'s units (US: lb and in)', () => {
  const P = require('../js/calc/progress.js');
  const weights = []; for (let i = 0; i < 20; i++) weights.push({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, kg: 80 });
  const input = { phase: { type: 'recomp', startDate: '2026-11-01' }, today: '2026-11-20', weights, waist: [{ date: '2026-11-02', cm: 90 }, { date: '2026-11-18', cm: 87.46 }], lifts: {} };
  const us = P.read(input, { units: 'us' });
  // waist 87.46 − 90 = −2.54 cm = −1.0 in; the 0.5 cm noise band = 0.2 in
  assert.match(us.signals[0].value, /lb a week/);
  assert.equal(us.signals[1].value, '−1.0 in since 2026-11-02');
  assert.match(us.signals[1].rule, /under 0\.2 in count as flat/);
  assert.match(us.summary, /waist −1\.0 in/);
  const metric = P.read(input);
  assert.match(metric.signals[1].value, /−2\.5 cm/); assert.match(metric.signals[1].rule, /under 0\.5 cm/);
});
