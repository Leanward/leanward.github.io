/* Weekly check-in (PRD PRG-6, js/checkin.js): when it's due, the week in numbers, the one outcome. */
const test = require('node:test');
const assert = require('node:assert/strict');
const CI = require('../js/checkin.js');

// 2026-11-02 is a Monday.
const phase = { id: 'p1', start_date: '2026-11-02' };

test('due: from day 7 of the phase, on the phase start weekday, open 3 days, once a week', () => {
  assert.equal(CI.dayFor({}, phase), 1);                                   // Monday, the start weekday
  assert.equal(CI.dayFor({ checkinDay: 0 }, phase), 0);                    // the user picked Sunday
  let d = CI.due({ phase, today: '2026-11-05', recs: [] });
  assert.equal(d.due, false); assert.equal(d.next, '2026-11-09');          // first one a week in
  d = CI.due({ phase, today: '2026-11-09', recs: [] });
  assert.equal(d.due, true); assert.equal(d.date, '2026-11-09');
  assert.equal(CI.due({ phase, today: '2026-11-12', recs: [] }).due, true);   // 3 days after: still open
  assert.equal(CI.due({ phase, today: '2026-11-13', recs: [] }).due, false);  // 4 days after: closed, no guilt
  const done = [{ type: 'weekly-checkin', proposed: { date: '2026-11-09' } }];
  assert.equal(CI.due({ phase, today: '2026-11-10', recs: done }).due, false);
  assert.equal(CI.due({ phase, today: '2026-11-16', recs: done }).due, true);  // next week works as normal
  // a deleted record doesn't count as done; other record types are ignored
  assert.equal(CI.due({ phase, today: '2026-11-10', recs: [{ type: 'weekly-checkin', deleted: true, proposed: { date: '2026-11-09' } }, { type: 'maintenance-update', proposed: { date: '2026-11-09' } }] }).due, true);
  // a chosen day: Sunday 2026-11-08 is too early (day 7 is Nov 9), so the first is Sunday Nov 15
  assert.equal(CI.due({ phase, prefs: { checkinDay: 0 }, today: '2026-11-08', recs: [] }).next, '2026-11-15');
});

test('week: the 7 days before the check-in day; a day counts at half its target; averages of counted days', () => {
  const t = { kcal: 2000, protein_g: 150 };
  const diary = [
    { date: '2026-11-02', kcal: 1900, protein_g: 140 },
    { date: '2026-11-03', kcal: 2100, protein_g: 160 },
    { date: '2026-11-04', kcal: 600, protein_g: 40 },   // under half: a partly logged day, not counted
    { date: '2026-11-09', kcal: 2500, protein_g: 200 }, // the check-in day itself: not in the week
    { date: '2026-11-05', kcal: 2000, protein_g: 150, deleted: true }
  ];
  const weights = [{ date: '2026-11-02' }, { date: '2026-11-02' }, { date: '2026-11-06' }, { date: '2026-11-09' }];
  const w = CI.week({ date: '2026-11-09', diary, weights, targetOn: () => t });
  assert.equal(w.start, '2026-11-02'); assert.equal(w.end, '2026-11-08');
  assert.equal(w.loggedDays, 2);
  assert.equal(w.weighIns, 2);                       // distinct days
  assert.equal(w.avgKcal, 2000); assert.equal(w.avgProtein, 150);
  assert.equal(w.targetKcal, 2000);
});

test('outcome: care first; thin logging holds; a maintenance suggestion is offered; otherwise the step', () => {
  const full = { loggedDays: 6 };
  const care = { kind: 'care', title: 'You\'ve been eating under your safety floor', why: ['…'] };
  assert.equal(CI.outcome({ answer: 'some', step: care, week: { loggedDays: 1 } }).kind, 'care');
  // "Only some" holds even with a maintenance suggestion waiting
  const m = { state: 'proposed', from: 2600, to: 2480 };
  let o = CI.outcome({ answer: 'some', week: full, maint: m });
  assert.equal(o.kind, 'hold'); assert.equal(o.offerMaint, false);
  o = CI.outcome({ answer: 'all', week: { loggedDays: 3 }, maint: m });
  assert.equal(o.kind, 'hold'); assert.match(o.text, /Only 3 days/);
  o = CI.outcome({ answer: 'most', week: full, maint: m });
  assert.equal(o.kind, 'maint'); assert.equal(o.offerMaint, true); assert.match(o.text, /−120 kcal/);
  o = CI.outcome({ answer: 'all', week: full, step: { kind: 'eat-less', title: 'Consider a small change', why: ['Eat 100–150 kcal less.'] } });
  assert.equal(o.kind, 'change');
  o = CI.outcome({ answer: 'all', week: full, step: { kind: 'keep', title: 'Keep your current targets', why: ['Consistent with a productive cut.'] } });
  assert.equal(o.kind, 'keep'); assert.equal(o.title, 'No change needed');
  o = CI.outcome({ answer: 'all', week: full, step: { kind: 'wait', title: 'Too early to judge the pace', why: ['Hold steady.'] } });
  assert.equal(o.kind, 'keep'); assert.equal(o.text, 'Hold steady.');
  assert.equal(CI.outcome({ answer: 'all', week: full }).kind, 'keep');   // no read yet
});

test('record and history: a completed check-in is a recommendation row, newest first', () => {
  const out = { kind: 'keep', title: 'No change needed', text: 'x' };
  const r = CI.record({ date: '2026-11-09', phaseId: 'p1', answer: 'all', week: { loggedDays: 6 }, outcome: out, now: '2026-11-09T08:00:00Z' });
  assert.equal(r.type, 'weekly-checkin'); assert.equal(r.status, 'accepted'); assert.ok(r.id.length <= 64);
  assert.deepEqual(r.reasoning, ['x']);
  const h = CI.history([r, Object.assign({}, r, { id: 'b', proposed: Object.assign({}, r.proposed, { date: '2026-11-16' }) }), { type: 'maintenance-update', proposed: {} }]);
  assert.deepEqual(h.map((x) => x.proposed.date), ['2026-11-16', '2026-11-09']);
});
