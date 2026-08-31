# Checkpoint 3 — Products / Categories

## What changed

- `domain/catalog.ts` — plain `Category`/`Product` types, plus
  `SERVICE_BUSINESS_TYPES`/`isServiceBusinessType()` ported verbatim from
  `rakeen-pos.js`. Preserves the one genuinely load-bearing detail
  exactly: a service's virtual product id is its real id **negated**
  (`-s.id`) so services and menu_items share one product list with zero
  collision risk — this is not cosmetic, downstream order-building logic
  branches on the sign of this id, so it was kept unchanged rather than
  "cleaned up."
- `application/catalogService.ts` — `getBusinessType()` +
  `loadCatalog()`, ported from `loadPosData()`'s real
  `menu_categories`/`menu_items`/`services` queries, scoped to just
  categories/products (modifiers, box-pick eligibility, stock, delivery
  platform pricing are separate, later concerns — not needed for a real
  product grid). Same defensive `.error` check on the Promise.all results
  this project already learned the hard way it needs (supabase-js resolves
  a network failure as `{data:null,error}` rather than rejecting).
  Offline-boot fallback via `AsyncStorage`, mirroring the existing
  `kv_cache`/`posdata:` pattern.
- `ui/ProductsScreen.tsx` — the real product/category screen: category
  tabs, a real product grid (name + price, service duration where
  applicable), an offline-snapshot banner when the cache path was used.
  Tapping a product doesn't add to a cart yet — Cart is Checkpoint 4,
  deliberately not built ahead of the roadmap.
- `App.tsx` — this is now what shows after login; the hardware POC tools
  and logout stay reachable via a small top bar.

## What was tested

1. `npx tsc --noEmit` — clean.
2. **The exact query logic against the live backend** — a temporary
   scratch script (deleted after, confirmed via `git status`) logged in as
   the real cashier PIN account (branch 24), then ran the same
   `menu_categories`/`menu_items`/`services` queries `catalogService.ts`
   implements, under real RLS.
3. Real CI build on both platforms — in progress as of this doc; see the
   roadmap status section for the outcome.

## What passed

```
OK business_type: salon
OK categories: 1 [ 'Hair' ]
OK menu_items: 1
OK services: 7 [ 'Haircut (50)', 'Beard Trim (40)', 'Hair Color (40)',
  'Shave (40)', 'Kids Cut (40)', 'Hair Wash (40)', 'Styling (40)' ]
Product id collision check: OK — no collisions
```

Real data, real business (`__test_salon_mvp__`, business_id=20), real RLS
context (authenticated as the cashier, not the service role).

## What failed / what was fixed

Nothing failed in the backend verification. (CI result pending at time of
writing — see roadmap status for the confirmed outcome.)

## What remains

- Not yet run inside an actual RN runtime (Simulator/emulator/device) —
  same gap as Checkpoint 2's screen.
- Product images, barcodes, favorites/popularity, search, and the
  "hide product images" business setting are not ported — out of scope
  for this checkpoint, not forgotten.
- Only tested against a service-type business (salon) end-to-end for
  `services` — a restaurant-type business's `menu_items` path uses the
  identical code path but hasn't been separately re-verified against a
  restaurant test account (the query itself is the same one already
  proven working for `menu_items` in this exact test run — it just
  returned only 1 leftover test row for this particular business).

## What needs real hardware

Nothing in this checkpoint.

**Status: 🟢 Verified** for the catalog-loading logic (real backend, real
data, real RLS) / 🟡 Ready for Testing for the screen itself pending CI
confirmation and a real device/simulator run.
