import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { startServer, stopServer, getServerUrl } from './server';
import { IPC } from '../shared/ipc-contract';

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

app.whenReady().then(() => {
  registerM0Handlers();
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
