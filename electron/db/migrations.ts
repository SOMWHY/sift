import type Database from 'better-sqlite3';
import schemaSql from './schema.sql';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  { version: 1, name: 'initial_schema', sql: schemaSql },
  {
    version: 2,
    name: 'files_fts',
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        path, extracted_text,
        content='files', content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
        INSERT INTO files_fts(rowid, path, extracted_text)
        VALUES (new.id, new.path, new.extracted_text);
      END;

      CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
        INSERT INTO files_fts(files_fts, rowid, path, extracted_text)
        VALUES ('delete', old.id, old.path, old.extracted_text);
      END;

      CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
        INSERT INTO files_fts(files_fts, rowid, path, extracted_text)
        VALUES ('delete', old.id, old.path, old.extracted_text);
        INSERT INTO files_fts(rowid, path, extracted_text)
        VALUES (new.id, new.path, new.extracted_text);
      END;
    `,
  },
];

/**
 * 幂等执行迁移：按 version 顺序应用未执行过的迁移，并记录到 _migrations。
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM _migrations').all() as Array<{ version: number }>).map(
      (row) => row.version,
    ),
  );

  const apply = db.transaction(() => {
    const insert = db.prepare(
      'INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)',
    );
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      db.exec(migration.sql);
      insert.run(migration.version, migration.name, new Date().toISOString());
    }
  });

  apply();
}
