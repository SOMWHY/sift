'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'groq', label: 'Groq' },
  { id: 'custom', label: '自定义（OpenAI 兼容）' },
];

export default function SettingsPage() {
  const [providerId, setProviderId] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<{ configured: boolean; hint: string | null }>({
    configured: false,
    hint: null,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.sift) return;
    void window.sift.getProviderStatus().then(setStatus);
  }, []);

  async function save() {
    if (!window.sift) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.sift.saveProvider({ providerId, apiKey, baseUrl, model });
      if (result.configured) {
        setApiKey(''); // 提交后清空输入框
        setMessage('已保存。');
        setStatus(await window.sift.getProviderStatus());
      } else {
        setMessage('保存失败：请填写 API Key。');
      }
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!window.sift) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.sift.testConnection(providerId);
      setMessage(result.ok ? '连接成功。' : `连接失败：${result.error ?? '未知错误'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/">← 返回</Link>
      </nav>
      <h1>设置</h1>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
        <h2>AI Provider</h2>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          用于自动标签建议。Key 仅在主进程加密存储，渲染层永不回传完整 Key。
          {status.configured && status.hint ? ` 当前已配置（${status.hint}）。` : ' 尚未配置。'}
        </p>

        <label style={{ display: 'block', marginTop: '0.8rem' }}>
          Provider
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.3rem' }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginTop: '0.8rem' }}>
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            placeholder="sk-…"
            style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.3rem' }}
          />
        </label>

        {providerId === 'custom' && (
          <label style={{ display: 'block', marginTop: '0.8rem' }}>
            Base URL
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.3rem' }}
            />
          </label>
        )}

        <label style={{ display: 'block', marginTop: '0.8rem' }}>
          模型名（留空使用默认）
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="如 gpt-4o-mini / deepseek-chat"
            style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.3rem' }}
          />
        </label>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={save} disabled={busy}>
            {busy ? '处理中…' : '保存'}
          </button>
          <button type="button" onClick={test} disabled={busy}>
            测试连接
          </button>
        </div>
        {message && <p style={{ marginTop: '0.8rem' }}>{message}</p>}
      </section>
    </main>
  );
}
