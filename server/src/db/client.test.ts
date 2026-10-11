import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findMigrationsDir, MIGRATIONS_DIR } from './client.ts';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('migrations folder', () => {
  it('is server/drizzle from the sources and from the bundle (dist/main.js)', () => {
    const expected = path.join(serverDir, 'drizzle');
    expect(MIGRATIONS_DIR).toBe(expected);
    expect(findMigrationsDir(path.join(serverDir, 'src', 'db'))).toBe(expected);
    expect(findMigrationsDir(path.join(serverDir, 'dist'))).toBe(expected);
    expect(existsSync(path.join(expected, 'meta', '_journal.json'))).toBe(true);
  });
});
