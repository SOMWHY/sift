import fs from 'node:fs/promises';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { NewFile } from '../../shared/types';
import type { FileRepo } from '../db/repos/files';
import { hashFile } from './hasher';
import { mimeForPath } from './mime';

export interface WatcherHandle {
  close(): Promise<void>;
}

/**
 * 增量监听：新文件落地写入 files（status='pending'），进入"待整理队列"。
 * 按 content hash 去重：已索引过的文件（例如执行器移动后的归档结果）不会重复入队。
 */
export function watchRoot(root: string, files: FileRepo): WatcherHandle {
  const watcher: FSWatcher = chokidar.watch(root, {
    ignoreInitial: false,
    ignored: (p: string) => {
      const name = path.basename(p);
      return name === '.git' || name === 'node_modules' || name.startsWith('.DS_Store');
    },
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  const pending = new Set<string>();

  watcher.on('add', async (filePath: string) => {
    if (pending.has(filePath)) return;
    pending.add(filePath);
    try {
      const stat = await fs.stat(filePath);
      const hash = await hashFile(filePath);

      // 去重：hash 已存在 → 归档/撤销等内部移动导致的 add 事件，不重复入队。
      if (hash != null && files.getByHash(hash)) return;

      const entry: NewFile = {
        path: filePath,
        hash,
        size: stat.size,
        mime: mimeForPath(filePath),
        extracted_text: null,
        indexed_at: new Date().toISOString(),
        status: 'pending',
      };
      files.upsertByHash(entry);
    } catch {
      // 文件可能在 stat 前被删除：静默跳过，不中断监听。
    } finally {
      pending.delete(filePath);
    }
  });

  return {
    async close(): Promise<void> {
      await watcher.close();
    },
  };
}
