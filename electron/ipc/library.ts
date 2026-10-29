import path from 'node:path';
import type Database from 'better-sqlite3';
import { IPC, type SearchResult, type TagView } from '../../shared/ipc-contract';
import { FileTagRepo } from '../db/repos/file_tags';
import { TagRepo } from '../db/repos/tags';
import { searchFiles } from '../search/fts';
import type { IpcRegistrar } from './handlers';

export interface LibraryDeps {
  db: Database.Database;
}

/**
 * M2 检索/虚拟视图/手动标签的 IPC 边界。
 * searchFiles 的内部结果（SearchResult）在此映射为渲染层契约 SearchResult。
 */
export function registerLibraryHandlers(ipc: IpcRegistrar, deps: LibraryDeps): void {
  const fileTags = new FileTagRepo(deps.db);
  const tags = new TagRepo(deps.db);

  ipc.handle(IPC.search, (q: unknown, opts?: unknown) => {
    const query = String(q ?? '');
    const tagIds = ((opts as { tagIds?: string[] } | undefined)?.tagIds ?? []).map((id) =>
      Number(id),
    );

    const rows = searchFiles(deps.db, query, { tagIds });
    return rows.map(
      (r): SearchResult => ({
        id: String(r.fileId),
        path: r.path,
        fileName: path.basename(r.path),
        excerpt: (r.extracted_text ?? '').slice(0, 160),
        tagIds: fileTags.listByFile(r.fileId).map((ft) => String(ft.tag_id)),
      }),
    );
  });

  ipc.handle(IPC.addManualTag, (fileId: unknown, tagId: unknown) => {
    fileTags.set(Number(fileId), Number(tagId), 1);
    return { ok: true };
  });

  ipc.handle(IPC.listTags, () => tags.list().map((t): TagView => ({ id: String(t.id), name: t.name })));
}
