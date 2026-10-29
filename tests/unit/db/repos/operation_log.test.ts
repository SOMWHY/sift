import { describe, it, expect, afterEach } from 'vitest';
import { OperationLogRepo } from '../../../../electron/db/repos/operation_log';
import { createTestDb, type TestContext } from './_helper';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('OperationLogRepo', () => {
  it('append 追加记录，listByBatch 按批次取回（append-only）', () => {
    ctx = createTestDb();
    const repo = new OperationLogRepo(ctx.db);

    repo.append({
      batch_id: 'b1',
      source_path: 'a.pdf',
      target_path: 'b.pdf',
      op_type: 'move',
      suggestion_id: null,
      confidence: null,
      user_decision: null,
      created_at: new Date().toISOString(),
    });
    repo.append({
      batch_id: 'b1',
      source_path: 'c.pdf',
      target_path: 'd.pdf',
      op_type: 'move',
      suggestion_id: null,
      confidence: null,
      user_decision: null,
      created_at: new Date().toISOString(),
    });
    repo.append({
      batch_id: 'b2',
      source_path: 'e.pdf',
      target_path: 'f.pdf',
      op_type: 'move',
      suggestion_id: null,
      confidence: null,
      user_decision: null,
      created_at: new Date().toISOString(),
    });

    expect(repo.listByBatch('b1')).toHaveLength(2);
    expect(repo.listByBatch('b2')).toHaveLength(1);
    expect(repo.list()).toHaveLength(3);
  });
});
