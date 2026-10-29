import type { MetricsSnapshot } from '../shared/ipc-contract';

export interface Metrics {
  recordColdStartMs(ms: number): void;
  recordSuggestionLatencyMs(ms: number): void;
  setIndexProgress(done: number, total: number): void;
  recordUndo(success: boolean): void;
  getSnapshot(): MetricsSnapshot;
}

/**
 * 进程内可观测指标（§9 五项量化指标）。
 * 仅存内存，不落盘，不包含任何用户文件内容或密钥。
 */
export function createMetrics(): Metrics {
  let coldStartMs: number | null = null;
  let coldStartCount = 0;
  const suggestionLatencies: number[] = [];
  let indexDone = 0;
  let indexTotal = 0;
  let undoSamples = 0;
  let undoSuccess = 0;

  return {
    recordColdStartMs(ms) {
      coldStartMs = ms;
      coldStartCount += 1;
    },

    recordSuggestionLatencyMs(ms) {
      suggestionLatencies.push(ms);
    },

    setIndexProgress(done, total) {
      indexDone = done;
      indexTotal = total;
    },

    recordUndo(success) {
      undoSamples += 1;
      if (success) undoSuccess += 1;
    },

    getSnapshot() {
      const sorted = [...suggestionLatencies].sort((a, b) => a - b);
      const p = (q: number) =>
        sorted.length === 0 ? null : sorted[Math.ceil(q * sorted.length) - 1];
      const percent = indexTotal === 0 ? 0 : Math.round((indexDone / indexTotal) * 100);
      return {
        coldStartMs,
        coldStartCount,
        suggestionLatencyCount: sorted.length,
        suggestionLatencyP50: p(0.5),
        suggestionLatencyP95: p(0.95),
        index: {
          done: indexDone,
          total: indexTotal,
          percent,
          completed: indexTotal > 0 && indexDone >= indexTotal,
        },
        undo: {
          total: undoSamples,
          success: undoSuccess,
          failure: undoSamples - undoSuccess,
          successRate: undoSamples === 0 ? 1 : undoSuccess / undoSamples,
        },
      };
    },
  };
}

/** 全局单例；模块加载即创建。 */
export const metrics = createMetrics();
