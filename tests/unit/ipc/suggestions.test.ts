import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IPC } from '../../../shared/ipc-contract';
import { createTestDb } from '../db/repos/_helper';
import { FileRepo } from '../../../electron/db/repos/files';
import { SuggestionRepo } from '../../../electron/db/repos/suggestions';
import { TagRepo } from '../../../electron/db/repos/tags';
import { FileTagRepo } from '../../../electron/db/repos/file_tags';
import { registerSuggestionHandlers } from '../../../electron/ipc/suggestions';
import type { IpcRegistrar } from '../../../electron/ipc/handlers';

function makeRegistrar(): IpcRegistrar & { calls: Map<string, (...args: unknown[]) => unknown> } {
  const calls = new Map<string, (...args: unknown[]) => unknown>();
  return {
    calls,
    handle(channel, listener) {
      calls.set(channel, listener as (...args: unknown[]) => unknown);
    },
  };
}

const ctx = { db: undefined as unknown as ReturnType<typeof createTestDb>['db'] };
let cleanup: () => void;

beforeEach(() => {
  const t = createTestDb();
  ctx.db = t.db;
  cleanup = t.cleanup;
});
afterEach(() => cleanup());

function seedFile(path: string): number {
  const repo = new FileRepo(ctx.db);
  return repo
    .create({
      path,
      hash: `h-${path}`,
      size: 1,
      mime: 'text/plain',
      extracted_text: 'x',
      indexed_at: new Date().toISOString(),
      status: 'indexed',
    })
    .id;
}

function seedSuggestion(fileId: number, proposedTag: string, confidence: number): number {
  return new SuggestionRepo(ctx.db)
    .create({
      file_id: fileId,
      proposed_tag: proposedTag,
      confidence,
      reason: 'r',
      status: 'open',
      created_at: new Date().toISOString(),
    })
    .id;
}

describe('registerSuggestionHandlers (Task 4.2)', () => {
  it('getInbox 仅返回高置信度（≥0.8）', async () => {
    const r = makeRegistrar();
    registerSuggestionHandlers(r, {
      db: ctx.db,
      getThresholds: () => ({ high: 0.8, mid: 0.5 }),
    });
    const f1 = seedFile('/root/a.pdf');
    const f2 = seedFile('/root/b.pdf');
    seedSuggestion(f1, '合同', 0.92); // inbox
    seedSuggestion(f2, '发票', 0.3); // pending
    seedSuggestion(f1, '合同', 0.55); // to_confirm（不应出现在 inbox）

    const inbox = await r.calls.get(IPC.getInbox)!();
    expect(inbox).toHaveLength(1);
    expect((inbox as Array<{ proposedTag: string; fileName: string }>)[0]).toMatchObject({
      proposedTag: '合同',
      fileName: 'a.pdf',
    });
  });

  it('getPending 仅返回低置信度（<0.5）', async () => {
    const r = makeRegistrar();
    registerSuggestionHandlers(r, {
      db: ctx.db,
      getThresholds: () => ({ high: 0.8, mid: 0.5 }),
    });
    const f = seedFile('/root/c.pdf');
    seedSuggestion(f, '发票', 0.3);
    seedSuggestion(f, '证件', 0.9);

    const pending = await r.calls.get(IPC.getPending)!();
    expect(pending).toHaveLength(1);
    expect((pending as Array<{ proposedTag: string }>)[0].proposedTag).toBe('发票');
  });

  it('acceptSuggestions 批量接受：建标签 + 挂 file_tag + status=accepted', async () => {
    const r = makeRegistrar();
    registerSuggestionHandlers(r, {
      db: ctx.db,
      getThresholds: () => ({ high: 0.8, mid: 0.5 }),
    });
    const f = seedFile('/root/d.pdf');
    const s1 = seedSuggestion(f, '合同', 0.9);
    const s2 = seedSuggestion(f, '合同', 0.85);

    const res = await r.calls.get(IPC.acceptSuggestions)!([s1, s2]);
    expect(res).toEqual({ ok: true });

    const tags = new TagRepo(ctx.db).list();
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('合同');
    expect(new FileTagRepo(ctx.db).listByFile(f)).toHaveLength(1);
    expect(new SuggestionRepo(ctx.db).get(s1)!.status).toBe('accepted');
    expect(new SuggestionRepo(ctx.db).get(s2)!.status).toBe('accepted');
  });

  it('acceptSuggestions 复用已存在的同名标签', async () => {
    const r = makeRegistrar();
    registerSuggestionHandlers(r, {
      db: ctx.db,
      getThresholds: () => ({ high: 0.8, mid: 0.5 }),
    });
    const f = seedFile('/root/e.pdf');
    new TagRepo(ctx.db).create('合同');
    const s = seedSuggestion(f, '合同', 0.9);

    await r.calls.get(IPC.acceptSuggestions)!([s]);
    expect(new TagRepo(ctx.db).list()).toHaveLength(1);
  });

  it('assignTag 重定向到指定标签，status=redirected', async () => {
    const r = makeRegistrar();
    registerSuggestionHandlers(r, {
      db: ctx.db,
      getThresholds: () => ({ high: 0.8, mid: 0.5 }),
    });
    const f = seedFile('/root/f.pdf');
    const target = new TagRepo(ctx.db).create('证件').id;
    const s = seedSuggestion(f, '发票', 0.3);

    await r.calls.get(IPC.assignTag)!(s, String(target));
    expect(new SuggestionRepo(ctx.db).get(s)!.status).toBe('redirected');
    const ft = new FileTagRepo(ctx.db).listByFile(f);
    expect(ft).toHaveLength(1);
    expect(ft[0].tag_id).toBe(target);
  });

  it('ignore 置为 rejected，不建标签', async () => {
    const r = makeRegistrar();
    registerSuggestionHandlers(r, {
      db: ctx.db,
      getThresholds: () => ({ high: 0.8, mid: 0.5 }),
    });
    const f = seedFile('/root/g.pdf');
    const s = seedSuggestion(f, '发票', 0.3);

    await r.calls.get(IPC.ignore)!(s);
    expect(new SuggestionRepo(ctx.db).get(s)!.status).toBe('rejected');
    expect(new TagRepo(ctx.db).list()).toHaveLength(0);
  });
});
