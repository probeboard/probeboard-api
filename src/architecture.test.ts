import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Enforces the dependency direction that keeps api and worker separable.
 *
 *      core   <-- depends on nothing else in src/
 *      /  \
 *    api  worker   <-- may depend on core, never on each other
 *
 * Splitting this repository later must stay a `git mv` of a directory rather
 * than an untangling exercise, so the rule is checked rather than merely
 * documented. See docs ADR-0006.
 */

const SRC = join(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Every module path this file imports, resolved relative to src/. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');

  // Three forms, all of which create a real dependency:
  //   import x from './a'   /   export * from './a'
  //   import './a'                    (side effect only, no `from`)
  //   require('./a')
  const specifiers = [
    ...[...source.matchAll(/(?:^|\s)(?:import|export)[^'";]*?from\s*'([^']+)'/g)],
    ...[...source.matchAll(/(?:^|\s)import\s*'([^']+)'/g)],
    ...[...source.matchAll(/\brequire\s*\(\s*'([^']+)'\s*\)/g)],
  ].map((m) => m[1]!);

  return specifiers
    .filter((s) => s.startsWith('.'))
    .map((s) => relative(SRC, join(file, '..', s)));
}

function layerOf(pathFromSrc: string): 'core' | 'api' | 'worker' | 'root' {
  if (pathFromSrc.startsWith('core')) return 'core';
  if (pathFromSrc.startsWith('api')) return 'api';
  if (pathFromSrc.startsWith('worker')) return 'worker';
  return 'root';
}

const files = sourceFiles(SRC).map((f) => ({
  path: relative(SRC, f),
  imports: importsOf(f),
}));

describe('layer boundaries', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('core depends on nothing outside core', () => {
    const violations = files
      .filter((f) => layerOf(f.path) === 'core')
      .flatMap((f) =>
        f.imports.filter((i) => layerOf(i) !== 'core').map((i) => `${f.path} -> ${i}`),
      );
    expect(violations).toEqual([]);
  });

  it('api never imports worker', () => {
    const violations = files
      .filter((f) => layerOf(f.path) === 'api')
      .flatMap((f) =>
        f.imports.filter((i) => layerOf(i) === 'worker').map((i) => `${f.path} -> ${i}`),
      );
    expect(violations).toEqual([]);
  });

  it('worker never imports api', () => {
    const violations = files
      .filter((f) => layerOf(f.path) === 'worker')
      .flatMap((f) =>
        f.imports.filter((i) => layerOf(i) === 'api').map((i) => `${f.path} -> ${i}`),
      );
    expect(violations).toEqual([]);
  });

  it('every source file belongs to a layer', () => {
    expect(files.filter((f) => layerOf(f.path) === 'root').map((f) => f.path)).toEqual([
      'architecture.test.ts',
    ]);
  });
});
