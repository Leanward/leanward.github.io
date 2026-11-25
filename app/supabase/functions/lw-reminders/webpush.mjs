/* Leanward — Web Push with no third-party library (ACC-5, PRD §12).
 * Message encryption: RFC 8291 (aes128gcm, RFC 8188). Sender identity: VAPID, RFC 8292 (an ES256 JWT).
 * Uses only the Web Crypto API, so it runs the same in Supabase Edge Functions (Deno) and in Node 20+,
 * where tests/webpush.test.js checks it against the reference implementation's output.
 */
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

export function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}
async function hmac(key, data) {
  const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', k, data));
}
// A P-256 key pair from a raw public key (65 bytes) and private scalar (32 bytes).
function jwk(pub, d) {
  return { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: d ? b64u(d) : undefined, ext: true };
}

/** A new VAPID key pair: { publicKey, privateKey } as base64url (raw 65-byte point, 32-byte scalar). */
export async function generateVapidKeys() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const pub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  const priv = await subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64u(pub), privateKey: priv.d };
}

/**
 * Encrypts a push message for one subscription (RFC 8291). Returns the request body:
 * salt (16) | record size (4) | key id length (1) | sender public key (65) | ciphertext.
 * o: { p256dh, auth (base64url, from the phone's subscription), payload (string or bytes),
 *      salt?, senderPublic?, senderPrivate? (bytes; only tests pass these, to reproduce known output) }
 */
export async function encrypt(o) {
  const uaPublic = unb64u(o.p256dh), authSecret = unb64u(o.auth);
  const plain = typeof o.payload === 'string' ? enc.encode(o.payload) : o.payload;
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('bad p256dh key');
  if (plain.length > 3993) throw new Error('payload too long for one record');
  const salt = o.salt || globalThis.crypto.getRandomValues(new Uint8Array(16));
  let asPublic, asPrivateKey;
  if (o.senderPrivate) {
    asPublic = o.senderPublic;
    asPrivateKey = await subtle.importKey('jwk', jwk(asPublic, o.senderPrivate), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPublic = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
    asPrivateKey = kp.privateKey;
  }
  const uaKey = await subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivateKey, 256));
  // RFC 8291 §3.4: combine the shared secret with the phone's auth secret, then RFC 8188 key and nonce.
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plain, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = 65;
  return concat(header, asPublic, cipher);
}

/**
 * The VAPID Authorization header for an endpoint (RFC 8292): "vapid t=<ES256 JWT>, k=<public key>".
 * o: { endpoint, subject ("mailto:…" or "https://…"), publicKey, privateKey (base64url), now? (seconds) }
 */
export async function vapidHeader(o) {
  const now = o.now || Math.floor(Date.now() / 1000);
  const pub = unb64u(o.publicKey);
  const key = await subtle.importKey('jwk', jwk(pub, unb64u(o.privateKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(o.endpoint).origin, exp: now + 12 * 3600, sub: o.subject })));
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${o.publicKey}`;
}

/**
 * Sends one push. sub: { endpoint, p256dh, auth }; vapid: { subject, publicKey, privateKey }.
 * Resolves to the push service's HTTP status (201 = accepted; 404/410 = the subscription is gone).
 */
export async function send(sub, payload, vapid, opts = {}) {
  const body = await encrypt({ p256dh: sub.p256dh, auth: sub.auth, payload });
  const res = await (opts.fetch || fetch)(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(Object.assign({ endpoint: sub.endpoint }, vapid)),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl || 3600),   // a reminder more than an hour late is no use
      Urgency: 'normal'
    },
    body
  });
  return res.status;
}
