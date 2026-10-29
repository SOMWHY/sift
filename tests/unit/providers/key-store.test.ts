import { describe, it, expect, vi } from 'vitest';
import { createKeyStore, type SafeStorageLike } from '../../../electron/providers/key-store';

function fakeStorage(overrides: Partial<SafeStorageLike> = {}): SafeStorageLike {
  const map = new Map<string, Buffer>();
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => {
      const b = Buffer.from(`enc:${plain}`, 'utf8');
      map.set(`enc:${plain}`, b);
      return b;
    },
    decryptString: (enc: Buffer) => enc.toString('utf8').replace(/^enc:/, ''),
    ...overrides,
  };
}

describe('key-store (Task 3.1)', () => {
  it('encryptKey 加密后返回 base64 密文（不落明文）', async () => {
    const ks = createKeyStore(fakeStorage());
    const cipher = await ks.encryptKey('sk-abc123456789');
    expect(cipher).not.toContain('sk-abc123456789');
    expect(Buffer.from(cipher, 'base64').toString('utf8')).toContain('enc:sk-abc');
  });

  it('系统不支持加密时抛明确错误，且不调用 encryptString', async () => {
    const encryptString = vi.fn();
    const ks = createKeyStore(
      fakeStorage({ isEncryptionAvailable: () => false, encryptString }),
    );
    await expect(ks.encryptKey('sk-abc')).rejects.toThrow(/安全存储/i);
    expect(encryptString).not.toHaveBeenCalled();
  });

  it('decryptKey 与 encryptKey 往返一致', async () => {
    const ks = createKeyStore(fakeStorage());
    const cipher = await ks.encryptKey('sk-secret-key-2026');
    await expect(ks.decryptKey(cipher)).resolves.toBe('sk-secret-key-2026');
  });

  it('keyHint 解密后返回尾 4 位', async () => {
    const ks = createKeyStore(fakeStorage());
    const cipher = await ks.encryptKey('sk-secret-key-2026');
    expect(ks.keyHint(cipher)).toBe('...2026');
  });
});
