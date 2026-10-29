import type Database from 'better-sqlite3';
import type { Preference } from '../../shared/types';
import { FeedbackEventRepo } from '../db/repos/feedback_events';
import { PreferenceRepo } from '../db/repos/preferences';

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

/**
 * 从纠正事件（含 X → 用户改到 Y）更新偏好：同一 (pattern, preferred_tag)
 * 已存在则 weight +1，否则插入 weight=1。重复纠正持续提升权重。
 */
export function updatePreference(db: Database.Database, pattern: string, preferredTag: string): void {
  const repo = new PreferenceRepo(db);
  const existing = repo.getByPatternAndTag(pattern, preferredTag);
  if (existing) {
    repo.setWeight(existing.id, existing.weight + 1);
  } else {
    repo.create({
      pattern,
      preferred_tag: preferredTag,
      weight: 1,
      updated_at: new Date().toISOString(),
    });
  }
}

/** 读取全部偏好（建议引擎据此纠正同类文件的 proposed_tag）。 */
export function getPreferences(db: Database.Database): Preference[] {
  return new PreferenceRepo(db).list();
}
