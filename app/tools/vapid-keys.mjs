// Leanward — make the VAPID key pair for reminders (ACC-5). Run once: node tools/vapid-keys.mjs
// The public key goes in js/config.js (VAPID_PUBLIC_KEY; it is public by design).
// The private key goes ONLY in Supabase → Edge Functions → Secrets (VAPID_PRIVATE_KEY). Never commit it.
import { generateVapidKeys } from '../supabase/functions/lw-reminders/webpush.mjs';

const k = await generateVapidKeys();
console.log('VAPID_PUBLIC_KEY  (js/config.js and Supabase secrets):\n  ' + k.publicKey);
console.log('VAPID_PRIVATE_KEY (Supabase secrets only, keep it private):\n  ' + k.privateKey);
