/* Audit D7: error reports are capped per hour and purged after 90 days (supabase/schema.sql,
 * lw_errors_guard), on a real throwaway PostgreSQL. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { BIN, withPostgres, SCHEMA } = require('./pg.js');

const A = '00000000-0000-4000-8000-0000000000a1';

test('error reports: 300 an hour signed out, 30 an hour per person, server time, 90-day purge', { skip: BIN ? false : 'PostgreSQL not installed' }, () => {
  withPostgres({ users: [A] }, (db) => {
    db.file('schema.sql', fs.readFileSync(SCHEMA, 'utf8'));
    let r = db.run('schema.sql'); assert.equal(r.status, 0, r.stderr);
    r = db.run('schema.sql'); assert.equal(r.status, 0, 'safe to re-run: ' + r.stderr);
    // 305 signed-out inserts (each its own statement, as the app sends them) and 35 from A, one claiming an old created_at
    const anon = Array.from({ length: 305 }, () => `insert into public.lw_errors (app_version, message) values ('1', 'x');`).join('\n');
    const mine = Array.from({ length: 35 }, (x, i) => `insert into public.lw_errors (user_id, app_version, message${i === 0 ? ', created_at' : ''}) values ('${A}', '1', 'y'${i === 0 ? ", now() - interval '2 hours'" : ''});`).join('\n');
    db.file('flood.sql', `reset role; set role anon;\n${anon}\nreset role; set role authenticated; set request.jwt.claim.sub = '${A}';\n${mine}\nreset role;
select (select count(*) from public.lw_errors where user_id is null) || ',' || (select count(*) from public.lw_errors where user_id = '${A}')
  || ',' || (select count(*) from public.lw_errors where created_at < now() - interval '1 hour');`);
    r = db.run('flood.sql'); assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '300,30,0');   // capped; the back-dated report got the server's time
    // a report from 100 days ago is purged when the next one arrives (rows older than 90 days go)
    db.file('purge.sql', `update public.lw_errors set created_at = now() - interval '100 days' where id = (select min(id) from public.lw_errors);
update public.lw_errors set created_at = now() - interval '2 hours' where user_id = '${A}';
set role authenticated; set request.jwt.claim.sub = '${A}';
insert into public.lw_errors (user_id, app_version, message) values ('${A}', '1', 'z');
reset role;
select (select count(*) from public.lw_errors where created_at < now() - interval '90 days') || ',' || (select count(*) from public.lw_errors where user_id = '${A}');`);
    r = db.run('purge.sql'); assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '0,31');   // the old row is gone; A's earlier 30 moved out of the hour, so the new one is kept
    // nobody but the database can run the guard function directly
    db.file('call.sql', `set role authenticated; select public.lw_errors_guard();`);
    assert.notEqual(db.run('call.sql').status, 0);
  });
});
