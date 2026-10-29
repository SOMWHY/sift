import type Database from 'better-sqlite3';
import type { DbFile, NewFile } from '../../../shared/types';

export class FileRepo {
  constructor(private readonly db: Database.Database) {}

  create(f: NewFile): DbFile {
    const info = this.db
      .prepare(
        `INSERT INTO files (path, hash, size, mime, extracted_text, indexed_at, status)
         VALUES (@path, @hash, @size, @mime, @extracted_text, @indexed_at, @status)`,
      )
      .run(f);
    return this.get(Number(info.lastInsertRowid)) as DbFile;
  }

  get(id: number): DbFile | undefined {
    return this.db.prepare('SELECT * FROM files WHERE id = ?').get(id) as DbFile | undefined;
  }

  list(): DbFile[] {
    return this.db.prepare('SELECT * FROM files ORDER BY id').all() as DbFile[];
  }

  listByStatus(status: string): DbFile[] {
    return this.db
      .prepare('SELECT * FROM files WHERE status = ? ORDER BY id')
      .all(status) as DbFile[];
  }

  update(id: number, patch: Partial<NewFile>): void {
    const current = this.get(id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE files SET path=@path, hash=@hash, size=@size, mime=@mime,
         extracted_text=@extracted_text, indexed_at=@indexed_at, status=@status WHERE id=@id`,
      )
      .run({ ...next, id });
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM files WHERE id = ?').run(id);
  }

  /** 相同 hash 视为同一文件：已存在则更新，否则插入。 */
  upsertByHash(f: NewFile): DbFile {
    if (f.hash != null) {
      const existing = this.db
        .prepare('SELECT * FROM files WHERE hash = ?')
        .get(f.hash) as DbFile | undefined;
      if (existing) {
        this.update(existing.id, f);
        return this.get(existing.id) as DbFile;
      }
    }
    return this.create(f);
  }
}
