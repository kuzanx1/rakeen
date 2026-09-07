// Wraps the OpenNext-generated worker to add a Cron Trigger `scheduled`
// handler for the automatic customer win-back push (Settings → الولاء).
// `.open-next/worker.js` is a build artifact regenerated on every deploy —
// this file is not, so it's a stable home for anything OpenNext's own
// entrypoint doesn't provide. Plain .js on purpose: it only resolves after
// `next build` + the OpenNext build have already produced
// `.open-next/worker.js`, so it must stay outside tsconfig's `**/*.ts`
// include glob (which runs before that directory exists).
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
import openNextWorker from "./.open-next/worker.js";

// media.rakeenapp.com used to bypass this Worker entirely — R2's own custom
// domain served it straight from the bucket (see wrangler.jsonc's r2_buckets
// comment). Adding the *.rakeenapp.com/* wildcard route for per-business
// online menus made this Worker match that hostname too, and Workers Routes
// take priority over R2 custom domains, so those requests started landing in
// Next.js (which has no page for a raw object key) instead of R2. This
// restores the original behavior by serving straight from the bucket here.
async function serveMediaBucket(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!key) return new Response("Not found", { status: 404 });

  const ifNoneMatch = request.headers.get("if-none-match");
  const object = await env.MEDIA_BUCKET.get(key, {
    onlyIf: ifNoneMatch ? { etagDoesNotMatch: ifNoneMatch } : undefined,
  });
  if (object === null) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  // @font-face (unlike <img>/background-image) enforces CORS even for a
  // same-site-looking cross-origin font load — the online storefront's
  // self-hosted Thmanyah font otherwise silently fails to load with no
  // console signal beyond a CORS error. Every object in this bucket is
  // already fully public, so a blanket allow-origin costs nothing.
  headers.set("access-control-allow-origin", "*");

  if (!object.body) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

// وسم توثيق ملكية النطاق يُرفَع إلى <head>.
//
// وزارة التجارة تقرأ <head> وحده -- دليلها يقول "داخل قسم <head>" --
// وNext يبعث وسوم الميتاداتا بعد إقفاله، فتستقرّ في <body>. المتصفّح لا
// يبالي، والزاحف يبالي: يفتح الصفحة، لا يجد الوسم حيث نصّ عليه، ويردّ
// الطلب. وهذا ما حدث فعلاً في أول محاولة.
//
// فيُنسَخ الوسم إلى موضعه قبل أن تخرج الصفحة. ونسخاً لا نقلاً: React
// يعيد بناء ما في <body> عند التحميل، فحذفه من هناك يفتح باب اختلافٍ
// بين ما بناه الخادم وما يبنيه المتصفّح، مقابل لا شيء.
//
// ويُقرأ الجسم كاملاً هنا -- وهو صفحةٌ في عشرة كيلوبايت تخرج في دفعة
// واحدة أصلاً، فلا بثَّ يُفقد. ويُطبَّق على جذر نطاق المتجر وحده: هو
// العنوان الوحيد الذي يفتحه الزاحف.
const VERIFY_MARKER = "x-rakeen-verify";

function metaTagRegex(name) {
  return new RegExp(
    '<meta\\s+name="' + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"\\s+content="[^"]*"\\s*/?>',
    "i",
  );
}

async function hoistVerificationMeta(response) {
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;
  let html;
  try {
    html = await response.text();
  } catch {
    return response;
  }
  try {
    const marker = metaTagRegex(VERIFY_MARKER).exec(html);
    const name = marker && /content="([^"]*)"/i.exec(marker[0]);
    const headEnd = html.search(/<\/head>/i);
    const tag = name && metaTagRegex(name[1]).exec(html);
    // موجودٌ في الترويسة أصلاً؟ فلا شيء يُفعل -- ولا يُضاعَف.
    if (tag && headEnd > 0 && tag.index > headEnd) {
      html = html.slice(0, headEnd) + tag[0] + html.slice(headEnd);
    }
  } catch {
    /* الصفحة تخرج كما هي: توثيقٌ لا يتمّ أهونُ من متجرٍ لا يفتح. */
  }
  // الطول والترميز يتغيّران بإعادة البناء، فتُطرح ترويستاهما لتُحسبا من
  // جديد -- وإبقاؤهما يعني جسماً يخالف ما تصفه ترويسته.
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

