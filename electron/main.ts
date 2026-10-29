import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { startServer, stopServer, getServerUrl } from './server';
import { IPC } from '../shared/ipc-contract';
import { getDb } from './db/connection';
import { runMigrations } from './db/migrations';
import { SettingsRepo } from './db/repos/settings';
import { registerDirectoryHandlers } from './ipc/handlers';

let db: Database.Database | null = null;

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
  });
}

app.whenReady().then(() => {
  registerM0Handlers();
  db = initDatabase();
  registerDirectoryHandlersInMain(db);
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
