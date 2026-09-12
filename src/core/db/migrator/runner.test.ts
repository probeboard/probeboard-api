import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { migrationFiles, migrationName } from './files.js';
import { down, up } from './runner.js';

/** Whatever migrations exist today; the tests must not encode the list. */
const allMigrations = (await migrationFiles('up')).map(migrationName);
const firstMigration = allMigrations[0];
const lastMigration = allMigrations.at(-1)!;

/**
 * A pg Pool recorded rather than mocked: every statement is kept in order, so
 * a test can assert on the transaction boundaries the runner must produce.
 */
function fakePool(options: { applied?: string[]; failOn?: RegExp } = {}) {
  const statements: string[] = [];
  const applied = new Set(options.applied ?? []);

  const query = vi.fn((sql: string, params?: unknown[]) => {
    statements.push(sql.trim().split('\n')[0].trim());

    if (options.failOn?.test(sql)) throw new Error('syntax error at or near "BROKEN"');

    if (sql.includes('SELECT name FROM schema_migrations ORDER BY')) {
      const last = [...applied].sort().at(-1);
      return { rows: last ? [{ name: last }] : [] };
    }
    if (sql.includes('SELECT name FROM schema_migrations')) {
      return { rows: [...applied].map((name) => ({ name })) };
    }
    if (sql.includes('INSERT INTO schema_migrations')) applied.add(String(params?.[0]));
    if (sql.includes('DELETE FROM schema_migrations')) applied.delete(String(params?.[0]));

    return { rows: [] };
  });

  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = { query, connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;

  return { pool, statements, applied, release: client.release };
}

const silent = () => undefined;

describe('up', () => {
  it('applies pending migrations and records them', async () => {
    const { pool, applied } = fakePool();
    const reported: string[] = [];

    const done = await up(pool, (m) => reported.push(m));

    expect(done).toEqual(allMigrations);
    expect(applied.has(firstMigration)).toBe(true);
    expect(reported).toContain(`migrations: applied ${firstMigration}`);
  });

  it('is a no-op when everything is applied', async () => {
    const { pool, statements } = fakePool({ applied: allMigrations });
    const reported: string[] = [];

    expect(await up(pool, (m) => reported.push(m))).toEqual([]);
    expect(reported).toEqual(['migrations: nothing to apply']);
    expect(statements.some((s) => s.startsWith('BEGIN'))).toBe(false);
  });

  it('wraps each migration in its own transaction', async () => {
    const { pool, statements } = fakePool();
    await up(pool, silent);

    const begin = statements.indexOf('BEGIN');
    const commit = statements.indexOf('COMMIT');
    expect(begin).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(begin);
    expect(statements).not.toContain('ROLLBACK');
  });

  it('records the migration inside the same transaction that applied it', async () => {
    // Otherwise a crash between the two leaves the schema changed and the
    // registry unaware, and the next run reapplies it.
    const { pool, statements } = fakePool();
    await up(pool, silent);

    const insert = statements.findIndex((s) => s.startsWith('INSERT INTO schema_migrations'));
    expect(insert).toBeGreaterThan(statements.indexOf('BEGIN'));
    expect(insert).toBeLessThan(statements.indexOf('COMMIT'));
  });

  it('rolls back and stops when a migration fails', async () => {
    const { pool, statements, applied } = fakePool({ failOn: /CREATE TYPE/ });

    await expect(up(pool, silent)).rejects.toThrow(new RegExp(`${firstMigration} \\(up\\) failed`));
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
    expect(applied.size).toBe(0);
  });

  it('releases the client even when the migration fails', async () => {
    const { pool, release } = fakePool({ failOn: /CREATE TYPE/ });
    await up(pool, silent).catch(() => undefined);
    expect(release).toHaveBeenCalled();
  });
});

describe('down', () => {
  it('rolls back the most recently applied migration', async () => {
    const { pool, applied } = fakePool({ applied: allMigrations });
    const reported: string[] = [];

    // down rolls back the most recent, not the first.
    expect(await down(pool, (m) => reported.push(m))).toBe(lastMigration);
    expect(applied.has(lastMigration)).toBe(false);
    expect(reported).toContain(`migrations: rolled back ${lastMigration}`);
  });

  it('is a no-op when nothing has been applied', async () => {
    const { pool, statements } = fakePool();
    const reported: string[] = [];

    expect(await down(pool, (m) => reported.push(m))).toBeUndefined();
    expect(reported).toEqual(['migrations: nothing to roll back']);
    expect(statements.some((s) => s.startsWith('BEGIN'))).toBe(false);
  });

  it('removes the registry row inside the transaction', async () => {
    const { pool, statements } = fakePool({ applied: allMigrations });
    await down(pool, silent);

    const del = statements.findIndex((s) => s.startsWith('DELETE FROM schema_migrations'));
    expect(del).toBeGreaterThan(statements.indexOf('BEGIN'));
    expect(del).toBeLessThan(statements.indexOf('COMMIT'));
  });
});
