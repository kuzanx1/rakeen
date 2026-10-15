/* مصفوفة الباقات مكتوبة مرّتين: lib/plans.ts (عرض السعر ولوحة الأدمن)،
 * وrk_plan_features() في الـmigration (الـtrigger الذي يقفل ويفتح). لو
 * اختلفتا، يرى الأدمن «مسموحة» والقاعدة تطفئها، أو العكس. هذا يرسب عند
 * أوّل اختلاف.
 */
const fs = require('fs');
const ts = fs.readFileSync(process.argv[2] || 'lib/plans.ts', 'utf8');
const sql = fs.readFileSync(process.argv[3] || 'supabase/migrations/20261015120000_business_plans.sql', 'utf8');

const quoted = (s) => [...s.matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1]);

// TS: ASAS = [...], EMAD = [...ASAS, ...], SARH = [...EMAD, ...]
const tsSets = {};
for (const name of ['ASAS', 'EMAD', 'SARH']) {
  const m = ts.match(new RegExp(`const ${name}: FeatureKey\\[\\] = \\[([^\\]]*)\\]`));
  if (!m) { console.error('FAIL: no ' + name + ' in lib/plans.ts'); process.exit(1); }
  const spread = (m[1].match(/\.\.\.([A-Z]+)/) || [])[1];
  tsSets[name.toLowerCase()] = new Set([...(spread ? tsSets[spread.toLowerCase()] : []), ...quoted(m[1])]);
}

const fn = sql.slice(sql.indexOf('create or replace function rk_plan_features'));
let fail = 0;
for (const plan of ['asas', 'emad', 'sarh']) {
  const m = fn.match(new RegExp(`when '${plan}' then array\\[([^\\]]*)\\]`));
  if (!m) { console.error('FAIL: no ' + plan + ' in rk_plan_features()'); fail++; continue; }
  const sqlSet = new Set(quoted(m[1]));
  const onlyTs = [...tsSets[plan]].filter((k) => !sqlSet.has(k));
  const onlySql = [...sqlSet].filter((k) => !tsSets[plan].has(k));
  if (onlyTs.length || onlySql.length) {
    console.error(`FAIL ${plan}: only in TS [${onlyTs}] · only in SQL [${onlySql}]`);
    fail++;
  } else {
    console.log(`ok ${plan}: ${sqlSet.size} features match`);
  }
}
process.exit(fail ? 1 : 0);
