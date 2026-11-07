import { inkMask } from '../src/domain/escposRaster';

// كاشير الويب ينسخ نفس الخوارزمية (CLAUDE.md: التطبيق أولاً ثم الويب) -- هذا يمنعهما يفترقان.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const src: string = require('fs').readFileSync(require('path').join(__dirname, '../../public/pos/rakeen-pos.js'), 'utf8');
const start = src.indexOf('function receiptInkMask(');
const end = src.indexOf('function canvasToEscPosRaster(');
// eslint-disable-next-line no-new-func
const webInkMask = new Function(src.slice(start, end) + '; return receiptInkMask;')();

test('web receiptInkMask == app inkMask for every darkness, with and without protect', () => {
  const w = 37, h = 23;
  const data = new Uint8Array(w * h * 4);
  let seed = 7;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = seed % 256;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const protect = [{ x: 5, y: 4, w: 10, h: 9 }];
  for (const d of ['normal', 'dark', 'darker'] as const) {
    for (const p of [undefined, protect]) {
      const app = inkMask({ width: w, height: h, data }, { darkness: d, protect: p });
      const web = webInkMask(data, w, h, d, p || null);
      expect(Array.from(web)).toEqual(Array.from(app));
    }
  }
});
