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
  // this week = Mon 16 Nov to Wed 18 Nov: 1 session (the 16th); the weekly aim = 2 usual days
  assert.deepEqual([td.week, td.weekAim], [1, 2]);
  assert.equal(PF.trainingDays(ex, '2026-11-16').today, 'logged');
  assert.equal(PF.trainingDays(ex, '2026-11-19').today, null);      // Thursday: rest day
  assert.deepEqual(PF.trainingDays([], '2026-11-18'), { today: null, usual: [], label: null, manual: false, usualNames: [], sessions14: 0, sessions28: 0, perWeek: 0, week: 0, weekAim: 0, restToday: false });
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

test('training days you set yourself: a weekly schedule, one-off training days and rest days (NUT-9b)', () => {
  // no PR Forge at all; hockey on Tue and Thu. 2026-11-17 is a Tuesday.
  const hockey = { weekdays: [2, 4], label: 'Hockey', days: {} };
  const tue = PF.trainingDays([], '2026-11-17', hockey);
  assert.deepEqual([tue.today, tue.usualNames, tue.label, tue.manual, tue.weekAim], ['usual', ['Tue', 'Thu'], 'Hockey', true, 2]);
  assert.match(H.trainingLine({ training: tue, carbsTarget: 200 }).text, /^You usually train on Tue, Thu \(Hockey\)\./);
  // a game on Saturday the 21st, marked that day → a training day and a session this week
  const sat = PF.trainingDays([], '2026-11-21', Object.assign({}, hockey, { days: { '2026-11-21': true } }));
  assert.deepEqual([sat.today, sat.week], ['marked', 1]);
  assert.match(H.trainingLine({ training: sat, carbsTarget: 200 }).text, /^You marked today as a training day \(Hockey\)\./);
  // skipping Thursday the 19th → no training line that day
  const thu = PF.trainingDays([], '2026-11-19', Object.assign({}, hockey, { days: { '2026-11-19': false } }));
  assert.deepEqual([thu.today, thu.restToday], [null, true]);
  assert.equal(H.trainingLine({ training: thu, carbsTarget: 200 }), null);
  // with PR Forge: usual days merge (Mon, Wed from PR Forge + Tue, Thu hockey), Monday first
  assert.deepEqual(PF.trainingDays(ex, '2026-11-18', hockey).usualNames, ['Mon', 'Tue', 'Wed', 'Thu']);
  // marks keep 60 days; null clears a day
  let m = PF.setMark({ '2026-08-01': true, '2026-11-10': false }, '2026-11-18', true, '2026-11-18');
  assert.deepEqual(m, { '2026-11-10': false, '2026-11-18': true });
  assert.deepEqual(PF.setMark(m, '2026-11-18', null, '2026-11-18'), { '2026-11-10': false });
});
