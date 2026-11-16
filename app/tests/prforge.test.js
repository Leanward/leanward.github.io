/* M6b: key lifts from PR Forge (js/prforge.js, the pure part). Workouts are in PR Forge's own shape. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PF = require('../js/prforge.js');
const P = require('../js/calc/progress.js');
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

const set = (weight, reps, extra) => Object.assign({ id: 's' + Math.random(), weight, reps, done: true, warmup: false }, extra);
const workout = (startedAt, unit, exercises, extra) => Object.assign({ id: 'w' + startedAt, startedAt, endedAt: startedAt, unit, exercises }, extra);

test('a day\'s point is the best estimated 1RM among working sets, by PR Forge\'s rules', () => {
  const w = workout('2026-11-10T18:00:00', 'lb', [{ id: 'e1', exerciseId: 'bench-press', sets: [
    set(135, 10, { warmup: true }),          // warm-up: ignored
    set(185, 5),                             // 185 × (1 + 5/30) = 215.83
    set(205, 3),                             // 205 × 1.1 = 225.5  ← best
    set(225, 1, { done: false }),            // not confirmed: ignored
    set(95, 20)                              // over 12 reps: no estimate (§8.7)
  ] }, { id: 'e2', exerciseId: 'plank', sets: [set(0, 0, { seconds: 60, tracking: 'timed' })] },
  { id: 'e3', exerciseId: 'pull-up', sets: [set(40, 8, { tracking: 'assisted' }), set(0, 10)] }]);
  const b = PF.bestSet(w, 'bench-press');
  close(b.e1rmLb, 225.5); assert.deepEqual([b.weightLb, b.reps], [205, 3]);
  assert.equal(PF.bestSet(w, 'plank'), null);       // timed
  assert.equal(PF.bestSet(w, 'pull-up'), null);     // assisted, and bodyweight with no load
});

test('summary: one point a day, kg workouts converted, unfinished workouts left out', () => {
  const ws = [
    workout('2026-11-03T18:00:00', 'lb', [{ exerciseId: 'bench-press', sets: [set(200, 1)] }]),
    workout('2026-11-10T07:00:00', 'lb', [{ exerciseId: 'bench-press', sets: [set(180, 5)] }]),                 // 210
    workout('2026-11-10T18:00:00', 'kg', [{ exerciseId: 'bench-press', sets: [set(100, 1)] }, { exerciseId: 'custom-1', sets: [set(50, 10)] }]),   // 220.46 lb ← the day's best
    workout('2026-11-12T18:00:00', 'lb', [{ exerciseId: 'bench-press', sets: [set(300, 1)] }], { endedAt: null })   // still in progress
  ];
  const s = PF.summarize(ws, [{ id: 'custom-1', name: 'Landmine Press' }]);
  assert.deepEqual(s.map((e) => [e.id, e.name, e.sessions.length]), [['bench-press', 'Bench Press (Barbell)', 2], ['custom-1', 'Landmine Press', 1]]);
  assert.deepEqual(s[0].sessions.map((x) => x.date), ['2026-11-03', '2026-11-10']);
  close(s[0].sessions[1].e1rmLb, 220.462262185);
  assert.equal(PF.nameOf('fedb:Ab_Crunch_Machine'), 'Ab Crunch Machine');
  assert.equal(PF.nameOf('some-new-lift'), 'Some New Lift');
});

test('chosen lifts: display units, up to 5, and the progress read', () => {
  const ws = [];
  for (let i = 0; i < 4; i++) ws.push(workout(`2026-11-${String(1 + i * 6).padStart(2, '0')}T18:00:00`, 'lb', [{ exerciseId: 'squat', sets: [set(300 + i * 5, 1)] }]));
  const sum = PF.summarize(ws, []);
  const picks = [{ id: 'squat', name: 'Squat' }, { id: 'gone', name: 'Old Lift' }];
  const kg = PF.series(sum, picks, 'metric');
  close(kg[0].points[0].v, 300 / 2.20462262185); assert.equal(kg[1].missing, true);
  // toggle: add, remove, and the limit of 5
  let list = [];
  ['a', 'b', 'c', 'd', 'e'].forEach((id) => { list = PF.toggle(list, { id, name: id }); });
  assert.throws(() => PF.toggle(list, { id: 'f', name: 'f' }), /up to 5/);
  assert.deepEqual(PF.toggle(list, { id: 'c', name: 'c' }).map((p) => p.id), ['a', 'b', 'd', 'e']);
  // recomp from 1 Nov, read on 20 Nov: squat 300 → 315 lb = +5%, on track
  const lifts = PF.forProgress(sum, picks);
  assert.deepEqual(Object.keys(lifts), [sum[0].name]);
  const r = P.read({ phase: { type: 'recomp', startDate: '2026-11-01' }, today: '2026-11-20', weights: [], waist: [], lifts });
  const sig = r.signals.find((x) => x.id.startsWith('lift:'));
  assert.equal(sig.status, 'on-track'); close(sig.changePct, 5);
});
