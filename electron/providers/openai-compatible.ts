export interface Endpoint {
  baseUrl: string;
  defaultModel: string;
}

/** OpenAI 兼容 Provider 的默认端点与模型占位。 */
const DEFAULTS: Record<string, Endpoint> = {
  openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile' },
};

export function resolveEndpoint(providerId: string): Endpoint {
  return DEFAULTS[providerId] ?? { baseUrl: '', defaultModel: '' };
}
