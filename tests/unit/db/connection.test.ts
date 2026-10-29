import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, getDb } from '../../../electron/db/connection';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-db-conn-'));
const cleanups: Array<() => void> = [];

function tmpDir(name: string): string {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

afterAll(() => {
  for (const fn of cleanups) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('openDb', () => {
  it('首次调用自动创建 .db 文件', () => {
    const dir = tmpDir('auto-create');
    const dbPath = path.join(dir, 'test.db');
    expect(fs.existsSync(dbPath)).toBe(false);

    const db = openDb(dbPath);
    cleanups.push(() => db.close());

    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('journal_mode 为 WAL', () => {
    const dir = tmpDir('wal');
    const dbPath = path.join(dir, 'test.db');
    const db = openDb(dbPath);
    cleanups.push(() => db.close());

    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });
});

describe('getDb', () => {
  it('在 userData 目录下创建 sift.db（目录不存在则自动创建）', () => {
    const userData = path.join(tmpRoot, 'nested', 'user-data');
    expect(fs.existsSync(userData)).toBe(false);

    const db = getDb(userData);
    cleanups.push(() => db.close());

    const dbPath = path.join(userData, 'sift.db');
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});
