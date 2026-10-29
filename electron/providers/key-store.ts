export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface KeyStore {
  encryptKey(plain: string): Promise<string>;
  decryptKey(cipher: string): Promise<string>;
  keyHint(encrypted: string): string;
}

/**
 * 基于 Electron safeStorage 的 Key 存储。
 * 明文绝不落盘：只在主进程内存中加密，写入 DB 的是 base64 密文。
 */
export function createKeyStore(storage: SafeStorageLike): KeyStore {
  return {
    async encryptKey(plain: string): Promise<string> {
      if (!storage.isEncryptionAvailable()) {
        throw new Error('当前系统不支持安全存储（safeStorage 不可用），API Key 未保存');
      }
      return storage.encryptString(plain).toString('base64');
    },

    async decryptKey(cipher: string): Promise<string> {
      if (!storage.isEncryptionAvailable()) {
        throw new Error('当前系统不支持安全存储（safeStorage 不可用）');
      }
      return storage.decryptString(Buffer.from(cipher, 'base64'));
    },

    keyHint(encrypted: string): string {
      if (!storage.isEncryptionAvailable()) return '...----';
      const plain = storage.decryptString(Buffer.from(encrypted, 'base64'));
      return `...${plain.slice(-4)}`;
    },
  };
}
