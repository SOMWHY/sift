import type Database from 'better-sqlite3';
import type { Tag } from '../../../shared/types';

export class TagRepo {
  constructor(private readonly db: Database.Database) {}

  create(name: string): Tag {
    const info = this.db.prepare('INSERT INTO tags (name) VALUES (?)').run(name);
    return this.get(Number(info.lastInsertRowid)) as Tag;
  }

  get(id: number): Tag | undefined {
    return this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag | undefined;
  }

  getByName(name: string): Tag | undefined {
    return this.db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as Tag | undefined;
  }

  list(): Tag[] {
    return this.db.prepare('SELECT * FROM tags ORDER BY name').all() as Tag[];
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }
}
