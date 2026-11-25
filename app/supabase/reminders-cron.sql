-- Leanward reminders (ACC-5): run the sender every 15 minutes. One-time setup, after schema.sql and after
-- the lw-reminders Edge Function is deployed with its secrets (README.md, "Reminders").
-- Before running: Database → Extensions → turn on pg_cron and pg_net, and replace PASTE-CRON-SECRET-HERE
-- with the same CRON_SECRET you saved in Edge Functions → Secrets. Safe to run again (it updates the job).

-- The shared secret, kept in Supabase Vault (not in this file or the job's text). Run this line once;
-- to change the secret later, use Vault in the dashboard instead.
select vault.create_secret('PASTE-CRON-SECRET-HERE', 'lw_reminders_cron')
where not exists (select 1 from vault.secrets where name = 'lw_reminders_cron');

select cron.schedule('lw-reminders', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://anxpwqbakjqnglqgccfo.supabase.co/functions/v1/lw-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-lw-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'lw_reminders_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
$job$);

-- To stop reminders: select cron.unschedule('lw-reminders');
