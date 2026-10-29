import { describe, it, expect, afterEach } from 'vitest';
import { FileRepo } from '../../../../electron/db/repos/files';
import { createTestDb, type TestContext } from './_helper';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('FileRepo', () => {
  it('create / get / list / update / delete 完整 CRUD', () => {
    ctx = createTestDb();
    const repo = new FileRepo(ctx.db);

    const created = repo.create({
      path: 'C:/inbox/a.pdf',
      hash: 'h1',
      size: 10,
      mime: 'application/pdf',
      extracted_text: null,
      indexed_at: null,
      status: 'new',
    });
    expect(created.id).toBeGreaterThan(0);

    expect(repo.get(created.id)?.path).toBe('C:/inbox/a.pdf');
    expect(repo.list()).toHaveLength(1);

    repo.update(created.id, { status: 'indexed' });
    expect(repo.get(created.id)?.status).toBe('indexed');

    repo.delete(created.id);
    expect(repo.get(created.id)).toBeUndefined();
  });

  it('upsertByHash：相同 hash 更新、不同 hash 插入', () => {
    ctx = createTestDb();
    const repo = new FileRepo(ctx.db);

    const first = repo.upsertByHash({
      path: 'C:/inbox/a.pdf',
      hash: 'h1',
      size: 10,
      mime: null,
      extracted_text: null,
      indexed_at: null,
      status: 'new',
    });
    const second = repo.upsertByHash({
      path: 'C:/inbox/a-copy.pdf',
      hash: 'h1',
      size: 10,
      mime: null,
      extracted_text: null,
      indexed_at: null,
      status: 'new',
    });
    expect(second.id).toBe(first.id);
    expect(repo.list()).toHaveLength(1);

    const third = repo.upsertByHash({
      path: 'C:/inbox/b.pdf',
      hash: 'h2',
      size: 20,
      mime: null,
      extracted_text: null,
      indexed_at: null,
      status: 'new',
    });
    expect(third.id).not.toBe(first.id);
    expect(repo.list()).toHaveLength(2);
  });

  it('listByStatus 只返回指定状态', () => {
    ctx = createTestDb();
    const repo = new FileRepo(ctx.db);
    repo.create({
      path: 'a',
      hash: null,
      size: null,
      mime: null,
      extracted_text: null,
      indexed_at: null,
      status: 'new',
    });
    repo.create({
      path: 'b',
      hash: null,
      size: null,
      mime: null,
      extracted_text: null,
      indexed_at: null,
      status: 'indexed',
    });

    expect(repo.listByStatus('new')).toHaveLength(1);
    expect(repo.listByStatus('indexed')[0].path).toBe('b');
  });
});
