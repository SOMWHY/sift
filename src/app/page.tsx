'use client';

import { useEffect, useState } from 'react';

interface Health {
  status: string;
  version: string | null;
}

export default function HomePage() {
  const [health, setHealth] = useState<Health>({ status: 'checking', version: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const version =
        typeof window !== 'undefined' && window.sift ? await window.sift.getVersion() : null;
      const res = await fetch('/health');
      const data = (await res.json()) as { status: string };
      if (!cancelled) {
        setHealth({ status: data.status, version });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: '2rem' }}>
      <h1>Sift</h1>
      <p>骨架已就绪。</p>
      <dl>
        <dt>渲染服务</dt>
        <dd>{health.status}</dd>
        <dt>Electron 版本</dt>
        <dd>{health.version ?? '—'}</dd>
      </dl>
    </main>
  );
}
