/**
 * GabayX Mobile SQLite Database Initialization & Migration Engine
 * Manages thread-safe SQLite connection and versioned schema migrations.
 */

import * as SQLite from 'expo-sqlite';
import { CURRENT_SCHEMA_VERSION, CREATE_MIGRATIONS_TABLE, MIGRATIONS } from './schema';

const DB_NAME = 'gabayx_mobile.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open or retrieve active SQLite connection
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await runMigrations(db);
      dbInstance = db;
      return db;
    } catch (err) {
      initPromise = null;
      dbInstance = null;
      console.error('[GabayX DB] Failed to open/initialize SQLite database:', err);
      throw new Error(`Database initialization failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();

  return initPromise;
}

/**
 * Run schema migrations safely
 */
async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // 1. Ensure migrations table exists
  await db.execAsync(CREATE_MIGRATIONS_TABLE);

  // 2. Query already applied migrations
  const appliedRows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC;'
  );
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  // 3. Apply missing versions in transaction
  for (let version = 1; version <= CURRENT_SCHEMA_VERSION; version++) {
    if (!appliedVersions.has(version)) {
      const statements = MIGRATIONS[version];
      if (statements && statements.length > 0) {
        console.log(`[GabayX DB] Applying migration version ${version}...`);
        await db.withTransactionAsync(async () => {
          for (const sql of statements) {
            await db.execAsync(sql);
          }
          await db.runAsync(
            'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);',
            [version, new Date().toISOString()]
          );
        });
        console.log(`[GabayX DB] Migration version ${version} applied successfully.`);
      }
    }
  }
}

/**
 * Explicit helper to reset DB instance (used in automated tests or debugging)
 */
export function resetDatabaseInstance(): void {
  dbInstance = null;
  initPromise = null;
}
