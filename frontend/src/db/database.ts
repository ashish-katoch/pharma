import * as SQLite from "expo-sqlite";
import { CREATE_TABLES, MIGRATIONS, SCHEMA_VERSION } from "./schema";

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  const db = await SQLite.openDatabaseAsync("pharma.db");
  await db.execAsync(CREATE_TABLES);

  const row = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_version LIMIT 1"
  );

  if (!row) {
    // Brand-new database — stamp the current version.
    await db.runAsync("INSERT INTO schema_version (version) VALUES (?)", [SCHEMA_VERSION]);
  } else if (row.version < SCHEMA_VERSION) {
    // Run each pending migration in order.
    for (let v = row.version + 1; v <= SCHEMA_VERSION; v++) {
      const stmts = MIGRATIONS[v] ?? [];
      for (const sql of stmts) {
        // Some migrations are idempotent (e.g. ALTER TABLE fails if column exists).
        // Catch and swallow those specific errors.
        try {
          await db.runAsync(sql);
        } catch (e: any) {
          const msg: string = e?.message ?? "";
          // "duplicate column name" = column already exists from a previous partial run.
          if (!msg.toLowerCase().includes("duplicate column")) throw e;
        }
      }
      await db.runAsync("UPDATE schema_version SET version = ?", [v]);
    }
  }

  _db = db;
  return _db;
}

export function resetDbSingleton() {
  _db = null;
}
