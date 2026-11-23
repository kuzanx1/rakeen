import { supabase, RAKEEN_API_BASE_URL } from '../infrastructure/supabaseClient';
import { getDeviceConfig } from './authService';
import { dayCutoffHour, businessDayKey } from './orderSeries';
import { appInfo } from './appUpdateService';

/**
 * صحّةُ الطباعة تصعد وحدَها، فلا نسأل العميلَ صورةَ شاشة.
 *
 * أمضينا ليلةً كاملةً نخمّن سرعةَ طابعةٍ لا نملكها: ثلاثةُ أرقامِ تهدئةٍ
 * متعاقبةٍ كلُّها حسابٌ لا قياس، وآخرُها تبيّن أنّه يُجوّع رأسَ الطابعة.
 * ولم نعرف ذلك إلّا من فيديوٍ صوّره المالكُ بجوّاله. فالقياسُ يصعد من
 * الجهاز من الآن.
 *
 * ورقمان يكفيان: البايتاتُ على الملّي ثانية (أي سرعةُ الكابل فعلاً)،
 * وعددُ مرّاتِ انقطاعِ الإرسال (وهي العلامةُ التي تسبق الخربشة). الأوّلُ
 * يُغني عن «هل صارت أسرع؟»، والثاني عن انتظارِ شكوى زبون.
 *
 * ولا صفٌّ لكلِّ فاتورة: يُجمَع هنا ويُرسل عند حدث. ومئةُ مقهى تطبع مئةَ
 * ألفِ ورقةٍ يومياً، وحجمُ القاعدة هو جدارُنا لا كلفةُ كلاودفلير.
 *
 * ولا مؤقّت: الرفعُ عند انقطاعٍ (فوراً)، وعند إغلاق الوردية، وكلَّ خمسٍ
 * وعشرين ورقة. والقاعدةُ عند المالك صريحة: لا setInterval يسأل الخادمَ
 * شيئاً.
 *
 * وإخفاقُ الرفع لا يعني شيئاً: الورقةُ طُبعت. تُحفظ المجاميعُ وتُضمّ إلى
 * الدفعة التالية، فالأرقامُ تصل متأخّرةً لا ناقصة.
 */

interface Bucket {
  transportKind: 'usb' | 'network' | 'bluetooth' | '';
  jobsOk: number;
  jobsFailed: number;
  truncations: number;
  transportMsSum: number;
  transportMsMax: number;
  bytesSum: number;
  lastError: string | null;
}

/** مفتاحُ الطابعة -> مجاميعُها. وأكثرُ مطعمٍ طابعتان أو ثلاث. */
const buckets = new Map<string, Bucket>();
let sinceFlush = 0;
let flushing = false;

const FLUSH_EVERY_JOBS = 25;
const MAX_PRINTERS = 8;

function bucketOf(key: string, kind: Bucket['transportKind']): Bucket {
  const found = buckets.get(key);
  if (found) return found;
  const fresh: Bucket = {
    transportKind: kind,
    jobsOk: 0, jobsFailed: 0, truncations: 0,
    transportMsSum: 0, transportMsMax: 0, bytesSum: 0, lastError: null,
  };
  // طابعاتٌ أكثرُ من المعقول تعني مفتاحاً يتغيّر مع كلِّ فاتورة -- وذلك
  // عطبٌ في المفتاح لا في المطعم. فلا نُنمِّي الخريطةَ بلا حدّ.
  if (buckets.size < MAX_PRINTERS) buckets.set(key, fresh);
  return fresh;
}

/**
 * ورقةٌ انتهت. يُنادى بعد كلِّ محاولةٍ، نجحت أو أخفقت.
 *
 * `target` هو ما يصفه printService (describeTarget): «USB 1a86:7584» أو
 * «192.168.1.50:9100» أو «BLE xx». وهو المفتاحُ نفسُه الذي تُنسب إليه
 * الأرقامُ في اللوحة، فطابعةُ المطبخ لا تُخلَط بطابعة الكاشير.
 */
