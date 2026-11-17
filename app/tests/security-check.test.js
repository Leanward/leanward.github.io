/* The live security check (supabase/security-check.sql) on a throwaway PostgreSQL: all PASS against
 * schema.sql, FAIL when a rule is broken on purpose, and it leaves no trace of its tries. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { BIN, withPostgres, SCHEMA } = require('./pg.js');

const A = '00000000-0000-4000-8000-0000000000a1';
const CHECK = path.join(__dirname, '..', 'supabase', 'security-check.sql');
const rows = (out) => out.trim().split('\n').filter(Boolean).map((l) => l.split('|'));

test('live security check: all PASS on the real rules, FAIL on a broken one, nothing left behind', { skip: BIN ? false : 'PostgreSQL not installed' }, () => {
  withPostgres({ users: [A] }, (db) => {
    db.file('schema.sql', fs.readFileSync(SCHEMA, 'utf8'));
    let r = db.run('schema.sql'); assert.equal(r.status, 0, r.stderr);
    db.file('seed.sql', `insert into public.lw_profiles (user_id, id) values ('${A}', 'me');
insert into public.lw_weights (user_id, id, measured_at, date, kg) values ('${A}', 'w1', now(), current_date, 80);
insert into public.lw_diary_entries (user_id, id, date, slot, food_source, name, kcal, logged_via) values ('${A}', 'd1', current_date, 'lunch', 'quick', 'x', 100, 'quick');`);
    assert.equal(db.run('seed.sql').status, 0);
    db.file('check.sql', fs.readFileSync(CHECK, 'utf8'));
    r = db.run('check.sql'); assert.equal(r.status, 0, r.stderr);
    const ok = rows(r.stdout);
    assert.equal(ok.length, 14);
    assert.deepEqual(ok.filter((x) => x[3] !== 'PASS'), [], 'every check passes');
    assert.deepEqual(ok[0], ['A has rows to protect', 'more than 0', '3', 'PASS']);
    // nothing left behind: still 3 rows, no probe rows, A's rows not touched
    db.file('after.sql', `select (select count(*) from public.lw_weights) + (select count(*) from public.lw_diary_entries) + (select count(*) from public.lw_profiles) || ',' || (select count(*) from public.lw_weights where id = 'lw-probe');`);
    assert.equal(db.run('after.sql').stdout.trim(), '3,0');
    // break a rule on purpose: anyone signed in can read weights, and a definer function appears
    db.file('break.sql', `create policy "oops" on public.lw_weights for select to authenticated using (true);
create function public.lw_oops() returns int language sql security definer as 'select 1';`);
    assert.equal(db.run('break.sql').status, 0);
    const bad = rows(db.run('check.sql').stdout);
    const failed = bad.filter((x) => x[3] === 'FAIL').map((x) => x[0]);
    assert.deepEqual(failed, ["Stranger B reads A's rows", 'Exactly the 3 own-rows rules on each table', 'Functions that run with extra rights']);
  });
});
