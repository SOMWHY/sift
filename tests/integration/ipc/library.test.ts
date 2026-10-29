import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';
import { FileRepo } from '../../../electron/db/repos/files';
import { FileTagRepo } from '../../../electron/db/repos/file_tags';
import { TagRepo } from '../../../electron/db/repos/tags';
import { IPC, type SearchResult, type TagView } from '../../../shared/ipc-contract';
import { registerLibraryHandlers } from '../../../electron/ipc/library';
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

describe('library IPC (Task 2.4)', () => {
  it('search 返回契约 SearchResult（含 fileName/excerpt/tagIds 映射）', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const files = new FileRepo(db);
    const tags = new TagRepo(db);
    const fileTags = new FileTagRepo(db);

    const f = files.create({
      path: path.join('D:', 'Downloads', 'report.pdf'),
      hash: 'h1',
      size: 10,
      mime: 'application/pdf',
      extracted_text: '季度财务报告 摘要',
      indexed_at: new Date().toISOString(),
      status: 'pending',
    });
    const tag = tags.create('财务');
    fileTags.set(f.id, tag.id, 0.9);

    const { registrar, handlers } = makeRegistrar();
    registerLibraryHandlers(registrar, { db });

    const results = (handlers.get(IPC.search)!('财务', undefined) as SearchResult[]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(String(f.id));
    expect(results[0].fileName).toBe('report.pdf');
    expect(results[0].excerpt).toContain('季度财务报告');
    expect(results[0].tagIds).toEqual([String(tag.id)]);
  });

  it('addManualTag 写入 file_tags（confidence=1）', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const files = new FileRepo(db);
    const tags = new TagRepo(db);
    const fileTags = new FileTagRepo(db);

    const f = files.create({
      path: path.join('D:', 'Downloads', 'a.txt'),
      hash: 'h2',
      size: 5,
      mime: 'text/plain',
      extracted_text: null,
      indexed_at: new Date().toISOString(),
      status: 'pending',
    });
    const tag = tags.create('收据');

    const { registrar, handlers } = makeRegistrar();
    registerLibraryHandlers(registrar, { db });

    const result = handlers.get(IPC.addManualTag)!(String(f.id), String(tag.id)) as {
      ok: boolean;
    };
    expect(result).toEqual({ ok: true });
    const rows = fileTags.listByFile(f.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].tag_id).toBe(tag.id);
    expect(rows[0].confidence).toBe(1);
  });

  it('listTags 返回按名称排序的标签', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const tags = new TagRepo(db);
    tags.create('工作');
    tags.create('收据');
    tags.create('发票');

    const { registrar, handlers } = makeRegistrar();
    registerLibraryHandlers(registrar, { db });

    const list = handlers.get(IPC.listTags)!() as TagView[];
    expect(list.map((t) => t.name)).toEqual(['发票', '工作', '收据']);
  });
});
