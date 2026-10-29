import fs from 'node:fs';
import type { OperationPlan } from '../../shared/ipc-contract';
import type { NewOperationLogEntry } from '../../shared/types';

/** 依赖注入：生产环境接真实 FileRepo / ACL / hash / fs / Ledger，测试可替换。 */
export interface ExecutorDeps {
  /** 按源路径查索引行，返回 id 与已索引 hash。 */
  findFile(sourcePath: string): { id: number; hash: string | null } | undefined;
  /** 计算文件内容哈希。 */
  hashFile(filePath: string): Promise<string>;
  /** 路径 ACL；op_type !== 'move'（删除请求）或越界时抛错。 */
  assertAllowed(sourcePath: string, targetPath: string, opType: string): void;
  /** 写一条账本记录。 */
  appendLog(entry: NewOperationLogEntry): void;
  /** 确定性移动（无 delete 能力）。 */
  moveFile(sourcePath: string, targetPath: string): void;
  /** 移动成功后把索引行路径更新为新路径。 */
  recordMovedPath(id: number, newPath: string): void;
}

export interface ExecutionResult {
  batch_id: string;
  executed: number;
  blocked: number;
  blockedEntries: Array<{ source_path: string; reason: string }>;
}

function reasonOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Task 5.4 — 确定性执行器。
 *
 * 两阶段：
 * 1. 整批 ACL 校验：任一条越界/删除请求 → 整批拒绝（不落任何账本，不移动任何文件）。
 * 2. 逐条执行：按源路径查索引 → 校验文件存在 → 用 content hash 复核（Review Focus #1：
 *    内容已被外部改动则拒绝该条）→ 确定性 move → 更新索引路径 → 写账本。
 *    单条失败只拒绝该条，不影响其余条目。
 */
export async function executePlan(
  plan: OperationPlan,
  deps: ExecutorDeps,
): Promise<ExecutionResult> {
  const blockedEntries: Array<{ source_path: string; reason: string }> = [];

  // 阶段 1：整批 ACL 校验
  for (const entry of plan.entries) {
    try {
      deps.assertAllowed(entry.source_path, entry.target_path, entry.op_type);
    } catch (e) {
      blockedEntries.push({ source_path: entry.source_path, reason: reasonOf(e) });
    }
  }
  if (blockedEntries.length > 0) {
    return {
      batch_id: plan.batch_id,
      executed: 0,
      blocked: blockedEntries.length,
      blockedEntries,
    };
  }

  // 阶段 2：逐条确定性执行
  let executed = 0;
  for (const entry of plan.entries) {
    try {
      const file = deps.findFile(entry.source_path);
      if (!file) {
        throw new Error('索引中不存在该路径');
      }

      if (!fs.existsSync(entry.source_path)) {
        throw new Error('源文件已不存在');
      }

      const currentHash = await deps.hashFile(entry.source_path);
      if (file.hash != null && currentHash !== file.hash) {
        throw new Error('内容已变化，可能被外部修改');
      }

      deps.moveFile(entry.source_path, entry.target_path);
      deps.recordMovedPath(file.id, entry.target_path);
      deps.appendLog({
        batch_id: plan.batch_id,
        source_path: entry.source_path,
        target_path: entry.target_path,
        op_type: entry.op_type,
        suggestion_id: entry.suggestion_id ?? null,
        confidence: entry.confidence ?? null,
        user_decision: entry.user_decision ?? null,
        created_at: new Date().toISOString(),
      });
      executed++;
    } catch (e) {
      blockedEntries.push({ source_path: entry.source_path, reason: reasonOf(e) });
    }
  }

  return {
    batch_id: plan.batch_id,
    executed,
    blocked: blockedEntries.length,
    blockedEntries,
  };
}
