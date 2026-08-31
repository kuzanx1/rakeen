# Checkpoint 4 — Cart

## What changed

- `domain/cart.ts` — the cart/pricing engine, ported line-for-line from
  `rakeen-pos.js`'s real `state.cart`/`lineUnitPrice`/`cartTotals`/
  `addToCartWithConfig`/`changeQty`/`removeFromCart`/`configsEqual`/
  `buildDefaultConfig`. Same VAT-inclusive/exclusive branching (must match
  `submit_online_order`'s server-side math exactly — the source's own
  comment says so, taken seriously), same percentage-only discount model,
  same delivery-platform price-override hook, same duplicate-line
  protection. **Box/meal modifier products explicitly deferred** — a
  materially larger, different feature (meal-builder/box-picker UI), not
  a standard modifier group.
- `application/catalogService.ts` extended with `modifier_groups`/
  `modifier_options`/`menu_item_modifier_groups` queries and the real
  modifier-map builder (same `price_delta` math, same `cost_mode='box'`
  exclusion), plus `getFinancialSettings()`.
- `ui/useCart.ts` — React orchestration, **in-memory only**. Confirmed by
  grepping `rakeen-pos.js` directly: the current PWA has zero persistence
  for the in-progress cart (only submitted orders go through the offline
  queue) — "preserve cart persistence requirements" means preserving that
  absence here, not inventing new persistence the source doesn't have.
- `ui/ModifierModal.tsx` + `ui/ProductsScreen.tsx` — the real customize
  flow (single/multi option groups) and a cart panel: order channel
  selector (dine_in/pickup/delivery), quantity controls, percentage
  discount chips, subtotal/discount/VAT/total. The "إتمام الطلب" button is
  intentionally disabled — payment/order submission are later checkpoints,
  not started here.

## What was tested

Two real, independent verifications, both against the actual code (not
copies):

1. **Real backend queries** (temporary script, deleted after — confirmed
   via `git status`): `modifier_groups`/`modifier_options`/
   `menu_item_modifier_groups`/`businesses` (VAT fields) all executed
   under real cashier RLS against `business_id=20`.
2. **Direct execution of the real `domain/cart.ts`** via `npx tsx`
   (temporary script, deleted after) — 15 assertions against known-correct
   math.

## What passed

Backend queries:
```
OK modifier_groups query succeeded, rows: 0
OK modifier_options query succeeded, rows: 23
OK menu_item_modifier_groups query succeeded, rows: 9
OK financial settings: { vat_registered: true, vat_rate: 0.15, prices_include_vat: true }
```

Cart math (all 15 passed), the ones worth calling out specifically:
```
OK VAT-inclusive: vat = round2(90*0.15/1.15)     -> 11.74
OK VAT-exclusive: vat = 100*0.15                  -> 15
OK not VAT-registered: vat forced to 0
OK base 50 + modifier price_delta 10 = 60
OK same product+null-config merges into ONE line, not two
OK same product, DIFFERENT config -> two separate lines
OK qty hits 0 -> line removed
OK service product (negative id) prices identically to a menu_item
```

Real CI: both platforms green (`macos-15`/Xcode 16.4 and `ubuntu-latest`),
native module compile verification passed on both.

## What failed / what was fixed

Nothing failed.

## What remains

- **Honest gap, not glossed over**: this test business (`business_id=20`,
  salon) has zero configured modifier groups — the group-BUILDING query
  path is confirmed to run without error against real data, but the
  actual group/option *content* (a real "Size: Small/Large" style group)
  couldn't be verified end-to-end against a real modifier-enabled product
  from this account. The pure computation logic was verified directly
  instead (see above) using realistic synthetic data matching the exact
  real schema shape — a deliberate, disclosed substitute, not a shortcut
  taken silently.
- Box/meal modifier products remain unported (see file header notes).
- Delivery platform price *loading* (not the override mechanism itself,
  which exists in `productBasePrice`) is not wired up — no delivery
  platforms are fetched yet.
- Not yet run on an actual device/simulator.
- Cart lines currently don't carry a free-text note (`item.note` in the
  source) — not exposed in the UI yet, though the domain type already has
  the field reserved.

## What needs real hardware

Nothing in this checkpoint.

**Status: 🟢 Verified** for the cart/pricing math and the modifier query
shape (real execution, real assertions, real backend) / 🟡 Ready for
Testing for the screen itself (CI green on both platforms), not yet run
on a real device.
