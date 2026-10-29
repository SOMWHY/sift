'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LedgerEntry } from '../../../shared/ipc-contract';
import { NoKeyBanner } from '../../components/NoKeyBanner';

type Filters = { date: string; batch: string; tag: string };

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<Filters>({ date: '', batch: '', tag: '' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [since, setSince] = useState('');
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !window.sift) return;
    setLoading(true);
    try {
      const json = await window.sift.exportLedger();
      const rows = JSON.parse(json) as LedgerEntry[];
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      setEntries(rows);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (typeof window === 'undefined' || !window.sift) return;
      setAiConfigured((await window.sift.getProviderStatus()).configured);
      void refresh();
    })();
  }, [refresh]);

  const { dates, batches, tags } = useMemo(() => {
    return {
      dates: [...new Set(entries.map((e) => e.createdAt.slice(0, 10)))].sort().reverse(),
      batches: [...new Set(entries.map((e) => e.batchId))].sort(),
      tags: [...new Set(entries.flatMap((e) => e.tags))].sort(),
    };
  }, [entries]);

  const visible = useMemo(() => {
    return entries.filter((e) => {
      if (filters.date && !e.createdAt.startsWith(filters.date)) return false;
      if (filters.batch && e.batchId !== filters.batch) return false;
      if (filters.tag && !e.tags.includes(filters.tag)) return false;
      return true;
    });
  }, [entries, filters]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: () => Promise<{ ok: boolean }>, label: string) {
    if (!window.sift) return;
    setBusy(true);
    try {
      const res = await action();
      if (!res.ok) window.alert(`${label}失败或无可撤销条目`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function exportFile() {
    const json = await window.sift.exportLedger();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sift-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <NoKeyBanner configured={aiConfigured} />
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/">← 返回</Link>
      </nav>
      <h1>操作账本</h1>
      <p style={{ color: '#666' }}>所有归档操作的时间倒序记录。支持逐条 / 整批 / 按条件撤销，原记录始终保留。</p>

      <section style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <select value={filters.date} onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))}>
          <option value="">全部日期</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select value={filters.batch} onChange={(e) => setFilters((f) => ({ ...f, batch: e.target.value }))}>
          <option value="">全部批次</option>
          {batches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={filters.tag} onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}>
          <option value="">全部标签</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" onClick={exportFile} disabled={entries.length === 0}>
          导出 JSON
        </button>
      </section>

      <section style={{ border: '1px solid #eee', borderRadius: 8, padding: '0.75rem', marginBottom: '1.5rem' }}>
        <strong>按条件撤销</strong>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <label>
            起始日期（含）
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              style={{ marginLeft: '0.4rem' }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={fromSuggestion}
              onChange={(e) => setFromSuggestion(e.target.checked)}
              style={{ marginRight: '0.3rem' }}
            />
            仅撤销 AI 建议执行的操作
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => window.sift.undoByCondition({ since: since || undefined, fromSuggestion }),
                '条件撤销',
              )
            }
          >
            执行条件撤销
          </button>
        </div>
      </section>

      {loading ? (
        <p>读取中…</p>
      ) : visible.length === 0 ? (
        <p>暂无账本记录。</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {visible.map((e) => (
            <li
              key={e.id}
              style={{ border: '1px solid #ddd', borderRadius: 8, padding: '0.6rem', marginBottom: '0.5rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  <strong>
                    {e.opType === 'undo' ? '↩ 撤销' : '→ 归档'} #{e.id}
                  </strong>
                  <span style={{ color: '#666', marginLeft: '0.75rem', fontSize: '0.85rem' }}>
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </button>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#999' }}>{e.tags.join(', ') || '无标签'}</span>
                  <button type="button" disabled={busy} onClick={() => run(() => window.sift.undoEntry(e.id), '撤销')}>
                    撤销此条
                  </button>
                </div>
              </div>

              {expanded.has(e.id) && (
                <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #eee' }}>
                  <div>源路径：<code>{e.sourcePath}</code></div>
                  <div>目标路径：<code>{e.targetPath}</code></div>
                  <div style={{ marginTop: '0.3rem', color: '#666' }}>
                    批次 <code>{e.batchId}</code>
                    {e.confidence != null && <> · 置信度 {e.confidence.toFixed(2)}</>}
                    {e.userDecision && <> · 决策 {e.userDecision}</>}
                    {e.suggestionId != null && <> · 建议 #{e.suggestionId}</>}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => run(() => window.sift.undoBatch(e.batchId), '撤销批次')}
                  >
                    撤销整批（{e.batchId}）
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
