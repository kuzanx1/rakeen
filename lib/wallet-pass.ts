import forge from "node-forge";

/**
 * بناء ملف .pkpass وتوقيعه.
 *
 * بطاقة Apple Wallet ملفٌ مضغوط فيه: وصفٌ بصيغة JSON، وصور، وبصمةٌ لكل
 * ملف (manifest.json)، وتوقيعٌ منفصل على تلك البصمات بشهادة Pass Type
 * ID. وآبل ترفض البندل كله إن اختلّت واحدة منها.
 *
 * والتوقيع PKCS#7 منفصل -- وهو ما لا تفعله WebCrypto، ولهذا node-forge:
 * جافاسكربت خالص يعمل على Workers مع nodejs_compat. وقد أُثبت عملياً
 * قبل كتابة هذا الملف: وُقّع manifest بشهادة هبية الحقيقية وتحقّق منه
 * openssl عبر سلسلة آبل كاملة (الشهادة ← WWDR G4 ← Apple Root CA).
 *
 * ولا مكتبة zip: صيغة ZIP المخزّنة (بلا ضغط) عشرات الأسطر، وإضافة
 * اعتمادية كاملة لأجلها في حزمة Worker تُحسب بالكيلوبايت ليست مقايضة
 * رابحة.
 */

/** الوسيطة عامة -- تُنزَّل من آبل علناً، فمكانها المستودع لا الأسرار. */
export const APPLE_WWDR_G4_PEM = `-----BEGIN CERTIFICATE-----
MIIEVTCCAz2gAwIBAgIUE9x3lVJx5T3GMujM/+Uh88zFztIwDQYJKoZIhvcNAQEL
BQAwYjELMAkGA1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsT
HUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBS
b290IENBMB4XDTIwMTIxNjE5MzYwNFoXDTMwMTIxMDAwMDAwMFowdTFEMEIGA1UE
Aww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlvbnMgQ2VydGlmaWNh
dGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc0MRMwEQYDVQQKDApBcHBsZSBJbmMu
MQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANAf
eKp6JzKwRl/nF3bYoJ0OKY6tPTKlxGs3yeRBkWq3eXFdDDQEYHX3rkOPR8SGHgjo
v9Y5Ui8eZ/xx8YJtPH4GUnadLLzVQ+mxtLxAOnhRXVGhJeG+bJGdayFZGEHVD41t
QSo5SiHgkJ9OE0/QjJoyuNdqkh4laqQyziIZhQVg3AJK8lrrd3kCfcCXVGySjnYB
5kaP5eYq+6KwrRitbTOFOCOL6oqW7Z+uZk+jDEAnbZXQYojZQykn/e2kv1MukBVl
PNkuYmQzHWxq3Y4hqqRfFcYw7V/mjDaSlLfcOQIA+2SM1AyB8j/VNJeHdSbCb64D
YyEMe9QbsWLFApy9/a8CAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8G
A1UdIwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0
BggrBgEFBQcwAYYoaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJv
b3RjYTAuBgNVHR8EJzAlMCOgIaAfhh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290
LmNybDAdBgNVHQ4EFgQUW9n6HeeaGgujmXYiUIY+kchbd6gwDgYDVR0PAQH/BAQD
AgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IBAQA/Vj2e5bbD
eeZFIGi9v3OLLBKeAuOugCKMBB7DUshwgKj7zqew1UJEggOCTwb8O0kU+9h0UoWv
p50h5wESA5/NQFjQAde/MoMrU1goPO6cn1R2PWQnxn6NHThNLa6B5rmluJyJlPef
x4elUWY0GzlxOSTjh2fvpbFoe4zuPfeutnvi0v/fYcZqdUmVIkSoBPyUuAsuORFJ
EtHlgepZAE9bPFo22noicwkJac3AfOriJP6YRLj477JxPxpd1F1+M02cHSS+APCQ
A1iZQT0xWmJArzmoUUOSqwSonMJNsUvSq3xKX+udO7xPiEAGE/+QF4oIRynoYpgp
pU8RBWk6z/Kf
-----END CERTIFICATE-----`;

export interface PassEnv {
  PASS_KEY_PEM: string;
  PASS_CERT_PEM: string;
  PASS_TYPE_ID: string;
  PASS_TEAM_ID: string;
}

export interface PassData {
  customerId: number;
  publicToken: string;
  customerName: string;
  businessName: string;
  systemType: "points" | "visits" | "products";
  points: number;
  visits: number;
  units: number;
  freeRewards: number;
  visitsThreshold: number;
  unitsThreshold: number;
  rewardLabel: string;
  accentColor: string;
  tagline: string;
  authToken: string;
  webServiceURL: string;
}

/** "#C4FF2B" -> "rgb(196, 255, 43)". آبل لا تقبل الست عشري. */
function toRgb(hex: string, fallback = "rgb(20, 20, 20)"): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/**
 * التقدّم كما يُقرأ لا كما يُخزَّن.
 *
 * "٤ من ٦" لا "٤". والرقم وحده لا يقول شيئاً لمن ينظر إلى بطاقته في
 * الطابور -- وهذا هو الغرض كله من وضعها في المحفظة.
 */
function progressFields(d: PassData) {
  if (d.systemType === "visits") {
    return {
      label: "زياراتك",
      value: `${d.visits} من ${d.visitsThreshold}`,
    };
  }
  if (d.systemType === "products") {
    return {
      label: "رصيدك",
      value: `${d.units} من ${d.unitsThreshold}`,
    };
  }
  return { label: "نقاطك", value: String(d.points) };
}

