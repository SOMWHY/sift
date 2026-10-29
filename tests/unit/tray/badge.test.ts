import { describe, it, expect } from 'vitest';
import { computeBadge } from '../../../electron/tray/badge';

describe('computeBadge (Task 4.4)', () => {
  it('未配置 AI：无论建议数多少都不显示红点', () => {
    expect(computeBadge({ count: 5, aiConfigured: false })).toEqual({
      visible: false,
      label: '',
      tooltip: 'Sift',
    });
  });

  it('已配置 AI 且建议数为 0：不显示', () => {
    expect(computeBadge({ count: 0, aiConfigured: true }).visible).toBe(false);
  });

  it('已配置 AI 且建议数 > 0：显示红点与数量', () => {
    expect(computeBadge({ count: 3, aiConfigured: true })).toEqual({
      visible: true,
      label: '3',
      tooltip: 'Sift · 3 条新建议',
    });
  });

  it('建议数从 N 变为 0 时红点消失（数量变化驱动）', () => {
    const before = computeBadge({ count: 7, aiConfigured: true });
    const after = computeBadge({ count: 0, aiConfigured: true });
    expect(before.visible).toBe(true);
    expect(after.visible).toBe(false);
    expect(after.label).toBe('');
  });

  it('超过 99 条显示 99+', () => {
    expect(computeBadge({ count: 150, aiConfigured: true }).label).toBe('99+');
    expect(computeBadge({ count: 99, aiConfigured: true }).label).toBe('99');
  });
});
