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
  /** الرموز التي قبلها APNs -- وحدها تُعلَّم مدفوعةً. */
  ok: string[];
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
  const out: PushResult = { sent: 0, failed: 0, ok: [], invalid: [] };
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
          /**
           * أولويةٌ عالية، وصلاحيةٌ ساعة.
           *
           * كانت 5 -- وهي الأولوية التي يؤجّلها iOS إلى وقتٍ يراه
           * مناسباً: يجمعها ويوقظ الجهاز حين يستيقظ لغيرها. فيقبل APNs
           * الإشعار ويردّ 200، ولا يسأل الجهازُ عن بطاقته لساعات. وهو
           * ما كان يحدث: إرسالٌ ناجح بلا أثر.
           *
           * وapns-expiration كان صفراً بالافتراض -- أي "سلّمه الآن أو
           * ارمه". وجهازٌ في جيبٍ بلا شبكة لحظةَ الإرسال يفقد التحديث
           * إلى الأبد. وساعةٌ تكفي ليعود من مصعدٍ أو رحلة.
           */
          "apns-priority": "10",
          "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
          "content-type": "application/json",
        },
        body: "{}",
      });
      if (res.ok) { out.sent++; out.ok.push(token); }
      else {
        out.failed++;
        /**
         * وسببُ الرفض يُقرأ ويُسجَّل.
         *
         * آبل تردّ برمزٍ وجسمٍ فيه reason -- BadDeviceToken أو
         * DeviceTokenNotForTopic أو غيرهما. وكنّا نعدّه فشلاً بلا اسم،
         * فيبقى "failed: 1" لا يقول ما العطل ولا أين يُصلَح.
         */
        let why = "";
        try { why = ((await res.json()) as { reason?: string }).reason || ""; } catch { /* بلا جسم */ }
        console.error(`APNs ${res.status} ${why} token=${token.slice(0, 12)}…`);
        if (res.status === 410) out.invalid.push(token);
      }
    } catch (err) {
      out.failed++;
      console.error("APNs fetch failed", err);
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

/**
 * بيئة الإشعارات من ربط Cloudflare.
 *
 * وAPNS_MTLS ربطٌ لا متغيّر بيئة: كائنٌ يحمل fetch يُوقّع بشهادة
 * البطاقة، فلا يقرأ من process.env بل من سياق العامل. وغيابُه ليس
 * خطأً -- البطاقات تعمل بلا إشعار، ويغيب التحديث اللحظي وحده.
 */
export async function apnsEnv(): Promise<ApnsEnv | null> {
  const topic = process.env.PASS_TYPE_ID;
  if (!topic) return null;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const mtls = (env as unknown as { APNS_MTLS?: { fetch: typeof fetch } }).APNS_MTLS;
    if (!mtls) return null;
    return { APNS_MTLS: mtls, PASS_TYPE_ID: topic, APNS_HOST: process.env.APNS_HOST };
  } catch {
    return null;
  }
}
