import { describe, it, expect } from 'vitest';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';
import { FileRepo } from '../../../electron/db/repos/files';
import { TagRepo } from '../../../electron/db/repos/tags';
import { FileTagRepo } from '../../../electron/db/repos/file_tags';
import { searchFiles } from '../../../electron/search/fts';

function newFile(path: string, text: string) {
  return {
    path,
    hash: 'h' + path,
    size: 1,
    mime: 'text/plain',
    extracted_text: text,
    indexed_at: new Date().toISOString(),
    status: 'indexed',
  };
}

describe('searchFiles（FTS5 检索）', () => {
  it('英文关键词命中', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const files = new FileRepo(db);
    files.create(newFile('/a.txt', 'hello world from sift'));
    files.create(newFile('/b.txt', 'goodbye'));
    files.create(newFile('/c.txt', 'nothing here'));

    const results = searchFiles(db, 'hello');
    expect(results.map((r) => r.path)).toEqual(['/a.txt']);
    db.close();
  });

  it('中文关键词命中（LIKE 回退）', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const files = new FileRepo(db);
    files.create(newFile('/zh.txt', '这是一份中文文档'));
    files.create(newFile('/en.txt', 'english document'));

    const results = searchFiles(db, '文档');
    expect(results.map((r) => r.path)).toEqual(['/zh.txt']);
    db.close();
  });

  it('标签过滤只返回带该标签的文件', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const files = new FileRepo(db);
    const tags = new TagRepo(db);
    const fileTags = new FileTagRepo(db);

    const a = files.create(newFile('/a.txt', 'invoice 2026'));
    const b = files.create(newFile('/b.txt', 'invoice 2026 copy'));
    const tag = tags.create('发票');
    fileTags.set(a.id, tag.id, 1);

    const all = searchFiles(db, 'invoice');
    expect(all).toHaveLength(2);

    const filtered = searchFiles(db, 'invoice', { tagIds: [tag.id] });
    expect(filtered.map((r) => r.path)).toEqual(['/a.txt']);
    db.close();
  });

  it('无匹配返回空数组', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const files = new FileRepo(db);
    files.create(newFile('/x.txt', 'alpha'));

    expect(searchFiles(db, 'zzz-not-present')).toEqual([]);
    db.close();
  });
});
