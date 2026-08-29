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

  if (!object.body) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).hostname === "media.rakeenapp.com") {
      return serveMediaBucket(request, env);
    }
    return openNextWorker.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    // event.cron identifies which of the schedules in wrangler.jsonc fired,
    // so one scheduled() handler can dispatch each to its own route.
    const path =
      event.cron === "0 7 * * 1" ? "/api/cron/usage-check" :
      event.cron === "0 21 * * *" ? "/api/cron/daily-report" :
      "/api/cron/win-back";
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch(`https://internal${path}`, {
        method: "POST",
        headers: { "x-cron-secret": env.CRON_SECRET || "" },
      }).catch((err) => console.error(`${path} cron dispatch failed`, err))
    );
  },
};
