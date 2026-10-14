/**
 * The backup FILE: the dump lines of logicalBackup.ts, gzip-compressed, and — when a passphrase is set — encrypted
 * (AES-256-GCM, key from scrypt) so a copy in a cloud folder or on a USB stick is useless without the passphrase
 * (the dump holds emails and password hashes).
 *
 *   plain:     <name>.cexbak.gz
 *   encrypted: <name>.cexbak.gz.enc = "CEXENC1" | salt 16 | iv 12 | ciphertext | GCM tag 16
 */
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { PassThrough, type Readable } from 'node:stream';

const MAGIC = Buffer.from('CEXENC1');
const SALT = 16;
const IV = 12;
const TAG = 16;
const HEADER = MAGIC.length + SALT + IV;

const deriveKey = (passphrase: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => scrypt(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))));

export const backupFileName = (at = new Date(), encrypted = false) => `cex-${at.toISOString().replace(/[:.]/g, '-')}.cexbak.gz${encrypted ? '.enc' : ''}`;
export const isEncryptedName = (file: string) => file.endsWith('.enc');

export interface BackupWriter {
  write(line: string): Promise<void>;
  /** Finishes the file (and the encryption tag); resolves when everything is on disk. */
  finish(): Promise<void>;
}

/** Opens `file` for writing dump lines; encrypts when `passphrase` is given. */
export async function openBackupWriter(file: string, passphrase?: string): Promise<BackupWriter> {
  const gzip = createGzip({ level: 6 });
  const out = createWriteStream(file, { mode: 0o600 });
  let done: Promise<void>;
  if (passphrase) {
    const salt = randomBytes(SALT);
    const iv = randomBytes(IV);
    const key = await deriveKey(passphrase, salt);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    out.write(Buffer.concat([MAGIC, salt, iv]));
    done = pipeline(gzip, cipher, out, { end: false }).then(async () => {
      out.end(cipher.getAuthTag());
      await once(out, 'finish');
    });
  } else {
    done = pipeline(gzip, out);
  }
  done.catch(() => {}); // the error surfaces from finish(); this only stops an unhandled-rejection warning
  return {
    async write(line) {
      if (!gzip.write(`${line}\n`)) await once(gzip, 'drain');
    },
    async finish() {
      gzip.end();
      await done;
    },
  };
}

/** The dump lines of a backup file, decrypted (wrong passphrase / tampering throws) and decompressed. */
export async function* readBackupLines(file: string, passphrase?: string): AsyncGenerator<string> {
  let source: Readable;
  if (isEncryptedName(file)) {
    if (!passphrase) throw new Error('this backup is encrypted: set HOST_BACKUP_PASSPHRASE (in host-data/.env.host)');
    const { size } = await stat(file);
    if (size < HEADER + TAG) throw new Error('the backup file is too short');
    const fd = await open(file, 'r');
    let head: Buffer;
    let tag: Buffer;
    try {
      head = Buffer.alloc(HEADER);
      await fd.read(head, 0, HEADER, 0);
      tag = Buffer.alloc(TAG);
      await fd.read(tag, 0, TAG, size - TAG);
    } finally {
      await fd.close();
    }
    if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not an encrypted backup file');
    const key = await deriveKey(passphrase, head.subarray(MAGIC.length, MAGIC.length + SALT));
    const decipher = createDecipheriv('aes-256-gcm', key, head.subarray(MAGIC.length + SALT));
    decipher.setAuthTag(tag);
    source = new PassThrough();
    const plain = source as PassThrough;
    pipeline(createReadStream(file, { start: HEADER, end: size - TAG - 1 }), decipher, plain).catch((e) => plain.destroy(e as Error));
  } else {
    source = createReadStream(file);
  }
  const gunzip = createGunzip();
  source.on('error', (e) => gunzip.destroy(e));
  source.pipe(gunzip);
  try {
    for await (const line of createInterface({ input: gunzip, crlfDelay: Infinity })) yield line;
  } catch (e) {
    // with a wrong key AES-GCM streams garbage first and only the last step notices — gunzip then fails with a puzzling message
    if (isEncryptedName(file)) throw new Error(`cannot decrypt the backup (wrong passphrase, or the file was changed): ${(e as Error).message}`, { cause: e });
    throw e;
  }
}
