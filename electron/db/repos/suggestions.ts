import type Database from 'better-sqlite3';
import type { NewSuggestion, Suggestion } from '../../../shared/types';

export class SuggestionRepo {
  constructor(private readonly db: Database.Database) {}

  create(s: NewSuggestion): Suggestion {
    const info = this.db
      .prepare(
        `INSERT INTO suggestions (file_id, proposed_tag, confidence, reason, status, created_at)
         VALUES (@file_id, @proposed_tag, @confidence, @reason, @status, @created_at)`,
      )
      .run(s);
    return this.get(Number(info.lastInsertRowid)) as Suggestion;
  }

  get(id: number): Suggestion | undefined {
    return this.db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id) as
      | Suggestion
      | undefined;
  }

  updateStatus(id: number, status: string): void {
    this.db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(status, id);
  }

  listByStatus(status: string): Suggestion[] {
    return this.db
      .prepare('SELECT * FROM suggestions WHERE status = ? ORDER BY id')
      .all(status) as Suggestion[];
  }

  /** 统计打开态（尚未处理）的建议数：pending + to_confirm + inbox。 */
  countOpen(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM suggestions
         WHERE status IN ('pending', 'to_confirm', 'inbox')`,
      )
      .get() as { n: number };
    return Number(row.n);
  }

  listByFile(fileId: number): Suggestion[] {
    return this.db
      .prepare('SELECT * FROM suggestions WHERE file_id = ? ORDER BY id')
      .all(fileId) as Suggestion[];
  }
}
