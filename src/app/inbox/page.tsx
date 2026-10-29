'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { SuggestionView, TagView } from '../../../shared/ipc-contract';
import { SuggestionCard } from '../../components/SuggestionCard';
import { NoKeyBanner } from '../../components/NoKeyBanner';

export default function InboxPage() {
  const [items, setItems] = useState<SuggestionView[]>([]);
  const [tags, setTags] = useState<TagView[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiConfigured, setAiConfigured] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !window.sift) return;
    const [inbox, tagList, status] = await Promise.all([
      window.sift.getInbox(),
      window.sift.listTags(),
      window.sift.getProviderStatus(),
    ]);
    setItems(inbox);
    setTags(tagList);
    setAiConfigured(status.configured);
    setSelected(new Set());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = items.length > 0 && items.every((s) => selected.has(s.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((s) => s.id)));
  };

  const batchAccept = async () => {
    if (selected.size === 0) return;
    await window.sift.acceptSuggestions([...selected]);
    await refresh();
  };

  const acceptOne = async (id: string) => {
    await window.sift.acceptSuggestions([id]);
    await refresh();
  };

  const assign = async (id: string, tagId: string) => {
    await window.sift.assignTag(id, tagId);
    await refresh();
  };

  const ignore = async (id: string) => {
    await window.sift.ignore(id);
    await refresh();
  };

  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <NoKeyBanner configured={aiConfigured} />
      <nav style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href="/">← 首页</Link>
        <Link href="/pending">待定箱</Link>
      </nav>
      <h1>收件箱（高置信度建议）</h1>
      {items.length === 0 ? (
        <p style={{ color: '#888' }}>暂无高置信度建议。</p>
      ) : (
        <>
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <label>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} /> 全选
            </label>
            <button disabled={selected.size === 0} onClick={batchAccept}>
              一键接受所选（{selected.size}）
            </button>
          </div>
          {items.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              tags={tags}
              selected={selected.has(s.id)}
              onToggleSelect={toggle}
              onAccept={acceptOne}
              onAssign={assign}
              onIgnore={ignore}
              allowAccept
            />
          ))}
        </>
      )}
    </main>
  );
}
