'use client';

import { useState } from 'react';
import Link from 'next/link';

export function NoKeyBanner({ configured }: { configured: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  if (configured || dismissed) return null;

  return (
    <div
      role="banner"
      style={{
        background: '#fff7e6',
        borderBottom: '1px solid #ffd591',
        padding: '0.5rem 1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <span>
        未配置 AI，自动建议已关闭。<Link href="/settings">点击配置。</Link>
      </span>
      <button
        type="button"
        aria-label="关闭"
        onClick={() => setDismissed(true)}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
      >
        ✕
      </button>
    </div>
  );
}