export function recordPrintOutcome(args: {
  target: string;
  ok: boolean;
  bytes: number;
  transportMs: number;
  errorDetail?: string | null;
}): void {
  try {
    const kind: Bucket['transportKind'] = args.target.startsWith('USB ')
      ? 'usb'
      : args.target.startsWith('BLE ')
        ? 'bluetooth'
        : args.target.includes(':')
          ? 'network'
          : '';
    const b = bucketOf(args.target, kind);
    if (args.ok) {
      b.jobsOk++;
      // المجاميعُ من الناجحة وحدَها: فاتورةٌ أخفقت لم تمرّ على الكابل
      // كلُّها، فبايتاتُها على زمنِها رقمٌ لا يعني شيئاً -- ويفسد المعدّل.
      b.bytesSum += Math.max(0, Math.round(args.bytes));
      b.transportMsSum += Math.max(0, Math.round(args.transportMs));
      b.transportMsMax = Math.max(b.transportMsMax, Math.round(args.transportMs));
    } else {
      b.jobsFailed++;
      if (args.errorDetail) b.lastError = String(args.errorDetail).slice(0, 200);
      // «truncated_write» وحدَها هي العلامة. وبقيّةُ الأعطال (كابلٌ
      // مفكوك، طابعةٌ مطفأة، عنوانٌ غلط) أعطالٌ ظاهرةٌ يراها الكاشيرُ
      // بنفسه، ولا تسبق خربشةً.
      if (args.errorDetail === 'truncated_write') {
        b.truncations++;
        // انقطاعٌ: يُرفع في حينه لا بعد خمسٍ وعشرين ورقة. هذا هو الخبرُ
        // الذي نريده قبل أن يراه زبون.
        void flushPrintHealth();
        return;
      }
    }
    sinceFlush++;
    if (sinceFlush >= FLUSH_EVERY_JOBS) void flushPrintHealth();
  } catch {
    // قياسٌ لا يُعطّل طباعةً.
  }
}

/** يومُ العمل YYYY-MM-DD -- بساعةِ إقفال المحل لا منتصف الليل، فورديةٌ
 *  تمتدّ إلى الفجر لا تُنقسم صفّين. */
function businessDayIso(): string {
  const cutoff = dayCutoffHour();
  const key = businessDayKey(cutoff == null ? 0 : cutoff);
  const y = Math.floor(key / 10000);
  const m = Math.floor((key % 10000) / 100);
  const d = key % 100;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * يرفع ما تجمّع. لا يرمي، ولا ينتظره أحد.
 *
 * وما يُرسل يُؤخذ من الخريطة قبل الشبكة ثم تُفرَّغ: ورقةٌ تُطبع أثناء
 * الرفع تبدأ مجاميعَ جديدةً ولا تُحسب مرّتين. وإن أخفق الرفعُ رُدَّت
 * المجاميعُ إلى الخريطة.
 */
export async function flushPrintHealth(): Promise<void> {
  if (flushing || buckets.size === 0) return;
  flushing = true;
  const taken = [...buckets.entries()];
  buckets.clear();
  sinceFlush = 0;
  try {
    const device = await getDeviceConfig();
    if (device.businessId == null) throw new Error('no_business');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('no_session');
    const info = appInfo();
    const res = await fetch(`${RAKEEN_API_BASE_URL}/api/pos/print-health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        branchId: device.branchId ?? null,
        day: businessDayIso(),
        deviceLabel: device.branchName ? `${device.branchName}` : '',
        appVersion: info?.versionName || '',
        client: 'app',
        printers: taken.map(([key, b]) => ({
          printerKey: key,
          transportKind: b.transportKind,
          jobsOk: b.jobsOk,
          jobsFailed: b.jobsFailed,
          truncations: b.truncations,
          // التهدئةُ تُستحقّ بالانقطاع، فوقوعُه هو وقوعُها.
          paced: b.truncations > 0,
          transportMsSum: b.transportMsSum,
          transportMsMax: b.transportMsMax,
          bytesSum: b.bytesSum,
          lastError: b.lastError,
        })),
      }),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
  } catch {
    // تُردُّ المجاميعُ، وتصل مع الدفعة التالية.
    for (const [key, b] of taken) {
      const cur = buckets.get(key);
      if (!cur) {
        if (buckets.size < MAX_PRINTERS) buckets.set(key, b);
        continue;
      }
      cur.jobsOk += b.jobsOk;
      cur.jobsFailed += b.jobsFailed;
      cur.truncations += b.truncations;
      cur.transportMsSum += b.transportMsSum;
      cur.transportMsMax = Math.max(cur.transportMsMax, b.transportMsMax);
      cur.bytesSum += b.bytesSum;
      cur.lastError = cur.lastError ?? b.lastError;
    }
  } finally {
    flushing = false;
  }
}

/** ما تجمّع ولم يُرفع بعد -- لشاشةِ التشخيص، فيرى الكاشيرُ الرقمَ نفسَه
 *  الذي نراه نحن. */
export function pendingPrintHealth(): Array<{ key: string; jobs: number; kbPerSecond: number | null; truncations: number }> {
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    jobs: b.jobsOk + b.jobsFailed,
    kbPerSecond: b.transportMsSum > 0 ? (b.bytesSum / 1024) / (b.transportMsSum / 1000) : null,
    truncations: b.truncations,
  }));
}
