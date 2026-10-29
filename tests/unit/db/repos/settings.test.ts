import { describe, it, expect, afterEach } from 'vitest';
import { SettingsRepo } from '../../../../electron/db/repos/settings';
import { createTestDb, type TestContext } from './_helper';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('SettingsRepo', () => {
  it('get / set / delete（set 覆盖同名 key）', () => {
    ctx = createTestDb();
    const repo = new SettingsRepo(ctx.db);

    expect(repo.get('inbox')).toBeUndefined();

    repo.set('inbox', 'C:/inbox');
    expect(repo.get('inbox')).toBe('C:/inbox');

    repo.set('inbox', 'D:/inbox2');
    expect(repo.get('inbox')).toBe('D:/inbox2');

    repo.delete('inbox');
    expect(repo.get('inbox')).toBeUndefined();
  });
});
