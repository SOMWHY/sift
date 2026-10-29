import type Database from 'better-sqlite3';
import type { FeedbackEvent, NewFeedbackEvent } from '../../../shared/types';

export class FeedbackEventRepo {
  constructor(private readonly db: Database.Database) {}

  create(e: NewFeedbackEvent): FeedbackEvent {
    const info = this.db
      .prepare(
        `INSERT INTO feedback_events (suggestion_id, user_action, from_tag, to_tag, created_at)
         VALUES (@suggestion_id, @user_action, @from_tag, @to_tag, @created_at)`,
      )
      .run(e);
    return this.db
      .prepare('SELECT * FROM feedback_events WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as FeedbackEvent;
  }

  listBySuggestion(suggestionId: number): FeedbackEvent[] {
    return this.db
      .prepare('SELECT * FROM feedback_events WHERE suggestion_id = ? ORDER BY id')
      .all(suggestionId) as FeedbackEvent[];
  }
}
