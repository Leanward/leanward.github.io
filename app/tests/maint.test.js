/* M6b: the maintenance check (js/maint.js, PRG-5). Arithmetic is worked in the comments. */
const test = require('node:test');
const assert = require('node:assert/strict');
const MT = require('../js/maint.js');
const core = require('../js/calc/core.js');

const today = '2026-11-22';                       // the window is 1 Nov to 21 Nov
const day = (n) => core.addDays('2026-11-01', n);
const target = () => ({ kcal: 2500 });
// Alex eats 2,500 kcal every day and his weight falls steadily by 0.05 kg a day.
const diary = (kcal, skip = []) => { const out = []; for (let i = 0; i < 21; i++) if (!skip.includes(i)) out.push({ date: day(i), kcal: kcal - 500, protein_g: 100 }, { date: day(i), kcal: 500, protein_g: 50 }); return out; };
const weights = (perDay, skip = []) => { const out = []; for (let i = -30; i < 21; i++) if (!skip.includes(i)) out.push({ date: day(i), kg: 80 + perDay * i, measured_at: day(i) + 'T07:00:00Z' }); return out; };

test('a day counts when it reaches half the calorie target', () => {
  const d = MT.intakeDays([{ date: day(0), kcal: 700 }, { date: day(0), kcal: 600 }, { date: day(1), kcal: 1100 }, { date: day(2), kcal: 900, deleted: true }, { date: day(3), kcal: 700 }], (date) => (date === day(3) ? null : target()), day(0), day(20));
  // 1,300 ≥ 1,250 counts; 1,100 doesn't; the deleted entry is ignored; with no target 700 < 800 doesn't
  assert.deepEqual(d, [{ date: day(0), kcal: 1300, complete: true }, { date: day(1), kcal: 1100, complete: false }, { date: day(3), kcal: 700, complete: false }]);
});

test('not enough data: says what is missing', () => {
  // 10 days logged; week 3 has 2 weigh-ins
  const r = MT.check({ today, diary: diary(2500, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), weights: weights(-0.05, [14, 15, 16, 17, 18]), targetOn: target, previousTdee: 2750, recommendations: [] });
  assert.equal(r.state, 'collecting');
  assert.deepEqual([r.logged, r.neededDays, r.weeks], [10, 17, [7, 7, 2]]);
  assert.match(r.need.join('; '), /10 of 21 days fully logged \(needs 17\); week 3 has 2 weigh-ins \(needs 4\)/);
  assert.equal(MT.check({ today, diary: [], weights: [], targetOn: target, previousTdee: null }).state, 'unavailable');
});

test('a suggestion when maintenance looks different, capped at 150 kcal', () => {
  // Trend falls about 0.05 kg a day while eating 2,500: raw ≈ 2,500 + 0.05 × 7,700 = 2,885 kcal.
  // Blend with 2,400: 0.7 × 2,885 + 0.3 × 2,400 ≈ 2,740 → +340, limited to +150 → 2,550.
  const r = MT.check({ today, diary: diary(2500), weights: weights(-0.05), targetOn: target, previousTdee: 2400, recommendations: [] });
  assert.deepEqual([r.state, r.from, r.to, r.windowStart, r.windowEnd], ['proposed', 2400, 2550, '2026-11-01', '2026-11-21']);
  assert.ok(Math.abs(r.estimate.rawTdee - 2885) < 15, String(r.estimate.rawTdee));
  assert.match(r.estimate.steps.join(' | '), /Change limited to 150 kcal a week/);
  // the working follows the user's units: −1.0 kg is −2.2 lb, and 7,700 kcal per kg is 3,493 per lb
  const us = MT.check({ today, diary: diary(2500), weights: weights(-0.05), targetOn: target, previousTdee: 2400, recommendations: [], units: 'us' });
  assert.equal(us.to, 2550);
  assert.match(us.estimate.steps[1], /lb \(−\d\.\d\d lb\)$/); assert.match(us.estimate.steps[2], /lb × 3,493 ÷ 20 days\)/);
  assert.match(r.estimate.steps[2], /kg × 7,700 ÷ 20 days\)/);
  const row = MT.decisionRow(r, 'accepted', 'ph1', '2026-11-22T09:00:00Z');
  assert.deepEqual([row.type, row.status, row.phase_id, row.proposed.from, row.proposed.to, row.decided_at], ['maintenance-update', 'accepted', 'ph1', 2400, 2550, '2026-11-22T09:00:00Z']);
  assert.ok(row.reasoning.length >= 4);
});

test('within 50 kcal it matches; after a decision it waits a week', () => {
  // Weight flat while eating 2,500, maintenance in use 2,520: raw 2,500, blended 2,506 → −14 kcal: matches
  const flat = { today, diary: diary(2500), weights: weights(0), targetOn: target, previousTdee: 2520, recommendations: [] };
  assert.equal(MT.check(flat).state, 'matches');
  const base = { today, diary: diary(2500), weights: weights(-0.05), targetOn: target, previousTdee: 2400 };
  const declined = [{ type: 'maintenance-update', status: 'declined', decided_at: '2026-11-18T10:00:00Z' }];
  const w = MT.check(Object.assign({}, base, { recommendations: declined }));
  assert.deepEqual([w.state, w.until], ['waiting', '2026-11-25']);
  assert.equal(MT.check(Object.assign({}, base, { today: '2026-11-25', diary: diary(2500).concat([{ date: '2026-11-22', kcal: 2500 }, { date: '2026-11-23', kcal: 2500 }, { date: '2026-11-24', kcal: 2500 }]),
    weights: weights(-0.05).concat(['2026-11-22', '2026-11-23', '2026-11-24'].map((d, i) => ({ date: d, kg: 78.95 - i * 0.05, measured_at: d }))), recommendations: declined })).state, 'proposed');
});
