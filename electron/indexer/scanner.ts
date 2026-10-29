import fs from 'node:fs/promises';
import path from 'node:path';
import type { NewFile } from '../../shared/types';
import type { FileRepo } from '../db/repos/files';
import { hashFile } from './hasher';
import { extractText } from './extractor';
import { mimeForPath } from './mime';
import { metrics } from '../metrics';

export type IndexedFile = NewFile;

export interface ScanProgress {
  indexed: number;
  total: number;
}

export interface ScanTreeOptions {
  /** 传入后，每索引一个文件即写入 files 表（写时落库，避免内存累积）。 */
  files?: FileRepo;
  onProgress?: (p: ScanProgress) => void;
  /** 额外忽略的目录/文件名（匹配 basename）。 */
  ignore?: string[];
}

const DEFAULT_IGNORE = new Set([
  '.git',
  'node_modules',
  '$RECYCLE.BIN',
  'System Volume Information',
  '.DS_Store',
  'Thumbs.db',
]);

/** 递归枚举常规文件（跳过目录、符号链接与忽略项；权限错误静默跳过）。 */
async function enumerateFiles(root: string, ignore: Set<string>): Promise<string[]> {
  const result: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // 无权限/不可读目录：跳过，不中断整次扫描
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || ignore.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        result.push(full);
      }
    }
  }

  await walk(root);
  return result;
}

async function indexOne(filePath: string): Promise<IndexedFile> {
  const [stat, hash, mime] = await Promise.all([
    fs.stat(filePath),
    hashFile(filePath),
    Promise.resolve(mimeForPath(filePath)),
  ]);
  const extractedText = await extractText(filePath, mime);
  return {
    path: filePath,
    hash,
    size: stat.size,
    mime,
    extracted_text: extractedText,
    indexed_at: new Date().toISOString(),
    status: 'indexed',
  };
}

/**
 * 扫描目录树并索引每个文件。只读：不修改、不移动、不删除任何源文件。
 * 返回 IndexedFile[]（即 NewFile[]），便于调用方直接 upsert 或另行处理。
 */
export async function scanTree(root: string, options: ScanTreeOptions = {}): Promise<IndexedFile[]> {
  const ignore = new Set([...(options.ignore ?? []), ...DEFAULT_IGNORE]);
  const paths = await enumerateFiles(root, ignore);
  const total = paths.length;
  const results: IndexedFile[] = [];

  for (let i = 0; i < paths.length; i++) {
    const entry = await indexOne(paths[i]);
    results.push(entry);
    options.files?.upsertByHash(entry);
    options.onProgress?.({ indexed: i + 1, total });
    metrics.setIndexProgress(i + 1, total);
  }

  return results;
}
