import { readFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { sha256 } from './assets.js';
import { writeArtifact } from './artifacts.js';
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';
export async function readJournal(path: string): Promise<string> {
  let active = '';
  try {
    active = await readFile(path, 'utf8');
  } catch (e) {
    if (!missing(e)) throw e;
  }
  let pointer: { file: string; hash: string; raw_hash: string };
  try {
    pointer = JSON.parse(await readFile(`${path}.archive.json`, 'utf8'));
  } catch (e) {
    if (missing(e)) return active;
    throw e;
  }
  if (basename(pointer.file) !== pointer.file) throw new Error('Invalid history archive path');
  const bytes = await readFile(join(dirname(path), pointer.file));
  if (sha256(bytes) !== pointer.hash) throw new Error('History archive integrity check failed');
  const archived = gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 }).toString('utf8');
  if (sha256(archived) !== pointer.raw_hash) throw new Error('History archive content mismatch');
  // A crash between publishing the pointer and clearing the active log can leave
  // a duplicate suffix. Accept only byte-identical records from that suffix.
  const lines = archived.trimEnd().split('\n'),
    tail = active.trimEnd() ? active.trimEnd().split('\n') : [];
  for (const line of tail) {
    const record = JSON.parse(line);
    if (record.sequence <= lines.length) {
      if (lines[record.sequence - 1] !== line)
        throw new Error('Conflicting archive/journal records');
    } else lines.push(line);
  }
  if (active && !active.endsWith('\n')) throw new Error('History has an incomplete final record');
  return lines.length ? lines.join('\n') + '\n' : '';
}
export async function compressJournal(path: string) {
  const raw = await readJournal(path);
  if (!raw) return { original_bytes: 0, compressed_bytes: 0 };
  const bytes = gzipSync(raw, { level: 9 }),
    file = `${basename(path)}.${sha256(bytes).slice(7)}.gz`;
  await writeArtifact(join(dirname(path), file), bytes);
  await writeArtifact(
    `${path}.archive.json`,
    JSON.stringify({ file, hash: sha256(bytes), raw_hash: sha256(raw) }) + '\n',
  );
  await writeArtifact(path, '');
  return { original_bytes: Buffer.byteLength(raw), compressed_bytes: bytes.length, archive: file };
}
