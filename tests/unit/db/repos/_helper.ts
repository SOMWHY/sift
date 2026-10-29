import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDb } from '../../../../electron/db/connection';
import { runMigrations } from '../../../../electron/db/migrations';

export interface TestContext {
  db: Database.Database;
  cleanup: () => void;
}

export function createTestDb(): TestContext {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-repos-'));
  const db = openDb(path.join(dir, 'test.db'));
  runMigrations(db);
  return {
    db,
    cleanup: () => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
