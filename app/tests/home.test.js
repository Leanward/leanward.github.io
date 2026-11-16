/* M7a: Home's daily insight (HOM-4), quick log picks (HOM-3) and the data export (ACC-2). */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/home.js');
const D = require('../js/diary.js');
const SY = require('../js/sync.js');

const tg = { protein_g: 180, fiber_g: 30 };
const totals = (protein, fiber, cov) => ({ entries: 3, protein_g: protein, nutrients: { fiber }, coverage: { fiber: cov } });

test('one insight at most, from the small set, in order', () => {
  const base = { today: '2026-11-16', target: tg, lastWeighDate: '2026-11-15', firstUseDate: '2026-11-01' };
  // 6 pm, 90 of 180 g protein (50%): protein first, even though fiber is low too
  const p = H.insight(Object.assign({}, base, { minutes: 18 * 60, totals: totals(90, 5, 1) }));
  assert.equal(p.id, 'protein-low'); assert.match(p.text, /^90 of 180 g so far\. About 90 g to go/);
  // protein fine (120 = 67%), fiber 10 of 30 (33%) with full coverage
  assert.equal(H.insight(Object.assign({}, base, { minutes: 19 * 60, totals: totals(120, 10, 1) })).id, 'fiber-low');
  // fiber low but known for only 30% of calories: not shown
  assert.equal(H.insight(Object.assign({}, base, { minutes: 19 * 60, totals: totals(120, 10, 0.3) })), null);
  // before 6 pm nothing about food; nothing logged yet: nothing either
  assert.equal(H.insight(Object.assign({}, base, { minutes: 17 * 60 + 59, totals: totals(10, 0, 1) })), null);
  assert.equal(H.insight(Object.assign({}, base, { minutes: 20 * 60, totals: { entries: 0, protein_g: 0, nutrients: {}, coverage: {} } })), null);
  // 7 days since the last weigh-in
  const w = H.insight(Object.assign({}, base, { minutes: 9 * 60, totals: totals(0, 0, 1), lastWeighDate: '2026-11-09' }));
  assert.deepEqual([w.id, w.title, w.action.a], ['no-weigh-in', 'No weigh-in for 7 days', 'weigh']);
  assert.equal(H.insight(Object.assign({}, base, { minutes: 9 * 60, totals: totals(0, 0, 1), lastWeighDate: '2026-11-10' })), null);
  // never weighed in: from the third day of use
  assert.equal(H.insight(Object.assign({}, base, { minutes: 9 * 60, totals: totals(0, 0, 1), lastWeighDate: null, firstUseDate: '2026-11-14' })).title, 'Add your first weigh-in');
  assert.equal(H.insight(Object.assign({}, base, { minutes: 9 * 60, totals: totals(0, 0, 1), lastWeighDate: null, firstUseDate: '2026-11-15' })), null);
  for (const x of [p, w]) assert.doesNotMatch(x.title + x.text, /fail|bad|should have|behind/i);
});

test('quick log: most frequent foods for the slot, not ones already logged there today', () => {
  const e = (ref, date, slot, extra) => Object.assign({ id: ref + date + slot, food_ref: ref, food_source: 'usda', name: ref, date, slot, kcal: 100, created_at: date }, extra);
  const list = [e('oats', '2026-11-10', 'breakfast'), e('oats', '2026-11-12', 'breakfast'), e('oats', '2026-11-14', 'breakfast', { qty: 60 }), e('eggs', '2026-11-13', 'breakfast'), e('eggs', '2026-11-15', 'breakfast'),
    e('yogurt', '2026-11-15', 'breakfast'), e('yogurt', '2026-11-11', 'breakfast'), e('yogurt', '2026-11-16', 'breakfast'),   // already logged today
    e('rice', '2026-11-15', 'dinner'), e('old', '2026-10-01', 'breakfast'), e('gone', '2026-11-15', 'breakfast', { deleted: true }),
    Object.assign(D.quickAdd({ kcal: 100, date: '2026-11-15', slot: 'breakfast' }), { food_ref: null })];
  const picks = D.quickPicks(list, 'breakfast', '2026-11-16', 5);
  assert.deepEqual(picks.map((x) => x.food_ref), ['oats', 'eggs']);
  assert.equal(picks[0].qty, 60);   // the most recent amount
  assert.deepEqual(D.quickPicks(list, 'lunch', '2026-11-16'), []);
});

test('export: every synced table, live rows only, as JSON and CSV (ACC-2)', () => {
  const tables = {}; SY.TABLES.forEach((t) => { tables[t] = []; });
  tables.lw_weights = [{ id: 'w1', date: '2026-11-16', kg: 80, note: 'a "quoted", note', rev: 3, dirty: 1, user_id: 'u', deleted: false }, { id: 'w2', date: '2026-11-15', kg: 81, deleted: true }];
  tables.lw_diary_entries = [{ id: 'd1', name: '=SUM(A1)', kcal: 100, nutrients: { fiber: 2 }, date: '2026-11-16' }, { id: 'd2', name: 'Line\nbreak', kcal: 50, protein_g: 5, date: '2026-11-16' }];
  const ex = H.toExport(tables, { version: '0.12.0', exportedAt: '2026-11-16T10:00:00Z', email: 'a@b.c' });
  assert.deepEqual(Object.keys(ex.tables), SY.TABLES.slice().sort());
  assert.deepEqual(ex.tables.lw_weights, [{ id: 'w1', date: '2026-11-16', kg: 80, note: 'a "quoted", note' }]);
  assert.equal(JSON.parse(JSON.stringify(ex)).tables.lw_diary_entries.length, 2);
  // CSV: quotes doubled, commas and line breaks quoted, objects as JSON, formulas defused, missing cells empty
  assert.equal(H.toCsv(tables.lw_weights), 'id,date,kg,note\r\nw1,2026-11-16,80,"a ""quoted"", note"\r\n');
  assert.equal(H.toCsv(tables.lw_diary_entries), 'id,name,kcal,nutrients,date,protein_g\r\nd1,\'=SUM(A1),100,"{""fiber"":2}",2026-11-16,\r\nd2,"Line\nbreak",50,,2026-11-16,5\r\n');
  assert.deepEqual(H.csvFiles(tables).map((f) => f.name), ['leanward-diary_entries.csv', 'leanward-weights.csv']);
});
