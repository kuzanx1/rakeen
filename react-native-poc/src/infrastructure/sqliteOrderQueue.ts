import type { DB } from '@op-engineering/op-sqlite';
import { getSharedDb } from './sqliteDb';
import type { QueuedPayload } from '../domain/order';
import type { QueueStorage } from '../domain/orderQueue';

/**
 * The REAL durable order queue storage -- SQLite, not AsyncStorage/MMKV.
 * Per docs/react-native-poc/phase8-offline-storage.md's own evaluation:
 * a financial queue needs real ACID transactions and crash-recovery
 * guarantees a flat key-value store can't express, which is exactly what
 * this checkpoint's "no data loss, no duplicate submission after a crash"
 * requirement demands. One table, one row per queued order, the whole
 * payload stored as JSON (same shape IndexedDB's pending_orders store
 * already used) plus the bookkeeping columns broken out for indexed
 * lookups.
 *
 * UNVERIFIED beyond compilation from this environment: @op-engineering/
 * op-sqlite's own Node.js build (which would otherwise let this run
 * directly from Windows, the same way domain/cart.ts and
 * domain/orderQueue.ts were verified via `npx tsx`) has a real, confirmed
 * packaging bug in the installed version -- its compiled node/dist/index.js
 * imports "./database" without a file extension, which Node's ESM
 * resolver rejects (ERR_MODULE_NOT_FOUND). This was an actual attempt,
 * not skipped -- ended in the real environment's own error. The domain-
 * layer queue ALGORITHM (domain/orderQueue.ts) was still verified for
 * real, against a fake in-memory QueueStorage standing in for this file --
 * what's NOT verified is that op-sqlite's real native binary persists
 * correctly across a genuine app restart, which needs a real iOS/Android
 * runtime.
 */

const TABLE = 'pending_orders';

let initialized = false;

function getDb(): DB {
  const db = getSharedDb();
  if (!initialized) {
    initialized = true;
    db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        client_order_uuid TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at REAL,
        stuck INTEGER NOT NULL DEFAULT 0,
        created_at REAL NOT NULL
      );
    `);
  }
  return db;
}

export const sqliteOrderQueueStorage: QueueStorage = {
  async put(item: QueuedPayload): Promise<void> {
    const db = getDb();
    // next_retry_at is stored as REAL so it can hold Infinity (the
    // permanently-stuck sentinel, same as the source's own
    // next_retry_at:Infinity) -- SQLite has no literal Infinity in SQL
    // text, so it's passed as a bound parameter, which sqlite3's REAL
    // affinity stores as IEEE 754 infinity correctly.
    await db.execute(
      `INSERT INTO ${TABLE} (client_order_uuid, payload_json, retry_count, next_retry_at, stuck, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_order_uuid) DO UPDATE SET
         payload_json = excluded.payload_json,
         retry_count = excluded.retry_count,
         next_retry_at = excluded.next_retry_at,
         stuck = excluded.stuck;`,
      [
        item.client_order_uuid,
        JSON.stringify(item),
        item.retry_count || 0,
        item.next_retry_at ?? null,
        item.stuck ? 1 : 0,
        Date.now(),
      ],
    );
  },

  async remove(clientOrderUuid: string): Promise<void> {
    const db = getDb();
    await db.execute(`DELETE FROM ${TABLE} WHERE client_order_uuid = ?;`, [clientOrderUuid]);
  },

  async getAll(): Promise<QueuedPayload[]> {
    const db = getDb();
    const result = await db.execute(`SELECT payload_json FROM ${TABLE} ORDER BY created_at ASC;`);
    return result.rows.map(row => JSON.parse(row.payload_json as string) as QueuedPayload);
  },
};
