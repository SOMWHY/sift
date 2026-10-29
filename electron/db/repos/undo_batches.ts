import type Database from 'better-sqlite3';
import type { UndoBatch } from '../../../shared/types';

export class UndoBatchRepo {
  constructor(private readonly db: Database.Database) {}

  create(batchId: string, undoneAt: string, reason: string | null): UndoBatch {
    const info = this.db
      .prepare('INSERT INTO undo_batches (batch_id, undone_at, reason) VALUES (?, ?, ?)')
      .run(batchId, undoneAt, reason);
    return this.db
      .prepare('SELECT * FROM undo_batches WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as UndoBatch;
  }

  getByBatchId(batchId: string): UndoBatch | undefined {
    return this.db
      .prepare('SELECT * FROM undo_batches WHERE batch_id = ?')
      .get(batchId) as UndoBatch | undefined;
  }

  list(): UndoBatch[] {
    return this.db.prepare('SELECT * FROM undo_batches ORDER BY id').all() as UndoBatch[];
  }
}
