-- Leanward live security check (audit, v0.20.1). Paste into Supabase → SQL editor → Run.
--
-- It changes nothing: every write it tries is undone, and it prints only pass/fail counts, never data.
-- It takes the account with the most diary rows as "A" and makes up a stranger "B" (a random id with
-- no account), then, inside the database, acts as B and tries to read, change, add and delete A's rows,
-- acts as a signed-out visitor, and checks the rules and permissions are the ones in schema.sql.
-- Every row of the result should say PASS.

create temp table if not exists lw_security_check (n int, check_name text, expected text, actual text, result text);
truncate lw_security_check;

do $$
declare
  tabs text[] := array['lw_profiles', 'lw_goals', 'lw_phases', 'lw_target_sets', 'lw_custom_foods', 'lw_saved_meals',
    'lw_diary_entries', 'lw_weights', 'lw_measurements', 'lw_body_fat', 'lw_lifts', 'lw_recommendations', 'lw_food_reports'];
  a uuid; b uuid := gen_random_uuid(); t text; n bigint; k int := 0;
  rows_a bigint := 0; seen_b bigint := 0; seen_a bigint := 0; changed_b bigint := 0; deleted_b bigint := 0;
  refused_ins int := 0; anon_refused int := 0; bad text; definers text;
begin
  select user_id into a from public.lw_diary_entries group by user_id order by count(*) desc limit 1;
  if a is null then raise exception 'No diary rows yet: log one food in the app, then run this again.'; end if;

  foreach t in array tabs loop
    execute format('select count(*) from public.%I where user_id = $1', t) into n using a;
    rows_a := rows_a + n;

    -- B (signed in, someone else) reads, changes and deletes A's rows. Each try is undone.
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claim.sub', b::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
      execute format('select count(*) from public.%I where user_id = $1', t) into n using a;
      seen_b := seen_b + n;
      execute format('update public.%I set deleted = deleted where user_id = $1', t) using a;
      get diagnostics n = row_count;
      changed_b := changed_b + n;
      raise exception 'lw-probe-undo';
    exception when others then
      if sqlerrm <> 'lw-probe-undo' then changed_b := changed_b + 1000000; end if;   -- an unexpected error shows as a FAIL
    end;
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claim.sub', b::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
      execute format('delete from public.%I where user_id = $1', t) using a;
      get diagnostics n = row_count;
      deleted_b := deleted_b + n;
      raise exception 'lw-probe-undo';
    exception when others then null;   -- "permission denied" is the expected answer
    end;

    -- A sees their own rows (proves the check really acts as a signed-in person).
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claim.sub', a::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
      execute format('select count(*) from public.%I where user_id = $1', t) into n using a;
      seen_a := seen_a + n;
      raise exception 'lw-probe-undo';
    exception when others then null;
    end;

    -- A signed-out visitor can't read the table at all.
    begin
      execute 'set local role anon';
      execute format('select count(*) from public.%I', t) into n;
      raise exception 'lw-probe-undo';
    exception when others then
      if sqlerrm <> 'lw-probe-undo' then anon_refused := anon_refused + 1; end if;
    end;
  end loop;
  execute 'reset role';

  -- B adds rows that claim to be A's.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', b::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    insert into public.lw_weights (user_id, id, measured_at, date, kg) values (a, 'lw-probe', now(), current_date, 80);
    raise exception 'lw-probe-undo';
  exception when others then if sqlerrm <> 'lw-probe-undo' then refused_ins := refused_ins + 1; end if;
  end;
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', b::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    insert into public.lw_diary_entries (user_id, id, date, slot, food_source, name, kcal, logged_via) values (a, 'lw-probe', current_date, 'lunch', 'quick', 'probe', 1, 'quick');
    raise exception 'lw-probe-undo';
  exception when others then if sqlerrm <> 'lw-probe-undo' then refused_ins := refused_ins + 1; end if;
  end;
  execute 'reset role';

  k := k + 1; insert into lw_security_check values (k, 'A has rows to protect', 'more than 0', rows_a::text, case when rows_a > 0 then 'PASS' else 'FAIL' end);
  k := k + 1; insert into lw_security_check values (k, 'A sees all of their own rows (check works)', rows_a::text, seen_a::text, case when seen_a = rows_a then 'PASS' else 'FAIL' end);
  k := k + 1; insert into lw_security_check values (k, 'Stranger B reads A''s rows', '0', seen_b::text, case when seen_b = 0 then 'PASS' else 'FAIL' end);
  k := k + 1; insert into lw_security_check values (k, 'Stranger B changes A''s rows', '0', changed_b::text, case when changed_b = 0 then 'PASS' else 'FAIL' end);
  k := k + 1; insert into lw_security_check values (k, 'Stranger B deletes A''s rows', '0', deleted_b::text, case when deleted_b = 0 then 'PASS' else 'FAIL' end);
  k := k + 1; insert into lw_security_check values (k, 'Stranger B adds rows as A (2 tries)', '2 refused', refused_ins || ' refused', case when refused_ins = 2 then 'PASS' else 'FAIL' end);
  k := k + 1; insert into lw_security_check values (k, 'Signed-out visitor reads the 13 tables', '13 refused', anon_refused || ' refused', case when anon_refused = 13 then 'PASS' else 'FAIL' end);

  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relname = any(tabs) and c.relrowsecurity;
  k := k + 1; insert into lw_security_check values (k, 'Row level security switched on', '13 tables', n || ' tables', case when n = 13 then 'PASS' else 'FAIL' end);
  select string_agg(x.t, ', ') into bad from unnest(tabs) as x(t)
    where (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = x.t and p.policyname like 'own rows:%') <> 3
       or (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = x.t) <> 3;
  k := k + 1; insert into lw_security_check values (k, 'Exactly the 3 own-rows rules on each table', 'none differ', coalesce(bad, 'none differ'), case when bad is null then 'PASS' else 'FAIL' end);
  select string_agg(p.proname, ', ' order by p.proname) into definers from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.prosecdef;
  k := k + 1; insert into lw_security_check values (k, 'Functions that run with extra rights', 'lw_delete_account, lw_errors_guard', coalesce(definers, 'none'), case when definers = 'lw_delete_account, lw_errors_guard' then 'PASS' else 'FAIL' end);
  k := k + 1; insert into lw_security_check values (k, 'Signed-out visitor can delete an account', 'no',
    case when has_function_privilege('anon', 'public.lw_delete_account()', 'execute') then 'yes' else 'no' end,
    case when has_function_privilege('anon', 'public.lw_delete_account()', 'execute') then 'FAIL' else 'PASS' end);
  k := k + 1; insert into lw_security_check values (k, 'Users can read the usage metrics', 'no',
    case when has_table_privilege('authenticated', 'public.lw_metrics', 'select') then 'yes' else 'no' end,
    case when has_table_privilege('authenticated', 'public.lw_metrics', 'select') then 'FAIL' else 'PASS' end);
  k := k + 1; insert into lw_security_check values (k, 'Anyone can read error reports', 'no',
    case when has_table_privilege('anon', 'public.lw_errors', 'select') or has_table_privilege('authenticated', 'public.lw_errors', 'select') then 'yes' else 'no' end,
    case when has_table_privilege('anon', 'public.lw_errors', 'select') or has_table_privilege('authenticated', 'public.lw_errors', 'select') then 'FAIL' else 'PASS' end);
  k := k + 1; insert into lw_security_check values (k, 'Signed-out visitor can read the food catalog', 'no',
    case when has_table_privilege('anon', 'public.lw_foods', 'select') then 'yes' else 'no' end,
    case when has_table_privilege('anon', 'public.lw_foods', 'select') then 'FAIL' else 'PASS' end);
end;
$$;

select check_name as "Check", expected as "Expected", actual as "Found", result as "Result" from lw_security_check order by n;
