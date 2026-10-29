import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';
import { FileRepo } from '../../../electron/db/repos/files';
import { OperationLogRepo } from '../../../electron/db/repos/operation_log';
import { UndoBatchRepo } from '../../../electron/db/repos/undo_batches';
import { createUndoService } from '../../../electron/ledger/undo';

const now = () => new Date().toISOString();

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-undo-'));
  const db = openDb(path.join(root, 'sift.db'));
  runMigrations(db);
  const files = new FileRepo(db);
  const log = new OperationLogRepo(db);
  return { root, db, files, log };
}

/** 模拟一条已执行的 move：物理文件位于 target，日志记录 source→target。 */
function seedEntry(
  root: string,
  files: FileRepo,
  log: OperationLogRepo,
  relTarget: string,
  relSource: string,
  opts: { batchId?: string; suggestionId?: number; createdAt?: string } = {},
) {
  const target = path.join(root, relTarget);
  const source = path.join(root, relSource);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `content-${relTarget}`);
  files.create({
    path: target,
    hash: `h-${relTarget}`,
    size: 1,
    mime: 'text/plain',
    extracted_text: null,
    indexed_at: now(),
    status: 'indexed',
  });
  return log.append({
    batch_id: opts.batchId ?? 'b1',
    source_path: source,
    target_path: target,
    op_type: 'move',
    suggestion_id: opts.suggestionId ?? null,
    confidence: null,
    user_decision: 'manual',
    created_at: opts.createdAt ?? now(),
  });
}

describe('ledger undo (Task 5.5)', () => {
  it('单条撤销：文件移回、新增 undo 记录、原记录保留', () => {
    const { root, db, files, log } = setup();
    const svc = createUndoService({ db, getAuthorizedRoot: () => root });

    const entry = seedEntry(root, files, log, 'archive/a.txt', 'inbox/a.txt');
    const result = svc.undoEntry(entry.id);

    expect(result.undone).toBe(1);
    expect(result.skipped).toBe(0);
    expect(fs.existsSync(path.join(root, 'inbox', 'a.txt'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'archive', 'a.txt'))).toBe(false);

    const all = log.list();
    expect(all).toHaveLength(2); // 原记录 + undo 记录
    expect(all.some((e) => e.id === entry.id && e.op_type === 'move')).toBe(true);
    expect(all.some((e) => e.op_type === 'undo' && e.target_path === entry.source_path)).toBe(true);
    db.close();
  });

  it('batch 撤销：全部移回 + undo_batches 记录 + 二次撤销被拦截', () => {
    const { root, db, files, log } = setup();
    const svc = createUndoService({ db, getAuthorizedRoot: () => root });

    const e1 = seedEntry(root, files, log, 'archive/a.txt', 'inbox/a.txt', { batchId: 'B9' });
    const e2 = seedEntry(root, files, log, 'archive/b.txt', 'inbox/b.txt', { batchId: 'B9' });

    const r1 = svc.undoBatch('B9', '误归档');
    expect(r1.undone).toBe(2);
    expect(new UndoBatchRepo(db).getByBatchId('B9')).toBeTruthy();
    expect(fs.existsSync(path.join(root, 'inbox', 'a.txt'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'inbox', 'b.txt'))).toBe(true);

    const r2 = svc.undoBatch('B9');
    expect(r2.undone).toBe(0);
    expect(r2.skipped).toBe(2); // undo_batches 拦截，不再重复
    expect(log.list().filter((e) => e.op_type === 'undo')).toHaveLength(2);
    db.close();
  });

  it('条件撤销：since + fromSuggestion 只回退匹配条目', () => {
    const { root, db, files, log } = setup();
    const svc = createUndoService({ db, getAuthorizedRoot: () => root });

    const eOld = seedEntry(root, files, log, 'archive/old.txt', 'inbox/old.txt', {
      suggestionId: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const eNewSug = seedEntry(root, files, log, 'archive/new-sug.txt', 'inbox/new-sug.txt', {
      suggestionId: 2,
      createdAt: '2026-03-01T00:00:00.000Z',
    });
    const eNewManual = seedEntry(root, files, log, 'archive/new-manual.txt', 'inbox/new-manual.txt', {
      createdAt: '2026-03-01T00:00:00.000Z',
    });

    const result = svc.undoByCondition({ since: '2026-02-01T00:00:00.000Z', fromSuggestion: true });

    expect(result.undone).toBe(1);
    expect(fs.existsSync(path.join(root, 'inbox', 'new-sug.txt'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'archive', 'old.txt'))).toBe(true); // 时间外，未回退
    expect(fs.existsSync(path.join(root, 'archive', 'new-manual.txt'))).toBe(true); // 手动，未回退
    db.close();
  });

  it('跨会话：关闭重开库后仍可撤销', () => {
    const { root, db, files, log } = setup();
    const svc = createUndoService({ db, getAuthorizedRoot: () => root });
    const entry = seedEntry(root, files, log, 'archive/x.txt', 'inbox/x.txt', { batchId: 'B9' });
    db.close(); // 模拟重启

    const db2 = openDb(path.join(root, 'sift.db'));
    const svc2 = createUndoService({ db: db2, getAuthorizedRoot: () => root });
    const result = svc2.undoEntry(entry.id);

    expect(result.undone).toBe(1);
    expect(fs.existsSync(path.join(root, 'inbox', 'x.txt'))).toBe(true);
    db2.close();
  });

  it('导出 JSON 包含全部账本记录', async () => {
    const { root, db, files, log } = setup();
    const svc = createUndoService({ db, getAuthorizedRoot: () => root });
    seedEntry(root, files, log, 'archive/a.txt', 'inbox/a.txt');
    seedEntry(root, files, log, 'archive/b.txt', 'inbox/b.txt');

    const json = await svc.exportLedger();
    const parsed = JSON.parse(json) as Array<{ id: string; opType: string; tags: string[] }>;
    expect(parsed).toHaveLength(2);
    expect(parsed.map((e) => e.opType)).toEqual(['move', 'move']);
    expect(parsed.every((e) => Array.isArray(e.tags))).toBe(true);
    db.close();
  });
});
