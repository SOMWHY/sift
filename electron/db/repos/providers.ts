import type Database from 'better-sqlite3';
import type { NewProvider, Provider } from '../../../shared/types';

export class ProviderRepo {
  constructor(private readonly db: Database.Database) {}

  get(id: number): Provider | undefined {
    return this.db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Provider | undefined;
  }

  list(): Provider[] {
    return this.db.prepare('SELECT * FROM providers ORDER BY id').all() as Provider[];
  }

  /** 同 provider_id 视为同一提供方：已存在则更新，否则插入。 */
  upsert(p: NewProvider): Provider {
    const existing = this.db
      .prepare('SELECT * FROM providers WHERE provider_id = ?')
      .get(p.provider_id) as Provider | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE providers
           SET base_url = @base_url, model = @model, encrypted_api_key = @encrypted_api_key,
               enabled = @enabled, updated_at = @updated_at
           WHERE id = @id`,
        )
        .run({ ...p, id: existing.id });
      return this.get(existing.id) as Provider;
    }

    const info = this.db
      .prepare(
        `INSERT INTO providers (provider_id, base_url, model, encrypted_api_key, enabled, created_at, updated_at)
         VALUES (@provider_id, @base_url, @model, @encrypted_api_key, @enabled, @created_at, @updated_at)`,
      )
      .run(p);
    return this.get(Number(info.lastInsertRowid)) as Provider;
  }
}
