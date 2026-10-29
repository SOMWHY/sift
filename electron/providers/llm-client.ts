export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  baseUrl: string;
  model: string;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
}

export interface LLMClientDeps {
  /** 主进程内部解密 Key；渲染层永不传 Key。 */
  resolveKey: (providerId: string) => Promise<string>;
  fetch?: typeof fetch;
}

export interface LLMClient {
  chat(
    providerId: string,
    messages: ChatMessage[],
    opts: ChatOptions,
  ): Promise<ChatResult>;
}

/**
 * 统一 OpenAI 兼容客户端。SSE 流式响应在此聚合为完整文本，
 * 渲染层只拿业务结果（content），Key 不出主进程。
 */
export function createLLMClient(deps: LLMClientDeps): LLMClient {
  const fetchImpl = deps.fetch ?? fetch;

  async function parseSSE(response: Response): Promise<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const ev of events) {
        for (const line of ev.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            content += json.choices?.[0]?.delta?.content ?? '';
          } catch {
            // 忽略无法解析的行。
          }
        }
      }
    }
    return content;
  }

  return {
    async chat(providerId, messages, opts): Promise<ChatResult> {
      const apiKey = await deps.resolveKey(providerId);
      const url = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages,
          temperature: opts.temperature,
          stream: true,
        }),
        signal: opts.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM 请求失败：HTTP ${response.status}`);
      }
      const content = await parseSSE(response);
      return { content };
    },
  };
}
