import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-db-mig-'));
let db: Database.Database;

const EXPECTED_TABLES = [
  'files',
  'tags',
  'file_tags',
  'suggestions',
  'feedback_events',
  'preferences',
  'operation_log',
  'undo_batches',
  'settings',
  'providers',
];

beforeAll(() => {
  db = openDb(path.join(tmpRoot, 'test.db'));
});

afterAll(() => {
  db.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('runMigrations', () => {
  it('幂等：跑两遍结果一致（10 表齐全，_migrations 只有 1 条记录）', () => {
    runMigrations(db);
    runMigrations(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    for (const expected of EXPECTED_TABLES) {
      expect(tableNames).toContain(expected);
    }

    const migrationCount = db
      .prepare('SELECT COUNT(*) AS n FROM _migrations')
      .get() as { n: number };
    expect(migrationCount.n).toBe(1);
  });

  it('必要索引存在：files.path、files.hash、operation_log.batch_id、operation_log.created_at', () => {
    const indexNames = (table: string): string[] =>
      (db.pragma(`index_list(${table})`) as Array<{ name: string }>).map((i) => i.name);

    expect(indexNames('files')).toEqual(
      expect.arrayContaining(['idx_files_path', 'idx_files_hash']),
    );
    expect(indexNames('operation_log')).toEqual(
      expect.arrayContaining(['idx_operation_log_batch_id', 'idx_operation_log_created_at']),
    );
  });

  it('operation_log 无 DELETE 触发器（append-only 由本层钉死）', () => {
    const triggers = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='operation_log'",
      )
      .all() as Array<{ name: string }>;
    expect(triggers).toEqual([]);
  });
});
