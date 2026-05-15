/**
 * Apply schema migrations to PGlite.
 *
 * Strategy: on first boot we run a hand-maintained bootstrap DDL that
 * mirrors src/persistence/schema.ts. drizzle-kit generated migrations
 * (under ./drizzle) are then applied incrementally.
 */
import path from "node:path";
import fs from "node:fs";
import { migrate as drizzleMigrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./database";
import { bootstrap } from "./bootstrap-ddl";
import { createDatabase, closeDatabase } from "./database";

const FTS_FUNCTION_SQL = `CREATE OR REPLACE FUNCTION memories_fts_update() RETURNS trigger AS $$
BEGIN
  NEW.fts := to_tsvector('simple', COALESCE(NEW.content, '') || ' ' || COALESCE(NEW.tags::text, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;`;

const FTS_TRIGGER_DROP_SQL = `DROP TRIGGER IF EXISTS memories_fts_trigger ON memories;`;

const FTS_TRIGGER_CREATE_SQL = `CREATE TRIGGER memories_fts_trigger BEFORE INSERT OR UPDATE ON memories FOR EACH ROW EXECUTE FUNCTION memories_fts_update();`;

export async function applyMigrations(db: Database, migrationsFolder?: string): Promise<void> {
  await bootstrap(db);
  const folder = migrationsFolder ?? path.join(__dirname, "..", "..", "drizzle");
  if (fs.existsSync(folder) && fs.readdirSync(folder).some((f) => f.endsWith(".sql"))) {
    await drizzleMigrate(db, { migrationsFolder: folder });
  }
  await db.execute(FTS_FUNCTION_SQL);
  await db.execute(FTS_TRIGGER_DROP_SQL);
  await db.execute(FTS_TRIGGER_CREATE_SQL);
}

if (require.main === module) {
  void (async () => {
    const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "..", "..", "data");
    const { db } = await createDatabase(path.resolve(dataDir));
    try {
      await applyMigrations(db);
      console.log("[migrate] applied to", path.resolve(dataDir));
    } finally {
      await closeDatabase();
    }
  })();
}
