import { describe, it, expect, vi } from 'vitest';
import { resolveEndpoint } from '../../../electron/providers/openai-compatible';
import { createLLMClient } from '../../../electron/providers/llm-client';

describe('resolveEndpoint (Task 3.2)', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1'],
    ['deepseek', 'https://api.deepseek.com/v1'],
    ['groq', 'https://api.groq.com/openai/v1'],
  ])('%s → %s', (id, baseUrl) => {
    const e = resolveEndpoint(id);
    expect(e.baseUrl).toBe(baseUrl);
    expect(e.defaultModel).toBeTruthy();
  });

  it('自定义 provider 默认 baseUrl 为空（用户必须填）', () => {
    expect(resolveEndpoint('custom').baseUrl).toBe('');
  });
});

function sseChunks(...pieces: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const all = pieces.join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(all));
      controller.close();
    },
  });
}

function sseOfDelta(delta: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
}

describe('LLMClient (Task 3.2)', () => {
  it('chat 以 SSE 聚合 content，且请求头带 Key', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(
        sseChunks(sseOfDelta('你好'), sseOfDelta('，世界'), 'data: [DONE]\n\n'),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    });

    const resolveKey = vi.fn(async () => 'sk-test-key');
    const client = createLLMClient({ resolveKey, fetch: fetchImpl as unknown as typeof fetch });

    const result = await client.chat('deepseek', [{ role: 'user', content: 'hi' }], {
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    });

    expect(result.content).toBe('你好，世界');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test-key');
  });

  it('resolveKey 用 providerId 注入；返回结果不包含 Key 明文', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(sseChunks(sseOfDelta('ok')), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    const resolveKey = vi.fn(async () => 'sk-super-secret-2026');
    const client = createLLMClient({ resolveKey, fetch: fetchImpl as unknown as typeof fetch });

    const result = await client.chat('openai', [{ role: 'user', content: 'q' }], {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });

    expect(resolveKey).toHaveBeenCalledWith('openai');
    expect(JSON.stringify(result)).not.toContain('sk-super-secret-2026');
    expect(result).toEqual({ content: 'ok' });
  });
});
