'use client';

import { useEffect, useState } from 'react';

interface Health {
  status: string;
  version: string | null;
}

export default function HomePage() {
  const [health, setHealth] = useState<Health>({ status: 'checking', version: null });
  const [authorizedRoot, setAuthorizedRoot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const version =
        typeof window !== 'undefined' && window.sift ? await window.sift.getVersion() : null;
      const res = await fetch('/health');
      const data = (await res.json()) as { status: string };
      const settings =
        typeof window !== 'undefined' && window.sift ? await window.sift.getSettings() : null;
      if (!cancelled) {
        setHealth({ status: data.status, version });
        setAuthorizedRoot(settings?.authorizedRoot ?? null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function chooseDirectory() {
    if (!window.sift) return;
    setBusy(true);
    try {
      const picked = await window.sift.pickDirectory();
      if (picked) {
        await window.sift.setAuthorizedRoot(picked);
        setAuthorizedRoot(picked);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: '2rem' }}>
      <h1>Sift</h1>
      <p>帮你看清下载文件夹，默认不动你的文件。</p>
      <dl>
        <dt>渲染服务</dt>
        <dd>{health.status}</dd>
        <dt>Electron 版本</dt>
        <dd>{health.version ?? '—'}</dd>
      </dl>
      <section style={{ marginTop: '1.5rem' }}>
        <h2>开始使用</h2>
        <p>选择一个要整理的目录（只读索引，不会移动任何文件）。</p>
        <button type="button" onClick={chooseDirectory} disabled={busy}>
          {busy ? '选择中…' : '选择目录'}
        </button>
        {authorizedRoot && (
          <p>
            已授权目录：<code>{authorizedRoot}</code>
          </p>
        )}
      </section>
    </main>
  );
}
