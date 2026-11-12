/* M6a: weigh-ins, circumferences and chart data (js/measure.js). Arithmetic is worked in the comments. */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/measure.js');
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test('a weigh-in is stored in kg with the local day and time (MEA-1)', () => {
  // 176.4 lb × 0.45359237 = 80.0137 → 80.01 kg
  const r = M.weightRow({ value: '176.4', units: 'us', date: '2026-11-12', time: '07:10', note: ' after run ', today: '2026-11-12' });
  assert.deepEqual([r.kg, r.date, r.source, r.note], [80.01, '2026-11-12', 'manual', 'after run']);
  assert.equal(new Date(r.measured_at).getTime(), new Date('2026-11-12T07:10:00').getTime());
  assert.equal(M.weightRow({ value: 80, units: 'metric', date: '2026-11-12', id: 'w1' }).id, 'w1');
  assert.throws(() => M.weightRow({ value: '', units: 'us', date: '2026-11-12' }), /Enter your weight/);
  assert.throws(() => M.weightRow({ value: 20, units: 'us', date: '2026-11-12' }), /looks off/);          // 9 kg
  assert.throws(() => M.weightRow({ value: 80, units: 'metric', date: '2026-11-13', today: '2026-11-12' }), /hasn't happened/);
});

test('a circumference is stored in cm (MEA-3)', () => {
  // 34 in × 2.54 = 86.36 → 86.4 cm
  const r = M.measurementRow({ site: 'waist', value: 34, units: 'us', date: '2026-11-12', today: '2026-11-12' });
  assert.deepEqual([r.site, r.cm, r.date], ['waist', 86.4, '2026-11-12']);
  assert.throws(() => M.measurementRow({ site: 'wrist', value: 10, units: 'metric', date: '2026-11-12' }), /what you measured/);
  assert.throws(() => M.measurementRow({ site: 'waist', value: 3, units: 'us', date: '2026-11-12' }), /looks off/);   // 7.6 cm
  assert.deepEqual(M.SITES.map((s) => s.id), ['waist', 'hip', 'chest', 'arm', 'thigh', 'neck']);
  assert.ok(M.SITES.every((s) => s.how.length > 20), 'how-to-measure guidance for every site');
});

test('ranges: 4 weeks, 12 weeks, 6 months, all (PRG-1)', () => {
  assert.equal(M.rangeStart('4w', '2026-11-12'), '2026-10-16');     // 28 days including today
  assert.equal(M.rangeStart('12w', '2026-11-12'), '2026-08-21');
  assert.equal(M.rangeStart('6m', '2026-11-12'), '2026-05-15');
  assert.equal(M.rangeStart('all', '2026-11-12', '2026-01-03'), '2026-01-03');
  assert.equal(M.rangeStart('all', '2026-11-12', null), '2026-10-16');
});

test('weight view: first weigh-in of the day, trend on all history, display units (MEA-2)', () => {
  const w = (date, kg, time, extra) => Object.assign({ date, kg, measured_at: date + 'T' + time + ':00Z' }, extra);
  const rows = [w('2026-11-01', 80, '07:00'), w('2026-11-02', 79, '07:00'), w('2026-11-02', 81, '19:00'), w('2026-11-04', 79.5, '07:00'), w('2026-11-03', 70, '07:00', { deleted: true })];
  const v = M.weightView(rows, 'metric', '2026-11-02', '2026-11-05');
  // trend: 80 → 80 + 0.1 × (79 − 80) = 79.9 → (no weigh-in on the 3rd) 79.9 → 79.9 + 0.1 × (79.5 − 79.9) = 79.86 → 79.86
  assert.deepEqual(v.dots, [{ date: '2026-11-02', v: 79 }, { date: '2026-11-04', v: 79.5 }]);
  assert.deepEqual(v.trend.map((p) => p.date), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  close(v.trend[0].v, 79.9); close(v.trend[3].v, 79.86);
  assert.deepEqual([v.latest.date, v.latest.v, v.first, v.rate], ['2026-11-04', 79.5, '2026-11-01', null]);
  close(v.latest.trend, 79.86);
  // weekly averages, newest first: week of Mon 2 Nov = (79 + 79.5) / 2 = 79.25; week of Mon 26 Oct = 80
  assert.deepEqual(v.weeks.map((x) => [x.weekStart, x.avg, x.count]), [['2026-11-02', 79.25, 2], ['2026-10-26', 80, 1]]);
  // pounds: 79.5 kg = 175.27 lb
  close(M.weightView(rows, 'us', '2026-11-02', '2026-11-05').latest.v, 175.2674, 1e-3);
  assert.equal(M.weightView([], 'us', '2026-11-02', '2026-11-05').latest, null);
});

test('waist view: one point a day, change over the range', () => {
  const rows = [{ site: 'waist', date: '2026-10-01', cm: 90, created_at: '1' }, { site: 'waist', date: '2026-11-01', cm: 89, created_at: '2' },
    { site: 'waist', date: '2026-11-10', cm: 88.5, created_at: '3' }, { site: 'waist', date: '2026-11-10', cm: 88, created_at: '4' }, { site: 'hip', date: '2026-11-10', cm: 100, created_at: '5' }];
  const v = M.siteView(rows, 'waist', 'metric', '2026-10-16', '2026-11-12');
  assert.deepEqual(v.points, [{ date: '2026-11-01', v: 89 }, { date: '2026-11-10', v: 88 }]);   // the later entry of the 10th wins
  assert.equal(v.change, -1); assert.equal(v.all.length, 3);
  close(M.siteView(rows, 'waist', 'us', '2026-10-16', '2026-11-12').points[0].v, 89 / 2.54);
});

test('intake view: logged days only, against each day\'s target (PRG-1)', () => {
  const diary = [{ date: '2026-11-10', kcal: 1200, protein_g: 80 }, { date: '2026-11-10', kcal: 900, protein_g: 70 }, { date: '2026-11-12', kcal: 2300, protein_g: null },
    { date: '2026-11-11', kcal: 500, protein_g: 10, deleted: true }, { date: '2026-10-01', kcal: 9999, protein_g: 1 }];
  const v = M.intakeView(diary, '2026-11-01', '2026-11-12', (d) => (d < '2026-11-12' ? { kcal: 2310, protein_g: 176 } : { kcal: 2200, protein_g: 170 }));
  assert.deepEqual(v.days.map((d) => [d.date, d.kcal, d.protein, d.kcalTarget]), [['2026-11-10', 2100, 150, 2310], ['2026-11-12', 2300, 0, 2200]]);
  // averages over the 2 logged days: (2100 + 2300) / 2 = 2200 kcal; targets (2310 + 2200) / 2 = 2255
  assert.deepEqual([v.logged, v.avgKcal, v.avgProtein, v.avgKcalTarget, v.avgProteinTarget], [2, 2200, 75, 2255, 173]);
  assert.equal(M.intakeView([], '2026-11-01', '2026-11-12', null).avgKcal, null);
});

test('chart scale: dates across the width, values padded top and bottom', () => {
  const box = { w: 340, h: 160, pad: { l: 40, r: 10, t: 10, b: 20 } };
  const s = M.scale([[{ date: '2026-11-01', v: 80 }, { date: '2026-11-11', v: 78 }]], '2026-11-01', '2026-11-11', box);
  // span 2 → padding 0.24 each side: 77.76 to 80.24
  close(s.min, 77.76); close(s.max, 80.24);
  assert.equal(s.x('2026-11-01'), 40); assert.equal(s.x('2026-11-11'), 330); assert.equal(s.x('2026-11-06'), 185);
  close(s.y(80.24), 10); close(s.y(77.76), 140);
  // one flat value still gets room
  const flat = M.scale([[{ date: '2026-11-01', v: 80 }]], '2026-11-01', '2026-11-11', box);
  assert.ok(flat.max > 80 && flat.min < 80);
});

test('spoken summary for the weight chart (§9)', () => {
  const rows = []; for (let i = 0; i < 20; i++) rows.push({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, kg: 80 - i * 0.1, measured_at: 'x' });
  const v = M.weightView(rows, 'metric', '2026-11-01', '2026-11-20');
  const s = M.weightSummary(v, 'metric', 'last 4 weeks');
  assert.match(s, /^Weight, last 4 weeks\. 20 weigh-ins\. Latest 78\.1 kg on 2026-11-20; trend /);
  assert.match(s, /Last 14 days: [−-]0\.\d\d kg a week\./);
  assert.equal(M.weightSummary(M.weightView([], 'us', 'a', 'b'), 'us', 'x'), 'No weigh-ins yet.');
});