// مسار ملف التوثيق يُسوّى قبل أن يصل إلى Next.
//
// Next يردّ 308 على "//ملف.txt" و"ملف.txt/" ليصحّح الشكل. والمتصفّح
// يتبع التحويل فلا يلاحظ، أما زاحف التحقق فكثيرٌ منها يرفض التحويل
// أصلاً -- لأن اتّباعه يعني إثبات ملكية موقعٍ يوجّه إلى موقع آخر. فيصل
// إليه 308 حيث ينتظر 200، ويُسجَّل فشلاً لا سببَ ظاهراً له.
//
// وشرطةٌ زائدة ليست خطأً يُفترض ألا يقع: من ركّب الرابط من عنوانٍ
// ينتهي بشرطةٍ واسمِ ملفٍ يبدأ بشرطة حصل عليها بلا أن يخطئ. فتُسوّى
// هنا، ويصل الطلب إلى وجهته من أول مرة.
function normalizeVerificationPath(request, url) {
  const m = /^\/{2,}([A-Za-z0-9][A-Za-z0-9._-]{0,78}\.txt)\/*$|^\/([A-Za-z0-9][A-Za-z0-9._-]{0,78}\.txt)\/+$/.exec(url.pathname);
  if (!m) return request;
  const fixed = new URL(url);
  fixed.pathname = "/" + (m[1] || m[2]);
  return new Request(fixed, request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "media.rakeenapp.com") {
      return serveMediaBucket(request, env);
    }
    if (url.hostname.endsWith(".rakeenapp.com") && url.pathname.includes(".txt")) {
      request = normalizeVerificationPath(request, url);
    }
    const response = await openNextWorker.fetch(request, env, ctx);
    const isStoreRoot =
      request.method === "GET" &&
      url.pathname === "/" &&
      url.hostname.endsWith(".rakeenapp.com") &&
      url.hostname !== "www.rakeenapp.com";
    return isStoreRoot ? hoistVerificationMeta(response) : response;
  },
  async scheduled(event, env, ctx) {
    // event.cron identifies which of the schedules in wrangler.jsonc fired,
    // so one scheduled() handler can dispatch each to its own route.
    //
    // A schedule may map to MORE than one route: the Workers Free plan caps
    // an account at 5 cron triggers, and we're at 5. The two-minute sweep
    // therefore carries both the pickup sweep and the wallet-pass push —
    // both finish in seconds, and neither blocks the other (they're
    // dispatched together, not in sequence).
    const paths =
      event.cron === "0 7 * * 1" ? ["/api/cron/usage-check"] :
      event.cron === "0 21 * * *" ? ["/api/cron/daily-report"] :
      event.cron === "*/2 * * * *" ? ["/api/cron/auto-ready-pickup", "/api/cron/wallet-push"] :
      event.cron === "0 5 * * *" ? ["/api/cron/compliance-check"] :
      ["/api/cron/win-back"];
    // والجسم يُقرأ، لا الترويسة وحدها.
    //
    // وعدُ fetch يُحلّ حين تصل الترويسة -- والمكنسة تعمل بعدها: تسأل
    // القاعدة، وتفتح اتصال APNs، وتعلّم ما دُفع. فينتهي waitUntil عند
    // الترويسة، وينتهي معه المؤقّت، ويُلغى الطلب الداخلي في منتصفه.
    // فيظهر في السجلّ "Canceled" كل دقيقتين ولا شيء يُدفع، ولا خطأ
    // يُرفع -- لأن لا أحد أخطأ.
    //
    // وقراءةُ الجسم تنتظر تمام المعالجة: الردّ لا يكتمل قبل أن يعود
    // المعالج. وهذا ينطبق على كنس الطلبات الجاهزة كذلك -- كانت تُلغى
    // معها في الدفعة نفسها.
    ctx.waitUntil(Promise.all(paths.map((path) =>
      env.WORKER_SELF_REFERENCE.fetch(`https://internal${path}`, {
        method: "POST",
        headers: { "x-cron-secret": env.CRON_SECRET || "" },
      })
        .then((res) => res.text().then((body) => console.log(`${path} → ${res.status} ${body.slice(0, 200)}`)))
        .catch((err) => console.error(`${path} cron dispatch failed`, err))
    )));
  },
};
