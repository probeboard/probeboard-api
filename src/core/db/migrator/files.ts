import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type Direction = 'up' | 'down';

/** Migrations live beside this module and are copied into dist by the build. */
export const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

/** `0001_init.up.sql` -> `0001_init`. */
export function migrationName(file: string): string {
  return file.replace(/\.(up|down)\.sql$/, '');
}

/**
 * Migration files for one direction, in filename order. Ordering by name is
 * what makes the sequence deterministic, so names must sort correctly --
 * hence the zero-padded numeric prefix.
 */
export async function migrationFiles(direction: Direction): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((f) => f.endsWith(`.${direction}.sql`)).sort();
}

export function readMigration(name: string, direction: Direction): Promise<string> {
  return readFile(join(MIGRATIONS_DIR, `${name}.${direction}.sql`), 'utf8');
}
