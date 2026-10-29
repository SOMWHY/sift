import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { startServer, stopServer, getServerUrl } from './server';
import { IPC } from '../shared/ipc-contract';
import { getDb } from './db/connection';
import { runMigrations } from './db/migrations';
import { SettingsRepo } from './db/repos/settings';
import { registerDirectoryHandlers } from './ipc/handlers';
import { registerLibraryHandlers } from './ipc/library';
import { registerProviderHandlers } from './ipc/providers';
import { registerSuggestionHandlers } from './ipc/suggestions';
import { watchRoot, type WatcherHandle } from './indexer/watcher';
import { FileRepo } from './db/repos/files';
import { ProviderRepo } from './db/repos/providers';
import { createKeyStore } from './providers/key-store';
import { createLLMClient } from './providers/llm-client';

let db: Database.Database | null = null;
let watcher: WatcherHandle | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

async function createWindow(): Promise<void> {
  await startServer();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Sift',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await win.loadURL(getServerUrl());
}

function registerM0Handlers(): void {
  ipcMain.handle(IPC.ping, () => 'pong' as const);
  ipcMain.handle(IPC.getVersion, () => app.getVersion());
}

function initDatabase(): Database.Database {
  const db = getDb(app.getPath('userData'));
  runMigrations(db);
  return db;
}

function registerDirectoryHandlersInMain(db: Database.Database): void {
  registerDirectoryHandlers(ipcMain, {
    settings: new SettingsRepo(db),
    pickDirectory: async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    onAuthorizedRootChanged: (root) => void restartWatcher(db, root),
  });
}

async function restartWatcher(db: Database.Database, root: string | null): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  if (root) {
    watcher = watchRoot(root, new FileRepo(db));
  }
}

function registerLibraryHandlersInMain(db: Database.Database): void {
  registerLibraryHandlers(ipcMain, { db });
}

function registerProviderHandlersInMain(db: Database.Database): void {
  const repo = new ProviderRepo(db);
  const keyStore = createKeyStore(safeStorage);
  const llm = createLLMClient({
    resolveKey: async (providerId: string) => {
      const p = repo.list().find((x) => x.provider_id === providerId);
      if (!p?.encrypted_api_key) throw new Error('未配置 API Key');
      return keyStore.decryptKey(p.encrypted_api_key);
    },
  });
  registerProviderHandlers(ipcMain, { repo, keyStore, llm });
}

function registerSuggestionHandlersInMain(db: Database.Database): void {
  const settings = new SettingsRepo(db);
  const num = (key: string, fallback: number) => {
    const v = Number(settings.get(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  registerSuggestionHandlers(ipcMain, {
    db,
    getThresholds: () => ({ high: num('highThreshold', 0.8), mid: num('midThreshold', 0.5) }),
  });
}

app.whenReady().then(() => {
  registerM0Handlers();
  db = initDatabase();
  registerDirectoryHandlersInMain(db);
  registerLibraryHandlersInMain(db);
  registerProviderHandlersInMain(db);
  registerSuggestionHandlersInMain(db);

  // 启动时若已有授权根，恢复增量监听。
  const root = new SettingsRepo(db).get('authorizedRoot');
  if (root) void restartWatcher(db, root);

  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
});
