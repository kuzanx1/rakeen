# Phase 8 — Offline Storage: IndexedDB → React Native

No implementation in this pass, per the explicit instruction — this is an
evaluation and recommendation only. The current IndexedDB implementation
(`openPosDb()` in `public/pos/rakeen-pos.js`) is untouched.

## What the current design actually needs (from reading the real code, not guessing)

Three distinct stores today, with different real requirements:
- **`pending_orders`** — the highest-stakes one. Needs a real unique key
  (`client_order_uuid`), fields that get updated repeatedly
  (`retry_count`, `next_retry_at`, `stuck`), and must survive an app kill
  mid-write with zero risk of a corrupted or duplicated order — this
  project's own stated #1 priority.
- **`print_jobs`** — similar shape (retry/backoff/dedup fields), lower
  stakes than orders (cosmetic-adjacent, per the project's own established
  philosophy) but still needs the same query pattern: "give me every job
  that's due for a retry right now."
- **`kv_cache`** — genuinely just a flat key→value cache (the offline POS
  snapshot, cached shift/profile lookups). No relational needs at all.

## Options, scored against the actual requirements

| | Durability | Transactions | Idempotency fit | Query the queue | Performance | Crash recovery | Maturity |
|---|---|---|---|---|---|---|---|
| **AsyncStorage** | Weak — historically backed by a single SQLite table for ALL keys on Android, a known bottleneck at scale | None — no multi-key atomicity | Manual (check-then-write, not atomic) | None — flat keys only | Weakest of the five | Weakest | Very mature, but increasingly considered legacy for anything beyond trivial state |
| **MMKV** | Strong (memory-mapped, fsync-backed) | Single-key only, no multi-row transaction | Manual, same as AsyncStorage | None — flat keys only | Fastest (synchronous, JSI) | Strong | Mature, battle-tested at WeChat/Tencent scale |
| **SQLite** (via a JSI binding — `react-native-quick-sqlite`/`op-sqlite`/`expo-sqlite`) | Strong — WAL mode is specifically designed for exactly this "recover cleanly from a kill mid-write" scenario | Real ACID transactions | Native — `UNIQUE`/`PRIMARY KEY` constraints, the same mechanism `orders.client_order_uuid` already uses server-side | Real SQL — `WHERE stuck=0 AND next_retry_at<=?` is a direct, natural translation of the existing retry logic | Fast enough for this workload (dozens–hundreds of rows, not big data) | Best-in-class — decades of production hardening industry-wide | Extremely mature |
| **WatermelonDB** | Strong (built on SQLite underneath) | Real transactions (inherited from SQLite) | Native, same as plain SQLite | Real queries, plus reactive observers (auto-re-render on change) | Fast, optimized for large reactive lists | Strong (inherits SQLite's) | Real production use (Nozbe and others), but a bigger, more opinionated framework with its own migration/sync model |
| **Realm** | Strong | Real transactions | Native (primary keys) | Real queries, live objects | Fast | Strong | Mature, but a different ecosystem (object-graph model, not SQL) with more ownership/direction uncertainty in recent years than SQLite itself |

## Recommendation: SQLite for the queues, MMKV for the flat cache

**Use a JSI-based SQLite binding for `pending_orders`/`print_jobs`, and
MMKV for `kv_cache`/simple flags** — a direct 1:1 match to the three
existing stores' actual different needs, not a single one-size-fits-all
choice:

1. **SQLite is the closest conceptual match to what's already built and
   proven.** The current queue design already thinks in exactly the terms
   SQL expresses natively — a table, a primary key, a `WHERE` clause for
   "what's due to retry." Porting the *design* (not rewriting it) is lower
   risk than adopting WatermelonDB's or Realm's own opinionated
   object/sync model, which could end up duplicating or conflicting with
   the sync/retry/idempotency logic this project already built and tested
   against the real Supabase backend.
2. **Real ACID transactions directly serve the stated #1 priority** (never
   lose an order) — this is not a performance nice-to-have, it's the same
   guarantee category IndexedDB already provided and that AsyncStorage/
   MMKV alone cannot express for multi-field updates.
3. **MMKV for `kv_cache`** — it has no relational shape today and never
   will; a flat, extremely fast key-value store is a better fit than
   forcing it into a SQL table, and using MMKV here also gives a natural
   home for tiny pieces of app state (a kiosk-mode flag, a cached auth
   token) without over-using SQLite for things that were never queues.
4. **WatermelonDB and Realm are not recommended for this project
   specifically** — not because they're inferior technology (both are
   real, mature, and used in serious production apps), but because both
   bring their own sync/object-model opinions that this project doesn't
   need and would have to work around, when the actual requirement is
   "durable transactional storage for a queue," which plain SQLite already
   provides directly.

**Not decided arbitrarily** — this recommendation follows directly from
matching each of the three existing stores' real, already-proven usage
pattern to the storage engine that expresses it most directly, rather than
picking whichever library is newest or fastest in the abstract.
