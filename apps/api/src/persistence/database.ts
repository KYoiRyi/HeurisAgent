import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let _pg: PGlite | null = null;
let _db: Database | null = null;

export async function createDatabase(dataDir: string): Promise<{ pg: PGlite; db: Database }> {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(path.join(dataDir, "pgdata"));
  await pg.waitReady;
  const db = drizzle(pg, { schema });
  _pg = pg;
  _db = db;
  return { pg, db };
}

export function getDb(): Database {
  if (!_db) throw new Error("Database not initialised. Call createDatabase() first.");
  return _db;
}

export function getPg(): PGlite {
  if (!_pg) throw new Error("PGlite not initialised. Call createDatabase() first.");
  return _pg;
}

export async function closeDatabase(): Promise<void> {
  if (_pg) {
    await _pg.close();
    _pg = null;
    _db = null;
  }
}
