// يولّد أصوات بيجر ركين (public/pager/*.wav) -- تُشغَّل مرة ويُحفظ ناتجها.
//   node tools/pager/make-sounds.cjs
//
// ملفاتٌ لا Web Audio وحده: عنصر <audio> بدأ بضغطة الزبون يبقى مسموحاً
// له أن يرنّ والصفحة في الخلفية (أندرويد)، والمولّدُ الحيّ يُعلَّق.
// و«الصامت» يبقي الصفحة حيّة ويُظهر الطلب في «قيد التشغيل» على شاشة القفل.
const fs = require('fs');
const path = require('path');

const RATE = 16000;
const OUT = path.join(__dirname, '..', '..', 'public', 'pager');
fs.mkdirSync(OUT, { recursive: true });

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-1, Math.min(1, v)) * 32767 | 0, i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function track(seconds) { return new Float64Array(Math.round(seconds * RATE)); }

/** نغمةُ جرس: أساسٌ وتوافقيّات تخفت أُسّياً. */
function bell(buf, at, freq, dur, amp) {
  const s0 = Math.round(at * RATE);
  const n = Math.round(dur * RATE);
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 3.2);
    buf[s0 + i] += amp * env * (
      Math.sin(2 * Math.PI * freq * t) +
      0.45 * Math.sin(2 * Math.PI * freq * 2.01 * t) * Math.exp(-t * 2) +
      0.22 * Math.sin(2 * Math.PI * freq * 3.02 * t) * Math.exp(-t * 4));
  }
}

/** صفيرُ البيجر: موجةٌ مربّعةٌ ناعمة الحواف. */
function beep(buf, at, freq, dur, amp) {
  const s0 = Math.round(at * RATE);
  const n = Math.round(dur * RATE);
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / RATE;
    const edge = Math.min(1, t / 0.005, (dur - t) / 0.005);
    let v = 0;
    for (let k = 1; k <= 7; k += 2) v += Math.sin(2 * Math.PI * freq * k * t) / k;
    buf[s0 + i] += amp * edge * v * 0.8;
  }
}

function normalize(buf, peak = 0.92) {
  let m = 0;
  for (const v of buf) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] = buf[i] / m * peak;
  return buf;
}

// نغمة: «دينغ-دونغ» مرتين.
{
  const b = track(3.2);
  [0, 1.5].forEach(o => { bell(b, o, 1318.5, 1.4, 1); bell(b, o + 0.38, 1046.5, 1.4, 1); });
  fs.writeFileSync(path.join(OUT, 'chime.wav'), wav(normalize(b)));
}
// جرس: ثلاث دقّات صاعدة.
{
  const b = track(3.0);
  [0, 1.4].forEach(o => { bell(b, o, 1568, 1, 1); bell(b, o + 0.18, 1568, 1, 1); bell(b, o + 0.36, 2093, 1.1, 1); });
  fs.writeFileSync(path.join(OUT, 'bell.wav'), wav(normalize(b)));
}
// بيجر: أربع صفّارات، مرتين -- صوت أجهزة النداء نفسه.
{
  const b = track(2.6);
  [0, 1.2].forEach(o => { for (let k = 0; k < 4; k++) beep(b, o + k * 0.17, 2400, 0.11, 1); });
  fs.writeFileSync(path.join(OUT, 'beep.wav'), wav(normalize(b, 0.8)));
}
// صامت: ثانيتان من همسٍ لا يُسمع (صفرٌ خالص قد يُعدّ "لا تشغيل" فيُوقف).
{
  const b = track(2);
  for (let i = 0; i < b.length; i++) b[i] = Math.sin(i / 9) * 0.0004;
  fs.writeFileSync(path.join(OUT, 'keepalive.wav'), wav(b));
}
// تأكيد: نقرةٌ قصيرة حين يشغّل الزبون البيجر -- يعرف أن الصوت يعمل.
{
  const b = track(0.5);
  bell(b, 0, 1760, 0.45, 1);
  fs.writeFileSync(path.join(OUT, 'armed.wav'), wav(normalize(b, 0.7)));
}
for (const f of fs.readdirSync(OUT)) console.log(f, fs.statSync(path.join(OUT, f)).size);
