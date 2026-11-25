/* ACC-5 reminders, server side (supabase/schema.sql): which reminders are due, the skip rules, the
 * 14-day pause, no double sends, and who may call what — on a real throwaway PostgreSQL.
 * The check-in reminder is cross-checked against js/checkin.js, so the two can't drift apart. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { BIN, withPostgres, SCHEMA } = require('./pg.js');
const CI = require('../js/checkin.js');
const core = require('../js/calc/core.js');

const skip = BIN ? false : 'PostgreSQL not installed';
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = uid(1), B = uid(2);
const KEY = 'B' + 'x'.repeat(86), AUTH = 'a'.repeat(22);

function setup(db, users) {
  db.file('schema.sql', fs.readFileSync(SCHEMA, 'utf8'));
  const r = db.run('schema.sql'); assert.equal(r.status, 0, r.stderr);
}
function sql(db, name, text) {
  db.file(name, text);
  const r = db.run(name); assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
// A person with a phone in tz, seen at `seen`, with these reminder settings and other preferences.
const person = (u, tz, reminders, extra, seen) => `
insert into public.lw_profiles (user_id, id, preferences) values ('${u}', 'me', '${JSON.stringify(Object.assign({ reminders }, extra || {}))}'::jsonb);
insert into public.lw_push_subscriptions (user_id, endpoint, p256dh, auth, tz, last_seen)
  values ('${u}', 'https://push.example/${u}', '${KEY}', '${AUTH}', '${tz}', ${seen || "'2026-11-25 12:00Z'"});`;
const due = (db, at) => JSON.parse(sql(db, 'due.sql', `select coalesce(json_agg(json_build_object('u', right(user_id::text, 2), 'k', kind, 'd', local_date) order by user_id, kind), '[]') from public.lw_reminders_due('${at}'::timestamptz);`));

test('log and weigh-in reminders: on time, in local time, with the skip rules', { skip }, () => {
  const users = [1, 2, 3, 4, 5, 6].map(uid);
  withPostgres({ users }, (db) => {
    setup(db);
    sql(db, 'seed.sql', [
      person(uid(1), 'America/New_York', { log: { on: true, time: '20:00' }, weigh: { on: true, time: '07:30', days: [3] } }),
      person(uid(2), 'Europe/London', { log: { on: true, time: '20:00' } }),                 // same moment is 1:05 am there
      person(uid(3), 'America/New_York', { log: { on: true } }),                               // default 8:00 pm
      person(uid(4), 'America/New_York', { log: { on: true, time: '20:00' } }),                // logged 2 h before: skipped
      person(uid(5), 'America/New_York', { log: { on: false, time: '20:00' }, weigh: { on: true } }),
      person(uid(6), 'America/New_York', { log: { on: true, time: '20:00' } }, null, "'2026-11-10 12:00Z'"),  // away 15 days
      `insert into public.lw_diary_entries (user_id, id, date, slot, food_source, name, kcal, logged_via, created_at)
         values ('${uid(4)}', 'd4', '2026-11-25', 'lunch', 'quick', 'x', 100, 'quick', '2026-11-25 18:05-05'),
                ('${uid(1)}', 'd1', '2026-11-25', 'lunch', 'quick', 'x', 100, 'quick', '2026-11-25 16:00-05');`
    ].join('\n'));

    // 8:05 pm in New York on Wednesday 25 Nov 2026.
    assert.deepEqual(due(db, '2026-11-25 20:05-05'), [
      { u: '01', k: 'log', d: '2026-11-25' }, { u: '03', k: 'log', d: '2026-11-25' }]);
    // Before the time, and 30+ minutes after it: nothing.
    assert.deepEqual(due(db, '2026-11-25 19:55-05'), []);
    assert.deepEqual(due(db, '2026-11-25 20:30-05'), []);
    // A log at 6:30 pm (in the 3 hours before) skips it.
    sql(db, 'log.sql', `insert into public.lw_diary_entries (user_id, id, date, slot, food_source, name, kcal, logged_via, created_at)
       values ('${uid(3)}', 'd3', '2026-11-25', 'dinner', 'quick', 'x', 100, 'quick', '2026-11-25 18:30-05');`);
    assert.deepEqual(due(db, '2026-11-25 20:05-05').map((x) => x.u), ['01']);

    // Weigh-in at 7:30 am on Wednesdays only (user 1); every day by default (user 5).
    assert.deepEqual(due(db, '2026-11-25 07:40-05').map((x) => x.u + x.k), ['01weigh', '05weigh']);
    assert.deepEqual(due(db, '2026-11-26 07:40-05').map((x) => x.u + x.k), ['05weigh']);   // Thursday
    sql(db, 'w.sql', `insert into public.lw_weights (user_id, id, measured_at, date, kg) values ('${uid(5)}', 'w5', '2026-11-26 06:50-05', '2026-11-26', 80);`);
    assert.deepEqual(due(db, '2026-11-26 07:40-05'), [], 'already weighed in today');
    // A deleted weigh-in doesn't count.
    sql(db, 'wd.sql', `update public.lw_weights set deleted = true where id = 'w5';`);
    assert.deepEqual(due(db, '2026-11-26 07:40-05').map((x) => x.u), ['05']);
  });
});

test('claim: records each send once, pauses people away 14 days, and skips paused phones', { skip }, () => {
  withPostgres({ users: [A, B] }, (db) => {
    setup(db);
    sql(db, 'seed.sql', person(A, 'UTC', { log: { on: true, time: '00:00' }, weigh: { on: true, time: '00:00' } }, null, 'now()') + '\n' +
      person(B, 'UTC', { log: { on: true, time: '00:00' } }, null, "now() - interval '15 days'") + `
insert into public.lw_push_subscriptions (user_id, endpoint, p256dh, auth, tz, last_seen) values ('${A}', 'https://push.example/a2', '${KEY}', '${AUTH}', 'UTC', now());`);
    // Times of 00:00 are due from midnight for 30 minutes; to test at any moment, set each time to "now".
    sql(db, 'now.sql', `update public.lw_profiles set preferences = jsonb_set(jsonb_set(preferences, '{reminders,log,time}', to_jsonb(to_char(now() at time zone 'UTC', 'HH24:MI'))), '{reminders,weigh,time}', to_jsonb(to_char(now() at time zone 'UTC', 'HH24:MI')), true);`);
    const claim = () => sql(db, 'claim.sql', `select coalesce(string_agg(kind || ' ' || endpoint, ',' order by kind, endpoint), '-') from public.lw_reminders_claim();`);
    assert.equal(claim(), 'log https://push.example/' + A + ',log https://push.example/a2,weigh https://push.example/' + A + ',weigh https://push.example/a2');
    assert.equal(claim(), '-', 'nothing goes twice the same day');
    assert.equal(sql(db, 'p.sql', `select string_agg(right(user_id::text, 2) || ':' || (paused_at is not null), ',' order by user_id, id) from public.lw_push_subscriptions;`), '01:false,01:false,02:true');
    // B comes back: touch says paused until Resume.
    const touch = sql(db, 't.sql', `set role authenticated; set request.jwt.claim.sub = '${B}';
select public.lw_push_touch('https://push.example/${B}', 'America/Chicago');
select public.lw_push_resume();
select public.lw_push_touch('https://push.example/${B}', 'Not/AZone');
select public.lw_push_touch('https://push.example/unknown', 'UTC');`);
    assert.deepEqual(touch.split('\n').filter(Boolean), ['paused', 'ok', 'missing']);
    assert.equal(sql(db, 'tz.sql', `select tz from public.lw_push_subscriptions where user_id = '${B}';`), 'America/Chicago', 'a bad time zone is ignored');
    // Gone endpoints are forgotten.
    sql(db, 'g.sql', `select public.lw_push_gone(array['https://push.example/a2']);`);
    assert.equal(sql(db, 'n.sql', `select count(*) from public.lw_push_subscriptions where user_id = '${A}';`), '1');
    // Deleting the account removes the phones and the send log.
    sql(db, 'del.sql', `set role authenticated; set request.jwt.claim.sub = '${A}'; select public.lw_delete_account(); reset role;`);
    assert.equal(sql(db, 'n2.sql', `select (select count(*) from public.lw_push_subscriptions where user_id = '${A}') + (select count(*) from public.lw_reminder_sends where user_id = '${A}');`), '0');
  });
});

test('the app can save and remove only its own phone, and cannot read subscriptions or send', { skip }, () => {
  withPostgres({ users: [A, B] }, (db) => {
    setup(db);
    const out = sql(db, 'app.sql', `
set role authenticated; set request.jwt.claim.sub = '${A}';
select public.lw_push_save('https://push.example/phone', '${KEY}', '${AUTH}', 'America/New_York');
do $t$ begin
  begin perform count(*) from public.lw_push_subscriptions; raise exception 'FAIL could read'; exception when insufficient_privilege then raise notice 'ok: no read'; end;
  begin perform count(*) from public.lw_reminder_sends; raise exception 'FAIL could read sends'; exception when insufficient_privilege then raise notice 'ok: no read sends'; end;
  begin perform * from public.lw_reminders_claim(); raise exception 'FAIL could claim'; exception when insufficient_privilege then raise notice 'ok: no claim'; end;
  begin perform * from public.lw_reminders_due(now()); raise exception 'FAIL could list due'; exception when insufficient_privilege then raise notice 'ok: no due'; end;
  begin perform public.lw_push_gone(array['x']); raise exception 'FAIL could gone'; exception when insufficient_privilege then raise notice 'ok: no gone'; end;
  begin perform public.lw_push_save('https://push.example/x', '${KEY}', '${AUTH}', 'Mars/Base'); raise exception 'FAIL bad tz'; exception when invalid_parameter_value then raise notice 'ok: bad tz'; end;
  begin perform public.lw_push_save('http://push.example/x', '${KEY}', '${AUTH}', 'UTC'); raise exception 'FAIL http'; exception when check_violation then raise notice 'ok: https only'; end;
end $t$;
-- B signs in on the same phone: it moves to B. A's remove of it then does nothing.
set request.jwt.claim.sub = '${B}';
select public.lw_push_save('https://push.example/phone', '${KEY}', '${AUTH}', 'UTC');
set request.jwt.claim.sub = '${A}';
select public.lw_push_remove('https://push.example/phone');
reset role;
select right(user_id::text, 2) || ' ' || tz from public.lw_push_subscriptions;
set role anon;
do $t$ begin
  begin perform public.lw_push_save('https://push.example/y', '${KEY}', '${AUTH}', 'UTC'); raise exception 'FAIL anon'; exception when insufficient_privilege then raise notice 'ok: anon'; end;
end $t$;`);
    assert.equal(out.split('\n').filter(Boolean).pop(), '02 UTC');
  });
});

test('the check-in reminder matches js/checkin.js for every start weekday and chosen day', { skip }, () => {
  // 7 phase-start weekdays × (no choice + 7 choices) = 56 people, each checked at 9:05 on 28 days.
  const people = [];
  for (let s = 0; s < 7; s++) for (let c = -1; c < 7; c++) people.push({ u: uid(100 + people.length), start: core.addDays('2026-11-01', s), checkinDay: c < 0 ? null : c });
  withPostgres({ users: people.map((p) => p.u) }, (db) => {
    setup(db);
    sql(db, 'seed.sql', people.map((p, i) => person(p.u, 'UTC', { checkin: { on: true } }, { checkinDay: p.checkinDay }) + `
insert into public.lw_phases (user_id, id, type, start_date, calc_version) values ('${p.u}', 'old', 'cut', '2026-09-01', '1');
update public.lw_phases set end_date = '2026-10-31' where user_id = '${p.u}' and id = 'old';
insert into public.lw_phases (user_id, id, type, start_date, calc_version) values ('${p.u}', 'ph', 'cut', '${p.start}', '1');`).join('\n') + `
insert into public.lw_recommendations (user_id, id, type, proposed, status) values ('${people[3].u}', 'ci', 'weekly-checkin', '{"date": "2026-11-18"}', 'accepted');`);
    const days = []; for (let d = 0; d < 28; d++) days.push(core.addDays('2026-11-01', d));
    const got = new Set(sql(db, 'all.sql', `select string_agg(right(r.user_id::text, 3) || '@' || r.local_date, ',') from unnest(array['${days.join("','")}']::date[]) d
      cross join lateral public.lw_reminders_due((d + time '09:05') at time zone 'UTC') r where r.kind = 'checkin';`).split(',').filter(Boolean));
    let expected = 0;
    people.forEach((p, i) => days.forEach((d) => {
      const recs = i === 3 ? [{ type: 'weekly-checkin', proposed: { date: '2026-11-18' } }] : [];
      const r = CI.due({ phase: { start_date: p.start }, today: d, prefs: { checkinDay: p.checkinDay }, recs });
      const want = r.due && r.date === d;   // the reminder goes on the check-in day itself
      if (want) expected++;
      assert.equal(got.has(p.u.slice(-3) + '@' + d), want, `start ${p.start}, day ${p.checkinDay}, on ${d}`);
    }));
    assert.ok(expected > 100, 'the comparison covered real check-in days');
    assert.equal(got.size, expected);
  });
});
