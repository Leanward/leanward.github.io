/* Shared pieces of the approved design (js/ui.js): labels and shapes the screens rely on. */
const test = require('node:test');
const assert = require('node:assert/strict');
const UI = require('../js/ui.js');

test('phase week label: "Cut · Week 4 of 12", open-ended phases without a total', () => {
  assert.equal(UI.weekLabel('Cut', { day: 27, total: 84 }), 'Cut · Week 4 of 12');     // day 27 → week 4; 84 days → 12 weeks
  assert.equal(UI.weekLabel('Cut', { day: 1, total: 84 }), 'Cut · Week 1 of 12');
  assert.equal(UI.weekLabel('Maintenance', { day: 15, total: null }), 'Maintenance · Week 3');
});

test('ring and bar never draw past full or below empty; icons are decorative', () => {
  const dashes = (svg) => svg.match(/stroke-dasharray="([\d.]+)" stroke-dashoffset="([\d.-]+)"/).slice(1).map(Number);
  const [c, offOver] = dashes(UI.ring(1.4, 120, 11, 'x'));
  assert.equal(offOver, 0);                          // 140% eaten still shows a full ring, not past it
  assert.equal(dashes(UI.ring(-1, 120, 11, 'x'))[1], c);   // nothing eaten → empty
  assert.match(UI.bar(2), /width:100\.0%/); assert.match(UI.bar(null), /width:0\.0%/);
  assert.match(UI.icon('scale'), /aria-hidden="true"/);
  assert.equal(UI.icon('nope').includes('<path'), false);
});

test('Intelligence card states its data in words, never a made-up percentage', () => {
  const html = UI.intel({ state: 'Collecting data', title: 'Building your baseline', text: 'x' });
  assert.match(html, /Collecting data/); assert.doesNotMatch(html, /Confidence:|\d+%/);
});
