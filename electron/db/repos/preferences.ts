import type Database from 'better-sqlite3';
import type { NewPreference, Preference } from '../../../shared/types';

export class PreferenceRepo {
  constructor(private readonly db: Database.Database) {}

  create(p: NewPreference): Preference {
    const info = this.db
      .prepare(
        `INSERT INTO preferences (pattern, preferred_tag, weight, updated_at)
         VALUES (@pattern, @preferred_tag, @weight, @updated_at)`,
      )
      .run(p);
    return this.get(Number(info.lastInsertRowid)) as Preference;
  }

  get(id: number): Preference | undefined {
    return this.db.prepare('SELECT * FROM preferences WHERE id = ?').get(id) as
      | Preference
      | undefined;
  }

  getByPatternAndTag(pattern: string, preferredTag: string): Preference | undefined {
    return this.db
      .prepare('SELECT * FROM preferences WHERE pattern = ? AND preferred_tag = ?')
      .get(pattern, preferredTag) as Preference | undefined;
  }

  setWeight(id: number, weight: number): void {
    this.db
      .prepare('UPDATE preferences SET weight = ?, updated_at = ? WHERE id = ?')
      .run(weight, new Date().toISOString(), id);
  }

  list(): Preference[] {
    return this.db.prepare('SELECT * FROM preferences ORDER BY id').all() as Preference[];
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM preferences WHERE id = ?').run(id);
  }
}
