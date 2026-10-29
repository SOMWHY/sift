import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';
import { FileRepo } from '../../../electron/db/repos/files';
import { watchRoot } from '../../../electron/indexer/watcher';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sift-watch-'));
}

async function waitFor(cond: () => boolean, timeoutMs = 8000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('waitFor timeout');
}

describe('watchRoot（chokidar 增量监听）', () => {
  it('新文件落地 → files 出现 pending 记录', async () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const files = new FileRepo(db);
    const root = tmpRoot();
    const handle = watchRoot(root, files);

    fs.writeFileSync(path.join(root, 'a.txt'), 'hello sift');

    await waitFor(() => files.listByStatus('pending').length === 1);
    const rows = files.listByStatus('pending');
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe(path.join(root, 'a.txt'));

    await handle.close();
    db.close();
  });

  it('执行器移动后不重复入队（按 hash 去重）', async () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const files = new FileRepo(db);
    const root = tmpRoot();
    const handle = watchRoot(root, files);

    fs.writeFileSync(path.join(root, 'a.txt'), 'same content');
    await waitFor(() => files.listByStatus('pending').length === 1);

    // 模拟执行器移动：把已入队的文件挪到子目录（chokidar unlink+add）。
    const sub = path.join(root, 'archived');
    fs.mkdirSync(sub);
    fs.renameSync(path.join(root, 'a.txt'), path.join(sub, 'a.txt'));

    // 等待 add 事件窗口结束，断言仍只有 1 条 pending、未被再次入队。
    await new Promise((r) => setTimeout(r, 1200));
    const rows = files.listByStatus('pending');
    expect(rows).toHaveLength(1);

    await handle.close();
    db.close();
  });
});
