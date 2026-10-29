import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type SiftBridge } from '../shared/ipc-contract';

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> =>
  ipcRenderer.invoke(channel, ...args);

const bridge: SiftBridge = {
  ping: () => invoke(IPC.ping) as Promise<'pong'>,
  getVersion: () => invoke(IPC.getVersion) as Promise<string>,
  pickDirectory: () => invoke(IPC.pickDirectory) as Promise<string | null>,
  setAuthorizedRoot: (path) => invoke(IPC.setAuthorizedRoot, path) as Promise<{ ok: boolean }>,
  getInbox: () => invoke(IPC.getInbox) as ReturnType<SiftBridge['getInbox']>,
  getPending: () => invoke(IPC.getPending) as ReturnType<SiftBridge['getPending']>,
  getToConfirm: () => invoke(IPC.getToConfirm) as ReturnType<SiftBridge['getToConfirm']>,
  acceptSuggestions: (ids) => invoke(IPC.acceptSuggestions, ids) as Promise<{ ok: boolean }>,
  assignTag: (suggestionId, tagId) => invoke(IPC.assignTag, suggestionId, tagId) as Promise<{ ok: boolean }>,
  ignore: (suggestionId) => invoke(IPC.ignore, suggestionId) as Promise<{ ok: boolean }>,
  search: (q, opts) => invoke(IPC.search, q, opts) as ReturnType<SiftBridge['search']>,
  addManualTag: (fileId, tagId) => invoke(IPC.addManualTag, fileId, tagId) as Promise<{ ok: boolean }>,
  listTags: () => invoke(IPC.listTags) as ReturnType<SiftBridge['listTags']>,
  saveProvider: (config) => invoke(IPC.saveProvider, config) as Promise<{ configured: boolean }>,
  getProviderStatus: () => invoke(IPC.getProviderStatus) as ReturnType<SiftBridge['getProviderStatus']>,
  testConnection: (providerId) => invoke(IPC.testConnection, providerId) as Promise<{ ok: boolean; error?: string }>,
  getThresholds: () => invoke(IPC.getThresholds) as ReturnType<SiftBridge['getThresholds']>,
  setThresholds: (high, mid) => invoke(IPC.setThresholds, high, mid) as Promise<{ ok: boolean }>,
  archiveDryRun: (fileIds, targetDir) =>
    invoke(IPC.archiveDryRun, fileIds, targetDir) as ReturnType<SiftBridge['archiveDryRun']>,
  confirmArchive: (batchId) => invoke(IPC.confirmArchive, batchId) as ReturnType<SiftBridge['confirmArchive']>,
  undoEntry: (id) => invoke(IPC.undoEntry, id) as Promise<{ ok: boolean }>,
  undoBatch: (batchId) => invoke(IPC.undoBatch, batchId) as Promise<{ ok: boolean }>,
  undoByCondition: (criteria) => invoke(IPC.undoByCondition, criteria) as ReturnType<SiftBridge['undoByCondition']>,
  exportLedger: () => invoke(IPC.exportLedger) as Promise<string>,
  getSettings: () => invoke(IPC.getSettings) as ReturnType<SiftBridge['getSettings']>,
  setSettings: (partial) => invoke(IPC.setSettings, partial) as Promise<{ ok: boolean }>,
  getMetrics: () => invoke(IPC.getMetrics) as ReturnType<SiftBridge['getMetrics']>,
};

contextBridge.exposeInMainWorld('sift', bridge);
