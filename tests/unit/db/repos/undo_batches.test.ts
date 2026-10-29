import { describe, it, expect, afterEach } from 'vitest';
import { UndoBatchRepo } from '../../../../electron/db/repos/undo_batches';
import { createTestDb, type TestContext } from './_helper';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('UndoBatchRepo', () => {
  it('create / getByBatchId / list', () => {
    ctx = createTestDb();
    const repo = new UndoBatchRepo(ctx.db);

    const batch = repo.create('b1', new Date().toISOString(), '用户撤销');
    expect(batch.id).toBeGreaterThan(0);

    expect(repo.getByBatchId('b1')?.reason).toBe('用户撤销');
    expect(repo.list()).toHaveLength(1);
  });
});
