import path from 'node:path';
import type Database from 'better-sqlite3';
import { IPC, type SuggestionView, type Thresholds } from '../../shared/ipc-contract';
import { FileRepo } from '../db/repos/files';
import { FileTagRepo } from '../db/repos/file_tags';
import { SuggestionRepo } from '../db/repos/suggestions';
import { TagRepo } from '../db/repos/tags';
import type { IpcRegistrar } from './handlers';

export interface SuggestionDeps {
  db: Database.Database;
  /** 分档阈值（来自 settings，默认 0.8/0.5）。 */
  getThresholds: () => Thresholds;
  setThresholds: (high: number, mid: number) => void;
  /** 建议状态变化后回调（用于刷新托盘红点）。 */
  onChange?: () => void;
}

/**
 * M4 建议区 IPC 边界：高/中/低三档查询 + 建议状态机
 * （open → accepted / redirected / rejected）。
 * 分档在查询时按 confidence 与当前阈值计算，因此阈值修改后可即时重新分档。
 */
export function registerSuggestionHandlers(ipc: IpcRegistrar, deps: SuggestionDeps): void {
  const files = new FileRepo(deps.db);
  const suggestions = new SuggestionRepo(deps.db);
  const tags = new TagRepo(deps.db);
  const fileTags = new FileTagRepo(deps.db);

  const toView = (s: ReturnType<SuggestionRepo['listByStatus']>[number]): SuggestionView => ({
    id: String(s.id),
    fileId: String(s.file_id),
    fileName: path.basename(files.get(s.file_id)?.path ?? ''),
    proposedTag: s.proposed_tag,
    confidence: s.confidence,
    reason: s.reason ?? '',
    status: s.status,
  });

  const openByTier = (filter: (c: number, t: Thresholds) => boolean): SuggestionView[] => {
    const thresholds = deps.getThresholds();
    return suggestions
      .listByStatus('open')
      .filter((s) => filter(s.confidence, thresholds))
      .map(toView);
  };

  ipc.handle(IPC.getThresholds, () => deps.getThresholds());

  ipc.handle(IPC.setThresholds, (high: unknown, mid: unknown) => {
    const h = Number(high);
    const m = Number(mid);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return { ok: false };
    if (h <= 0 || m <= 0 || h <= m) return { ok: false };
    deps.setThresholds(h, m);
    return { ok: true };
  });

  ipc.handle(IPC.getInbox, () => openByTier((c, t) => c >= t.high));

  ipc.handle(IPC.getToConfirm, () => openByTier((c, t) => c >= t.mid && c < t.high));

  ipc.handle(IPC.getPending, () => openByTier((c, t) => c < t.mid));

  ipc.handle(IPC.acceptSuggestions, (ids: unknown) => {
    for (const id of Array.isArray(ids) ? ids : []) {
      const s = suggestions.get(Number(id));
      if (!s || s.status !== 'open') continue;
      const tag = tags.getByName(s.proposed_tag) ?? tags.create(s.proposed_tag);
      fileTags.set(s.file_id, tag.id, s.confidence);
      suggestions.updateStatus(s.id, 'accepted');
    }
    deps.onChange?.();
    return { ok: true };
  });

  ipc.handle(IPC.assignTag, (suggestionId: unknown, tagId: unknown) => {
    const s = suggestions.get(Number(suggestionId));
    const tag = tags.get(Number(tagId));
    if (!s || !tag) return { ok: false };
    fileTags.set(s.file_id, tag.id, s.confidence);
    suggestions.updateStatus(s.id, 'redirected');
    deps.onChange?.();
    return { ok: true };
  });

  ipc.handle(IPC.ignore, (suggestionId: unknown) => {
    const s = suggestions.get(Number(suggestionId));
    if (!s) return { ok: false };
    suggestions.updateStatus(s.id, 'rejected');
    deps.onChange?.();
    return { ok: true };
  });
}
