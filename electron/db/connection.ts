import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 打开（不存在则创建）一个 SQLite 数据库并启用 WAL。
 * 测试可直接传入临时路径；生产调用方传 app.getPath('userData')。
 */
export function openDb(dbPath: string): Database.Database {
  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * 打开 userData 目录下的 sift.db（自动创建目录与文件）。
 */
export function getDb(userDataDir: string): Database.Database {
  return openDb(path.join(userDataDir, 'sift.db'));
}
