import { describe, it, expect, beforeEach } from 'vitest';
import { createMetrics, type Metrics } from '../../electron/metrics';

let m: Metrics;

beforeEach(() => {
  m = createMetrics();
});

describe('cold start', () => {
  it('记录冷启动耗时并只保留最新值', () => {
    m.recordColdStartMs(4200);
    m.recordColdStartMs(3800);
    const s = m.getSnapshot();
    expect(s.coldStartMs).toBe(3800);
    expect(s.coldStartCount).toBe(2);
  });
});

describe('suggestion latency', () => {
  it('记录每次建议落地耗时，统计 p50/p95', () => {
    const samples = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    for (const ms of samples) m.recordSuggestionLatencyMs(ms);

    const s = m.getSnapshot();
    // 10 个样本：p50 = 第 5 个 = 500（按 0.5*(n-1) 索引取整后 500 或 550，这里只验证数值区间）
    expect(s.suggestionLatencyCount).toBe(10);
    expect(s.suggestionLatencyP50).toBeGreaterThanOrEqual(500);
    expect(s.suggestionLatencyP50).toBeLessThanOrEqual(600);
    expect(s.suggestionLatencyP95).toBeGreaterThanOrEqual(900);
    expect(s.suggestionLatencyP95).toBeLessThanOrEqual(1000);
  });
});

describe('index progress', () => {
  it('跟踪索引进度并计算百分比', () => {
    m.setIndexProgress(30, 100);
    let s = m.getSnapshot();
    expect(s.index.done).toBe(30);
    expect(s.index.total).toBe(100);
    expect(s.index.percent).toBe(30);

    m.setIndexProgress(100, 100);
    s = m.getSnapshot();
    expect(s.index.percent).toBe(100);
    expect(s.index.completed).toBe(true);
  });
});

describe('undo success rate', () => {
  it('统计撤销成功率', () => {
    m.recordUndo(true);
    m.recordUndo(true);
    m.recordUndo(false);

    const s = m.getSnapshot();
    expect(s.undo.total).toBe(3);
    expect(s.undo.success).toBe(2);
    expect(s.undo.failure).toBe(1);
    expect(s.undo.successRate).toBeCloseTo(2 / 3, 5);
  });

  it('无撤销时成功率记为 1（无失败即无失败率）', () => {
    expect(m.getSnapshot().undo.successRate).toBe(1);
  });
});
