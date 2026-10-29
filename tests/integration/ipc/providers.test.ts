import { describe, it, expect, vi } from 'vitest';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';
import { ProviderRepo } from '../../../electron/db/repos/providers';
import { createKeyStore, type SafeStorageLike } from '../../../electron/providers/key-store';
import type { LLMClient } from '../../../electron/providers/llm-client';
import { IPC, type ProviderStatus } from '../../../shared/ipc-contract';
import { registerProviderHandlers } from '../../../electron/ipc/providers';
import type { IpcRegistrar } from '../../../electron/ipc/handlers';

function fakeStorage(): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (p: string) => Buffer.from(`enc:${p}`, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, ''),
  };
}

function setup() {
  const db = openDb(':memory:');
  runMigrations(db);
  const repo = new ProviderRepo(db);
  const keyStore = createKeyStore(fakeStorage());
  const llm: LLMClient = { chat: vi.fn(async () => ({ content: 'ok' })) };
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const registrar: IpcRegistrar = {
    handle: (channel, listener) => handlers.set(channel, listener),
  };
  registerProviderHandlers(registrar, { repo, keyStore, llm });
  return { db, repo, keyStore, llm, handlers };
}

describe('providers IPC 边界 (Task 3.3)', () => {
  it('saveProvider → getProviderStatus 永不返回完整 Key（仅 hint）', async () => {
    const { handlers } = setup();
    const plain = 'sk-super-secret-2026';

    const saved = await handlers.get(IPC.saveProvider)!({
      providerId: 'openai',
      apiKey: plain,
      model: 'gpt-4o-mini',
    });
    expect(saved).toEqual({ configured: true });

    const status = (await handlers.get(IPC.getProviderStatus)!()) as ProviderStatus;
    expect(status.configured).toBe(true);
    expect(status.hint).toBe('...2026');
    expect(JSON.stringify(status)).not.toContain(plain);
    expect(status.hint).not.toContain('super-secret');
  });

  it('空 Key 保存返回 configured:false，不落库', async () => {
    const { handlers, repo } = setup();
    const saved = await handlers.get(IPC.saveProvider)!({ providerId: 'openai', apiKey: '' });
    expect(saved).toEqual({ configured: false });
    expect(repo.list()).toHaveLength(0);
  });

  it('testConnection 只传 providerId，由主进程解密注入 Key', async () => {
    const { handlers, llm } = setup();
    await handlers.get(IPC.saveProvider)!({
      providerId: 'deepseek',
      apiKey: 'sk-ds-1234',
      model: 'deepseek-chat',
    });

    const result = (await handlers.get(IPC.testConnection)!('deepseek')) as {
      ok: boolean;
      error?: string;
    };
    expect(result.ok).toBe(true);
    expect(llm.chat).toHaveBeenCalledTimes(1);
    // chat 的第二个参数不含 apiKey 字段。
    const call = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(JSON.stringify(call)).not.toContain('sk-ds-1234');
  });

  it('未配置 Provider 测试连接返回明确错误', async () => {
    const { handlers } = setup();
    const result = (await handlers.get(IPC.testConnection)!('openai')) as {
      ok: boolean;
      error?: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('未配置 API Key');
  });
});
