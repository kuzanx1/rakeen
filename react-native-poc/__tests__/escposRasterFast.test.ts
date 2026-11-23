import { rgbaToEscPosRaster, rgbaToEscPosRasterLegacy, rasterJobBase64, bytesToBase64Fast, RgbaBuffer } from '../src/domain/escposRaster';
import { bytesToBase64 } from '../src/domain/escposText';

/** صورة شبه-فاتورة: خلفية بيضاء، سطور نص رمادية الحواف، شريط أسود. */
function fakeReceipt(width: number, height: number, opaque = true): RgbaBuffer {
  const data = new Uint8Array(width * height * 4);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const inLine = y % 40 < 22 && x > 30 && x < width - 30;
      const v = inLine ? (rnd() < 0.45 ? Math.floor(rnd() * 256) : 255) : 255;
      data[p] = v; data[p + 1] = Math.min(255, v + 3); data[p + 2] = Math.max(0, v - 2);
      data[p + 3] = opaque ? 255 : (rnd() < 0.9 ? 255 : Math.floor(rnd() * 256));
    }
  }
  return { width, height, data };
}

const oldJob = (b: RgbaBuffer, cmd: 'modern' | 'legacy') =>
  bytesToBase64([0x1b, 0x40, ...(cmd === 'modern' ? rgbaToEscPosRaster(b) : rgbaToEscPosRasterLegacy(b)), 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]);

/**
 * يُعيد بناءَ المهمّة كما لو أُرسلت كتلةً واحدة.
 *
 * فالمهمّةُ تُرسَل اليوم شرائحَ (bandedLegacyJob)، والمقارنةُ بايتاً
 * ببايتٍ مع المُرمِّز المرجعيِّ لا تصحّ إلا بعد لمِّ الشرائح. والذي
 * يُحرَس هنا هو ما يصل الطابعةَ من بكسلات: الشرائحُ تغيّر التغليفَ
 * لا الصورة.
 */
function unband(b64: string): string {
  const job = Uint8Array.from(Buffer.from(b64, 'base64'));
  const payload: number[] = [];
  let at = 2;
  let bpr = 0;
  let rows = 0;
  while (at + 8 <= job.length && job[at] === 0x1d && job[at + 1] === 0x76 && job[at + 2] === 0x30) {
    bpr = job[at + 4] | (job[at + 5] << 8);
    const n = job[at + 6] | (job[at + 7] << 8);
    rows += n;
    at += 8;
    for (let i = 0; i < bpr * n; i++) payload.push(job[at + i]);
    at += bpr * n;
  }
  const out: number[] = [job[0], job[1], 0x1d, 0x76, 0x30, 0x00, bpr & 0xff, (bpr >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff];
  for (const byte of payload) out.push(byte);
  while (at < job.length) out.push(job[at++]);
  return bytesToBase64(out);
}

/** عددُ شرائح GS v 0 في مهمّة. */
function bandCount(b64: string): number {
  const job = Uint8Array.from(Buffer.from(b64, 'base64'));
  let n = 0;
  for (let i = 0; i + 2 < job.length; i++) {
    if (job[i] === 0x1d && job[i + 1] === 0x76 && job[i + 2] === 0x30) n++;
  }
  return n;
}

describe('fast raster job', () => {
  for (const [w, h] of [[576, 900], [384, 501], [577, 33], [8, 1]] as const) {
    for (const cmd of ['legacy', 'modern'] as const) {
      it(`matches the old encoder byte for byte — ${w}x${h} ${cmd}`, () => {
        const b = fakeReceipt(w, h);
        const got = rasterJobBase64(b, cmd);
        expect(cmd === 'legacy' ? unband(got) : got).toBe(oldJob(b, cmd));
      });
    }
  }
  it('matches with partial alpha too', () => {
    const b = fakeReceipt(576, 300, false);
    expect(unband(rasterJobBase64(b, 'legacy'))).toBe(oldJob(b, 'legacy'));
  });

  /* والتقطيعُ نفسُه محروس: كتلةٌ واحدةٌ من مئة كيلوبايتٍ هي التي تجعل
     انقطاعاً واحداً يُخرج متر ورقٍ رموزاً. */
  it('تُرسَل شرائحَ لا كتلةً واحدة', () => {
    expect(bandCount(rasterJobBase64(fakeReceipt(576, 1356), 'legacy'))).toBe(Math.ceil(1356 / 128));
    expect(bandCount(rasterJobBase64(fakeReceipt(576, 128), 'legacy'))).toBe(1);
    expect(bandCount(rasterJobBase64(fakeReceipt(576, 129), 'legacy'))).toBe(2);
  });
  it('base64 handles every tail length', () => {
    for (let n = 0; n < 20; n++) {
      const bytes = Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(bytesToBase64Fast(Uint8Array.from(bytes))).toBe(bytesToBase64(bytes));
    }
  });
  it('is faster (timing, informational)', () => {
    const b = fakeReceipt(576, 1800);
    const t0 = Date.now(); for (let i = 0; i < 5; i++) oldJob(b, 'legacy'); const tOld = (Date.now() - t0) / 5;
    const t1 = Date.now(); for (let i = 0; i < 5; i++) rasterJobBase64(b, 'legacy'); const tNew = (Date.now() - t1) / 5;
    // eslint-disable-next-line no-console
    console.log(`576x1800 encode: old ${tOld.toFixed(1)} ms, new ${tNew.toFixed(1)} ms`);
    expect(tNew).toBeLessThan(tOld);
  });
});
