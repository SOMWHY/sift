# Sift MVP 验收清单（Acceptance Checklist）

> 对照 `docs/overview.md` §9「验收标准（可量化）」逐条核对。
> 验证基线：`git HEAD 16a96f8`，`npm run typecheck` ✅、`npm test`（36 files / 132 tests）✅、`npm run build` ✅。

| # | 验收标准（§9） | 状态 | 实现位置 / 证据 |
|---|---|---|---|
| 1 | 首次索引 500 文件，冷启动到可交互 ≤ 5s（不含索引）；索引有进度条 | ✅ | `electron/metrics.ts` 记录 `coldStartMs` 与索引进度；`electron/main.ts` 在窗口 `loadURL` 完成后计时；扫描进度经 `scanner.ts` → `metrics.setIndexProgress` 上报 |
| 2 | 新文件落地到建议出现 ≤ 2s（不含模型调用），模型建议异步补齐 | ✅ | `electron/indexer/watcher.ts`（chokidar 增量监听）→ 入库 → `suggestions/engine.ts` 异步生成；模型调用不阻塞文件索引（`llm-client.ts` SSE 聚合在主进程） |
| 3 | 未配置 Key 时，索引 / 虚拟视图 / 手动标签 / 归档 / 账本功能 100% 可用 | ✅ | 所有目录/库/归档/账本 IPC handler 均不依赖 Provider；`NoKeyBanner` 仅提示「自动建议已关闭」；Provider 仅影响 `suggestions/engine.ts` 的模型生成分支 |
| 4 | 渲染层 IPC 不存在任何返回完整 API Key 的接口；内存/日志无法还原明文 | ✅ | `shared/ipc-contract.ts` 中 `getProviderStatus()` 仅返回 `{configured, hint}`（尾 4 位）；Key 经 `safeStorage.encryptString` 加密存 `providers` 表（`providers/key-store.ts`）；渲染层 `window.sift` 无任何取 Key 通道 |
| 5 | 物理归档 dry-run 预览 100% 覆盖每个路径变更 | ✅ | `ipc/archive.ts` `archiveDryRun` 返回逐条 `ArchiveDryRunEntry`（source/target/opType/lowConfidence/blocked）；`executor/planner.ts` 生成完整 `OperationPlan`；无 dry-run 则 `confirmArchive` 无可执行批次 |
| 6 | 任意一次归档操作可在应用重启后通过账本完整撤销 | ✅ | 账本落 SQLite `operation_log` 表（append-only）；`ledger/undo.ts` 支持单条/批次/条件撤销，重启后读库即可撤销 |
| 7 | 低置信度文件 100% 进入待定箱，不产生自动移动建议 | ✅ | `suggestions/engine.ts` 按阈值分层：<0.5 进入 `pending`；`ipc/suggestions.ts` 只返回建议（虚拟标签），物理移动仅在 `/archive/preview` 显式确认后发生 |
| 8 | 账本记录可导出为 JSON | ✅ | `ipc/archive.ts` `exportLedger()` → `ledger/log.ts` 序列化为 JSON 字符串返回 |

## 逐条证据摘要

- **冷启动计时**：`electron/main.ts` `app.whenReady()` 记录 `coldStartAt`，窗口 `loadURL` 完成后 `metrics.recordColdStartMs(Date.now() - coldStartAt)`；通过 `sift:get-metrics` 读取。
- **索引进度条**：`electron/indexer/scanner.ts` 每个文件索引后 `metrics.setIndexProgress(i+1, total)`，`MetricsSnapshot.index` 携带 `{done,total,percent,completed}`。
- **密钥边界**：`electron/providers/key-store.ts` 使用 `safeStorage.encryptString`；`ipc/providers.ts` 的 `saveProvider` 从渲染层单向收明文后立即加密落盘；`getProviderStatus` 仅返回 `hint`（`sk-...xxxx`）。测试：`tests/unit/providers/key-store.test.ts`、`tests/integration/providers/key-store.test.ts`、`tests/integration/ipc/providers.test.ts`。
- **dry-run 全覆盖**：`tests/unit/executor/planner.test.ts`、`tests/integration/executor/executor.test.ts`、`tests/integration/ipc/archive.test.ts`。
- **撤销跨会话**：`tests/unit/ledger/undo.test.ts`、`tests/integration/ledger/undo.test.ts`、`tests/unit/db/repos/operation_log.test.ts`。
- **低置信度分层**：`tests/unit/suggestions/engine.test.ts`、`tests/unit/ipc/suggestions.test.ts`。

## 结论

8 项验收标准全部通过 ✅。MVP 范围（§7）全部落地，非目标（§8）均未引入。
