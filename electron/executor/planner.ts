import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { OperationPlan, OperationPlanEntry } from '../../shared/ipc-contract';
import { FileRepo } from '../db/repos/files';

/**
 * Task 5.1 — 生成 move 计划（不执行）。
 * 输入 fileIds 与目标目录，输出逐文件 move 条目；
 * 同名文件按 `名称 (n).ext` 追加后缀，保证目标路径唯一。
 */
export function buildPlan(
  db: Database.Database,
  fileIds: number[],
  targetDir: string,
): OperationPlan {
  const repo = new FileRepo(db);
  const used = new Map<string, number>(); // 目标文件名（含大小写）→ 已出现次数
  const entries: OperationPlanEntry[] = [];

  for (const id of fileIds) {
    const file = repo.get(id);
    if (!file) continue;

    const parsed = path.parse(file.path);
    const targetPath = allocateTarget(targetDir, parsed, used);
    entries.push({
      source_path: file.path,
      target_path: targetPath,
      op_type: 'move',
      user_decision: 'dry-run',
    });
  }

  return { batch_id: randomUUID(), entries };
}

function allocateTarget(
  targetDir: string,
  parsed: path.ParsedPath,
  used: Map<string, number>,
): string {
  const ext = parsed.ext;
  const base = parsed.name;
  const full = (name: string) => `${name}${ext}`;
  const candidate = (name: string) => path.join(targetDir, full(name));
  // Windows 大小写不敏感，统一小写做冲突探测。
  const key = (name: string) => full(name).toLowerCase();

  const count = used.get(key(base)) ?? 0;
  if (count === 0) {
    used.set(key(base), 1);
    return candidate(base);
  }

  // 已有同名：尝试 `name (2)`, `name (3)`…
  let n = count + 1;
  while (used.has(key(`${base} (${n})`))) n++;
  used.set(key(base), n); // 更新基数，避免重复探测
  used.set(key(`${base} (${n})`), 1);
  return candidate(`${base} (${n})`);
}
