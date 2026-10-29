import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';
import { FileRepo } from '../../../electron/db/repos/files';
import { OperationLogRepo } from '../../../electron/db/repos/operation_log';
import { IPC, type ArchiveDryRunResponse, type ConfirmArchiveResponse } from '../../../shared/ipc-contract';
import { registerArchiveHandlers } from '../../../electron/ipc/archive';
import { hashFile } from '../../../electron/indexer/hasher';
import type { IpcRegistrar } from '../../../electron/ipc/handlers';

function makeRegistrar() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const registrar: IpcRegistrar = {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
  };
  return { registrar, handlers };
}

async function insertFile(files: FileRepo, p: string): Promise<number> {
  const hash = await hashFile(p);
  const stat = fs.statSync(p);
  return files
    .create({
      path: p,
      hash,
      size: stat.size,
      mime: 'text/plain',
      extracted_text: null,
      indexed_at: new Date().toISOString(),
      status: 'indexed',
    })
    .id;
}

describe('archive IPC (Task 5.4)', () => {
  it('archiveDryRun 预览 + confirmArchive 执行 + 账本落库', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-archive-ipc-'));
    const db = openDb(path.join(root, 'sift.db'));
    runMigrations(db);
    const files = new FileRepo(db);

    const srcA = path.join(root, 'a.txt');
    const srcB = path.join(root, 'b.txt');
    fs.writeFileSync(srcA, 'alpha');
    fs.writeFileSync(srcB, 'beta');
    const idA = await insertFile(files, srcA);
    const idB = await insertFile(files, srcB);

    const { registrar, handlers } = makeRegistrar();
    registerArchiveHandlers(registrar, {
      db,
      getAuthorizedRoot: () => root,
      getLowConfidenceThreshold: () => 0.5,
    });

    const targetDir = path.join(root, 'archive');
    const dryRun = handlers.get(IPC.archiveDryRun)!([idA, idB], targetDir) as ArchiveDryRunResponse;
    expect(dryRun.entries).toHaveLength(2);
    expect(dryRun.entries.every((e) => !e.blocked)).toBe(true);
    expect(dryRun.batchId).toBeTruthy();

    const confirm = (await handlers.get(IPC.confirmArchive)!(dryRun.batchId)) as ConfirmArchiveResponse;
    expect(confirm.ok).toBe(true);
    expect(confirm.executed).toBe(2);
    expect(confirm.blocked).toBe(0);

    expect(fs.existsSync(path.join(targetDir, 'a.txt'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'b.txt'))).toBe(true);
    expect(fs.existsSync(srcA)).toBe(false);
    expect(fs.existsSync(srcB)).toBe(false);

    expect(new OperationLogRepo(db).list()).toHaveLength(2);
    db.close();
  });
});
