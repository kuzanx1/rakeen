/**
 * الحالاتُ المصوَّرة -- تُبنى من المصدر المشترك لا من نسخةٍ عنه.
 *
 * كانت مكتوبةً هنا، ومثلُها في التطبيق. فلو اختلفت واحدةٌ بحرفٍ أو
 * بكمية لَاختلفت الصورتان، ولا يُدرى: أالخطُّ اختلف أم الطلب؟
 *
 * فهي الآن من `shared/receipt/scenarios.ts` -- الملفُّ الذي يبني منه
 * التطبيقُ معاينتَه على الأيباد. صورةٌ بصورة، لطلبٍ واحد.
 */

import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function buildCases() {
  const dir = await mkdtemp(join(tmpdir(), 'rk-scenarios-'));
  try {
    const outfile = join(dir, 'scenarios.mjs');
    await build({
      entryPoints: [join(ROOT, 'shared/receipt/scenarios.ts')],
      bundle: true, format: 'esm', outfile,
      target: ['node18'], charset: 'utf8', logLevel: 'silent',
    });
    const mod = await import('file://' + outfile);
    return mod.buildScenarios();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
