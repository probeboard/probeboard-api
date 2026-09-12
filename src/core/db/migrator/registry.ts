import type { Pool } from 'pg';

/** Tracks which migrations have been applied. */
export const REGISTRY_TABLE = 'schema_migrations';

export async function ensureRegistry(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${REGISTRY_TABLE} (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function appliedMigrations(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>(`SELECT name FROM ${REGISTRY_TABLE}`);
  return new Set(rows.map((r) => r.name));
}

export async function lastApplied(pool: Pool): Promise<string | undefined> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM ${REGISTRY_TABLE} ORDER BY name DESC LIMIT 1`,
  );
  return rows[0]?.name;
}
