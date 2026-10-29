import type Database from 'better-sqlite3';
import { FeedbackEventRepo } from '../db/repos/feedback_events';

export type FeedbackAction = 'accepted' | 'redirected' | 'rejected';

export interface FeedbackInput {
  suggestionId: number;
  action: FeedbackAction;
  /** 原建议标签（accepted 时为 null）。 */
  fromTag: string | null;
  /** 实际应用标签（rejected 时为 null）。 */
  toTag: string | null;
}

/** 记录一次用户对建议的决策（接受 / 改到 / 拒绝），写入 feedback_events。 */
export function recordFeedback(db: Database.Database, input: FeedbackInput): void {
  new FeedbackEventRepo(db).create({
    suggestion_id: input.suggestionId,
    user_action: input.action,
    from_tag: input.fromTag,
    to_tag: input.toTag,
    created_at: new Date().toISOString(),
  });
}

/** 从文件名提取偏好 pattern：小写并去掉扩展名，保持为文件名子串以便命中。 */
export function derivePattern(fileName: string): string {
  return fileName.toLowerCase().replace(/\.[^.]+$/, '');
}
