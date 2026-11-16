/* ACC-1: deleting an account removes every Leanward row for that person and nobody else's
 * (supabase/schema.sql, lw_delete_account), on a real throwaway PostgreSQL. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { BIN, withPostgres, SCHEMA } = require('./pg.js');
const SY = require('../js/sync.js');

const A = '00000000-0000-4000-8000-0000000000a1', B = '00000000-0000-4000-8000-0000000000b2';

test('delete my account: all my rows go, others stay, and only the signed-in person can call it', { skip: BIN ? false : 'PostgreSQL not installed' }, () => {
  withPostgres({ users: [A, B] }, (db) => {
    db.file('schema.sql', fs.readFileSync(SCHEMA, 'utf8'));
    assert.equal(db.run('schema.sql').status, 0);
    // Every table that holds a person's data has a user_id that cascades from auth.users.
    db.file('fk.sql', `select coalesce(string_agg(c.relname, ',' order by c.relname), '-') from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'lw\\_%' and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped)
        and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.confdeltype = 'c');`);
    const fk = db.run('fk.sql');
    assert.equal(fk.stdout.trim(), 'lw_errors', 'only lw_errors lacks the cascade, and the function clears it by hand');

    const seed = (u, tag) => `set request.jwt.claim.sub = '${u}';
insert into public.lw_profiles (user_id, id) values ('${u}', 'me');
insert into public.lw_weights (user_id, id, measured_at, date, kg) values ('${u}', 'w-${tag}', now(), current_date, 80);
insert into public.lw_diary_entries (user_id, id, date, slot, food_source, name, kcal, logged_via) values ('${u}', 'd-${tag}', current_date, 'lunch', 'quick', 'x', 100, 'quick');
insert into public.lw_measurements (user_id, id, date, site, cm) values ('${u}', 'm-${tag}', current_date, 'waist', 90);
insert into public.lw_recommendations (user_id, id, type, proposed) values ('${u}', 'r-${tag}', 'maintenance-update', '{}');
insert into public.lw_errors (user_id, app_version, message) values ('${u}', '1', 'boom');`;
    db.file('seed.sql', seed(A, 'a') + '\n' + seed(B, 'b'));
    const s = db.run('seed.sql'); assert.equal(s.status, 0, s.stderr);

    const count = (u) => SY.TABLES.concat(['lw_errors']).map((t) => `(select count(*) from public.${t} where user_id = '${u}')`).join(' + ');
    db.file('run.sql', `
-- signed out: refused
set role anon;
do $t$ begin
  begin perform public.lw_delete_account(); raise exception 'FAIL anon could call it';
  exception when insufficient_privilege then raise notice 'ok: anon cannot call'; end;
end $t$;
reset role;
-- A deletes their own account
set role authenticated; set request.jwt.claim.sub = '${A}';
select public.lw_delete_account();
reset role;
select 'A rows left: ' || (${count(A)});
select 'B rows left: ' || (${count(B)});
select 'A sign-in left: ' || (select count(*) from auth.users where id = '${A}');
select 'B sign-in left: ' || (select count(*) from auth.users where id = '${B}');
-- with no sign-in at all, it refuses
set role authenticated; set request.jwt.claim.sub = '';
do $t$ begin
  begin perform public.lw_delete_account(); raise exception 'FAIL ran with no user';
  exception when invalid_authorization_specification then raise notice 'ok: needs a signed-in user'; end;
end $t$;`);
    const r = db.run('run.sql');
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout.split('\n').filter((l) => / left: /.test(l));
    assert.deepEqual(out, ['A rows left: 0', 'B rows left: 6', 'A sign-in left: 0', 'B sign-in left: 1']);
    assert.equal((r.stderr.match(/ok:/g) || []).length, 2, r.stderr);
  });
});
