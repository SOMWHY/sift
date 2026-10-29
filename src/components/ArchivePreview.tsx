'use client';

import type { ArchiveDryRunEntry } from '../../shared/ipc-contract';

export interface ArchivePreviewProps {
  entries: ArchiveDryRunEntry[];
  batchId?: string | null;
  onConfirm?: (batchId: string) => void;
  onBack?: () => void;
}

/**
 * Task 5.3 — dry-run 预览。
 * 逐条展示 source → target 路径变更；低置信度标黄「请确认」；
 * 无预览或整批被拒时执行按钮禁用，并提示原因。
 */
export function ArchivePreview({ entries, batchId, onConfirm, onBack }: ArchivePreviewProps) {
  const hasPreview = entries.length > 0 && !!batchId;
  const allBlocked = entries.length > 0 && entries.every((e) => e.blocked);
  const blockedReasons = entries.filter((e) => e.blocked && e.reason).map((e) => e.reason);

  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <nav style={{ marginBottom: '1rem' }}>
        {onBack ? (
          <button type="button" onClick={onBack}>
            ← 返回
          </button>
        ) : null}
      </nav>
      <h1>归档预览（dry-run）</h1>
      <p style={{ color: '#666' }}>以下操作尚未执行，请确认后执行。</p>

      {entries.length === 0 ? (
        <p>暂无预览。请先选择文件与目标目录。</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {entries.map((e, i) => (
            <li
              key={`${e.sourcePath}-${i}`}
              className={e.lowConfidence ? 'entry low-confidence' : 'entry'}
              style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: '0.75rem',
                marginBottom: '0.5rem',
                background: e.blocked ? '#ffe8e8' : e.lowConfidence ? '#fff7d6' : undefined,
              }}
            >
              <div>
                <span style={{ color: '#666' }}>{e.sourcePath}</span>
                <span style={{ margin: '0 0.5rem' }}>→</span>
                <strong>{e.targetPath}</strong>
              </div>
              {e.lowConfidence ? (
                <span style={{ color: '#b8860b', fontSize: '0.85rem' }}>请确认</span>
              ) : null}
              {e.blocked && e.reason ? (
                <div style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                  已拦截：{e.reason}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {allBlocked && blockedReasons.length > 0 ? (
        <p role="alert" style={{ color: '#c0392b' }}>
          整批被拒绝：{blockedReasons.join('；')}
        </p>
      ) : null}

      <footer style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
        <button
          type="button"
          disabled={!hasPreview || allBlocked}
          onClick={() => batchId && onConfirm?.(batchId)}
          style={{ padding: '0.6rem 1.2rem', fontSize: '1rem' }}
        >
          执行归档
        </button>
      </footer>
    </main>
  );
}
