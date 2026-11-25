/* ACC-5: Web Push encryption (RFC 8291) and VAPID (RFC 8292) in supabase/functions/lw-reminders/webpush.mjs.
 * The fixed example is RFC 8291's own (Section 5, "When I grow up…"); the reference library (http_ece)
 * gives the same bytes. Random round trips are decrypted here with node:crypto, step by step from the RFC. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'lw-reminders', 'webpush.mjs')).href);
const V = {
  plain: 'When I grow up, I want to be a watermelon',
  asPriv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPub: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPub: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  out: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
};

// The phone's side of RFC 8291, written independently with node:crypto.
function decrypt(body, ua, authSecret) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ecdh = ua.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdh, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'last-record padding delimiter');
  return plain.subarray(0, plain.length - 1).toString();
}

test('encrypt reproduces the RFC 8291 example exactly', async () => {
  const wp = await load();
  const out = await wp.encrypt({ p256dh: V.uaPub, auth: V.auth, payload: V.plain, salt: wp.unb64u(V.salt), senderPublic: wp.unb64u(V.asPub), senderPrivate: wp.unb64u(V.asPriv) });
  assert.equal(wp.b64u(out), V.out);
});

test('a phone can decrypt what we send, with fresh keys every time', async () => {
  const wp = await load();
  for (let i = 0; i < 5; i++) {
    const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
    const auth = crypto.randomBytes(16);
    const body = await wp.encrypt({ p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url'), payload: '{"t":"weigh"}' });
    assert.equal(new DataView(body.buffer).getUint32(16), 4096);
    assert.equal(decrypt(Buffer.from(body), ua, auth), '{"t":"weigh"}');
  }
});

test('VAPID: an ES256 JWT for the push service origin, valid 12 hours, that verifies with the public key', async () => {
  const wp = await load();
  const k = await wp.generateVapidKeys();
  assert.match(k.publicKey, /^B[A-Za-z0-9_-]{86}$/);
  assert.match(k.privateKey, /^[A-Za-z0-9_-]{43}$/);
  const h = await wp.vapidHeader({ endpoint: 'https://web.push.apple.com/QGx-abc', subject: 'mailto:support@example.com', ...k, now: 1000 });
  const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.ok(m, h);
  assert.equal(m[4], k.publicKey);
  assert.deepEqual(JSON.parse(Buffer.from(m[1], 'base64url')), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(JSON.parse(Buffer.from(m[2], 'base64url')), { aud: 'https://web.push.apple.com', exp: 1000 + 43200, sub: 'mailto:support@example.com' });
  const raw = Buffer.from(k.publicKey, 'base64url');
  const pub = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') } });
  assert.ok(crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')));
});

test('send posts the encrypted body with the Web Push headers and returns the status', async () => {
  const wp = await load();
  const k = await wp.generateVapidKeys();
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  let seen;
  const status = await wp.send({ endpoint: 'https://web.push.apple.com/x', p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
    '{"t":"checkin"}', { subject: 'mailto:a@example.com', ...k }, { fetch: async (url, init) => { seen = { url, init }; return { status: 201 }; } });
  assert.equal(status, 201);
  assert.equal(seen.url, 'https://web.push.apple.com/x');
  assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(seen.init.headers.TTL, '3600');
  assert.match(seen.init.headers.Authorization, /^vapid t=/);
  assert.equal(decrypt(Buffer.from(seen.init.body), ua, auth), '{"t":"checkin"}');
});
