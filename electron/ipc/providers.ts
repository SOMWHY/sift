import { IPC, type ProviderConfig, type ProviderStatus } from '../../shared/ipc-contract';
import type { ProviderRepo } from '../db/repos/providers';
import type { KeyStore } from '../providers/key-store';
import type { LLMClient } from '../providers/llm-client';
import { resolveEndpoint } from '../providers/openai-compatible';
import type { IpcRegistrar } from './handlers';

export interface ProviderDeps {
  repo: ProviderRepo;
  keyStore: KeyStore;
  llm: LLMClient;
}

/**
 * Provider 配置 + 测试连接 + IPC 边界。
 * 铁律：Key 明文只进不出主进程 —— saveProvider 只返回 {configured}，
 * getProviderStatus 只返回尾 4 位 hint，永不返回完整 Key。
 */
export function registerProviderHandlers(ipc: IpcRegistrar, deps: ProviderDeps): void {
  ipc.handle(IPC.saveProvider, async (config: unknown) => {
    const c = config as ProviderConfig;
    if (!c?.apiKey?.trim()) return { configured: false };
    try {
      const cipher = await deps.keyStore.encryptKey(c.apiKey);
      deps.repo.upsert({
        provider_id: c.providerId,
        base_url: c.baseUrl ?? null,
        model: c.model ?? null,
        encrypted_api_key: cipher,
        enabled: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return { configured: true };
    } catch {
      return { configured: false };
    }
  });

  ipc.handle(IPC.getProviderStatus, (): ProviderStatus => {
    const enabled = deps.repo.list().find((p) => p.enabled === 1);
    if (!enabled?.encrypted_api_key) return { configured: false, hint: null };
    return { configured: true, hint: deps.keyStore.keyHint(enabled.encrypted_api_key) };
  });

  ipc.handle(IPC.testConnection, async (providerId: unknown) => {
    const id = String(providerId);
    const provider = deps.repo.list().find((p) => p.provider_id === id);
    if (!provider?.encrypted_api_key) return { ok: false, error: '未配置 API Key' };

    try {
      const key = await deps.keyStore.decryptKey(provider.encrypted_api_key);
      const endpoint = resolveEndpoint(id);
      const baseUrl = provider.base_url ?? endpoint.baseUrl;
      const model = provider.model ?? endpoint.defaultModel;
      if (!baseUrl) return { ok: false, error: '未配置 Base URL' };
      await deps.llm.chat(id, [{ role: 'user', content: 'ping' }], { baseUrl, model });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '连接失败' };
    }
  });
}
