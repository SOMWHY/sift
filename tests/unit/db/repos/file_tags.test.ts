import { describe, it, expect, afterEach } from 'vitest';
import { FileTagRepo } from '../../../../electron/db/repos/file_tags';
import { TagRepo } from '../../../../electron/db/repos/tags';
import { FileRepo } from '../../../../electron/db/repos/files';
import { createTestDb, type TestContext } from './_helper';

let ctx: TestContext;

afterEach(() => {
  ctx?.cleanup();
});

describe('FileTagRepo', () => {
  it('set / listByFile / delete（含 confidence）', () => {
    ctx = createTestDb();
    const fileRepo = new FileRepo(ctx.db);
    const tagRepo = new TagRepo(ctx.db);
    const repo = new FileTagRepo(ctx.db);

    const file = fileRepo.create({
      path: 'a',
      hash: null,
      size: null,
      mime: null,
      extracted_text: null,
      indexed_at: null,
      status: 'new',
    });
    const tag = tagRepo.create('合同');

    repo.set(file.id, tag.id, 0.9);
    const links = repo.listByFile(file.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ file_id: file.id, tag_id: tag.id, confidence: 0.9 });

    repo.delete(file.id, tag.id);
    expect(repo.listByFile(file.id)).toHaveLength(0);
  });
});
