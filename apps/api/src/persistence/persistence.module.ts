import { Global, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { closeDatabase, createDatabase, type Database } from "./database";
import { applyMigrations } from "./migrate";

export const DB = Symbol("HEURIS_DB");
export const PG = Symbol("HEURIS_PG");

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: async (config: ConfigService): Promise<Database> => {
        const dataDir = path.resolve(config.get<string>("DATA_DIR") ?? path.join(process.cwd(), "..", "..", "data"));
        const { db } = await createDatabase(dataDir);
        await applyMigrations(db);
        return db;
      },
      inject: [ConfigService],
    },
    {
      provide: PG,
      useFactory: async (db: Database): Promise<PGlite> => {
        const { getPg } = await import("./database");
        // ensure DB is created before grabbing PG
        void db;
        return getPg();
      },
      inject: [DB],
    },
  ],
  exports: [DB, PG],
})
export class PersistenceModule implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    // Provider factories already initialised the database. Nothing else to do.
  }

  async onModuleDestroy(): Promise<void> {
    await closeDatabase();
  }
}
