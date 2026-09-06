import forge from "node-forge";

/**
 * إيقاظ البطاقة في جيب صاحبها.
 *
 * إشعار PassKit جسمه `{}` فارغ: لا عنوان ولا نص ولا صوت. لا يظهر شيء
 * على الشاشة -- هو إشارة إلى المحفظة وحدها تقول "اسأل خادمك". فتسأل،
 * فتحدّث نفسها. والعميل يرى "٥ من ٦" وقد كانت "٤" وهو يمشي، بلا أن
 * يفتح شيئاً.
 *
 * والموضوع (topic) هو Pass Type ID لا معرّف تطبيق، والمصادقة بشهادة
 * الـPass Type ID نفسها -- وهي الوثيقة الوحيدة التي تسمح بالإرسال
 * لبطاقاتنا، ولا تسمح بغيرها.
 *
 * وHTTP/2 يشترطه APNs، وfetch على Workers تتفاوض عليه. أما mTLS -- تقديم
 * شهادة العميل -- فلا تفعله fetch القياسية، ولهذا يمرّ الإرسال عبر
 * mTLS binding الذي تتيحه Cloudflare: الشهادة تُرفع مرةً إليها، ويُرسل
 * بها بلا أن تغادر مفاتيحها الخادم.
 */

export interface ApnsEnv {
  /** ربط mTLS من Cloudflare، حين يكون مضبوطاً. */
  APNS_MTLS?: { fetch: typeof fetch };
  PASS_TYPE_ID?: string;
  /** 'production' أو 'sandbox' -- البطاقات دائماً على الإنتاج. */
  APNS_HOST?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** الرموز التي ردّ APNs بأنها لم تعد صالحة، لتُحذف تسجيلاتها. */
  invalid: string[];
}

const DEFAULT_HOST = "https://api.push.apple.com";

/**
 * يرسل إشعاراً فارغاً لكل جهاز يحمل هذه البطاقة.
 *
 * ولا يتوقف عند أول فشل: جهازٌ حُذفت منه البطاقة لا يمنع إشعار الأجهزة
 * الأخرى. و410 معناها "هذا الرمز مات" -- تُجمع لتُنظَّف تسجيلاتها، لا
 * لتُعاد المحاولة عليها إلى الأبد.
 */
export async function pushToDevices(
  pushTokens: string[],
  env: ApnsEnv,
): Promise<PushResult> {
  const out: PushResult = { sent: 0, failed: 0, invalid: [] };
  const topic = env.PASS_TYPE_ID;
  const host = env.APNS_HOST || DEFAULT_HOST;
  const mtls = env.APNS_MTLS;

  // بلا ربط mTLS لا إرسال. والصمت هنا مقصود: البطاقة تبقى تُحدَّث حين
  // يفتحها صاحبه، والتحديث اللحظي وحده هو ما يغيب. فلا يُسقط ذلك بيعاً
  // ولا يُرمى خطأ في وجه كاشير.
  if (!mtls || !topic) return out;

  for (const token of pushTokens) {
    try {
      const res = await mtls.fetch(`${host}/3/device/${token}`, {
        method: "POST",
        headers: {
          "apns-topic": topic,
          "apns-push-type": "background",
          "apns-priority": "5",
          "content-type": "application/json",
        },
        body: "{}",
      });
      if (res.ok) out.sent++;
      else {
        out.failed++;
        if (res.status === 410) out.invalid.push(token);
      }
    } catch {
      out.failed++;
    }
  }
  return out;
}

/**
 * شهادة الإرسال من الأسرار، للاستعمال المحلي أو خارج Workers.
 *
 * تُبنى مرةً وتُعاد: تحليل PEM في كل نداء يضيف عملاً بلا سبب، والشهادة
 * لا تتغيّر بين النداءات.
 */
let cachedPem: { key: string; cert: string } | null = null;
export function apnsClientPem(): { key: string; cert: string } | null {
  if (cachedPem) return cachedPem;
  const { PASS_KEY_PEM, PASS_CERT_PEM } = process.env;
  if (!PASS_KEY_PEM || !PASS_CERT_PEM) return null;
  // يُتحقق من أنهما يُحلّلان قبل الاعتماد عليهما: سرٌّ لُصق ناقصاً
  // يُكتشف هنا لا عند أول زبون.
  try {
    forge.pki.privateKeyFromPem(PASS_KEY_PEM);
    forge.pki.certificateFromPem(PASS_CERT_PEM);
  } catch {
    return null;
  }
  cachedPem = { key: PASS_KEY_PEM, cert: PASS_CERT_PEM };
  return cachedPem;
}
