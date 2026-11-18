/* Food catalog search and barcode lookup (supabase/schema.sql, M4), run on a real throwaway PostgreSQL
 * with pg_trgm, the same as Supabase. The rows are a small hand-made sample in the catalog's shape. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { BIN, withPostgres, SCHEMA } = require('./pg.js');

const U = '00000000-0000-4000-8000-0000000000c1';
const foods = [
  // id, source, verification, name, brand, gtin, kcal, P, C, F, preparation
  ['usda:1', 'usda-sr-legacy', 'verified', 'Chicken, broilers or fryers, breast, meat only, raw', null, null, 120, 22.5, 0, 2.6, 'raw'],
  ['usda:2', 'usda-sr-legacy', 'verified', 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', null, null, 165, 31, 0, 3.6, 'cooked'],
  ['usda:3', 'usda-foundation', 'verified', 'Bananas, ripe and slightly ripe, raw', null, null, 97, 0.7, 23, 0.3, 'raw'],
  ['usda:4', 'usda-branded', 'verified', 'Banana chips', 'Snack Co', '00012345678905', 520, 2.3, 58, 34, null],
  ['usda:5', 'usda-branded', 'verified', 'Banana chips', 'Snack Co', null, 519, 2.3, 58, 34, null],   // near-duplicate
  ['usda:6', 'usda-branded', 'verified', 'Greek yogurt, plain, nonfat', 'Dairy Farm', '00076543210988', 59, 10.3, 3.6, 0.4, null],
  ['usda:7', 'usda-fndds', 'verified', 'Oatmeal, cooked with water', null, null, 71, 2.5, 12, 1.5, 'cooked'],
  // Seen on the real catalog (2026-11-06): "quest bar" showed Quaker granola bars; "banana" showed a branded "Banana" first.
  ['usda:8', 'usda-branded', 'verified', 'Protein Bar, Cookies & Cream', 'Quest Bar', null, 357, 33, 40, 13, null],
  ['usda:9', 'usda-fndds', 'verified', 'Cereal or granola bar (Quaker Chewy Granola Bar)', null, null, 420, 6, 70, 14, null],
  ['usda:10', 'usda-branded', 'verified', 'Banana', 'Kid Vids', null, 89, 1, 23, 0.3, null],
  ['usda:11', 'usda-branded', 'verified', 'Banana Chips', 'Banana Joe', null, 520, 2, 58, 34, null],
  ['usda:12', 'usda-sr-legacy', 'verified', 'Salmonberries, raw (Alaska Native)', null, null, 47, 1.4, 10, 0.4, 'raw'],
  ['usda:13', 'usda-sr-legacy', 'verified', 'Fish, salmon, Atlantic, farmed, raw', null, null, 208, 20, 0, 13, 'raw'],
  // Seen on the real catalog (2026-11-18): Thomas' protein bagels aren't in it, and "protein bagel" showed protein bars.
  ['usda:14', 'usda-branded', 'verified', 'Everything Bagels, Everything', "Thomas'", null, 250, 9, 49, 2, null],
  ['usda:15', 'usda-branded', 'verified', 'Plain Bagels, Plain', "Thomas'", null, 245, 9, 48, 1.5, null],
  ['usda:16', 'usda-sr-legacy', 'verified', 'Formulated Bar, SOUTH BEACH protein bar', null, null, 380, 30, 40, 12, null]
];
const q = (v) => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);
const insert = `insert into public.lw_foods (id, source, source_id, verification, name, brand, gtin, kcal, protein_g, carbs_g, fat_g, preparation) values
${foods.map((f) => `(${q(f[0])}, ${q(f[1])}, ${q(f[0].split(':')[1])}, ${q(f[2])}, ${q(f[3])}, ${q(f[4])}, ${q(f[5])}, ${f[6]}, ${f[7]}, ${f[8]}, ${f[9]}, ${q(f[10])})`).join(',\n')};`;

const as = `set role authenticated; set request.jwt.claim.sub = '${U}';`;
// coalesce: an empty result prints '-' rather than a blank line, so the answers stay in order.
const search = (term) => `select coalesce(string_agg(id, ',' order by score desc, name), '-') from public.lw_search_foods(${q(term)}, 10);`;

test('catalog search and barcode lookup (real PostgreSQL)', { skip: BIN ? false : 'PostgreSQL not installed' }, () => {
  withPostgres({ users: [U] }, (db) => {
    db.file('schema.sql', fs.readFileSync(SCHEMA, 'utf8'));
    assert.equal(db.run('schema.sql').status, 0);
    db.file('seed.sql', insert);
    const s = db.run('seed.sql'); assert.equal(s.status, 0, s.stderr);
    const queries = [
      ['chicken breast cooked', 'cooked first when the query says cooked'],
      ['chicken breast raw', 'raw first when the query says raw'],
      ['banana', 'generic before branded; the duplicate collapsed'],
      ['bananna', 'a typo still finds bananas (trigram)'],
      ['greek yogurt', 'branded match'],
      ['oatmeal', 'FNDDS dish'],
      ['quest bar', 'a brand named in the query comes first'],
      ['salmon', 'whole words before prefixes'],
      ['greek yog', 'a half-typed word matches as a prefix'],
      ['dairy fa', 'a half-typed brand matches'],
      ["snack co's banana", 'apostrophes and one-letter words are ignored'],
      ['b', 'one letter: no results'],
      ['zzzzqq', 'no match'],
      ['thomas everything protein bagels', 'no food has every word: closest matches (all but one)'],
      ['protein bagel', 'two words, no exact match: the food (last word) wins over the describing word']
    ];
    db.file('q.sql', as + '\n' + queries.map(([t]) => search(t)).join('\n') +
      `\nselect id from public.lw_food_by_barcode('00012345678905');\nselect count(*) from public.lw_food_by_barcode('12345');`);
    const r = db.run('q.sql');
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout.split('\n').filter((l) => l !== '');
    const res = {}; queries.forEach(([t], i) => { res[t] = out[i] === '-' ? [] : out[i].split(','); });
    assert.equal(res['chicken breast cooked'][0], 'usda:2');
    assert.equal(res['chicken breast raw'][0], 'usda:1');
    assert.equal(res.banana[0], 'usda:3', 'plain bananas before a branded food named just "Banana"');
    assert.equal(res.banana.filter((x) => x === 'usda:4' || x === 'usda:5').length, 1, 'Banana chips from Snack Co shown once');
    assert.ok(res.bananna.includes('usda:3'), JSON.stringify(res.bananna));
    assert.equal(res['greek yogurt'][0], 'usda:6');
    assert.equal(res.oatmeal[0], 'usda:7');
    assert.equal(res['quest bar'][0], 'usda:8', JSON.stringify(res['quest bar']));
    assert.ok(res['greek yog'].includes('usda:6'));
    assert.equal(res.salmon[0], 'usda:13', JSON.stringify(res.salmon));
    assert.equal(res['dairy fa'][0], 'usda:6');
    assert.ok(res["snack co's banana"][0] === 'usda:4' || res["snack co's banana"][0] === 'usda:5', JSON.stringify(res["snack co's banana"]));
    assert.deepEqual(res.b, []);
    assert.deepEqual(res.zzzzqq, []);
    assert.equal(res['thomas everything protein bagels'][0], 'usda:14', JSON.stringify(res['thomas everything protein bagels']));
    assert.ok(['usda:14', 'usda:15'].includes(res['protein bagel'][0]), JSON.stringify(res['protein bagel']));
    assert.ok(!res['protein bagel'].includes('usda:16'), 'no protein bars for "protein bagel"');
    assert.equal(out[queries.length], 'usda:4', 'barcode lookup');
    assert.equal(out[queries.length + 1], '0', 'a malformed barcode finds nothing');

    // The app can read and search, never write; signed-out visitors get nothing.
    db.file('deny.sql', `${as}
do $t$ begin
  begin insert into public.lw_foods (id, source, source_id, name, kcal, protein_g, carbs_g, fat_g) values ('x:1', 'usda-branded', '1', 'Hack', 1, 1, 1, 1); raise exception 'FAIL insert allowed';
  exception when insufficient_privilege then raise notice 'ok: no insert'; end;
  begin update public.lw_foods set kcal = 0; raise exception 'FAIL update allowed';
  exception when insufficient_privilege then raise notice 'ok: no update'; end;
end $t$;
reset role; set role anon;
do $t$ begin
  begin perform 1 from public.lw_foods; raise exception 'FAIL anon read';
  exception when insufficient_privilege then raise notice 'ok: anon cannot read'; end;
  begin perform * from public.lw_search_foods('banana'); raise exception 'FAIL anon search';
  exception when insufficient_privilege then raise notice 'ok: anon cannot search'; end;
end $t$;`);
    const d = db.run('deny.sql');
    assert.equal(d.status, 0, d.stderr);
    assert.equal((d.stderr.match(/ok:/g) || []).length, 4, d.stderr);
  });
});
