/**
 * shared/ipc-contract.ts
 * 主进程与渲染层之间的唯一类型契约。
 * channel 名与 payload 类型集中在此定义，两边只引用不重抄。
 */

/** IPC channel 常量（preload 与主进程 ipcMain 共用） */
export const IPC = {
  ping: 'sift:ping',
  getVersion: 'sift:get-version',
  pickDirectory: 'sift:pick-directory',
  setAuthorizedRoot: 'sift:set-authorized-root',
  getInbox: 'sift:get-inbox',
  getPending: 'sift:get-pending',
  getToConfirm: 'sift:get-to-confirm',
  acceptSuggestions: 'sift:accept-suggestions',
  assignTag: 'sift:assign-tag',
  ignore: 'sift:ignore',
  search: 'sift:search',
  addManualTag: 'sift:add-manual-tag',
  saveProvider: 'sift:save-provider',
  getProviderStatus: 'sift:get-provider-status',
  testConnection: 'sift:test-connection',
  getThresholds: 'sift:get-thresholds',
  setThresholds: 'sift:set-thresholds',
  archiveDryRun: 'sift:archive-dry-run',
  confirmArchive: 'sift:confirm-archive',
  undoEntry: 'sift:undo-entry',
  undoBatch: 'sift:undo-batch',
  undoByCondition: 'sift:undo-by-condition',
  exportLedger: 'sift:export-ledger',
  getSettings: 'sift:get-settings',
  setSettings: 'sift:set-settings',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** 所有 IPC channel 的去重清单（测试用：断言无重复） */
export const CHANNEL_LIST: readonly string[] = Object.values(IPC);

export type PingResult = 'pong';

export interface ProviderStatus {
  configured: boolean;
  hint: string | null; // 如 "sk-...xxxx"，永不包含完整 Key
}

export interface ProviderConfig {
  providerId: string;
  baseUrl?: string;
  model?: string;
  apiKey: string; // 单向提交；仅用于主进程 safeStorage 加密后落库
}

export interface Thresholds {
  high: number;
  mid: number;
}

export interface SuggestionView {
  id: string;
  fileId: string;
  fileName: string;
  proposedTag: string;
  confidence: number;
  reason: string;
  status: string;
}

export interface SearchResult {
  id: string;
  path: string;
  fileName: string;
  excerpt: string;
  tagIds: string[];
}

export interface ArchiveDryRunEntry {
  sourcePath: string;
  targetPath: string;
  opType: 'move';
  lowConfidence: boolean;
  blocked: boolean;
  reason?: string;
}

export interface LedgerEntry {
  id: string;
  batchId: string;
  sourcePath: string;
  targetPath: string;
  opType: string;
  confidence: number | null;
  userDecision: string | null;
  createdAt: string;
}

export interface Settings {
  authorizedRoot: string | null;
  highThreshold: number;
  midThreshold: number;
  launchAtStartup: boolean;
  trayEnabled: boolean;
}

export interface UndoCriteria {
  since?: string;
  fromSuggestionId?: string;
}

/** 渲染层 window.sift.* 的类型契约 */
export interface SiftBridge {
  ping(): Promise<PingResult>;
  getVersion(): Promise<string>;
  pickDirectory(): Promise<string | null>;
  setAuthorizedRoot(path: string): Promise<{ ok: boolean }>;
  getInbox(): Promise<SuggestionView[]>;
  getPending(): Promise<SuggestionView[]>;
  getToConfirm(): Promise<SuggestionView[]>;
  acceptSuggestions(ids: string[]): Promise<{ ok: boolean }>;
  assignTag(suggestionId: string, tagId: string): Promise<{ ok: boolean }>;
  ignore(suggestionId: string): Promise<{ ok: boolean }>;
  search(q: string, opts?: { tagIds?: string[] }): Promise<SearchResult[]>;
  addManualTag(fileId: string, tagId: string): Promise<{ ok: boolean }>;
  saveProvider(config: ProviderConfig): Promise<{ configured: boolean }>;
  getProviderStatus(): Promise<ProviderStatus>;
  testConnection(providerId: string): Promise<{ ok: boolean; error?: string }>;
  getThresholds(): Promise<Thresholds>;
  setThresholds(high: number, mid: number): Promise<{ ok: boolean }>;
  archiveDryRun(fileIds: string[], targetDir: string): Promise<{ batchId: string; entries: ArchiveDryRunEntry[] }>;
  confirmArchive(batchId: string): Promise<{ ok: boolean; executed: number; blocked: number }>;
  undoEntry(id: string): Promise<{ ok: boolean }>;
  undoBatch(batchId: string): Promise<{ ok: boolean }>;
  undoByCondition(criteria: UndoCriteria): Promise<{ ok: boolean; undone: number }>;
  exportLedger(): Promise<string>;
  getSettings(): Promise<Settings>;
  setSettings(partial: Partial<Settings>): Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    sift: SiftBridge;
  }
}