export function buildPassJson(d: PassData, env: PassEnv): Record<string, unknown> {
  const progress = progressFields(d);
  const ready = d.freeRewards > 0;
  return {
    formatVersion: 1,
    passTypeIdentifier: env.PASS_TYPE_ID,
    teamIdentifier: env.PASS_TEAM_ID,
    // الرقم التسلسلي هو الرمز العام للزبون: موجودٌ أصلاً، وفريد، ولا
    // يكشف شيئاً عنه. ولا يُخترع له معرّفٌ ثانٍ يُحفظ ويُزامن.
    serialNumber: d.publicToken,
    organizationName: d.businessName,
    description: `بطاقة ولاء ${d.businessName}`,
    logoText: d.businessName,
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: toRgb(d.accentColor, "rgb(20, 20, 20)"),
    labelColor: "rgb(255, 255, 255)",
    webServiceURL: d.webServiceURL,
    authenticationToken: d.authToken,
    // الباركود هو الرمز نفسه: الكاشير يمسحه فيجد الزبون بلا أن يسأله
    // رقم جواله ولا أن يكتبه.
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: d.publicToken,
        messageEncoding: "iso-8859-1",
        altText: d.customerName || undefined,
      },
    ],
    storeCard: {
      headerFields: [
        { key: "progress", label: progress.label, value: progress.value, textAlignment: "PKTextAlignmentRight" },
      ],
      primaryFields: ready
        ? [{ key: "ready", label: "جاهزة الآن", value: d.rewardLabel }]
        : [],
      secondaryFields: [
        { key: "name", label: "العميل", value: d.customerName || "—" },
      ],
      auxiliaryFields: ready
        ? [{ key: "count", label: "مكافآت جاهزة", value: String(d.freeRewards) }]
        : [],
      backFields: [
        { key: "tagline", label: d.businessName, value: d.tagline || "شكراً لولائك" },
        { key: "how", label: "كيف تستخدمها", value: "اعرض هذه البطاقة عند الكاشير. حين تجهز مكافأتك، اطلبها منه ويصلك تنبيه للتأكيد." },
      ],
    },
  };
}

/** SHA-1 لكل ملف -- هي ما تشترطه آبل في manifest.json، لا SHA-256. */
async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * التوقيع: PKCS#7 منفصل على بايتات manifest.json.
 *
 * والوسيطة تُضاف إلى البندل ولا تُوقِّع: بدونها لا يستطيع الجهاز ربط
 * شهادتنا بجذر آبل، فيرفض البطاقة وهي موقّعة صحيحاً.
 */
export function signManifest(manifestBytes: Uint8Array, env: PassEnv): Uint8Array {
  const cert = forge.pki.certificateFromPem(env.PASS_CERT_PEM);
  const key = forge.pki.privateKeyFromPem(env.PASS_KEY_PEM);
  const wwdr = forge.pki.certificateFromPem(APPLE_WWDR_G4_PEM);

  const p7 = forge.pkcs7.createSignedData();
  // بايتاتٌ خام لا نصّ: createBuffer بلا ترميز تعامل السلسلة على أنها
  // وحدات bytes كما هي، وهو المطلوب -- وتمرير "binary" ترفضه أنواعها.
  // والبناء بالتقطيع لا بـspread واحد: مصفوفةٌ بطول manifest تُمرَّر
  // معاملاتٍ تتجاوز حدّ المكدّس على المدخلات الكبيرة.
  let manifestBinary = "";
  for (let i = 0; i < manifestBytes.length; i += 4096) {
    manifestBinary += String.fromCharCode(...manifestBytes.subarray(i, i + 4096));
  }
  p7.content = forge.util.createBuffer(manifestBinary);
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const out = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i) & 0xff;
  return out;
}

/* ============ ZIP مخزّن، بلا اعتمادية ============
   .pkpass ملف ZIP عادي. والبنية المخزّنة (طريقة 0، بلا ضغط) بضعة
   حقول ثابتة -- وإضافة مكتبة ضغط كاملة إلى حزمة Worker لأجلها ليست
   مقايضة رابحة. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);           // النسخة المطلوبة
    lv.setUint16(8, 0, true);            // طريقة 0 = مخزّن
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    locals.push(local, f.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length + f.data.length;
  }

  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const chunk of [...locals, ...centrals, end]) { out.set(chunk, p); p += chunk.length; }
  return out;
}

/**
 * البندل كاملاً: الوصف، والصور، والبصمات، والتوقيع.
 *
 * والصور إلزامية: بطاقة بلا icon.png ترفضها آبل بلا رسالة تقول لماذا.
 */
export async function buildPkPass(
  passJson: Record<string, unknown>,
  images: { name: string; data: Uint8Array }[],
  env: PassEnv,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const files: { name: string; data: Uint8Array }[] = [
    { name: "pass.json", data: enc.encode(JSON.stringify(passJson)) },
    ...images,
  ];

  const manifest: Record<string, string> = {};
  for (const f of files) manifest[f.name] = await sha1Hex(f.data);
  const manifestBytes = enc.encode(JSON.stringify(manifest));

  files.push({ name: "manifest.json", data: manifestBytes });
  files.push({ name: "signature", data: signManifest(manifestBytes, env) });
  return buildZip(files);
}
