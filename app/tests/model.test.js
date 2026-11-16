/* M3 model (js/model.js): onboarding answers → rows, current phase and targets, new phases (PHS-2/3)
 * and edited targets (PHS-5). The numbers themselves are tested in the calc tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');

const alex = { units: 'us', dob: '1995-06-15', sex: 'male', cm: 180, kg: 80, activity: 'moderate', trainingPerWeek: 4, goal: 'lose-fat', phase: 'cut', rate: 0.5, foodPrefs: ['Halal'] };
const rows = (r, t) => r.rows.filter((x) => x[0] === t).map((x) => x[1]);

test('onboarding saves a profile, the first weigh-in, a goal, a phase and its targets', () => {
  const r = M.setup(alex, '2026-11-03', '2026-11-03T07:00:00Z');
  const [prof] = rows(r, 'lw_profiles'), [w] = rows(r, 'lw_weights'), [g] = rows(r, 'lw_goals'), [ph] = rows(r, 'lw_phases'), [ts] = rows(r, 'lw_target_sets');
  assert.equal(prof.id, 'me'); assert.equal(prof.sex, 'male'); assert.deepEqual(prof.preferences, { foodPrefs: ['Halal'] });
  assert.equal(w.kg, 80); assert.equal(w.date, '2026-11-03');
  assert.equal(g.type, 'lose-fat');
  assert.equal(ph.goal_id, g.id); assert.equal(ph.type, 'cut'); assert.equal(ph.rate, 0.5);
  assert.equal(ph.planned_end, '2027-01-25');          // 12 weeks: 2026-11-03 + 83 days
  assert.equal(ts.phase_id, ph.id); assert.equal(ts.origin, 'calculated');
  assert.deepEqual([ts.kcal, ts.protein_g, ts.fat_g, ts.carbs_g, ts.fiber_g], [2310, 176, 69, 246, 32]);   // as in the calc tests
  assert.equal(ts.calc_version, '1.0.0');
  assert.ok(ts.calc_inputs.steps.length > 5, 'the working is saved with the targets');
  assert.equal(rows(r, 'lw_measurements').length, 0);
});

test('optional waist and body fat are saved as their own entries', () => {
  const r = M.setup(Object.assign({ waistCm: 86, bodyFatPct: 18, bodyFatSource: 'dexa', useBodyFat: true }, alex), '2026-11-03', '2026-11-03T07:00:00Z');
  assert.equal(rows(r, 'lw_measurements')[0].cm, 86);
  assert.equal(rows(r, 'lw_body_fat')[0].method, 'dexa');
  assert.equal(r.preview.plan.bmrMethod, 'katch');      // trusted body fat → Katch-McArdle
  // A guessed body fat isn't used for BMR, even if asked.
  assert.equal(M.setup(Object.assign({ bodyFatPct: 18, bodyFatSource: 'guess', useBodyFat: true }, alex), '2026-11-03', 'x').preview.plan.bmrMethod, 'mifflin');
});

test('edited targets: held at the floor, warned, and marked manual', () => {
  const pv = M.preview(M.profileOf(alex), { phase: 'cut', rate: 0.5 }, '2026-11-03', { kcal: 1500, proteinG: 50, fatG: 30 });
  assert.equal(pv.origin, 'manual');
  assert.equal(pv.final.kcal, 1780);                    // floor 1,775 → rounded up to 1,780
  assert.deepEqual(pv.warnings.map((w) => w.id), ['below-floor', 'protein-below-rda', 'fat-below-20pct']);
  // carbs = (1780 − 200 − 270) ÷ 4 = 327.5 → 328; fiber 14 × 1.78 = 24.9 → 25
  assert.equal(pv.final.carbsG, 328); assert.equal(pv.final.fiberG, 25);
  // Typing the calculated numbers back in counts as calculated.
  assert.equal(M.preview(M.profileOf(alex), { phase: 'cut', rate: 0.5 }, '2026-11-03', { kcal: 2310 }).origin, 'calculated');
});

test('goal options follow the safety rules', () => {
  const opts = M.goalOptions(M.profileOf(Object.assign({}, alex, { kg: 50, cm: 170 })), { bmr: 1500, tdee: 2000 });   // BMI 17.3
  assert.equal(opts.find((g) => g.id === 'lose-fat').available, false);
  const preg = M.goalOptions(M.profileOf(Object.assign({}, alex, { sex: 'female', pregnantOrBreastfeeding: true })), { bmr: 1400, tdee: 2000 });
  assert.deepEqual(preg.filter((g) => g.available).map((g) => g.id), ['maintain', 'nutrition']);
});

test('current phase and the targets in effect on a date', () => {
  const sets = [
    { id: 'a', phase_id: 'p1', effective_from: '2026-11-01', kcal: 2300 },
    { id: 'b', phase_id: 'p1', effective_from: '2026-11-10', kcal: 2200 },
    { id: 'c', phase_id: 'p1', effective_from: '2026-11-20', kcal: 2100, deleted: true },
    { id: 'd', phase_id: 'p0', effective_from: '2026-11-15', kcal: 3000 }
  ];
  assert.equal(M.targetsOn(sets, 'p1', '2026-11-05').id, 'a');
  assert.equal(M.targetsOn(sets, 'p1', '2026-11-10').id, 'b');
  assert.equal(M.targetsOn(sets, 'p1', '2026-11-25').id, 'b');
  assert.equal(M.targetsOn(sets, 'p1', '2026-10-31'), null);
  const phases = [{ id: 'p0', start_date: '2026-09-01', end_date: '2026-10-31' }, { id: 'p1', start_date: '2026-11-01', end_date: null }];
  assert.equal(M.currentPhase(phases).id, 'p1');
  assert.equal(M.dayOf({ start_date: '2026-11-01', planned_end: '2027-01-23' }, '2026-11-23').label, 'Day 23 of ~84');
  assert.equal(M.dayOf({ start_date: '2026-11-01', planned_end: null }, '2026-11-05').label, 'Day 5');
});

test('starting a new phase closes the old one and keeps the goal if it is the same', () => {
  const s = M.setup(alex, '2026-09-01', 'x');
  const [goal] = rows(s, 'lw_goals'), [phase] = rows(s, 'lw_phases');
  const r = M.startPhase({ today: '2026-11-03', profile: M.profileOf(alex), currentPhase: phase, currentGoal: goal, goal: 'lose-fat', phase: 'maintenance' });
  const ph = rows(r, 'lw_phases');
  assert.equal(ph[0].id, phase.id); assert.equal(ph[0].end_date, '2026-11-02');
  assert.equal(ph[1].type, 'maintenance'); assert.equal(ph[1].goal_id, goal.id); assert.equal(ph[1].planned_end, null);
  assert.equal(rows(r, 'lw_goals').length, 0, 'same goal: nothing new');
  assert.equal(rows(r, 'lw_target_sets')[0].phase_id, ph[1].id);
});

test('changing the goal ends the old goal and starts a new one; history is kept', () => {
  const s = M.setup(alex, '2026-09-01', 'x');
  const r = M.startPhase({ today: '2026-11-03', profile: M.profileOf(alex), currentPhase: rows(s, 'lw_phases')[0], currentGoal: rows(s, 'lw_goals')[0], goal: 'build-muscle', phase: 'bulk', rate: 0.25 });
  const g = rows(r, 'lw_goals');
  assert.equal(g[0].ended_on, '2026-11-02'); assert.equal(g[1].type, 'build-muscle');
  assert.equal(rows(r, 'lw_phases')[1].goal_id, g[1].id);
  assert.ok(r.rows.every(([, rec]) => !rec.deleted), 'nothing is deleted (PHS-3)');
});

test('a phase started and replaced on the same day ends that day (end ≥ start)', () => {
  const s = M.setup(alex, '2026-11-03', 'x');
  const r = M.startPhase({ today: '2026-11-03', profile: M.profileOf(alex), currentPhase: rows(s, 'lw_phases')[0], currentGoal: rows(s, 'lw_goals')[0], goal: 'lose-fat', phase: 'cut', rate: 0.25 });
  assert.equal(rows(r, 'lw_phases')[0].end_date, '2026-11-03');
});

test('editing targets mid-phase makes a new version from a date', () => {
  const s = M.setup(alex, '2026-11-01', 'x');
  const phase = rows(s, 'lw_phases')[0];
  const r = M.editTargets({ phase, profile: M.profileOf(alex), from: '2026-11-04', manual: { kcal: 2200, proteinG: 180, fatG: 65 } });
  const [ts] = rows(r, 'lw_target_sets');
  assert.equal(ts.effective_from, '2026-11-04'); assert.equal(ts.origin, 'manual'); assert.equal(ts.kcal, 2200);
  assert.equal(ts.calc_inputs.calculated.kcal, 2310, 'the calculated numbers are kept for reference');
  const all = rows(s, 'lw_target_sets').concat([ts]);
  assert.equal(M.targetsOn(all, phase.id, '2026-11-03').kcal, 2310, 'past days keep their targets');
  assert.equal(M.targetsOn(all, phase.id, '2026-11-04').kcal, 2200);
});

test('profile from saved rows uses the latest weigh-in', () => {
  const p = M.profileFromRows({ dob: '1995-06-15', sex: 'male', height_cm: '180.0', activity: 'moderate', body_fat_pct: null, use_body_fat: false, pregnant_or_breastfeeding: false },
    [{ measured_at: '2026-11-01T07:00:00Z', kg: '81.0' }, { measured_at: '2026-11-03T07:00:00Z', kg: '80.2' }]);
  assert.equal(p.kg, 80.2); assert.equal(p.cm, 180);
});

test('ids are UUIDs', () => {
  assert.match(M.newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('ONB-10: known numbers drive the targets and are saved with the profile', () => {
  // Known maintenance 2,200; a 0.5% cut wants −440 → 1,760, below the 1,775 floor → 1,780
  const r = M.setup(Object.assign({ knownTdee: 2200, knownTdeeSource: 'tracking' }, alex), '2026-11-03', 'x');
  const [prof] = rows(r, 'lw_profiles'), [ts] = rows(r, 'lw_target_sets');
  assert.deepEqual([prof.known_tdee_kcal, prof.known_tdee_source, prof.known_bmr_kcal], [2200, 'tracking', null]);
  assert.equal(ts.kcal, 1780);
  assert.equal(ts.calc_inputs.energySource, 'known-tdee');
  assert.deepEqual([ts.calc_inputs.tdee, ts.calc_inputs.formulaTdee], [2200, 2751]);
  // A known maintenance wins over a measured BMR if both are somehow given.
  const both = M.profileOf(Object.assign({ knownTdee: 2200, knownBmr: 1650 }, alex));
  assert.equal(both.knownBmr, undefined);
  // And they come back from saved rows.
  const back = M.profileFromRows(Object.assign({ known_tdee_kcal: 2200, known_tdee_source: 'tracking', height_cm: 180 }, { dob: alex.dob, sex: 'male', activity: 'moderate' }), [{ measured_at: 't', kg: 80 }]);
  assert.equal(back.knownTdee, 2200);
});

test('two target versions starting the same day: the newer one is in effect', () => {
  const s = M.setup(alex, '2026-11-03', '2026-11-03T07:00:00.000Z');
  const phase = rows(s, 'lw_phases')[0];
  const r = M.editTargets({ now: '2026-11-03T09:00:00.000Z', phase, profile: M.profileOf(alex), from: '2026-11-03', manual: { kcal: 2200, proteinG: 176, fatG: 69 } });
  const all = rows(s, 'lw_target_sets').concat(rows(r, 'lw_target_sets'));
  assert.equal(M.targetsOn(all, phase.id, '2026-11-03').kcal, 2200);
  assert.equal(M.targetsOn(all.slice().reverse(), phase.id, '2026-11-03').kcal, 2200, 'order in storage does not matter');
});

test('Home, Diary and the Phase tab use the same targets for today', () => {
  const M2 = require('../js/model.js');
  const set = (id, phase, from, kcal, created) => ({ id, phase_id: phase, effective_from: from, kcal, created_at: created });
  // Two open phases that start on the same day (set up on two devices): the newer one is current everywhere.
  const phases = [{ id: 'p-old', start_date: '2026-11-03', created_at: '2026-11-03T10:00:00Z' }, { id: 'p-new', start_date: '2026-11-03', created_at: '2026-11-03T12:00:00Z' }];
  const sets = [set('s1', 'p-old', '2026-11-03', 2200, 'a'), set('s2', 'p-new', '2026-11-03', 2750, 'b'), set('s3', 'p-new', '2026-11-03', 1900, 'c')];
  assert.equal(M2.currentPhase(phases).id, 'p-new');
  assert.equal(M2.targetsFor(phases, sets, '2026-11-16', '2026-11-16').kcal, 1900);
  assert.equal(M2.targetsFor(phases.slice().reverse(), sets, '2026-11-10', '2026-11-16').kcal, 1900);
  // An ended phase still answers for its own days; today falls back to the phase's first set when none has started.
  const hist = [{ id: 'a', start_date: '2026-10-01', end_date: '2026-11-02', created_at: '1' }, { id: 'b', start_date: '2026-11-03', created_at: '2' }];
  const hs = [set('x', 'a', '2026-10-01', 2500, '1'), set('y', 'b', '2026-11-20', 2000, '2')];
  assert.equal(M2.targetsFor(hist, hs, '2026-10-15', '2026-11-16').kcal, 2500);
  assert.equal(M2.targetsFor(hist, hs, '2026-11-16', '2026-11-16').kcal, 2000);
  assert.equal(M2.targetsFor(hist, hs, '2026-11-10', '2026-11-16'), null);
  assert.equal(M2.targetsFor([], [], '2026-11-16', '2026-11-16'), null);
});
