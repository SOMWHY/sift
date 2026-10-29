import type Database from 'better-sqlite3';
import type { NewOperationLogEntry, OperationLogEntry } from '../../../shared/types';

/**
 * Append-only 操作日志仓库：只暴露 append / listByBatch / list，不提供 update/delete。
 */
export class OperationLogRepo {
  constructor(private readonly db: Database.Database) {}

  append(entry: NewOperationLogEntry): OperationLogEntry {
    const info = this.db
      .prepare(
        `INSERT INTO operation_log
           (batch_id, source_path, target_path, op_type, suggestion_id, confidence, user_decision, created_at)
         VALUES
           (@batch_id, @source_path, @target_path, @op_type, @suggestion_id, @confidence, @user_decision, @created_at)`,
      )
      .run(entry);
    return this.db
      .prepare('SELECT * FROM operation_log WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as OperationLogEntry;
  }

  listByBatch(batchId: string): OperationLogEntry[] {
    return this.db
      .prepare('SELECT * FROM operation_log WHERE batch_id = ? ORDER BY id')
      .all(batchId) as OperationLogEntry[];
  }

  list(): OperationLogEntry[] {
    return this.db.prepare('SELECT * FROM operation_log ORDER BY id').all() as OperationLogEntry[];
  }
}
