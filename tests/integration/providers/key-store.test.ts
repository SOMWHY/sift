import { describe, it, expect } from 'vitest';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';
import { ProviderRepo } from '../../../electron/db/repos/providers';
import { createKeyStore, type SafeStorageLike } from '../../../electron/providers/key-store';

function fakeStorage(): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (p: string) => Buffer.from(`enc:${p}`, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, ''),
  };
}

describe('providers key 密文落库 (Task 3.1)', () => {
  it('encrypted_api_key 存的是密文，db 中查不到明文', async () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const ks = createKeyStore(fakeStorage());
    const repo = new ProviderRepo(db);

    const plain = 'sk-super-secret-2026';
    const cipher = await ks.encryptKey(plain);

    repo.upsert({
      provider_id: 'openai',
      base_url: null,
      model: 'gpt-4o-mini',
      encrypted_api_key: cipher,
      enabled: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const row = repo.list()[0];
    expect(row.encrypted_api_key).not.toContain(plain);
    await expect(ks.decryptKey(row.encrypted_api_key!)).resolves.toBe(plain);
  });
});
