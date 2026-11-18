/* NUT-9: training days from PR Forge, the Today line, Plan context and strength-dip context. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PF = require('../js/prforge.js');
const H = require('../js/home.js');
const P = require('../js/calc/progress.js');

// 2026-11-18 is a Wednesday. Mondays and Wednesdays for 3 weeks, plus one Saturday.
const ex = [{ sessions: ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11', '2026-11-14', '2026-11-16'].map((date) => ({ date })) },
  { sessions: [{ date: '2026-11-16' }, { date: '2026-10-01' }] }];

test('training days: usual weekdays from the last 4 weeks, today logged or usual, session counts', () => {
  const td = PF.trainingDays(ex, '2026-11-18');
  // Mon ×3, Wed ×2 → usual; Sat ×1 → not; Oct 1 is outside 28 days; Nov 16 counted once across exercises
  assert.deepEqual([td.today, td.usualNames, td.sessions14, td.sessions28, td.perWeek], ['usual', ['Mon', 'Wed'], 4, 6, 1.5]);
  assert.equal(PF.trainingDays(ex, '2026-11-16').today, 'logged');
  assert.equal(PF.trainingDays(ex, '2026-11-19').today, null);      // Thursday: rest day
  assert.deepEqual(PF.trainingDays([], '2026-11-18'), { today: null, usual: [], usualNames: [], sessions14: 0, sessions28: 0, perWeek: 0 });
});

test('Today line: about half the carbs around training; nothing on rest days; total unchanged', () => {
  const l = H.trainingLine({ training: PF.trainingDays(ex, '2026-11-18'), carbsTarget: 221 });
  // 221 ÷ 2 = 110.5 → nearest 5 = 110
  assert.equal(l.title, 'Training day');
  assert.match(l.text, /^You usually train on Mon, Wed \(PR Forge\)\. .*around 110 g.*stays 221 g\.$/);
  assert.equal(H.trainingLine({ training: PF.trainingDays(ex, '2026-11-16'), carbsTarget: 200 }).title, 'Trained today');
  assert.equal(H.trainingLine({ training: PF.trainingDays(ex, '2026-11-19'), carbsTarget: 221 }), null);
  assert.equal(H.trainingLine({ training: null, carbsTarget: 221 }), null);
});

test('a strength dip after fewer sessions than usual is said to be that, not muscle loss', () => {
  const w = { id: 'weight', label: 'Weight trend', status: 'on-track', value: '−0.5% a week', actual: -0.5, planned: -0.5 };
  const lift = { id: 'lift:Bench', label: 'Bench', status: 'off-track', value: 'Estimated 1RM −11%', changePct: -11 };
  const q = { loggedDays14: 13, weighIns14: 12 };
  // usually 3 a week = 6 in 14 days; 2 sessions < 60% of 6 → fewer sessions
  const s = P.nextStep('cut', { signals: [w, lift] }, Object.assign({ sessions14: 2, usualPerWeek: 3 }, q));
  assert.equal(s.title, 'Fewer sessions lately'); assert.match(s.why[0], /trained 2 times in the last 14 days; you usually train about 3\.0 times a week/);
  // the usual number of sessions → the recovery advice as before
  assert.equal(P.nextStep('cut', { signals: [w, lift] }, Object.assign({ sessions14: 6, usualPerWeek: 3 }, q)).title, 'Look after recovery');
  assert.equal(P.nextStep('cut', { signals: [w, lift] }, q).title, 'Look after recovery');
});
