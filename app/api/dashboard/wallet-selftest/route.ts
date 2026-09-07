import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import forge from "node-forge";
import { loadWalletRow, renderPass, serviceClient, passEnv } from "@/lib/wallet-service";

/**
 * هل المفتاح والشهادة زوجٌ واحد؟
 *
 * وُلدا معاً في ملف p12 ثم فُصلا وأُرسلا سرّين. وفصلٌ يقع فيه خطأ --
 * سطرٌ ناقص، أو شهادةٌ من طلبٍ سابق -- يُخرج توقيعاً صحيح الشكل باطل
 * المعنى: يُبنى البندل ولا يُشتكى منه، وترفضه المحفظة بصمت.
 *
 * والتحقق بمقارنة المُعامِل: مفتاحٌ عامٌّ في الشهادة ومفتاحٌ خاصٌّ
 * بيدنا، فإن اختلف مُعامِلاهما فليسا لبعضهما -- ولا شيء غير هذا يكشفه.
 */
function certKeyPair(certPem: string, keyPem: string) {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
    const pub = cert.publicKey as forge.pki.rsa.PublicKey;
    const match = pub.n.toString(16) === key.n.toString(16);
    const cn = cert.subject.getField("CN");
    const ou = cert.subject.getField("OU");
    /**
     * UID يُقرأ برقمه لا باسمه.
     *
     * node-forge لا تعرف "UID" اسماً -- هو حقلٌ من مخطّط مختلف
     * (0.9.2342.19200300.100.1.1). فسؤالُها عنه بالاسم يردّ فراغاً،
     * ويُقرأ الفراغُ "لا يطابق" -- وهو إنذارٌ كاذب من الفحص نفسه.
     *
     * والاسم الشائع احتياطٌ ثانٍ: CN فيها "Pass Type ID: pass.xxx".
     */
    const uid = cert.subject.getField({ type: "0.9.2342.19200300.100.1.1" });
    const cnUid = cn && /Pass Type ID:\s*(\S+)/.exec(String(cn.value));
    return {
      match,
      certCN: cn ? cn.value : null,
      certTeam: ou ? ou.value : null,
      certUID: uid ? uid.value : (cnUid ? cnUid[1] : null),
      notAfter: cert.validity.notAfter.toISOString().slice(0, 10),
      expired: cert.validity.notAfter.getTime() < Date.now(),
    };
  } catch (e) {
    return { match: false, parseError: String((e as Error)?.message || e).slice(0, 200) };
  }
}

