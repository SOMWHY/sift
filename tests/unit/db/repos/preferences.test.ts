import { describe, it, expect, afterEach } from 'vitest';
import { PreferenceRepo } from '../../../../electron/db/repos/preferences';
import { createTestDb, type TestContext } from './_helper';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('PreferenceRepo', () => {
  it('create / get / list / delete', () => {
    ctx = createTestDb();
    const repo = new PreferenceRepo(ctx.db);

    const pref = repo.create({
      pattern: '*.pdf',
      preferred_tag: '文档',
      weight: 1,
      updated_at: new Date().toISOString(),
    });
    expect(pref.id).toBeGreaterThan(0);

    expect(repo.get(pref.id)?.preferred_tag).toBe('文档');
    expect(repo.list()).toHaveLength(1);

    repo.delete(pref.id);
    expect(repo.list()).toHaveLength(0);
  });
});
