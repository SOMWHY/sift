import { IPC, type Settings } from '../../shared/ipc-contract';
import type { SettingsRepo } from '../db/repos/settings';

/**
 * 可注入的 IPC 注册器抽象：主进程传 ipcMain，测试传捕获器。
 * 类型化事件参数由各 handler 自行断言，避免在此硬依赖 electron 运行时。
 */
export interface IpcRegistrar {
  handle(channel: string, listener: (...args: unknown[]) => unknown): void;
}

export interface DirectoryDeps {
  settings: SettingsRepo;
  /** 原生目录选择；测试注入假实现。 */
  pickDirectory: () => Promise<string | null>;
}

export const DEFAULT_SETTINGS = {
  authorizedRoot: null as string | null,
  highThreshold: 0.8,
  midThreshold: 0.5,
  launchAtStartup: false,
  trayEnabled: true,
} satisfies Settings;

/** settings 表中所有键均为字符串存储。 */
function asBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true';
}

function asNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function registerDirectoryHandlers(ipc: IpcRegistrar, deps: DirectoryDeps): void {
  ipc.handle(IPC.pickDirectory, () => deps.pickDirectory());

  ipc.handle(IPC.setAuthorizedRoot, (p: unknown) => {
    const path = String(p);
    if (!path.trim()) return { ok: false };
    deps.settings.set('authorizedRoot', path);
    return { ok: true };
  });

  ipc.handle(IPC.getSettings, () => {
    const s = deps.settings;
    const settings: Settings = {
      authorizedRoot: s.get('authorizedRoot') ?? null,
      highThreshold: asNumber(s.get('highThreshold'), DEFAULT_SETTINGS.highThreshold),
      midThreshold: asNumber(s.get('midThreshold'), DEFAULT_SETTINGS.midThreshold),
      launchAtStartup: asBool(s.get('launchAtStartup'), DEFAULT_SETTINGS.launchAtStartup),
      trayEnabled: asBool(s.get('trayEnabled'), DEFAULT_SETTINGS.trayEnabled),
    };
    return settings;
  });

  ipc.handle(IPC.setSettings, (partial: unknown) => {
    const patch = (partial ?? {}) as Partial<Settings>;
    if (typeof patch.authorizedRoot === 'string') {
      deps.settings.set('authorizedRoot', patch.authorizedRoot);
    }
    if (typeof patch.highThreshold === 'number') {
      deps.settings.set('highThreshold', String(patch.highThreshold));
    }
    if (typeof patch.midThreshold === 'number') {
      deps.settings.set('midThreshold', String(patch.midThreshold));
    }
    if (typeof patch.launchAtStartup === 'boolean') {
      deps.settings.set('launchAtStartup', String(patch.launchAtStartup));
    }
    if (typeof patch.trayEnabled === 'boolean') {
      deps.settings.set('trayEnabled', String(patch.trayEnabled));
    }
    return { ok: true };
  });
}
