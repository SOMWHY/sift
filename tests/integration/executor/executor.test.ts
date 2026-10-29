import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';
import { FileRepo } from '../../../electron/db/repos/files';
import { OperationLogRepo } from '../../../electron/db/repos/operation_log';
import { Ledger } from '../../../electron/ledger/log';
import { createAcl } from '../../../electron/executor/acl';
import { executePlan, type ExecutorDeps } from '../../../electron/executor/executor';
import { hashFile } from '../../../electron/indexer/hasher';
import type { OperationPlan } from '../../../shared/ipc-contract';
import type { NewFile } from '../../../shared/types';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sift-exec-'));
}

function writeFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

function makeDeps(
  root: string,
  files: FileRepo,
  ledger: Ledger,
): ExecutorDeps {
  const assertAllowed = createAcl();
  return {
    findFile: (p) => {
      const f = files.getByPath(p);
      return f ? { id: f.id, hash: f.hash } : undefined;
    },
    hashFile: (p) => hashFile(p),
    assertAllowed: (s, t, op) => {
      if (op !== 'move') throw new Error('不支持删除操作');
      assertAllowed(root, s, t);
    },
    appendLog: (e) => {
      ledger.append(e);
    },
    moveFile: (s, t) => {
      fs.renameSync(s, t);
    },
    recordMovedPath: (id, newPath) => {
      files.update(id, { path: newPath });
    },
  };
}

async function insertFile(files: FileRepo, p: string): Promise<void> {
  const hash = await hashFile(p);
  const stat = fs.statSync(p);
  const row: NewFile = {
    path: p,
    hash,
    size: stat.size,
    mime: 'text/plain',
    extracted_text: null,
    indexed_at: new Date().toISOString(),
    status: 'indexed',
  };
  files.create(row);
}

function plan(batchId: string, entries: Array<[string, string]>): OperationPlan {
  return {
    batch_id: batchId,
    entries: entries.map(([source_path, target_path]) => ({
      source_path,
      target_path,
      op_type: 'move',
      user_decision: 'dry-run',
    })),
  };
}

describe('executePlan (Task 5.4)', () => {
  it('整批越界 → 全部不执行，不写账本', async () => {
    const root = tmpRoot();
    const outside = tmpRoot();
    const db = openDb(path.join(root, 'sift.db'));
    runMigrations(db);
    const files = new FileRepo(db);
    const ledger = new Ledger(new OperationLogRepo(db));

    const src = writeFile(root, 'a.txt', 'hello');
    await insertFile(files, src);
    const target = path.join(outside, 'a.txt');

    const result = await executePlan(plan('b1', [[src, target]]), makeDeps(root, files, ledger));

    expect(result.executed).toBe(0);
    expect(result.blocked).toBe(1);
    expect(ledger.list()).toHaveLength(0);
    expect(fs.existsSync(src)).toBe(true);
    db.close();
  });

  it('正常 move → 全部执行，账本 N 条', async () => {
    const root = tmpRoot();
    const db = openDb(path.join(root, 'sift.db'));
    runMigrations(db);
    const files = new FileRepo(db);
    const ledger = new Ledger(new OperationLogRepo(db));

    const srcA = writeFile(root, 'a.txt', 'alpha');
    const srcB = writeFile(root, 'b.txt', 'beta');
    await insertFile(files, srcA);
    await insertFile(files, srcB);

    const targetDir = path.join(root, 'archive');
    fs.mkdirSync(targetDir, { recursive: true });
    const tgtA = path.join(targetDir, 'a.txt');
    const tgtB = path.join(targetDir, 'b.txt');

    const result = await executePlan(
      plan('b1', [
        [srcA, tgtA],
        [srcB, tgtB],
      ]),
      makeDeps(root, files, ledger),
    );

    expect(result.executed).toBe(2);
    expect(result.blocked).toBe(0);
    expect(ledger.list()).toHaveLength(2);
    expect(ledger.listByBatch('b1')).toHaveLength(2);
    expect(fs.existsSync(srcA)).toBe(false);
    expect(fs.existsSync(srcB)).toBe(false);
    expect(fs.readFileSync(tgtA, 'utf-8')).toBe('alpha');
    expect(fs.readFileSync(tgtB, 'utf-8')).toBe('beta');
    expect(files.getByPath(srcA)).toBeUndefined();
    expect(files.getByPath(tgtA)?.path).toBe(tgtA);
    db.close();
  });

  it('外部改过路径 → 该条拒绝，其余照常执行', async () => {
    const root = tmpRoot();
    const db = openDb(path.join(root, 'sift.db'));
    runMigrations(db);
    const files = new FileRepo(db);
    const ledger = new Ledger(new OperationLogRepo(db));

    const srcA = writeFile(root, 'a.txt', 'alpha-v1');
    const srcB = writeFile(root, 'b.txt', 'beta');
    await insertFile(files, srcA);
    await insertFile(files, srcB);

    const targetDir = path.join(root, 'archive');
    fs.mkdirSync(targetDir, { recursive: true });
    const tgtA = path.join(targetDir, 'a.txt');
    const tgtB = path.join(targetDir, 'b.txt');

    // 索引后被外部修改
    fs.writeFileSync(srcA, 'alpha-v2-CHANGED');

    const result = await executePlan(
      plan('b1', [
        [srcA, tgtA],
        [srcB, tgtB],
      ]),
      makeDeps(root, files, ledger),
    );

    expect(result.executed).toBe(1);
    expect(result.blocked).toBe(1);
    expect(fs.existsSync(srcA)).toBe(true); // 未被移动
    expect(fs.existsSync(tgtA)).toBe(false);
    expect(fs.existsSync(srcB)).toBe(false);
    expect(fs.readFileSync(tgtB, 'utf-8')).toBe('beta');
    expect(ledger.list()).toHaveLength(1);
    db.close();
  });

  it('重复下载（同 hash 不同路径）→ 按 path 执行不串', async () => {
    const root = tmpRoot();
    const db = openDb(path.join(root, 'sift.db'));
    runMigrations(db);
    const files = new FileRepo(db);
    const ledger = new Ledger(new OperationLogRepo(db));

    const sameContent = 'same-content';
    const srcA = writeFile(root, 'a.txt', sameContent);
    const srcB = writeFile(root, 'b.txt', sameContent);
    await insertFile(files, srcA);
    await insertFile(files, srcB);

    const targetDir = path.join(root, 'archive');
    fs.mkdirSync(targetDir, { recursive: true });
    const tgtA = path.join(targetDir, 'a.txt');
    const tgtB = path.join(targetDir, 'b.txt');

    const result = await executePlan(
      plan('b1', [
        [srcA, tgtA],
        [srcB, tgtB],
      ]),
      makeDeps(root, files, ledger),
    );

    expect(result.executed).toBe(2);
    expect(result.blocked).toBe(0);
    expect(fs.existsSync(srcA)).toBe(false);
    expect(fs.existsSync(srcB)).toBe(false);
    expect(fs.readFileSync(tgtA, 'utf-8')).toBe(sameContent);
    expect(fs.readFileSync(tgtB, 'utf-8')).toBe(sameContent);
    db.close();
  });
});
