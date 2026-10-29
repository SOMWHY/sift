import { describe, it, expect, afterEach } from 'vitest';
import { SuggestionRepo } from '../../../../electron/db/repos/suggestions';
import { FileRepo } from '../../../../electron/db/repos/files';
import { createTestDb, type TestContext } from './_helper';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('SuggestionRepo', () => {
  it('create / get / updateStatus / listByStatus / listByFile', () => {
    ctx = createTestDb();
    const fileRepo = new FileRepo(ctx.db);
    const repo = new SuggestionRepo(ctx.db);

    const file = fileRepo.create({
      path: 'a.pdf',
      hash: null,
      size: null,
      mime: null,
      extracted_text: null,
      indexed_at: null,
      status: 'indexed',
    });

    const s = repo.create({
      file_id: file.id,
      proposed_tag: '合同',
      confidence: 0.85,
      reason: '关键词命中',
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    expect(s.id).toBeGreaterThan(0);

    expect(repo.get(s.id)?.proposed_tag).toBe('合同');

    repo.updateStatus(s.id, 'accepted');
    expect(repo.get(s.id)?.status).toBe('accepted');

    expect(repo.listByStatus('accepted')).toHaveLength(1);
    expect(repo.listByFile(file.id)).toHaveLength(1);
  });
});
