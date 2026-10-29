import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { IPC, type ArchiveDryRunEntry, type OperationPlan } from '../../shared/ipc-contract';
import { FileRepo } from '../db/repos/files';
import { FileTagRepo } from '../db/repos/file_tags';
import { OperationLogRepo } from '../db/repos/operation_log';
import { buildPlan } from '../executor/planner';
import { createAcl } from '../executor/acl';
import { executePlan } from '../executor/executor';
import { hashFile } from '../indexer/hasher';
import { Ledger } from '../ledger/log';
import { createUndoService } from '../ledger/undo';
import { metrics } from '../metrics';
import type { IpcRegistrar } from './handlers';

export interface ArchiveDeps {
  db: Database.Database;
  getAuthorizedRoot: () => string | null;
  /** 低置信度阈值（默认 0.5，与 midThreshold 同源）。 */
  getLowConfidenceThreshold: () => number;
  /** 执行/撤销后回调（刷新托盘红点等）。 */
  onChange?: () => void;
}

/** 逻辑路径判断：child 是否严格位于 parent 内（不要求 realpath，用于目标目录预检）。 */
function pathInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
/**
 * M5 归档执行区 IPC 边界：archiveDryRun（生成计划 + ACL 预检，不执行）
 * 与 confirmArchive（确定性执行）。计划按 batchId 会话内缓存，仅供一次确认。
 */
export function registerArchiveHandlers(ipc: IpcRegistrar, deps: ArchiveDeps): void {
  const plans = new Map<string, OperationPlan>();
  const files = new FileRepo(deps.db);
  const fileTags = new FileTagRepo(deps.db);
  const ledger = new Ledger(new OperationLogRepo(deps.db));
  const undo = createUndoService({
    db: deps.db,
    getAuthorizedRoot: deps.getAuthorizedRoot,
    onChange: deps.onChange,
  });

  ipc.handle(IPC.archiveDryRun, (fileIds: unknown, targetDir: unknown) => {
    const ids = (Array.isArray(fileIds) ? fileIds : [])
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
    const dir = String(targetDir ?? '');
    const root = deps.getAuthorizedRoot();

    // 预检目标目录：未配置根/空目录/目录不在根内 → 全部 blocked，不创建目录。
    const dirOutsideRoot =
      root != null && dir !== '' && !pathInside(dir, root);
    if (root != null && dir !== '' && !dirOutsideRoot) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const plan = buildPlan(deps.db, ids, dir);

    const entries: ArchiveDryRunEntry[] = plan.entries.map((entry) => {
      const file = files.getByPath(entry.source_path);
      const lowConfidence =
        file != null &&
        fileTags.listByFile(file.id).some((ft) => ft.confidence < deps.getLowConfidenceThreshold());

      let blocked = false;
      let reason: string | undefined;
      if (!root) {
        blocked = true;
        reason = '未配置授权根目录';
      } else if (dir === '') {
        blocked = true;
        reason = '目标目录为空';
      } else if (dirOutsideRoot) {
        blocked = true;
        reason = '目标目录不在授权根内';
      } else {
        try {
          createAcl()(root, entry.source_path, entry.target_path);
        } catch (e) {
          blocked = true;
          reason = e instanceof Error ? e.message : String(e);
        }
      }

      return {
        sourcePath: entry.source_path,
        targetPath: entry.target_path,
        opType: entry.op_type,
        lowConfidence,
        blocked,
        reason,
      };
    });

    if (plan.entries.length > 0) {
      plans.set(plan.batch_id, plan);
    }
    return { batchId: plan.batch_id, entries };
  });

  ipc.handle(IPC.confirmArchive, async (batchId: unknown) => {
    const id = String(batchId ?? '');
    const plan = plans.get(id);
    if (!plan) return { ok: false, executed: 0, blocked: 0 };

    const root = deps.getAuthorizedRoot();
    if (!root) return { ok: false, executed: 0, blocked: 0 };

    // dry-run 预览 → 实际执行：决策改写为 manual（手动归档）。
    const confirmPlan: OperationPlan = {
      batch_id: plan.batch_id,
      entries: plan.entries.map((e) => ({ ...e, user_decision: 'manual' })),
    };

    const assertAllowed = createAcl();
    const result = await executePlan(confirmPlan, {
      findFile: (p) => {
        const f = files.getByPath(p);
        return f ? { id: f.id, hash: f.hash } : undefined;
      },
      hashFile: (p) => hashFile(p),
      assertAllowed: (s, t) => assertAllowed(root, s, t),
      appendLog: (e) => {
        ledger.append(e);
      },
      moveFile: (s, t) => {
        fs.mkdirSync(path.dirname(t), { recursive: true });
        fs.renameSync(s, t);
      },
      recordMovedPath: (id, newPath) => {
        files.update(id, { path: newPath });
      },
    });

    plans.delete(id);
    deps.onChange?.();
    return { ok: result.blocked === 0, executed: result.executed, blocked: result.blocked };
  });

  ipc.handle(IPC.undoEntry, (id: unknown) => {
    const r = undo.undoEntry(Number(id));
    metrics.recordUndo(r.undone > 0);
    return { ok: r.undone > 0 };
  });

  ipc.handle(IPC.undoBatch, (batchId: unknown) => {
    const r = undo.undoBatch(String(batchId ?? ''));
    metrics.recordUndo(r.undone > 0);
    return { ok: r.undone > 0 };
  });

  ipc.handle(IPC.undoByCondition, (criteria: unknown) => {
    const c = (criteria ?? {}) as { since?: string; fromSuggestion?: boolean };
    const r = undo.undoByCondition({ since: c.since, fromSuggestion: c.fromSuggestion ?? false });
    metrics.recordUndo(r.undone > 0);
    return { ok: r.undone > 0, undone: r.undone };
  });

  ipc.handle(IPC.exportLedger, () => undo.exportLedger());
}
