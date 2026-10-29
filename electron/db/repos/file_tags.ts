import type Database from 'better-sqlite3';
import type { FileTag } from '../../../shared/types';

export class FileTagRepo {
  constructor(private readonly db: Database.Database) {}

  set(fileId: number, tagId: number, confidence: number): void {
    this.db
      .prepare(
        `INSERT INTO file_tags (file_id, tag_id, confidence) VALUES (?, ?, ?)
         ON CONFLICT(file_id, tag_id) DO UPDATE SET confidence = excluded.confidence`,
      )
      .run(fileId, tagId, confidence);
  }

  listByFile(fileId: number): FileTag[] {
    return this.db
      .prepare('SELECT * FROM file_tags WHERE file_id = ? ORDER BY confidence DESC')
      .all(fileId) as FileTag[];
  }

  delete(fileId: number, tagId: number): void {
    this.db.prepare('DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?').run(fileId, tagId);
  }
}
