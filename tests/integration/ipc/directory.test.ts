import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../../electron/db/connection';
import { runMigrations } from '../../../electron/db/migrations';
import { SettingsRepo } from '../../../electron/db/repos/settings';
import { IPC } from '../../../shared/ipc-contract';
import {
  registerDirectoryHandlers,
  type IpcRegistrar,
} from '../../../electron/ipc/handlers';

/** 捕获 handle 注册，模拟 ipcMain.handle。 */
function makeRegistrar() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const registrar: IpcRegistrar = {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
  };
  return { registrar, handlers };
}

function tmpDbPath(): string {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sift-dir-')),
    'sift.db',
  );
}

describe('目录授权 + settings 存储 (Task 2.1)', () => {
  it('setAuthorizedRoot 写入 settings，关闭重开（重启）后仍可读回', () => {
    const dbPath = tmpDbPath();

    const db = openDb(dbPath);
    runMigrations(db);
    const settings = new SettingsRepo(db);
    const { registrar, handlers } = makeRegistrar();

    registerDirectoryHandlers(registrar, {
      settings,
      pickDirectory: async () => 'D:/Downloads',
    });

    const setRoot = handlers.get(IPC.setAuthorizedRoot)!;
    const result = setRoot('D:/Downloads') as { ok: boolean };
    expect(result).toEqual({ ok: true });
    expect(settings.get('authorizedRoot')).toBe('D:/Downloads');

    // 模拟重启：关闭数据库后重新打开
    db.close();
    const reopened = openDb(dbPath);
    runMigrations(reopened);
    const settingsAfterRestart = new SettingsRepo(reopened);
    expect(settingsAfterRestart.get('authorizedRoot')).toBe('D:/Downloads');
    reopened.close();
  });

  it('getSettings 返回默认阈值 + 已授权目录；setSettings 持久化', () => {
    const db = openDb(tmpDbPath());
    runMigrations(db);
    const settings = new SettingsRepo(db);
    const { registrar, handlers } = makeRegistrar();

    registerDirectoryHandlers(registrar, {
      settings,
      pickDirectory: async () => null,
    });

    const getSettings = handlers.get(IPC.getSettings)!;
    const initial = getSettings() as {
      authorizedRoot: string | null;
      highThreshold: number;
      midThreshold: number;
    };
    expect(initial.authorizedRoot).toBeNull();
    expect(initial.highThreshold).toBe(0.8);
    expect(initial.midThreshold).toBe(0.5);

    const setSettings = handlers.get(IPC.setSettings)!;
    expect(setSettings({ highThreshold: 0.7 })).toEqual({ ok: true });
    expect(settings.get('highThreshold')).toBe('0.7');
    db.close();
  });

  it('pickDirectory 返回原生目录选择结果', async () => {
    const db = openDb(tmpDbPath());
    runMigrations(db);
    const { registrar, handlers } = makeRegistrar();

    registerDirectoryHandlers(registrar, {
      settings: new SettingsRepo(db),
      pickDirectory: async () => 'C:/Users/me/Downloads',
    });

    const pick = handlers.get(IPC.pickDirectory)!;
    await expect(pick()).resolves.toBe('C:/Users/me/Downloads');
    db.close();
  });
});
