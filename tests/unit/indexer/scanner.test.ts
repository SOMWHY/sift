import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';
import { FileRepo } from '../../../electron/db/repos/files';
import { scanTree } from '../../../electron/indexer/scanner';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sift-scan-'));
}

function writeFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

describe('scanTree（只读 scanner）', () => {
  it('扫描 500 个文件，files 表数量与内容正确', async () => {
    const root = tmpRoot();
    for (let i = 0; i < 500; i++) {
      writeFile(root, `f${i}.txt`, `content-${i}`);
    }

    const db = openDb(':memory:');
    runMigrations(db);
    const files = new FileRepo(db);

    const results = await scanTree(root, { files });

    expect(results).toHaveLength(500);
    const rows = files.list();
    expect(rows).toHaveLength(500);

    const byName = new Map(rows.map((r) => [path.basename(r.path), r]));
    const sample = byName.get('f42.txt')!;
    expect(sample).toBeDefined();
    expect(sample.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sample.extracted_text).toBe('content-42');
    expect(sample.status).toBe('indexed');
    expect(sample.mime).toBe('text/plain');
    db.close();
  });

  it('全程只读：不改变任何文件的 mtime/大小，不新增文件', async () => {
    const root = tmpRoot();
    const paths: string[] = [];
    for (let i = 0; i < 20; i++) {
      paths.push(writeFile(root, `r${i}.txt`, `readonly-${i}`));
    }
    const before = new Map(
      paths.map((p) => {
        const st = fs.statSync(p);
        return [p, { mtimeMs: st.mtimeMs, size: st.size }];
      }),
    );
    const beforeNames = fs.readdirSync(root).sort();

    await scanTree(root, {}); // 不带 files，纯枚举

    for (const [p, prev] of before) {
      const st = fs.statSync(p);
      expect(st.mtimeMs).toBe(prev.mtimeMs);
      expect(st.size).toBe(prev.size);
    }
    expect(fs.readdirSync(root).sort()).toEqual(beforeNames);
  });

  it('跳过 node_modules 等忽略目录', async () => {
    const root = tmpRoot();
    writeFile(root, 'keep.txt', 'keep');
    const nm = path.join(root, 'node_modules');
    fs.mkdirSync(nm);
    writeFile(nm, 'dep.js', 'module.exports = 1');

    const results = await scanTree(root, {});
    expect(results.map((r) => path.basename(r.path))).toEqual(['keep.txt']);
  });

  it('跳过符号链接（文件与目录均不入索引）', async () => {
    const root = tmpRoot();
    const outside = tmpRoot();
    writeFile(outside, 'secret.txt', 'secret');

    // Windows 下创建文件符号链接需管理员/开发者模式；目录 junction 则无需特权。
    if (process.platform === 'win32') {
      const linkDir = path.join(root, 'linkdir');
      fs.symlinkSync(outside, linkDir, 'junction');
      const results = await scanTree(root, {});
      expect(results).toHaveLength(0);
      return;
    }

    const linkFile = path.join(root, 'link.txt');
    fs.symlinkSync(path.join(outside, 'secret.txt'), linkFile);
    const linkDir = path.join(root, 'linkdir');
    fs.symlinkSync(outside, linkDir, 'dir');

    const results = await scanTree(root, {});
    expect(results).toHaveLength(0);
  });
});
