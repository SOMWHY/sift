import { describe, it, expect, afterEach } from 'vitest';
import { ProviderRepo } from '../../../../electron/db/repos/providers';
import { createTestDb, type TestContext } from './_helper';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('ProviderRepo', () => {
  it('upsert：同 provider_id 更新、不同 provider_id 插入；list 返回全部', () => {
    ctx = createTestDb();
    const repo = new ProviderRepo(ctx.db);

    const now = new Date().toISOString();
    const first = repo.upsert({
      provider_id: 'openrouter',
      base_url: 'https://openrouter.ai/api/v1',
      model: 'x',
      encrypted_api_key: 'enc-1',
      enabled: 1,
      created_at: now,
      updated_at: now,
    });
    expect(first.id).toBeGreaterThan(0);

    const second = repo.upsert({
      provider_id: 'openrouter',
      base_url: 'https://openrouter.ai/api/v1',
      model: 'y',
      encrypted_api_key: 'enc-2',
      enabled: 0,
      created_at: now,
      updated_at: now,
    });
    expect(second.id).toBe(first.id);
    expect(repo.list()).toHaveLength(1);
    expect(repo.get(first.id)?.model).toBe('y');
  });
});
