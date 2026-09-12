/**
 * Forward-only SQL migrations, applied in filename order inside a single
 * transaction each, recorded in `schema_migrations`.
 *
 * Usage: tsx src/db/migrate.ts up | down
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { loadConfig } from '../config';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureRegistry(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

async function migrationFiles(suffix: '.up.sql' | '.down.sql'): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((f) => f.endsWith(suffix)).sort();
}

function migrationName(file: string): string {
  return file.replace(/\.(up|down)\.sql$/, '');
}

async function up(pool: Pool): Promise<void> {
  await ensureRegistry(pool);
  const done = await appliedMigrations(pool);
  const files = await migrationFiles('.up.sql');

  const pending = files.filter((f) => !done.has(migrationName(f)));
  if (pending.length === 0) {
    console.log('migrations: nothing to apply');
    return;
  }

  for (const file of pending) {
    const name = migrationName(file);
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`migrations: applied ${name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      // The failure must stop the run: applying later migrations on top of a
      // half-applied schema is worse than not migrating at all.
      throw new Error(`migration ${name} failed: ${(err as Error).message}`, { cause: err });
    } finally {
      client.release();
    }
  }
}

async function down(pool: Pool): Promise<void> {
  await ensureRegistry(pool);
  const { rows } = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1',
  );
  const last = rows[0]?.name;
  if (!last) {
    console.log('migrations: nothing to roll back');
    return;
  }

  const sql = await readFile(join(MIGRATIONS_DIR, `${last}.down.sql`), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('DELETE FROM schema_migrations WHERE name = $1', [last]);
    await client.query('COMMIT');
    console.log(`migrations: rolled back ${last}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`rollback of ${last} failed: ${(err as Error).message}`, { cause: err });
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const direction = process.argv[2] ?? 'up';
  if (direction !== 'up' && direction !== 'down') {
    throw new Error(`unknown direction "${direction}" (expected "up" or "down")`);
  }

  const cfg = loadConfig();
  const pool = new Pool({ connectionString: cfg.DATABASE_URL, max: 1 });
  try {
    await (direction === 'up' ? up(pool) : down(pool));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