/**
 * فحصٌ ذاتي لبطاقة المنشأة.
 *
 * البندل يُبنى في الخادم ويُفتح في جهاز الزبون، وبينهما لا شيء يُقرأ:
 * المحفظة ترفضه بصمت -- شاشةٌ سوداء تُغلق، بلا رسالة ولا سجلّ. فيبقى
 * صاحب المطعم يعيد المحاولة، ونحن نخمّن.
 *
 * فيُبنى هنا بنفس المسار وبنفس البيانات، ويُفكّ ويُوصَف: ما فيه من
 * ملفات، وأحجامها، وهل صورها PNG حقيقية، وهل بصماتها في manifest. وما
 * يُرفض لعلّةٍ في واحدٍ منها تُرى العلّة هنا بلا جهاز.
 *
 * ولا يُخرج البطاقة نفسها: هي بيدُ زبونٍ لا بيدِ مالك، ورمزُها يكفي
 * لإضافتها. والفحصُ يريد وصفَها لا نسخةً منها.
 */
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "no env" }, { status: 503 });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });

  // بجلسة المالك: يقرأ عملاء منشأته وحدها، فلا يفحص أحدٌ بطاقة غيره.
  const asOwner = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: cust } = await asOwner
    .from("customers").select("public_token").limit(1).maybeSingle();
  if (!cust?.public_token) {
    return NextResponse.json({ error: "ما فيه عملاء بعد — سجّل عميلاً واحداً وأعد الفحص." }, { status: 404 });
  }

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "no db" }, { status: 503 });
  const env = passEnv();
  if (!env) return NextResponse.json({ error: "شهادة المحفظة غير مضبوطة" }, { status: 503 });

  const row = await loadWalletRow(sb, cust.public_token);
  if (!row) return NextResponse.json({ error: "ما لقينا بيانات البطاقة" }, { status: 404 });

  let pk: Uint8Array | null = null;
  let buildError: string | null = null;
  try {
    pk = await renderPass(row, cust.public_token);
  } catch (e) {
    buildError = String((e as Error)?.message || e).slice(0, 300);
  }
  if (!pk) return NextResponse.json({ ok: false, stage: "build", buildError }, { status: 200 });

  /**
   * يُفكّ الأرشيف بقراءة فهرسه المركزي.
   *
   * ونحن كتبناه، فبنيتُه معروفة -- ولا حاجة إلى مكتبة فكٍّ لقراءة
   * أسماء ملفاته وأحجامها.
   */
  const files: { name: string; size: number; png?: boolean }[] = [];
  const dv = new DataView(pk.buffer, pk.byteOffset, pk.byteLength);
  for (let i = 0; i + 30 <= pk.length; i++) {
    if (dv.getUint32(i, true) !== 0x04034b50) continue;
    const nameLen = dv.getUint16(i + 26, true);
    const extraLen = dv.getUint16(i + 28, true);
    const size = dv.getUint32(i + 18, true);
    const name = new TextDecoder().decode(pk.subarray(i + 30, i + 30 + nameLen));
    const body = pk.subarray(i + 30 + nameLen + extraLen, i + 30 + nameLen + extraLen + size);
    const png = name.endsWith(".png")
      ? body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47
      : undefined;
    files.push({ name, size, ...(png === undefined ? {} : { png }) });
    i += 29;
  }

  const manifest = files.find(f => f.name === "manifest.json");
  const bad = files.filter(f => f.png === false).map(f => f.name);

  const pair = certKeyPair(env.PASS_CERT_PEM, env.PASS_KEY_PEM);

  /**
   * وهل يطابق ما في pass.json ما في الشهادة؟
   *
   * iOS يقارنهما حرفاً بحرف: passTypeIdentifier بـUID الشهادة،
   * وteamIdentifier بـOU فيها. واختلافُ حرفٍ واحد يعني بطاقةً يرفضها
   * الجهاز بصمت -- بلا رسالة، وبتوقيعٍ صحيح تماماً. وهذا أشيع سببٍ
   * لبطاقةٍ "كل شيء فيها سليم" ولا تُضاف.
   *
   * والقيمتان من الأسرار لا من الشهادة، فقد تفترقان عنها بلا أن يظهر
   * أثرُ الافتراق في أي فحصٍ آخر.
   */
  const idsMatch = {
    teamIdInPass: env.PASS_TEAM_ID,
    teamIdInCert: pair.certTeam || null,
    teamOk: !!pair.certTeam && env.PASS_TEAM_ID === pair.certTeam,
    passTypeInPass: env.PASS_TYPE_ID,
    passTypeInCert: pair.certUID || null,
    passTypeOk: !!pair.certUID && env.PASS_TYPE_ID === pair.certUID,
  };

  return NextResponse.json({
    ok: bad.length === 0 && pair.match && !pair.expired && idsMatch.teamOk && idsMatch.passTypeOk,
    certificate: pair,
    identifiers: idsMatch,
    bundleBytes: pk.length,
    files: files.map(f => `${f.name} — ${f.size}b${f.png === false ? " ⚠ ليست PNG" : ""}`),
    notRealPng: bad,
    hasManifest: !!manifest,
    hasSignature: files.some(f => f.name === "signature"),
    passTypeId: env.PASS_TYPE_ID,
    teamId: env.PASS_TEAM_ID,
    /**
     * ورابطان يُفتحان على الجهاز نفسه.
     *
     * الأول بالبطاقة كاملة، والثاني مبسّطة. وما نجح منهما يقسم
     * الاحتمالات نصفين في مسحةٍ واحدة -- بدل أن يُجرَّب عشرون حقلاً
     * واحداً واحداً على جهازٍ لا نراه.
     */
    testFull: `https://rakeenapp.com/api/wallet/pass/${cust.public_token}`,
    testMinimal: `https://rakeenapp.com/api/wallet/pass/${cust.public_token}?minimal=1`,
    testBare: `https://rakeenapp.com/api/wallet/pass/${cust.public_token}?bare=1`,
    bisect: ["hdrtier", "hdrready", "hdr"].map(k =>
      `${k}: https://rakeenapp.com/api/wallet/pass/${cust.public_token}?drop=${k}`),
    systemType: row.systemType,
    iconStyle: row.iconStyle,
  });
}
