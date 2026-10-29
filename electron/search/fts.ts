import type Database from 'better-sqlite3';

export interface SearchOptions {
  tagIds?: number[];
}

export interface SearchResult {
  fileId: number;
  path: string;
  mime: string | null;
  size: number | null;
  extracted_text: string | null;
  indexed_at: string | null;
  status: string;
  rank: number;
}

interface FileRow {
  id: number;
  path: string;
  mime: string | null;
  size: number | null;
  extracted_text: string | null;
  indexed_at: string | null;
  status: string;
}

const HAS_CJK = /[\u3400-\u9fff]/;

/** 标签过滤 SQL 片段（?tagIds 为空时无过滤）。 */
function tagFilter(tagIds: number[]): string {
  if (tagIds.length === 0) return '';
  const placeholders = tagIds.map(() => '?').join(', ');
  return `AND EXISTS (
    SELECT 1 FROM file_tags ft
    WHERE ft.file_id = f.id AND ft.tag_id IN (${placeholders})
  )`;
}

/**
 * 全文检索：英文/空格分词走 FTS5 MATCH；含 CJK 的查询走 LIKE 回退（FTS5 unicode61
 * 无法切分中文）。返回 SearchResult[]，按相关度排序。
 */
export function searchFiles(db: Database.Database, q: string, options: SearchOptions = {}): SearchResult[] {
  const query = q.trim();
  const tagIds = options.tagIds ?? [];

  // 空查询 = 虚拟视图“全部文件”，按入库时间倒序。
  if (!query) {
    const sql = `
      SELECT id, path, mime, size, extracted_text, indexed_at, status
      FROM files f
      WHERE 1=1
      ${tagFilter(tagIds)}
      ORDER BY indexed_at DESC
    `;
    const rows = db.prepare(sql).all(...tagIds) as FileRow[];
    return rows.map((r) => ({ fileId: r.id, path: r.path, mime: r.mime, size: r.size, extracted_text: r.extracted_text, indexed_at: r.indexed_at, status: r.status, rank: 0 }));
  }

  if (HAS_CJK.test(query)) {
    const like = `%${query}%`;
    const sql = `
      SELECT id, path, mime, size, extracted_text, indexed_at, status
      FROM files f
      WHERE (f.extracted_text LIKE ? OR f.path LIKE ?)
      ${tagFilter(tagIds)}
    `;
    const rows = db.prepare(sql).all(like, like, ...tagIds) as Array<FileRow & { rank?: number }>;
    return rows.map((r) => ({ fileId: r.id, path: r.path, mime: r.mime, size: r.size, extracted_text: r.extracted_text, indexed_at: r.indexed_at, status: r.status, rank: 0 }));
  }

  const match = query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' AND ');

  const sql = `
    SELECT f.id, f.path, f.mime, f.size, f.extracted_text, f.indexed_at, f.status,
           bm25(files_fts) AS rank
    FROM files_fts
    JOIN files f ON f.id = files_fts.rowid
    WHERE files_fts MATCH ?
    ${tagFilter(tagIds)}
    ORDER BY rank
  `;
  const rows = db.prepare(sql).all(match, ...tagIds) as Array<FileRow & { rank: number }>;
  return rows.map((r) => ({ fileId: r.id, path: r.path, mime: r.mime, size: r.size, extracted_text: r.extracted_text, indexed_at: r.indexed_at, status: r.status, rank: r.rank }));
}
