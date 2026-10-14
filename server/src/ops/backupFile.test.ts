import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { backupFileName, openBackupWriter, readBackupLines } from './backupFile.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'cex-backupfile-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// 50 000 lines (more than one internal buffer) incl. Vietnamese text and long numerics
const lines = Array.from({ length: 50_000 }, (_, i) => `D\tpublic.t\t{"id":${i},"v":"123456789.123456789012345678","name":"Nguyễn Văn ${i}"}`);
const collect = async (file: string, pass?: string) => {
  const out: string[] = [];
  for await (const l of readBackupLines(file, pass)) out.push(l);
  return out;
};
async function write(file: string, pass?: string) {
  const w = await openBackupWriter(file, pass);
  for (const l of lines) await w.write(l);
  await w.finish();
}

describe('backup file', () => {
  it('names: encrypted ones end with .enc', () => {
    expect(backupFileName(new Date('2026-10-13T01:02:03.456Z'))).toBe('cex-2026-10-13T01-02-03-456Z.cexbak.gz');
    expect(backupFileName(new Date('2026-10-13T01:02:03.456Z'), true)).toMatch(/\.cexbak\.gz\.enc$/);
  });

  it('plain: round trip, compressed', async () => {
    const f = path.join(dir, 'plain.cexbak.gz');
    await write(f);
    expect(await collect(f)).toEqual(lines);
    expect(readFileSync(f).length).toBeLessThan(lines.join('\n').length / 3);
  }, 30_000);

  it('encrypted: round trip; the file holds no readable data', async () => {
    const f = path.join(dir, 'enc.cexbak.gz.enc');
    await write(f, 'correct horse battery staple');
    expect(await collect(f, 'correct horse battery staple')).toEqual(lines);
    expect(readFileSync(f).toString('latin1')).not.toContain('Nguy');
    expect(readFileSync(f).subarray(0, 7).toString()).toBe('CEXENC1');
  }, 30_000);

  it('encrypted: no passphrase, a wrong passphrase, or a changed byte is refused', async () => {
    const f = path.join(dir, 'enc2.cexbak.gz.enc');
    await write(f, 'right');
    await expect(collect(f)).rejects.toThrow(/HOST_BACKUP_PASSPHRASE/);
    await expect(collect(f, 'wrong')).rejects.toThrow(/cannot decrypt|wrong passphrase|bad decrypt|Unsupported state/i);
    const bytes = readFileSync(f);
    const at = Math.floor(bytes.length / 2);
    bytes[at] = (bytes[at] ?? 0) ^ 0xff;
    const tampered = path.join(dir, 'tampered.cexbak.gz.enc');
    writeFileSync(tampered, bytes);
    await expect(collect(tampered, 'right')).rejects.toThrow();
  }, 30_000);
});
