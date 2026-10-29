export interface BadgeState {
  /** 当前 open 状态的建议数。 */
  count: number;
  /** AI Provider 是否已配置。 */
  aiConfigured: boolean;
}

export interface BadgeResult {
  visible: boolean;
  /** 展示在托盘上的数字（如 "5"、"99+"）。 */
  label: string;
  /** 托盘 tooltip。 */
  tooltip: string;
}

/**
 * 托盘红点纯逻辑：已配置 AI 且存在新建议时才显示，否则隐藏。
 * 超过 99 条显示 "99+"。
 */
export function computeBadge(state: BadgeState): BadgeResult {
  if (!state.aiConfigured || state.count <= 0) {
    return { visible: false, label: '', tooltip: 'Sift' };
  }
  const label = state.count >= 100 ? '99+' : String(state.count);
  return { visible: true, label, tooltip: `Sift · ${label} 条新建议` };
}
