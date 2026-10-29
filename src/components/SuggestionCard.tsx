'use client';

import { useState } from 'react';
import type { SuggestionView, TagView } from '../../shared/ipc-contract';

export interface SuggestionCardProps {
  suggestion: SuggestionView;
  tags: TagView[];
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onAccept?: (id: string) => void;
  onAssign: (id: string, tagId: string) => void;
  onIgnore: (id: string) => void;
  allowAccept: boolean;
}

export function SuggestionCard({
  suggestion,
  tags,
  selected = false,
  onToggleSelect,
  onAccept,
  onAssign,
  onIgnore,
  allowAccept,
}: SuggestionCardProps) {
  const [tagId, setTagId] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: '0.75rem 1rem',
        marginBottom: '0.75rem',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(suggestion.id)}
            aria-label={`选择 ${suggestion.fileName}`}
          />
        )}
        <div style={{ flex: 1 }}>
          <strong>{suggestion.fileName}</strong>
          <span
            style={{
              marginLeft: '0.75rem',
              padding: '0 0.5rem',
              borderRadius: 4,
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
            }}
          >
            {suggestion.proposedTag}
          </span>
          <span style={{ marginLeft: '0.75rem', color: '#888' }}>
            {Math.round(suggestion.confidence * 100)}%
          </span>
          <p style={{ margin: '0.25rem 0 0', color: '#555' }}>{suggestion.reason}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {allowAccept && onAccept && (
            <button disabled={busy} onClick={() => run(() => onAccept(suggestion.id))}>
              接受
            </button>
          )}
          <select
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            aria-label={`为 ${suggestion.fileName} 指定标签`}
          >
            <option value="">指定标签…</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            disabled={busy || !tagId}
            onClick={() => run(() => onAssign(suggestion.id, tagId))}
          >
            指定
          </button>
          <button disabled={busy} onClick={() => run(() => onIgnore(suggestion.id))}>
            忽略
          </button>
        </div>
      </div>
    </div>
  );
}
