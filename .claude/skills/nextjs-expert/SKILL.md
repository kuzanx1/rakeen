---
name: nextjs-expert
description: Next.js 16 App Router expertise for Rakeen (ركين), including this repo's route conventions and its Cloudflare Workers deployment via OpenNext. Use when adding or changing routes/layouts/API route handlers under app/, working with server/client component boundaries, data fetching, dynamic vs static rendering, or anything touching the cf:deploy pipeline. Not for CSS/visual work (see ui-designer, tailwind-css-expert) or general JS logic already covered by senior-frontend-engineer.
---

# Next.js Expert — Rakeen

Rakeen runs **Next.js 16.2.12 with React 19**, deployed to **Cloudflare Workers** via `@opennextjs/cloudflare` (not Vercel, not Node hosting).

## Read the docs in the repo before writing App Router code

`AGENTS.md` at the repo root states plainly: this Next.js version has breaking changes from your training data — APIs, conventions, and file structure may all differ. **Before using any App Router API, data-fetching pattern, or config option you're not 100% certain is current for v16, read the matching guide in `node_modules/next/dist/docs/`.** Do not assume Next 13/14-era patterns still apply; verify against the vendored docs first, every time, not just once per session.

## Route map and conventions actually used in this repo

- `app/page.tsx` → `app/landing/LandingPage.tsx`: the marketing/landing page, a `"use client"` component that imports its own hand-authored CSS file (`app/landing/rakeen-landing.css`) via a plain `import` statement — no CSS modules, no Tailwind classes, no styled-components.
- `app/dashboard/`, `app/pos/`, `app/kitchen/`, `app/order/[slug]/`, `app/order-status/[token]/`, `app/loyalty-card/[token]/`: each is a thin React shell that mounts a legacy vanilla-JS bundle from `public/<surface>/rakeen-<surface>.js` via `document.createElement('script')`. When editing these surfaces, the real logic lives in the `public/*.js` file, not in TSX — don't try to "modernize" them into React state during an unrelated task.
- `app/api/*/route.ts`: standard Route Handlers (`export async function POST(req)`), used for anything needing the Supabase service-role key, Gemini invoice-scan calls, push notifications, or map-tile proxying. Keep server-only secrets exclusively in these routes.
- Dynamic vs static is meaningful here: `next build`'s output table marks routes `○ (Static)` vs `ƒ (Dynamic)` — most real screens are `ƒ` because they depend on request-time Supabase auth/data; don't fight the framework into static rendering for pages that need live per-business data.

## Cloudflare Workers constraints

- Runtime is Workers, not Node — avoid Node-only APIs unless `nodejs_compat` is already enabled for this project; check `wrangler.jsonc`/`open-next.config.ts` before assuming a Node API (e.g. `fs`, certain `crypto` shapes) is available.
- Secrets in local dev come from `.dev.vars`; production secrets are Wrangler secrets — never hardcode a key and never assume `.dev.vars` values exist in production.
- `npm run cf:deploy` = `opennextjs-cloudflare build && opennextjs-cloudflare deploy`. Before running it, make sure no stale `workerd`/`next dev` process is holding a lock on `.open-next` (see senior-frontend-engineer's deploy-hygiene note) — this has caused real ~1-hour deploy blocks in this project.
- There's a scheduled Worker trigger (`schedule: 0 6 * * *`, `/api/cron/win-back`) — be aware cron-triggered routes run without a normal request context.

## Practical checklist for any App Router change

1. Confirm the target route's rendering mode (static vs dynamic) is what you intend after your change — check the `next build` output table.
2. `"use client"` only where you actually need interactivity/browser APIs; keep data-loading server-side where the existing pattern already does so.
3. Run `npx tsc --noEmit` and `npx next build` — Next 16's build runs its own TypeScript pass too, so a clean `tsc` doesn't guarantee a clean build.
4. If build-time typecheck errors look garbled/nonsensical (referencing truncated identifiers), suspect a corrupted `.next/dev/types/validator.ts` from an interrupted dev server, not your change — `rm -rf .next` and rebuild.
5. For anything financial or security-sensitive, do the authoritative computation in a Route Handler or Postgres RPC, never trust a value the client already computed and sent back.
