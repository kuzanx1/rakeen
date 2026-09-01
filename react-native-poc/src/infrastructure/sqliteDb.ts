import { open, type DB } from '@op-engineering/op-sqlite';

/**
 * Shared op-sqlite connection, extracted so the print queue (Checkpoint
 * 10) can add its own table to the SAME database file as the order
 * queue (Checkpoint 5) instead of opening a second SQLite file for no
 * real reason. Not a redesign of the verified order queue -- same file
 * name, same table, same behavior; this only factors out the `open()`
 * call so a second table can share the connection.
 */
const DB_NAME = 'rakeen_pos_queue.sqlite';

let dbInstance: DB | null = null;

export function getSharedDb(): DB {
  if (!dbInstance) {
    dbInstance = open({ name: DB_NAME });
  }
  return dbInstance;
}
