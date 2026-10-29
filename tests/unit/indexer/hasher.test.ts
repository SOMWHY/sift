import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { hashFile } from '../../../electron/indexer/hasher';

function tmpFile(name: string, content: Buffer | string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-hash-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

describe('hasher', () => {
  it('对同一内容产生稳定的 64 位十六进制 sha256', async () => {
    const p = tmpFile('a.txt', 'hello');
    const h1 = await hashFile(p);
    const h2 = await hashFile(p);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
  });

  it('不同内容产生不同哈希', async () => {
    const a = tmpFile('a.txt', 'hello');
    const b = tmpFile('b.txt', 'world');
    expect(await hashFile(a)).not.toBe(await hashFile(b));
  });

  it('与 node:crypto 直接哈希一致（流式读取无截断）', async () => {
    const content = Buffer.alloc(1024 * 1024, 0x61); // 1MiB
    const p = tmpFile('big.bin', content);
    const expected = createHash('sha256').update(content).digest('hex');
    expect(await hashFile(p)).toBe(expected);
  });
});
