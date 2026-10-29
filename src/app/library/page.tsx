'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SearchResult, TagView } from '../../../shared/ipc-contract';
import { NoKeyBanner } from '../../components/NoKeyBanner';

type Filter = { tagId: string | null; untaggedOnly: boolean };

export default function LibraryPage() {
  const [q, setQ] = useState('');
  const [tags, setTags] = useState<TagView[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filter, setFilter] = useState<Filter>({ tagId: null, untaggedOnly: false });
  const [loading, setLoading] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);

  const refresh = useCallback(async (query: string) => {
    if (typeof window === 'undefined' || !window.sift) return;
    setLoading(true);
    try {
      const opts = filter.tagId ? { tagIds: [filter.tagId] } : undefined;
      const rows = await window.sift.search(query, opts);
      setResults(rows);
    } finally {
      setLoading(false);
    }
  }, [filter.tagId]);

  useEffect(() => {
    void (async () => {
      if (typeof window === 'undefined' || !window.sift) return;
      setTags(await window.sift.listTags());
      setAiConfigured((await window.sift.getProviderStatus()).configured);
    })();
  }, []);

  useEffect(() => {
    void refresh(q);
  }, [q, filter, refresh]);

  const visible = useMemo(() => {
    if (!filter.untaggedOnly) return results;
    return results.filter((r) => r.tagIds.length === 0);
  }, [results, filter.untaggedOnly]);

  async function addTag(fileId: string, tagId: string) {
    if (!window.sift) return;
    await window.sift.addManualTag(fileId, tagId);
    void refresh(q);
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <NoKeyBanner configured={aiConfigured} />
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/">← 返回</Link>
      </nav>
      <h1>资料库</h1>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索文件名或内容（支持中文 / 英文）"
        style={{ width: '100%', padding: '0.6rem', fontSize: '1rem', marginBottom: '1rem' }}
      />

      <section style={{ display: 'flex', gap: '1.5rem' }}>
        <aside style={{ width: 180, flexShrink: 0 }}>
          <h3>标签</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li>
              <button
                type="button"
                onClick={() => setFilter({ tagId: null, untaggedOnly: false })}
                style={{ fontWeight: filter.tagId === null && !filter.untaggedOnly ? 700 : 400 }}
              >
                全部
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setFilter({ tagId: null, untaggedOnly: true })}
                style={{ fontWeight: filter.untaggedOnly ? 700 : 400 }}
              >
                待归类
              </button>
            </li>
            {tags.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setFilter({ tagId: t.id, untaggedOnly: false })}
                  style={{ fontWeight: filter.tagId === t.id ? 700 : 400 }}
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section style={{ flex: 1 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{filter.untaggedOnly ? '待归类' : filter.tagId ? '标签筛选' : '全部文件'}（{visible.length}）</h3>
            <button type="button" disabled title="归档在 M5 开放">
              归档（M5 开放）
            </button>
          </header>

          {loading ? (
            <p>检索中…</p>
          ) : visible.length === 0 ? (
            <p>没有匹配的文件。</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {visible.map((r) => (
                <li
                  key={r.id}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <strong>{r.fileName}</strong>
                  <div style={{ fontSize: '0.85rem', color: '#666' }}>{r.path}</div>
                  {r.excerpt && (
                    <div style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>{r.excerpt}</div>
                  )}
                  <div style={{ marginTop: '0.4rem' }}>
                    {r.tagIds.length === 0 ? <em style={{ color: '#999' }}>未打标签</em> : null}
                    <select
                      value=""
                      onChange={(e) => e.target.value && void addTag(r.id, e.target.value)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      <option value="">手动打标签…</option>
                      {tags.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
