'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { SuggestionView, TagView } from '../../../shared/ipc-contract';
import { SuggestionCard } from '../../components/SuggestionCard';
import { NoKeyBanner } from '../../components/NoKeyBanner';

export default function PendingPage() {
  const [items, setItems] = useState<SuggestionView[]>([]);
  const [tags, setTags] = useState<TagView[]>([]);
  const [aiConfigured, setAiConfigured] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !window.sift) return;
    const [pending, tagList, status] = await Promise.all([
      window.sift.getPending(),
      window.sift.listTags(),
      window.sift.getProviderStatus(),
    ]);
    setItems(pending);
    setTags(tagList);
    setAiConfigured(status.configured);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        <Link href="/inbox">收件箱</Link>
      </nav>
      <h1>待定箱（低置信度建议）</h1>
      {items.length === 0 ? (
        <p style={{ color: '#888' }}>暂无低置信度建议。</p>
      ) : (
        items.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            tags={tags}
            onAssign={assign}
            onIgnore={ignore}
            allowAccept={false}
          />
        ))
      )}
    </main>
  );
}
