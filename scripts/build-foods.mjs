// Builds lib/data/sr28.json from the official USDA SR28 abbreviated file
// (bundled in the `fda-nutrient-database` dev dependency, an unmodified copy of ABBREV.txt).
// Source: USDA ARS Nutrient Data Laboratory, National Nutrient Database for Standard Reference, Release 28 (2015),
// which FoodData Central republishes as "SR Legacy".
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('fda-nutrient-database/package.json'));
const raw = fs.readFileSync(path.join(pkgDir, 'data', 'ABBREV.txt'), 'latin1');
const num = (s) => (s === '' || s == null ? null : Number(s));
const out = [];
for (const line of raw.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const f = line.split('^').map((s) => s.replace(/~/g, ''));
  // Column positions per SR28 documentation, ABBREV file layout (p. 44)
  out.push([
    f[0], f[1],
    num(f[3]),  // kcal
    num(f[4]),  // protein g
    num(f[7]),  // carbohydrate g (by difference)
    num(f[5]),  // total fat g
    num(f[8]),  // fiber g
    num(f[9]),  // sugar g
    num(f[15]), // sodium mg
    num(f[44]), // saturated fat g
    num(f[10]), // calcium mg
    num(f[11]), // iron mg
    num(f[14]), // potassium mg
    num(f[20]), // vitamin C mg
    num(f[41]), // vitamin D mcg
    num(f[31]), // vitamin B12 mcg
    num(f[52]), // refuse %
  ]);
}
fs.writeFileSync(path.join(process.cwd(), 'lib/data/sr28.json'), JSON.stringify(out));
console.log(`wrote ${out.length} foods`);
