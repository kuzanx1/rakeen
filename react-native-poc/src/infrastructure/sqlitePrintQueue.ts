import type { DB } from '@op-engineering/op-sqlite';
import { getSharedDb } from './sqliteDb';
import type { PrintJobRecord, PrintQueueStorage } from '../domain/printQueue';

/**
 * The REAL durable print queue storage -- SQLite, same database file as
 * the order queue (Checkpoint 5/8's validated choice: SQLite for
 * durable transactional queues), a second table rather than a second
 * database. Same UNVERIFIED-from-Windows caveat as
 * infrastructure/sqliteOrderQueue.ts: op-sqlite's own Node.js build has
 * a confirmed packaging bug (missing .js extension in its own relative
 * import), so this can only be compile-checked here, never run --
 * needs a real iOS/Android runtime. The print queue ALGORITHM
 * (domain/printQueue.ts) is verified for real against a fake in-memory
 * PrintQueueStorage standing in for this file.
 */
const TABLE = 'print_jobs';

let initialized = false;

function getDb(): DB {
  const db = getSharedDb();
  if (!initialized) {
    initialized = true;
    db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL,
        status TEXT NOT NULL,
        next_retry_at REAL NOT NULL DEFAULT 0,
        created_at REAL NOT NULL
      );
    `);
  }
  return db;
}

export const sqlitePrintQueueStorage: PrintQueueStorage = {
  async put(job: PrintJobRecord): Promise<void> {
    const db = getDb();
    await db.execute(
      `INSERT INTO ${TABLE} (id, record_json, status, next_retry_at, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         record_json = excluded.record_json,
         status = excluded.status,
         next_retry_at = excluded.next_retry_at;`,
      [job.id, JSON.stringify(job), job.status, job.next_retry_at, job.created_at],
    );
  },

  async getAll(): Promise<PrintJobRecord[]> {
    const db = getDb();
    const result = await db.execute(`SELECT record_json FROM ${TABLE} ORDER BY created_at ASC;`);
    return result.rows.map(row => JSON.parse(row.record_json as string) as PrintJobRecord);
  },
};

/**
 * Ported from the PWA's resetInterruptedPrintJobsOnBoot() IIFE: any job
 * stuck mid-flight in 'printing' when the app crashed/closed would
 * otherwise never be flipped back, since nothing else transitions it.
 * Call once at app start, before the print queue scheduler's first
 * pass -- same reasoning as the source, minus its DEVICE-not-ready
 * timing concern (this app has no such boot-ordering constraint since
 * printerProfileStore.ts's target is read fresh on every dispatch attempt,
 * not cached into a global at boot).
 */
export async function resetInterruptedPrintJobsOnBoot(): Promise<void> {
  const jobs = await sqlitePrintQueueStorage.getAll();
  for (const job of jobs) {
    if (job.status === 'printing') {
      await sqlitePrintQueueStorage.put({ ...job, status: 'queued' });
    }
  }
}
