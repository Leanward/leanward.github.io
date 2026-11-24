/* Planned-end hand-off (PRD PHS-6, js/phaseend.js): when it's due and what it offers. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PE = require('../js/phaseend.js');

const cut = { id: 'c1', type: 'cut', start_date: '2026-09-01', planned_end: '2026-11-23', rate: 0.75, target_weight_kg: 80 };

test('due: within 7 days of the planned end, or when the trend reaches the goal weight', () => {
  assert.equal(PE.due({ phase: cut, today: '2026-11-15', trendKg: 85 }).due, false);  // 8 days out
  let d = PE.due({ phase: cut, today: '2026-11-16', trendKg: 85 });
  assert.equal(d.due, true); assert.equal(d.reason, 'planned-end'); assert.equal(d.daysLeft, 7);
  d = PE.due({ phase: cut, today: '2026-10-01', trendKg: 79.9 });                        // goal reached by trend
  assert.equal(d.due, true); assert.equal(d.reason, 'goal');
  assert.equal(PE.due({ phase: Object.assign({}, cut, { type: 'bulk', target_weight_kg: 90 }), today: '2026-10-01', trendKg: 85 }).due, false);
  assert.equal(PE.due({ phase: Object.assign({}, cut, { planned_end: null }), today: '2026-11-30', trendKg: 85 }).due, false);  // open-ended
  // overdue stays due (nothing switches on its own)
  assert.equal(PE.due({ phase: cut, today: '2026-12-20', trendKg: 85 }).due, true);
  // "Not now" snoozes Today for 7 days, for this phase only
  const sz = PE.snooze('c1', '2026-11-16');
  assert.equal(sz.until, '2026-11-23');
  assert.equal(PE.due({ phase: cut, today: '2026-11-20', trendKg: 85, snooze: sz }).snoozed, true);
  assert.equal(PE.due({ phase: cut, today: '2026-11-23', trendKg: 85, snooze: sz }).snoozed, false);
  assert.equal(PE.due({ phase: cut, today: '2026-11-20', trendKg: 85, snooze: { phaseId: 'other', until: '2026-12-01' } }).snoozed, false);
});

test('after a cut: maintenance suggested, diet break, keep cutting only without care and under 16 weeks', () => {
  let o = PE.options({ phase: cut, goalType: 'lose-fat', today: '2026-11-20' });   // 11 weeks in
  assert.deepEqual(o.map((x) => x.id), ['maintenance', 'break', 'extend', 'other']);
  assert.equal(o[0].suggested, true); assert.equal(o[0].goal, 'maintain');
  assert.equal(o[1].plannedDays, 14); assert.equal(o[1].goal, 'lose-fat');          // a break keeps the fat-loss goal
  assert.equal(PE.options({ phase: cut, goalType: 'lose-fat', today: '2026-11-20', careStep: true }).some((x) => x.id === 'extend'), false);
  assert.equal(PE.options({ phase: cut, goalType: 'lose-fat', today: '2026-12-30' }).some((x) => x.id === 'extend'), false);  // 17 weeks
});

test('after a diet break: back to the cut at its old rate comes first', () => {
  const br = { id: 'b1', type: 'maintenance', start_date: '2026-11-24', planned_end: '2026-12-07' };
  assert.equal(PE.isDietBreak(br, 'lose-fat'), true);
  assert.equal(PE.isDietBreak(br, 'maintain'), false);
  assert.equal(PE.isDietBreak(Object.assign({}, br, { planned_end: '2026-12-20' }), 'lose-fat'), false);
  const o = PE.options({ phase: br, goalType: 'lose-fat', today: '2026-12-05', lastCut: cut });
  assert.equal(o[0].id, 'resume'); assert.equal(o[0].phase, 'cut'); assert.equal(o[0].rate, 0.75); assert.match(o[0].why, /0\.75% a week/);
});

test('after a bulk and other phases; keep going moves the planned end', () => {
  const bulk = { id: 'k', type: 'bulk', start_date: '2026-06-01', planned_end: '2026-09-20' };
  assert.deepEqual(PE.options({ phase: bulk, goalType: 'build-muscle', today: '2026-09-18' }).map((x) => x.id), ['maintenance', 'extend', 'cut', 'other']);
  const rc = { id: 'r', type: 'recomp', start_date: '2026-06-01', planned_end: '2026-08-23' };
  assert.deepEqual(PE.options({ phase: rc, goalType: 'recomp', today: '2026-08-20' }).map((x) => x.id), ['extend', 'other']);
  assert.equal(PE.extended(cut, 4, '2026-11-20').planned_end, '2026-12-21');   // from the old end
  assert.equal(PE.extended(cut, 4, '2026-12-10').planned_end, '2027-01-07');   // overdue: from today
});
