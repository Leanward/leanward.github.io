/* ACC-5 reminders, app side (js/reminders.js and sw.js): settings defaults, the fixed words, the
 * setup states, and that a push always shows a notification. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('../js/reminders.js');

test('everything is off by default, with the PRD default times', () => {
  assert.deepEqual(R.normalize(undefined), { log: { on: false, time: '20:00' }, weigh: { on: false, time: '07:30', days: null }, checkin: { on: false } });
  assert.equal(R.anyOn(null), false);
  assert.equal(R.summary(null), 'Off');
});

test('settings are cleaned up: bad times fall back, days are 0–6, all 7 days means every day', () => {
  const n = R.normalize({ log: { on: true, time: '25:00' }, weigh: { on: true, time: '06:45', days: [5, 1, 9, 1.5, 3] }, checkin: { on: 'yes' } });
  assert.deepEqual(n, { log: { on: true, time: '20:00' }, weigh: { on: true, time: '06:45', days: [1, 3, 5] }, checkin: { on: false } });
  assert.equal(R.normalize({ weigh: { days: [0, 1, 2, 3, 4, 5, 6] } }).weigh.days, null);
  assert.equal(R.summary(n), 'Log 8:00 pm · Weigh-in 6:45 am');
});

test('times come in 15-minute steps, shown as am/pm', () => {
  const t = R.times();
  assert.equal(t.length, 96);
  assert.equal(t[0], '00:00'); assert.equal(t[1], '00:15'); assert.equal(t[95], '23:45');
  assert.ok(t.includes(R.DEFAULT_TIME.log) && t.includes(R.DEFAULT_TIME.weigh) && t.includes(R.CHECKIN_TIME));
  assert.equal(R.niceTime('00:15'), '12:15 am'); assert.equal(R.niceTime('12:00'), '12:00 pm'); assert.equal(R.niceTime('20:00'), '8:00 pm');
});

test('the lock-screen words are fixed, kind, and hold no numbers, foods or weights', () => {
  assert.deepEqual(Object.keys(R.TEXT), R.KINDS);
  assert.equal(R.TEXT.log.body, 'Time to log today\'s meals?');
  assert.equal(R.TEXT.weigh.body, 'Morning weigh-in? Before breakfast is best.');
  assert.equal(R.TEXT.checkin.body, 'Your weekly check-in is ready.');
  for (const k of R.KINDS) {
    assert.doesNotMatch(R.TEXT[k].body, /\d/);
    assert.doesNotMatch(R.TEXT[k].body, /miss|streak|forgot|again|fail|should/i);
  }
});

test('setup states: no key, unsupported, needs the Home Screen, denied, ready', () => {
  assert.equal(R.status({ key: '', push: true, permission: 'granted' }), 'unconfigured');
  assert.equal(R.status({ key: 'B', push: false, ios: true, standalone: false }), 'install');
  assert.equal(R.status({ key: 'B', push: false, ios: true, standalone: true }), 'unsupported');
  assert.equal(R.status({ key: 'B', push: false, ios: false }), 'unsupported');
  assert.equal(R.status({ key: 'B', push: true, permission: 'denied' }), 'denied');
  assert.equal(R.status({ key: 'B', push: true, permission: 'default' }), 'ready');
});

test('a tapped reminder names its screen in the address; nothing else does', () => {
  assert.equal(R.openFrom('?open=weigh'), 'weigh');
  assert.equal(R.openFrom('?x=1&open=checkin'), 'checkin');
  assert.equal(R.openFrom('?open=log&y=2'), 'log');
  assert.equal(R.openFrom('?open=deleteaccount'), null);
  assert.equal(R.openFrom(''), null);
});

test('the service worker shows a notification for every push, with the fixed words, and opens the right screen', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const shown = [], listeners = {};
  const self = {
    LW: null,
    registration: { scope: 'https://leanward.example/', showNotification: (t, o) => { shown.push([t, o]); return Promise.resolve(); } },
    clients: { matchAll: () => Promise.resolve([]), openWindow: (u) => { shown.push(['open', u]); return Promise.resolve(); } },
    addEventListener: (n, f) => { listeners[n] = f; },
    location: { origin: 'https://leanward.example' }
  };
  self.self = self;
  const importScripts = () => { self.LW = { reminders: R }; };
  new Function('self', 'importScripts', 'caches', 'fetch', src)(self, importScripts, {}, () => {});
  const fire = (name, ev) => { let p; ev.waitUntil = (x) => { p = x; }; listeners[name](ev); return p; };
  return fire('push', { data: { json: () => ({ t: 'weigh' }) } })
    .then(() => fire('push', { data: { json: () => { throw new Error('not json'); } } }))
    .then(() => fire('push', { data: null }))
    .then(() => {
      assert.equal(shown.length, 3, 'every push shows something');
      assert.equal(shown[0][1].body, R.TEXT.weigh.body);
      assert.equal(shown[1][1].body, 'Open Leanward');
      return fire('notificationclick', { notification: { data: shown[0][1].data, close: () => {} } });
    })
    .then(() => assert.deepEqual(shown[3], ['open', 'https://leanward.example/?open=weigh']));
});
