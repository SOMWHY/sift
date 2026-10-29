import type { ChatMessage } from '../providers/llm-client';
import type { Preference } from '../../shared/types';

export interface SuggestionDraft {
  proposedTag: string;
  confidence: number;
  reason: string;
}

export interface SuggestionFile {
  fileName: string;
  extractedText: string | null;
}

export interface SuggestionEngineDeps {
  /** 返回 LLM 原始文本；由主进程注入解密后的客户端。 */
  chat: (messages: ChatMessage[]) => Promise<string>;
  /** 可选：读取全部用户偏好，用于纠正 LLM 建议。 */
  getPreferences?: () => Preference[];
}

export interface SuggestionEngine {
  generateSuggestion(
    file: SuggestionFile,
    taxonomy: string[],
    history: string[],
  ): Promise<SuggestionDraft | null>;
}

/**
 * 解析 LLM 输出的结构化 JSON（容忍 markdown 代码块包裹）。
 * 非法 / 缺字段 / confidence 越界 → null（调用方丢进待定箱，不崩溃）。
 */
export function parsePlan(text: string): SuggestionDraft | null {
  let body = text.trim();
  // 剥离 ```json ... ``` 代码块
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) body = fence[1].trim();

  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;

  const r = obj as Record<string, unknown>;
  const proposedTag = r.proposed_tag;
  const confidence = r.confidence;
  const reason = r.reason;
  if (typeof proposedTag !== 'string' || proposedTag.trim() === '') return null;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  if (confidence < 0 || confidence > 1) return null;
  if (typeof reason !== 'string' || reason.trim() === '') return null;

  return { proposedTag: proposedTag.trim(), confidence, reason: reason.trim() };
}

/** LLM 只产出计划，不触碰 fs。 */
export function createSuggestionEngine(deps: SuggestionEngineDeps): SuggestionEngine {
  return {
    async generateSuggestion(file, taxonomy, history) {
      const system = [
        '你是文件整理助手。只输出一个 JSON 对象，不要输出任何其他文字。',
        'JSON 结构：{"proposed_tag": string, "confidence": number(0~1), "reason": string}',
        'confidence 是你对该标签的把握程度。把握不足时给低 confidence 并如实说明。',
      ].join('\n');

      const user = [
        `文件名：${file.fileName}`,
        `内容摘要：${file.extractedText ? file.extractedText.slice(0, 1000) : '（无可用文本）'}`,
        `可用标签体系：${taxonomy.length ? taxonomy.join('、') : '（暂无，可自行拟一个）'}`,
        `历史反馈：${history.length ? history.join('；') : '（暂无）'}`,
      ].join('\n');

      const raw = await deps.chat([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);
      const draft = parsePlan(raw);
      return draft ? applyPreferences(draft, file.fileName, deps.getPreferences?.() ?? []) : null;
    },
  };
}

/**
 * 用户纠正过的文件名 pattern 优先：命中则覆盖 proposedTag。
 * 命中规则：偏好 pattern 为文件名小写子串（pattern 已由 derivePattern 归一化）。
 * 多命中取 weight 最高者；weight 相同取 updated_at 较新者。
 */
export function applyPreferences(
  draft: SuggestionDraft,
  fileName: string,
  prefs: Preference[],
): SuggestionDraft {
  if (prefs.length === 0) return draft;
  const lower = fileName.toLowerCase();
  let best: Preference | null = null;
  for (const p of prefs) {
    if (!lower.includes(p.pattern.toLowerCase())) continue;
    if (
      !best ||
      p.weight > best.weight ||
      (p.weight === best.weight && p.updated_at > best.updated_at)
    ) {
      best = p;
    }
  }
  if (!best) return draft;
  return { ...draft, proposedTag: best.preferred_tag };
}
