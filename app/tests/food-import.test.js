/* USDA import (tools/food-import) on hand-made sample files in FoodData Central's CSV layout:
 * conversion rules, the nutrient-id safety check, and a full load into a real PostgreSQL. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const U = require('../tools/food-import/usda.js');
const { BIN, withPostgres, SCHEMA } = require('./pg.js');

const FIX = path.join(__dirname, '..', 'tools', 'food-import', 'fixtures');
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test('generic foods: energy fallback, preparation, portions, categories, FDB-6', async () => {
  const { rows, stats } = await U.convert(path.join(FIX, 'generic'));
  const f = byId(rows);
  assert.deepEqual(Object.keys(f).sort(), ['usda:9001', 'usda:9002']);
  assert.equal(stats.rowsIn, 3, 'the Foundation sub-sample row is not a food');
  assert.deepEqual(stats.dropped, { 'missing calories or a macro': 1 });
  const chicken = f['usda:9001'], banana = f['usda:9002'];
  assert.equal(chicken.source, 'usda-sr-legacy'); assert.equal(chicken.preparation, 'cooked'); assert.equal(chicken.category, 'Poultry Products');
  assert.deepEqual([chicken.kcal, chicken.protein_g, chicken.fat_g, chicken.carbs_g], [165, 31.02, 3.57, 0]);
  assert.deepEqual(chicken.nutrients, { sodium: 74, potassium: 256 });
  assert.deepEqual(chicken.servings, [{ label: '1 cup chopped or diced', g: 140 }, { label: '0.5 breast, bone and skin removed', g: 86 }]);
  assert.equal(banana.source, 'usda-foundation'); assert.equal(banana.preparation, 'raw');
  assert.equal(banana.kcal, 97, 'Foundation foods without "Energy" use Atwater general factors');
  assert.equal(banana.energy_derived, false);
  assert.deepEqual(banana.nutrients, { fiber: 1.7, potassium: 326, sugar: 15.8 });
  assert.equal(banana.servings[0].label, '1 piece medium (7" to 7-7/8" long)');
  // FNDDS-style rows: the numeric portion code is not part of the name, and the placeholder serving is left out
  assert.deepEqual(banana.servings.slice(1), [{ label: '1 cup, sliced', g: 150 }]);
});

test('branded foods: names, brands, barcodes, duplicates, ml, IU and derived energy', async () => {
  const { rows, stats } = await U.convert(path.join(FIX, 'branded'), { onlyTypes: ['branded_food'] });
  const f = byId(rows);
  assert.equal(f['usda:8001'].name, 'Toasted Oat Cereal, Honey');
  assert.equal(f['usda:8001'].brand, 'Sunny Oats');
  assert.equal(f['usda:8001'].gtin, '00036000291452');                    // UPC-A → GTIN-14
  assert.equal(f['usda:8001'].nutrients.vitaminD, 3.575);                  // 143 IU ÷ 40
  assert.deepEqual([f['usda:8001'].serving_g, f['usda:8001'].serving_label], [28, '1 cup']);
  // Two listings of one barcode (EAN-13 and GTIN-14 forms): the newer is kept.
  assert.ok(f['usda:8002'] && !f['usda:8003']);
  assert.equal(f['usda:8004'].per, 'ml');
  assert.equal(f['usda:8004'].gtin, null, 'an invalid barcode is dropped, the food kept');
  // Protein bar with no calories listed: 4 × 20 + 4 × 45 + 9 × 15 = 395, flagged as worked out
  assert.deepEqual([f['usda:8005'].kcal, f['usda:8005'].energy_derived], [395, true]);
  assert.equal(f['usda:8005'].gtin, '00000096385074');                     // EAN-8
  assert.equal(stats.dropped['duplicate barcode (older kept out)'], 1);
  assert.equal(stats.dropped['barcode invalid (food kept, barcode dropped)'], 1);
});

test('the import stops if a USDA nutrient id has a different name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-usda-'));
  for (const f of fs.readdirSync(path.join(FIX, 'generic'))) fs.copyFileSync(path.join(FIX, 'generic', f), path.join(dir, f));
  const n = fs.readFileSync(path.join(dir, 'nutrient.csv'), 'utf8').replace('1093,"Sodium, Na"', '1093,"Potassium, K"');
  fs.writeFileSync(path.join(dir, 'nutrient.csv'), n);
  await assert.rejects(U.convert(dir), /nutrient 1093: expected .*Sodium.*found "Potassium, K"/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('tidy names only change all-caps text', () => {
  assert.equal(U.tidyName('ORGANIC PEANUT BUTTER WITH SEA SALT'), 'Organic Peanut Butter with Sea Salt');
  assert.equal(U.tidyName('Oats, rolled, dry'), 'Oats, rolled, dry');
});

test('import.js output loads into the catalog; a re-run updates, removes and frees barcodes (real PostgreSQL)', { skip: BIN ? false : 'PostgreSQL not installed' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-load-'));
  const imp = path.join(__dirname, '..', 'tools', 'food-import', 'import.js');
  const csv1 = path.join(tmp, 'b1.csv');
  execFileSync(process.execPath, [imp, path.join(FIX, 'branded'), csv1, '--only', 'branded_food'], { stdio: 'pipe' });
  // Second release: the cereal is gone and the yogurt's barcode moved to a new record.
  const csv2 = path.join(tmp, 'b2.csv');
  const lines = fs.readFileSync(csv1, 'utf8').split('\n').filter((l) => !l.startsWith('usda:8001,')).map((l) => l.replace(/^usda:8002,usda-branded,8002,/, 'usda:8102,usda-branded,8102,'));
  fs.writeFileSync(csv2, lines.join('\n'));
  try {
    withPostgres({ users: [] }, (db) => {
      db.file('schema.sql', fs.readFileSync(SCHEMA, 'utf8'));
      assert.equal(db.run('schema.sql').status, 0);
      const use = (f) => { fs.copyFileSync(path.join(tmp, f), path.join(db.dir, 'foods.csv')); try { execFileSync('chown', ['postgres', path.join(db.dir, 'foods.csv')], { stdio: 'ignore' }); } catch (e) { /* not root */ } };
      const load = fs.readFileSync(path.join(__dirname, '..', 'tools', 'food-import', 'load.sql'), 'utf8');
      db.file('l.sql', '\\set source usda-branded\n\\set release 2024-10-31\n\\set rows_in 5\n' + load);
      use('b1.csv');
      const r1 = db.run('l.sql'); assert.equal(r1.status, 0, r1.stderr);
      assert.match(r1.stdout, /usda-branded\|4/);
      use('b2.csv');
      const r2 = db.run('l.sql'); assert.equal(r2.status, 0, r2.stderr);
      db.file('check.sql', `select string_agg(id || ':' || coalesce(gtin, '-'), ',' order by id) from public.lw_foods;
select count(*) from public.lw_food_imports;
select nutrients->>'vitaminD' from public.lw_foods where id = 'usda:8005' or id = 'usda:8004' order by id limit 1;`);
      const c = db.run('check.sql'); assert.equal(c.status, 0, c.stderr);
      const [ids, runs] = c.stdout.trim().split('\n');
      assert.equal(ids, 'usda:8004:-,usda:8005:00000096385074,usda:8102:04006381333931', 'cereal removed; yogurt barcode now on the new record');
      assert.equal(runs, '2');
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('find-urls picks the newest CSV download of each dataset', () => {
  const { pick } = require('../tools/food-import/find-urls.js');
  const html = '<a href="https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2024-10-31.zip">old</a>' +
    '<a href="/fdc-datasets/FoodData_Central_branded_food_csv_2025-04-24.zip">new</a>' +
    '<a href="https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_2025-04-24.zip">json, ignored</a>' +
    '<a href="https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip">sr</a>';
  const p = pick(html);
  assert.equal(p.branded_food.url, 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2025-04-24.zip');
  assert.equal(p.sr_legacy_food.date, '2018-04');
  assert.equal(p.foundation_food, undefined);
});

test('datasets that use old 3-digit nutrient numbers (FNDDS) are read through nutrient.csv', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-fndds-'));
  fs.writeFileSync(path.join(dir, 'nutrient.csv'), '"id","name","unit_name","nutrient_nbr","rank"\n"1003","Protein","G","203",""\n"1004","Total lipid (fat)","G","204",""\n"1005","Carbohydrate, by difference","G","205",""\n"1008","Energy","KCAL","208",""\n"1093","Sodium, Na","MG","307",""\n');
  fs.writeFileSync(path.join(dir, 'food.csv'), '"fdc_id","data_type","description","food_category_id","publication_date"\n"7001","survey_fndds_food","Oatmeal, cooked with water","","2022-10-28"\n');
  fs.writeFileSync(path.join(dir, 'food_nutrient.csv'), '"id","fdc_id","nutrient_id","amount"\n"1","7001","203","2.5"\n"2","7001","204","1.5"\n"3","7001","205","12"\n"4","7001","208","71"\n"5","7001","307","4"\n');
  const { rows } = await U.convert(dir);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].kcal, rows[0].protein_g, rows[0].carbs_g, rows[0].fat_g, rows[0].nutrients.sodium], [71, 2.5, 12, 1.5, 4]);
  assert.equal(rows[0].source, 'usda-fndds'); assert.equal(rows[0].preparation, 'cooked');
  fs.rmSync(dir, { recursive: true, force: true });
});
