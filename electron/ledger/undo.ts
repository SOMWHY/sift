import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { FileRepo } from '../db/repos/files';
import { FileTagRepo } from '../db/repos/file_tags';
import { OperationLogRepo } from '../db/repos/operation_log';
import { TagRepo } from '../db/repos/tags';
import { UndoBatchRepo } from '../db/repos/undo_batches';
import { createAcl } from '../executor/acl';
import type { OperationLogEntry } from '../../shared/types';
import type { LedgerEntry } from '../../shared/ipc-contract';

export interface UndoDeps {
  db: Database.Database;
  getAuthorizedRoot: () => string | null;
  /** 撤销后回调（刷新托盘红点等）。 */
  onChange?: () => void;
}

export interface UndoResult {
  undone: number;
  skipped: number;
  error?: string;
}

export interface UndoService {
  undoEntry(id: number): UndoResult;
  undoBatch(batchId: string, reason?: string): UndoResult;
  undoByCondition(opts: { since?: string; fromSuggestion?: boolean }): UndoResult;
  exportLedger(): Promise<string>;
}

/**
 * Task 5.5 — 撤销服务。
 * 反向执行 move（target→source），物理移动 + files 表路径回写 + 新写一条 op_type='undo' 账本记录，
 * 原记录保留（append-only）。batch 撤销额外写 undo_batches 防重复。
 */
export function createUndoService(deps: UndoDeps): UndoService {
  const log = new OperationLogRepo(deps.db);
  const files = new FileRepo(deps.db);
  const undoBatches = new UndoBatchRepo(deps.db);
  const assertAllowed = createAcl();

  const reverse = (entry: OperationLogEntry, batchId: string): boolean => {
    const root = deps.getAuthorizedRoot();
    if (!root) return false;

    const from = entry.target_path; // 文件当前所在（move 之后）
    const to = entry.source_path; // 撤销目标（move 之前）
    if (!fs.existsSync(from)) return false; // 已被撤销或外部改动 → 跳过，安全优先

    try {
      // 先建目标父目录，否则 ACL 对不存在的目标会回退解析到根并误拒。
      fs.mkdirSync(path.dirname(to), { recursive: true });
      assertAllowed(root, from, to);
      fs.renameSync(from, to);

      // files 表路径回写（仅当该路径仍在索引中）。
      const file = files.getByPath(from);
      if (file) files.update(file.id, { path: to });

      // 撤销本身写入新记录（原记录保留）。
      log.append({
        batch_id: batchId,
        source_path: from,
        target_path: to,
        op_type: 'undo',
        suggestion_id: entry.suggestion_id,
        confidence: entry.confidence,
        user_decision: 'undo',
        created_at: new Date().toISOString(),
      });
      return true;
    } catch {
      return false; // ACL 拒绝等 → 跳过该条
    }
  };

  return {
    undoEntry(id: number): UndoResult {
      const entry = log.getById(id);
      if (!entry) return { undone: 0, skipped: 1 };
      const ok = reverse(entry, `undo:${entry.id}`);
      if (ok) deps.onChange?.();
      return { undone: ok ? 1 : 0, skipped: ok ? 0 : 1 };
    },

    undoBatch(batchId: string, reason?: string): UndoResult {
      const entries = log.listByBatch(batchId);
      if (entries.length === 0) return { undone: 0, skipped: 0 };
      if (undoBatches.getByBatchId(batchId)) return { undone: 0, skipped: entries.length };

      let undone = 0;
      let skipped = 0;
      for (const entry of entries) {
        if (reverse(entry, `undo:${batchId}`)) undone += 1;
        else skipped += 1;
      }
      if (undone > 0) {
        undoBatches.create(batchId, new Date().toISOString(), reason ?? null);
        deps.onChange?.();
      }
      return { undone, skipped };
    },

    undoByCondition(opts: { since?: string; fromSuggestion?: boolean }): UndoResult {
      const entries = log.listByCondition(opts.since, opts.fromSuggestion ?? false);
      let undone = 0;
      let skipped = 0;
      for (const entry of entries) {
        if (reverse(entry, `undo:cond:${entry.id}`)) undone += 1;
        else skipped += 1;
      }
      if (undone > 0) deps.onChange?.();
      return { undone, skipped };
    },

    async exportLedger(): Promise<string> {
      const tags = new TagRepo(deps.db);
      const fileTags = new FileTagRepo(deps.db);
      const entries: LedgerEntry[] = log.list().map((e) => {
        const file = files.getByPath(e.target_path);
        const tagNames = file
          ? fileTags.listByFile(file.id).map((ft) => tags.get(ft.tag_id)?.name).filter((n): n is string => !!n)
          : [];
        return {
          id: String(e.id),
          batchId: e.batch_id,
          sourcePath: e.source_path,
          targetPath: e.target_path,
          opType: e.op_type,
          confidence: e.confidence,
          userDecision: e.user_decision,
          suggestionId: e.suggestion_id,
          tags: tagNames,
          createdAt: e.created_at,
        };
      });
      return JSON.stringify(entries, null, 2);
    },
  };
}
