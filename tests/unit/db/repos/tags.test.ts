import { describe, it, expect, afterEach } from 'vitest';
import { TagRepo } from '../../../../electron/db/repos/tags';
import { createTestDb, type TestContext } from './_helper';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('TagRepo', () => {
  it('create / getByName / list / delete', () => {
    ctx = createTestDb();
    const repo = new TagRepo(ctx.db);

    const tag = repo.create('合同');
    expect(tag.id).toBeGreaterThan(0);

    expect(repo.getByName('合同')?.id).toBe(tag.id);
    expect(repo.list()).toHaveLength(1);

    repo.delete(tag.id);
    expect(repo.getByName('合同')).toBeUndefined();
  });

  it('重复名称报错（UNIQUE 约束）', () => {
    ctx = createTestDb();
    const repo = new TagRepo(ctx.db);
    repo.create('发票');
    expect(() => repo.create('发票')).toThrow();
  });
});
