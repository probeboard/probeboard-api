import type { Pool } from 'pg';
import { describeError } from '../../errors/describe.js';
import { type Direction, migrationFiles, migrationName, readMigration } from './files.js';
import { appliedMigrations, ensureRegistry, lastApplied, REGISTRY_TABLE } from './registry.js';

export type Report = (message: string) => void;

/**
 * Applies one migration and records it, in a single transaction. A failure
 * rolls the migration back and throws, so the caller stops rather than
 * applying later migrations onto a half-built schema.
 */
async function applyOne(
  pool: Pool,
  name: string,
  direction: Direction,
  record: string,
): Promise<void> {
  const sql = await readMigration(name, direction);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(record, [name]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`migration ${name} (${direction}) failed: ${describeError(err)}`, {
      cause: err,
    });
  } finally {
    client.release();
  }
}

/** Applies every migration not yet recorded, oldest first. */
export async function up(pool: Pool, report: Report): Promise<string[]> {
  await ensureRegistry(pool);

  const done = await appliedMigrations(pool);
  const pending = (await migrationFiles('up')).map(migrationName).filter((name) => !done.has(name));

  if (pending.length === 0) {
    report('migrations: nothing to apply');
    return [];
  }

  for (const name of pending) {
    await applyOne(pool, name, 'up', `INSERT INTO ${REGISTRY_TABLE} (name) VALUES ($1)`);
    report(`migrations: applied ${name}`);
  }

  return pending;
}

/** Rolls back the most recently applied migration. */
export async function down(pool: Pool, report: Report): Promise<string | undefined> {
  await ensureRegistry(pool);

  const last = await lastApplied(pool);
  if (!last) {
    report('migrations: nothing to roll back');
    return undefined;
  }

  await applyOne(pool, last, 'down', `DELETE FROM ${REGISTRY_TABLE} WHERE name = $1`);
  report(`migrations: rolled back ${last}`);
  return last;
}
