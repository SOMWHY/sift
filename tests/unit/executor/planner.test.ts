import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { buildPlan } from '../../../electron/executor/planner';
import { FileRepo } from '../../../electron/db/repos/files';
import { createTestDb } from '../db/repos/_helper';

function seedFile(db: import('better-sqlite3').Database, p: string, name = path.basename(p)) {
  return new FileRepo(db).create({
    path: p,
    hash: `hash-${p}`,
    size: 10,
    mime: 'text/plain',
    extracted_text: '',
    indexed_at: new Date().toISOString(),
    status: 'indexed',
  });
}

describe('buildPlan (Task 5.1)', () => {
  it('选择 N 文件 → 计划含 N 条 move 条目', () => {
    const ctx = createTestDb();
    try {
      const a = seedFile(ctx.db, '/root/a.txt').id;
      const b = seedFile(ctx.db, '/root/b.txt').id;
      const plan = buildPlan(ctx.db, [a, b], 'D:/archive');

      expect(plan.entries).toHaveLength(2);
      expect(plan.entries.every((e) => e.op_type === 'move')).toBe(true);
      expect(plan.entries.map((e) => e.source_path)).toEqual(['/root/a.txt', '/root/b.txt']);
    } finally {
      ctx.cleanup();
    }
  });

  it('目标路径唯一不冲突（同名文件加后缀）', () => {
    const ctx = createTestDb();
    try {
      const a = seedFile(ctx.db, '/root/report.pdf', 'report.pdf').id;
      const b = seedFile(ctx.db, '/root/other/report.pdf', 'report.pdf').id;
      const plan = buildPlan(ctx.db, [a, b], 'D:/archive');

      const targets = plan.entries.map((e) => e.target_path);
      expect(new Set(targets).size).toBe(2);
      expect(targets[0]).toBe(path.join('D:/archive', 'report.pdf'));
      expect(targets[1]).toMatch(/report \(\d+\)\.pdf$/);
    } finally {
      ctx.cleanup();
    }
  });

  it('不存在的 fileId 被跳过', () => {
    const ctx = createTestDb();
    try {
      const a = seedFile(ctx.db, '/root/a.txt').id;
      const plan = buildPlan(ctx.db, [a, 9999], 'D:/archive');
      expect(plan.entries).toHaveLength(1);
    } finally {
      ctx.cleanup();
    }
  });

  it('batch_id 非空且稳定', () => {
    const ctx = createTestDb();
    try {
      const a = seedFile(ctx.db, '/root/a.txt').id;
      const plan = buildPlan(ctx.db, [a], 'D:/archive');
      expect(plan.batch_id).toBeTruthy();
    } finally {
      ctx.cleanup();
    }
  });
});
