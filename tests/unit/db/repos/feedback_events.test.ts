import { describe, it, expect, afterEach } from 'vitest';
import { FeedbackEventRepo } from '../../../../electron/db/repos/feedback_events';
import { SuggestionRepo } from '../../../../electron/db/repos/suggestions';
import { FileRepo } from '../../../../electron/db/repos/files';
import { createTestDb, type TestContext } from './_helper';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('FeedbackEventRepo', () => {
  it('create / listBySuggestion', () => {
    ctx = createTestDb();
    const fileRepo = new FileRepo(ctx.db);
    const suggestionRepo = new SuggestionRepo(ctx.db);
    const repo = new FeedbackEventRepo(ctx.db);

    const file = fileRepo.create({
      path: 'a.pdf',
      hash: null,
      size: null,
      mime: null,
      extracted_text: null,
      indexed_at: null,
      status: 'indexed',
    });
    const suggestion = suggestionRepo.create({
      file_id: file.id,
      proposed_tag: '合同',
      confidence: 0.8,
      reason: null,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    const event = repo.create({
      suggestion_id: suggestion.id,
      user_action: 'accepted',
      from_tag: null,
      to_tag: '合同',
      created_at: new Date().toISOString(),
    });
    expect(event.id).toBeGreaterThan(0);

    expect(repo.listBySuggestion(suggestion.id)).toHaveLength(1);
  });
});
