// Leanward — reminders sender (ACC-5, PRD §12). A Supabase Edge Function that pg_cron calls every
// 15 minutes (setup: README.md, "Reminders"). It asks the database which reminders are due
// (lw_reminders_claim, which also records them so none goes twice), sends each with Web Push, and
// forgets phones Apple reports as gone. The message holds only which reminder it is; the words are
// fixed in the app's service worker (sw.js), and no health data ever leaves the database.
//
// Secrets (Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
// CRON_SECRET. SUPABASE_URL and the server key are provided by Supabase itself.
import { send } from './webpush.mjs';

const env = (k: string) => Deno.env.get(k) ?? '';
const KINDS = new Set(['log', 'weigh', 'checkin']);

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;   // legacy JWT keys also go here
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

Deno.serve(async (req) => {
  const secret = env('CRON_SECRET');
  if (req.method !== 'POST' || !secret || req.headers.get('x-lw-cron') !== secret) return new Response('Not found', { status: 404 });
  const vapid = { subject: env('VAPID_SUBJECT'), publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY') };
  if (!vapid.subject || !vapid.publicKey || !vapid.privateKey) return new Response('VAPID secrets missing', { status: 500 });

  const due: { kind: string; endpoint: string; p256dh: string; auth: string }[] = await rpc('lw_reminders_claim');
  const gone: string[] = [];
  let sent = 0, failed = 0;
  // A few at a time, so one slow push service doesn't hold up the rest.
  for (let i = 0; i < due.length; i += 20) {
    await Promise.all(due.slice(i, i + 20).filter((d) => KINDS.has(d.kind)).map(async (d) => {
      try {
        const status = await send(d, JSON.stringify({ t: d.kind }), vapid);
        if (status === 404 || status === 410) gone.push(d.endpoint);
        else if (status >= 200 && status < 300) sent++;
        else failed++;
      } catch (_e) { failed++; }
    }));
  }
  if (gone.length) await rpc('lw_push_gone', { endpoints: gone });
  // Counts only: no endpoints or user ids in the logs.
  return Response.json({ due: due.length, sent, gone: gone.length, failed });
});
