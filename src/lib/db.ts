import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

/**
 * Lazy singleton SQLite Database wrapper.
 *
 * Schema is owned entirely by TypeScript (see spec §15). On first call to
 * `getDb()` we resolve the on-disk path via the Rust `get_db_path` IPC
 * command, open the database, run `CREATE TABLE IF NOT EXISTS` for every
 * table, then advance through any pending schema migrations.
 */

let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    display_name TEXT,
    tags TEXT,
    group_id TEXT,
    is_pinned INTEGER DEFAULT 0,
    archived_at INTEGER,
    sort_order INTEGER,
    cwd TEXT,
    first_prompt TEXT,
    summary TEXT,
    message_count INTEGER,
    model TEXT,
    version TEXT,
    permission_mode TEXT,
    git_branch TEXT,
    started_at INTEGER,
    duration_ms INTEGER,
    entrypoint TEXT,
    kind TEXT,
    last_synced_at INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );`,
  `INSERT OR IGNORE INTO app_settings (key, value) VALUES ('schema_version', '1');`,
];

/**
 * The schema version this build of the app expects. Bump this whenever a
 * new migration is added to `MIGRATIONS`.
 */
const EXPECTED_VERSION = 1;

/**
 * Sequential schema migrations keyed by the version they upgrade *to*.
 *
 * For example, `MIGRATIONS[2]` is the migration that takes the DB from
 * v1 -> v2. Each migration runs inside a transaction managed by
 * `runMigrations`. v1 is the initial schema and has no migration entry.
 */
const MIGRATIONS: Record<number, (db: Database) => Promise<void>> = {
  // Future migrations go here, e.g.:
  // 2: async (db) => { await db.execute("ALTER TABLE sessions ADD COLUMN foo TEXT"); },
};

async function init(): Promise<Database> {
  const path = await invoke<string>("get_db_path");
  const db = await Database.load(`sqlite:${path}`);
  for (const sql of SCHEMA) {
    await db.execute(sql);
  }
  await runMigrations(db);
  return db;
}

async function runMigrations(db: Database): Promise<void> {
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = 'schema_version'"
  );
  let current = rows.length > 0 ? parseInt(rows[0].value, 10) : 0;
  if (Number.isNaN(current)) current = 0;

  while (current < EXPECTED_VERSION) {
    const next = current + 1;
    const fn = MIGRATIONS[next];
    if (fn) {
      await db.execute("BEGIN TRANSACTION");
      try {
        await fn(db);
        await db.execute(
          "UPDATE app_settings SET value = $1 WHERE key = 'schema_version'",
          [String(next)]
        );
        await db.execute("COMMIT");
      } catch (e) {
        await db.execute("ROLLBACK");
        throw e;
      }
    } else {
      // No migration registered for this step (e.g. v1 -> just bumping
      // because the initial INSERT OR IGNORE already wrote '1'). Update
      // the version row outside a transaction; a single UPDATE is atomic.
      await db.execute(
        "UPDATE app_settings SET value = $1 WHERE key = 'schema_version'",
        [String(next)]
      );
    }
    current = next;
  }
}

/**
 * Returns the singleton `Database` instance, initializing it on first call.
 * Concurrent callers during the first call will share the same in-flight
 * `initPromise` and resolve to the same instance.
 */
export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (!initPromise) {
    initPromise = init().then((db) => {
      dbInstance = db;
      return db;
    });
  }
  return initPromise;
}

/** Convenience wrapper around `db.select` that lazily initializes the DB. */
export async function dbSelect<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, params);
}

/** Convenience wrapper around `db.execute` that lazily initializes the DB. */
export async function dbExecute(sql: string, params: unknown[] = []) {
  const db = await getDb();
  return db.execute(sql, params);
}
