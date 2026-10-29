import type { NewOperationLogEntry, OperationLogEntry } from '../../shared/types';
import { OperationLogRepo } from '../db/repos/operation_log';

/**
 * Task 5.4 — 账本写入门面。
 * 对 operation_log 仓库的薄封装：追加、按批次列出、全量列出。
 * 撤销（反向执行 + 新增记录）在 Task 5.5 的 ledger/undo.ts。
 */
export class Ledger {
  constructor(private readonly repo: OperationLogRepo) {}

  append(entry: NewOperationLogEntry): OperationLogEntry {
    return this.repo.append(entry);
  }

  listByBatch(batchId: string): OperationLogEntry[] {
    return this.repo.listByBatch(batchId);
  }

  list(): OperationLogEntry[] {
    return this.repo.list();
  }
}
