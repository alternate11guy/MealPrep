// Persistence: a small document store on PostgreSQL.
// - DATABASE_URL set  -> hosted Postgres / Supabase via postgres.js
// - otherwise         -> embedded Postgres (PGlite) persisted in ./.data/pg
// Both run the same SQL. Only server code imports this module.

import path from "node:path";
import fs from "node:fs";

type Row = { id: string; data: unknown };
interface Driver {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

declare global {
  // eslint-disable-next-line no-var
  var __mealDb: Promise<Driver> | undefined;
}

const SCHEMA = `
create table if not exists docs (
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists docs_collection_idx on docs (collection, updated_at desc);
`;

async function connect(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { ssl: url.includes("localhost") ? false : "require", max: 5, prepare: false });
    const d: Driver = {
      async query(text, params = []) {
        return (await sql.unsafe(text, params as never[])) as never;
      },
    };
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await d.query(stmt);
    return d;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.MISE_DATA_DIR || path.join(process.cwd(), ".data", "pg");
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.exec(SCHEMA);
  return {
    async query(text, params = []) {
      const r = await db.query(text, params as unknown[]);
      return r.rows as never;
    },
  };
}

function db() {
  globalThis.__mealDb ??= connect();
  return globalThis.__mealDb;
}

export type Collection =
  | "profile" | "targets" | "week" | "recipe" | "inventory" | "log" | "weight" | "water"
  | "feedback" | "template" | "grocery" | "prep" | "price" | "chat" | "auth" | "meta" | "proposal";

export async function getDoc<T>(collection: Collection, id: string): Promise<T | null> {
  const rows = await (await db()).query<{ data: T }>("select data from docs where collection = $1 and id = $2", [collection, id]);
  return rows[0]?.data ?? null;
}

export async function putDoc<T>(collection: Collection, id: string, data: T): Promise<T> {
  await (await db()).query(
    `insert into docs (collection, id, data, updated_at) values ($1, $2, $3::jsonb, now())
     on conflict (collection, id) do update set data = excluded.data, updated_at = now()`,
    [collection, id, JSON.stringify(data)],
  );
  return data;
}

export async function listDocs<T>(collection: Collection): Promise<T[]> {
  const rows = await (await db()).query<{ data: T }>("select data from docs where collection = $1 order by id", [collection]);
  return rows.map((r) => r.data);
}

export async function listIds(collection: Collection): Promise<string[]> {
  const rows = await (await db()).query<{ id: string }>("select id from docs where collection = $1 order by id", [collection]);
  return rows.map((r) => r.id);
}

export async function deleteDoc(collection: Collection, id: string) {
  await (await db()).query("delete from docs where collection = $1 and id = $2", [collection, id]);
}

export async function deleteWhere(collection: Collection, predicate: (d: Record<string, unknown>) => boolean) {
  const rows = await (await db()).query<{ id: string; data: Record<string, unknown> }>("select id, data from docs where collection = $1", [collection]);
  for (const r of rows) if (predicate(r.data)) await deleteDoc(collection, r.id);
}

export async function wipeAll() {
  await (await db()).query("delete from docs where collection <> 'auth'");
}
