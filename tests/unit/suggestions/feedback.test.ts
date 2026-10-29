import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, type TestContext } from '../db/repos/_helper';
import { FileRepo } from '../../../electron/db/repos/files';
import { SuggestionRepo } from '../../../electron/db/repos/suggestions';
import { FeedbackEventRepo } from '../../../electron/db/repos/feedback_events';
import { PreferenceRepo } from '../../../electron/db/repos/preferences';
import {
  recordFeedback,
  derivePattern,
  updatePreference,
  getPreferences,
} from '../../../electron/suggestions/preferences';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

function seedSuggestion(db: Database.Database) {
  const file = new FileRepo(db).create({
    path: '/root/Invoice 2024.pdf',
    hash: 'h1',
    size: 10,
    mime: 'application/pdf',
    extracted_text: null,
    indexed_at: null,
    status: 'indexed',
  });
  return new SuggestionRepo(db).create({
    file_id: file.id,
    proposed_tag: '合同',
    confidence: 0.8,
    reason: null,
    status: 'open',
    created_at: new Date().toISOString(),
  });
}

describe('recordFeedback (Task 6.1)', () => {
  it('accepted：user_action/from_tag/to_tag 落库正确', () => {
    ctx = createTestDb();
    const s = seedSuggestion(ctx.db);

    recordFeedback(ctx.db, { suggestionId: s.id, action: 'accepted', fromTag: null, toTag: '合同' });

    const rows = new FeedbackEventRepo(ctx.db).listBySuggestion(s.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_action).toBe('accepted');
    expect(rows[0].from_tag).toBeNull();
    expect(rows[0].to_tag).toBe('合同');
  });

  it('redirected：from_tag=原建议 to_tag=用户改到', () => {
    ctx = createTestDb();
    const s = seedSuggestion(ctx.db);

    recordFeedback(ctx.db, {
      suggestionId: s.id,
      action: 'redirected',
      fromTag: '合同',
      toTag: '工作/报销',
    });

    const rows = new FeedbackEventRepo(ctx.db).listBySuggestion(s.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_action).toBe('redirected');
    expect(rows[0].from_tag).toBe('合同');
    expect(rows[0].to_tag).toBe('工作/报销');
  });

  it('rejected：from_tag=原建议 to_tag=null', () => {
    ctx = createTestDb();
    const s = seedSuggestion(ctx.db);

    recordFeedback(ctx.db, { suggestionId: s.id, action: 'rejected', fromTag: '合同', toTag: null });

    const rows = new FeedbackEventRepo(ctx.db).listBySuggestion(s.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_action).toBe('rejected');
    expect(rows[0].from_tag).toBe('合同');
    expect(rows[0].to_tag).toBeNull();
  });
});

describe('derivePattern (Task 6.1)', () => {
  it('小写并去掉扩展名，保留为文件名子串', () => {
    expect(derivePattern('Invoice 2024.pdf')).toBe('invoice 2024');
    expect(derivePattern('房屋租赁合同.pdf')).toBe('房屋租赁合同');
    expect(derivePattern('a.b.c.tar.gz')).toBe('a.b.c.tar');
  });
});

describe('updatePreference (Task 6.2)', () => {
  it('新 pattern 插入，weight=1', () => {
    ctx = createTestDb();
    updatePreference(ctx.db, 'invoice', '工作/报销');

    const prefs = getPreferences(ctx.db);
    expect(prefs).toHaveLength(1);
    expect(prefs[0].pattern).toBe('invoice');
    expect(prefs[0].preferred_tag).toBe('工作/报销');
    expect(prefs[0].weight).toBe(1);
  });

  it('重复纠正同一 pattern+tag → weight 递增（不新增行）', () => {
    ctx = createTestDb();
    updatePreference(ctx.db, 'invoice', '工作/报销');
    updatePreference(ctx.db, 'invoice', '工作/报销');
    updatePreference(ctx.db, 'invoice', '工作/报销');

    const prefs = getPreferences(ctx.db);
    expect(prefs).toHaveLength(1);
    expect(prefs[0].weight).toBe(3);
  });

  it('同一 pattern 改到不同 tag → 各自独立成行', () => {
    ctx = createTestDb();
    updatePreference(ctx.db, 'invoice', '工作/报销');
    updatePreference(ctx.db, 'invoice', '财务');

    const prefs = getPreferences(ctx.db);
    expect(prefs).toHaveLength(2);
    expect(new PreferenceRepo(ctx.db).list().map((p) => p.preferred_tag).sort()).toEqual([
      '工作/报销',
      '财务',
    ]);
  });
});
