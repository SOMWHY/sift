import { describe, it, expect, vi } from 'vitest';
import {
  parsePlan,
  createSuggestionEngine,
  type SuggestionDraft,
} from '../../../electron/suggestions/engine';

describe('parsePlan (Task 4.1)', () => {
  it('合法 JSON → 结构化建议', () => {
    const text = JSON.stringify({
      proposed_tag: '合同',
      confidence: 0.92,
      reason: '文件名与内容均含合同字样',
    });
    expect(parsePlan(text)).toEqual({
      proposedTag: '合同',
      confidence: 0.92,
      reason: '文件名与内容均含合同字样',
    });
  });

  it('非法 JSON → null（不崩溃）', () => {
    expect(parsePlan('不是 JSON')).toBeNull();
    expect(parsePlan('')).toBeNull();
  });

  it('缺字段 → null', () => {
    expect(parsePlan(JSON.stringify({ proposed_tag: '合同' }))).toBeNull();
    expect(parsePlan(JSON.stringify({ confidence: 0.9 }))).toBeNull();
    expect(parsePlan(JSON.stringify({ reason: 'x' }))).toBeNull();
  });

  it('confidence 越界 → null', () => {
    expect(
      parsePlan(JSON.stringify({ proposed_tag: 'a', confidence: 1.5, reason: 'r' })),
    ).toBeNull();
    expect(
      parsePlan(JSON.stringify({ proposed_tag: 'a', confidence: -0.1, reason: 'r' })),
    ).toBeNull();
  });

  it('低置信度 (<0.5) 仍返回草稿（仅猜测+理由，无移动）', () => {
    const draft = parsePlan(
      JSON.stringify({ proposed_tag: '其他', confidence: 0.3, reason: '把握不高' }),
    );
    expect(draft).toEqual({ proposedTag: '其他', confidence: 0.3, reason: '把握不高' });
  });
});

function engineWith(raw: string) {
  const chat = vi.fn(async () => raw);
  const engine = createSuggestionEngine({ chat });
  return { engine, chat };
}

describe('generateSuggestion (Task 4.1)', () => {
  const file = { fileName: '房屋租赁合同.pdf', extractedText: '甲方 乙方 租赁期限' };
  const taxonomy = ['合同', '发票', '证件'];
  const history = ['合同→发票 曾被纠正'];

  it('prompt 含文件元数据 + 标签体系 + 历史反馈；解析返回草稿', async () => {
    const raw = JSON.stringify({
      proposed_tag: '合同',
      confidence: 0.88,
      reason: '含合同关键词',
    });
    const { engine, chat } = engineWith(raw);

    const draft = await engine.generateSuggestion(file, taxonomy, history);

    expect(draft).toEqual({ proposedTag: '合同', confidence: 0.88, reason: '含合同关键词' });
    const messages = (chat.mock.calls[0] as unknown[])[0] as Array<{ content: string }>;
    const prompt = messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('房屋租赁合同.pdf');
    expect(prompt).toContain('合同');
    expect(prompt).toContain('合同→发票 曾被纠正');
  });

  it('LLM 返回非法 JSON → null（进待定箱，不崩溃）', async () => {
    const { engine } = engineWith('抱歉，我无法判断');
    const draft = await engine.generateSuggestion(file, taxonomy, []);
    expect(draft).toBeNull();
  });

  it('LLM 输出被代码块包裹也能解析', async () => {
    const raw = '```json\n' + JSON.stringify({
      proposed_tag: '证件',
      confidence: 0.6,
      reason: '文件名含证件',
    }) + '\n```';
    const { engine } = engineWith(raw);
    const draft = await engine.generateSuggestion(file, taxonomy, []);
    expect(draft).toEqual({ proposedTag: '证件', confidence: 0.6, reason: '文件名含证件' });
  });
});
