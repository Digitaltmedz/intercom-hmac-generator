import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { schema } from "./schema.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/** Gemensam typ för Postgres (drift) och PGlite (test), så att resten av koden inte bryr sig. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  close: () => Promise<void>;
}

/** Riktig Postgres i drift. */
export async function connectPostgres(databaseUrl: string): Promise<DbHandle> {
  const client = postgres(databaseUrl, { max: 10, prepare: false });
  const db = drizzlePostgres(client, { schema });
  await migratePostgres(db, { migrationsFolder });
  return { db, close: () => client.end() };
}

/** Inbäddad Postgres (PGlite) för tester och lokal körning utan databas. */
export async function connectPglite(): Promise<DbHandle> {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db, close: () => client.close() };
}

export async function connectDb(databaseUrl: string | undefined): Promise<DbHandle> {
  return databaseUrl ? connectPostgres(databaseUrl) : connectPglite();
}
