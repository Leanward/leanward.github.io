/* Beta metrics view (supabase/schema.sql, lw_metrics; PRD §13, ACC-3) on a real throwaway PostgreSQL:
 * the counts are right, it holds counts only, and the app's roles can't read it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { BIN, withPostgres, SCHEMA } = require('./pg.js');

const U = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c3'];

test('lw_metrics: retention, logging and weigh-in counts; owner only', { skip: BIN ? false : 'PostgreSQL not installed' }, () => {
  withPostgres({ users: U }, (db) => {
    db.file('schema.sql', fs.readFileSync(SCHEMA, 'utf8'));
    assert.equal(db.run('schema.sql').status, 0);
    const entry = (u, id, daysAgo, slot, via) => `insert into public.lw_diary_entries (user_id, id, date, slot, food_source, name, kcal, logged_via) values ('${u}', '${id}', current_date - ${daysAgo}, '${slot}', 'usda', 'Food', 100, '${via}');`;
    const weigh = (u, id, daysAgo) => `insert into public.lw_weights (user_id, id, measured_at, date, kg) values ('${u}', '${id}', now(), current_date - ${daysAgo}, 80);`;
    db.file('seed.sql', [
      // A joined 40 days ago, in a cut: active on day 8 and day 31 after joining, and this week.
      `insert into public.lw_profiles (user_id, id, created_at) values ('${U[0]}', 'me', now() - interval '40 days');`,
      `insert into public.lw_phases (user_id, id, type, start_date, calc_version) values ('${U[0]}', 'p', 'cut', current_date - 40, '1');`,
      entry(U[0], 'a1', 32, 'lunch', 'search'), entry(U[0], 'a2', 9, 'lunch', 'barcode'),
      entry(U[0], 'a3', 1, 'breakfast', 'recent'), entry(U[0], 'a4', 1, 'dinner', 'search'), entry(U[0], 'a5', 1, 'dinner', 'search'),
      entry(U[0], 'a6', 3, 'lunch', 'quick'),
      weigh(U[0], 'w1', 1), weigh(U[0], 'w2', 2), weigh(U[0], 'w3', 3), weigh(U[0], 'w4', 4), weigh(U[0], 'w5', 10), weigh(U[0], 'w6', 12), weigh(U[0], 'w7', 20), weigh(U[0], 'w8', 26),
      // B joined 20 days ago, maintenance: nothing after the first two days.
      `insert into public.lw_profiles (user_id, id, created_at) values ('${U[1]}', 'me', now() - interval '20 days');`,
      `insert into public.lw_phases (user_id, id, type, start_date, calc_version) values ('${U[1]}', 'p', 'maintenance', current_date - 20, '1');`,
      entry(U[1], 'b1', 19, 'lunch', 'search'),
      // C joined 3 days ago: too new for the retention counts; one deleted entry is ignored.
      `insert into public.lw_profiles (user_id, id, created_at) values ('${U[2]}', 'me', now() - interval '3 days');`,
      entry(U[2], 'c1', 2, 'snacks', 'meal'),
      `insert into public.lw_diary_entries (user_id, id, date, slot, food_source, name, kcal, logged_via, deleted) values ('${U[2]}', 'c2', current_date, 'lunch', 'usda', 'X', 1, 'search', true);`,
      `insert into public.lw_food_reports (user_id, id, food_source, food_ref, issue) values ('${U[0]}', 'r1', 'usda', 'usda:1', 'other');`
    ].join('\n'));
    const s = db.run('seed.sql'); assert.equal(s.status, 0, s.stderr);
    db.file('q.sql', `select row_to_json(m) from public.lw_metrics m;
set role authenticated; set request.jwt.claim.sub = '${U[0]}';
do $t$ begin
  begin perform 1 from public.lw_metrics; raise exception 'FAIL app role can read metrics';
  exception when insufficient_privilege then raise notice 'ok: authenticated cannot read'; end;
end $t$;
reset role; set role anon;
do $t$ begin
  begin perform 1 from public.lw_metrics; raise exception 'FAIL anon can read metrics';
  exception when insufficient_privilege then raise notice 'ok: anon cannot read'; end;
end $t$;`);
    const r = db.run('q.sql'); assert.equal(r.status, 0, r.stderr);
    const m = JSON.parse(r.stdout.split('\n').find((l) => l.startsWith('{')));
    // users 3; active in the last 7 days: A and C
    // day-7: A and B set up 14+ days ago; A was active on day 8 (31 days ago = joined + 9) → kept 1 of 2
    // day-30: only A (40 days ago); active 9 days ago = day 31 → kept 1 of 1
    // last 28 days: A logged on 3 days (9, 3, 1 days ago), B on 1, C on 1 = 5 person-days; 2+ meals only A yesterday
    // A (the only cut) weighed in on 8 days in 28 → 2.0 a week
    // entries in 28 days: A 5 + B 1 + C 1 = 7; reports: 1 per 8 entries all time = 125.0 per 1,000
    assert.deepEqual(m, { users: 3, active_7d: 2, d7_eligible: 2, d7_kept: 1, d30_eligible: 1, d30_kept: 1, logged_days_28d: 5, two_meal_days_28d: 1,
      weighins_per_week_28d: 2.0, entries_28d: 7, via_search: 3, via_recent: 1, via_barcode: 1, via_quick: 1, via_meal: 1, via_copy: 0, reports_per_1000: 125.0 });
    assert.equal((r.stderr.match(/ok:/g) || []).length, 2, r.stderr);
  });
});
