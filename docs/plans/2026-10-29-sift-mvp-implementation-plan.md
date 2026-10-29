# Sift MVP 实施计划

> **For agentic workers:** 按任务逐条实现时，建议使用 subagent-driven-development 或 executing-plans 子技能。步骤用 `- [ ]` 复选框跟踪进度。
>
> 本计划只做规划与接口约定，不含业务实现代码。实现阶段的每个 Task 采用 TDD（先写失败测试 → 跑通 → 最小实现 → 提交）。

**Goal:** 实现 Sift MVP —— 一个本地优先的 Electron 桌面应用，把下载文件夹变成"可理解、可检索、可审计"的整理系统；默认不移动文件，AI 能力由用户自带 Key 提供。

**Architecture:** Electron 主进程（密钥管理 / LLM 调用 / chokidar 监听 / 确定性执行器 / 账本写入）+ Next.js App Router standalone server（由主进程 fork 子进程启动，随机端口 + 启动令牌 + `/health` 就绪轮询后开窗）作为渲染层；渲染层 `contextIsolation: true` + `sandbox: true`，经 preload 暴露最小 IPC 面。SQLite（better-sqlite3，WAL）存全部本地数据；AI 只输出结构化 JSON 计划，实际文件操作由主进程确定性执行器完成。

**Tech Stack:** Electron + Next.js (App Router) + TypeScript；better-sqlite3（WAL）；chokidar；FTS5 + 本地 embedding 向量混合（MVP 不引入独立向量库）；SSE 流式输出；PDF / 文本内容抽取（图片仅元数据）；Provider 抽象统一 `LLMClient.chat()`，支持 OpenAI / DeepSeek / Groq / 自定义 OpenAI 兼容端点。

**Spec:** `docs/overview.md`（本计划的所有约束、数据表、验收标准、页面路由均来自该文档；执行者需同时阅读两者）。

---

## Global Constraints（硬性约束，逐字摘自 spec）

- 默认不动文件：首次使用只做只读索引，不产生任何 `rename / move / delete`。
- 模型无文件系统执行权：LLM 只输出结构化 `OperationPlan`（JSON），实际文件操作由主进程确定性执行器完成；模型无法直接调用 `fs`。
- 不确定性是合法输出：低置信度（<0.5）文件必须进"待定箱"，不产生移动建议。
- 所有变更可审计、可跨会话撤销：每次物理操作写入 append-only 账本；撤销本身也写入新记录，不物理删除历史。
- 数据库零配置，密钥用户自备：SQLite 首次启动自动建库 + 迁移；应用不内置、不代理、不转售任何 Key。
- 密钥永不进渲染层：API Key 经 `safeStorage.encryptString` 加密后仅存主进程；渲染层只能拿到 `{configured, hint: "sk-...xxxx"}`；所有模型调用从主进程（或 `utilityProcess`）发起。
- 敏感数据不出设备：内容索引、向量、操作日志全部本地存储；仅用户触发分析时把必要文本片段发给用户自配 Provider。
- 第一版完全禁用删除；禁止跨盘符；禁止操作系统目录；默认 dry-run，预览后显式确认才执行。
- 未配置 Key 时优雅降级：索引 / 虚拟视图 / 手动标签 / 归档 / 账本 100% 可用，仅"自动生成建议"不可用。
- Provider 至少四种：OpenAI / DeepSeek / Groq / 自定义 OpenAI 兼容端点。

---

## Review Focus（spec 未显式规定、但最可能咬人的输入与失败模式）

按"最可能发生"排序。每条对应一个拥有该代码的 Task，并在该 Task 中补上钉死它的测试。

1. **外部重命名/移动后的归档**：索引后用户或外部程序移动了文件，归档执行时用过期路径会移动错误文件。→ 归档前用 content hash 重新解析当前路径，解析不到的条目整条拒绝并提示。→ Task 5.4。
2. **safeStorage 不可用**（Linux 无 keyring / `encryptString` 抛错）：不得落明文、不得崩溃；应报错并禁止保存，提示用户环境不支持加密。→ Task 3.1。
3. **无法抽取文本的文件**（二进制、损坏 PDF、非 UTF-8）：抽取器必须返回空文本并降级为"仅元数据"，索引流程不中断、不抛异常。→ Task 2.2。
4. **符号链接逃逸授权根**：ACL 必须解析 `realpath`，拒绝授权根之外的解析路径（含 symlink 指向越界）。→ Task 5.2。
5. **归档/撤销与 chokidar 事件竞态**：执行器自己移动文件会触发 watcher 事件，必须按路径+inode 去重忽略，避免"归档结果"再次进入待整理队列。→ Task 5.4。

---

## 里程碑总览（对应 overview §12 建议顺序）

| 里程碑 | 内容 | 对应 §12 | 可演示产物 |
|---|---|---|---|
| M0 | Electron + Next.js standalone 骨架 | 步骤 1 | 窗口打开，`/health` 就绪 |
| M1 | SQLite 建库 + 迁移 + 表结构 | 步骤 2 | 自动建库，schema 落盘 |
| M2 | 目录授权 + 只读索引 + 虚拟视图（无 AI） | 步骤 3 | 索引进度条 + 虚拟视图 + 手动标签 |
| M3 | Provider 配置层 + safeStorage + IPC 边界 | 步骤 4 | 配置/测试连接，渲染层零明文 |
| M4 | Provider 生成标签与建议（分层 + 理由） | 步骤 5-6 | 建议区/待确认/待定箱三档 |
| M5 | 执行器 + dry-run + 账本 + 撤销 | 步骤 7 | 归档预览、执行、跨会话撤销 |
| M6 | 纠正反馈学习（preferences 权重） | 步骤 8 | 纠正影响后续建议 |
| M7 | 指标 + README + 演示录屏 | 步骤 9 | 验收清单全绿 |

每个里程碑独立可运行、可演示；不并行铺开未完成模块。

---

## 文件结构（拟定，实施时可微调）

```
sift/
├── package.json                 # 脚本：dev / build / test / lint
├── tsconfig.json                # 主进程 + 渲染层两套 tsconfig
├── .gitignore                   # node_modules / out / .next / .env* / *.db
├── .env.example                 # 字段占位（无真实值），例：SIFT_STARTUP_TOKEN
├── electron/
│   ├── main.ts                  # app 入口、窗口、生命周期、托盘
│   ├── preload.ts               # contextBridge 暴露最小 IPC 面
│   ├── server.ts                # fork Next standalone、随机端口、启动令牌、/health 轮询
│   ├── db/
│   │   ├── connection.ts        # better-sqlite3 + WAL + userData/sift.db
│   │   ├── migrations.ts        # 迁移 runner + 版本表
│   │   └── repos/               # 每表一个 repo（files/tags/suggestions/...）
│   ├── indexer/
│   │   ├── hasher.ts            # 内容指纹（hash）
│   │   ├── extractor.ts         # 文本 + PDF 抽取，图片仅元数据
│   │   ├── scanner.ts           # 只读全量扫描 + 进度上报
│   │   └── watcher.ts           # chokidar 增量监听 + 待整理队列
│   ├── search/
│   │   ├── fts.ts               # FTS5 关键词召回
│   │   └── embedding.ts         # 本地 embedding 向量（决策点 D3）
│   ├── providers/
│   │   ├── llm-client.ts        # 统一 LLMClient.chat()
│   │   ├── openai-compatible.ts # baseUrl 可配，覆盖四种 Provider
│   │   └── key-store.ts         # safeStorage 加解密 + 尾号 hint
│   ├── suggestions/
│   │   ├── engine.ts            # 结构化建议生成（tag/confidence/reason）
│   │   └── preferences.ts       # feedback → pattern→preferred_tag 权重
│   ├── executor/
│   │   ├── planner.ts           # 生成 OperationPlan
│   │   ├── acl.ts               # 路径 ACL / realpath / 禁跨盘 / 禁系统目录
│   │   └── executor.ts          # 确定性移动 + 写 operation_log
│   ├── ledger/
│   │   ├── log.ts               # append-only 写入
│   │   └── undo.ts              # 单条 / batch / 条件撤销
│   └── ipc/
│       └── handlers.ts          # ipcMain 注册（含 channel 清单）
├── renderer/
│   ├── app/
│   │   ├── onboarding/page.tsx
│   │   ├── inbox/page.tsx       # 建议区（高置信度）
│   │   ├── pending/page.tsx     # 待定箱（低置信度）
│   │   ├── library/page.tsx     # 虚拟视图 + 搜索 + 归档入口 + 待归类
│   │   ├── archive/preview/page.tsx  # dry-run 预览
│   │   ├── ledger/page.tsx      # 操作账本
│   │   └── settings/page.tsx
│   ├── components/              # 建议卡片、置信度徽章、目录选择等
│   └── lib/ipc.ts               # window.sift.* 类型化封装
├── shared/
│   └── ipc-contract.ts          # 主/渲染共享的 channel 名与 payload 类型
└── tests/
    ├── unit/                    # 每模块单测
    └── integration/             # executor/ledger/provider 集成测试
```

> 关键结构原则：`shared/ipc-contract.ts` 是主进程与渲染层之间的唯一类型契约，channel 名与 payload 类型集中定义，两边只引用不重抄。

---

## 开放决策点（实施前需与用户确认）

- **D1 包管理器**：已检测到 npm 11.16.0，默认用 npm；若倾向 pnpm（Electron + Next standalone 场景更省盘）请指定。
- **D2 内容抽取库**：PDF 抽取候选 `pdf-parse`（轻量）vs `pdfjs-dist`（更稳但重）。计划默认 `pdf-parse`，文本类直接读 UTF-8。
- **D3 本地 embedding**：spec 要求"FTS5 + 本地 embedding 混合"但未指定模型。默认方案：MVP 先以 FTS5 关键词召回为主，embedding 用 `@xenova/transformers`（all-MiniLM-L6-v2）在 `utilityProcess` 中跑，向量存 SQLite；若时间紧，可先上线 FTS5-only，embedding 作为 M2 的可选增补。**此为影响 M2 检索质量与包体积的关键决策，建议实施 M2 前拍板。**

---

## Task 分解

### 里程碑 M0：Electron + Next.js standalone 骨架

#### Task 0.1: 仓库初始化与依赖

**Files:**
- Create: `package.json`、`tsconfig.json`、`tsconfig.renderer.json`、`.gitignore`、`.env.example`
- Create: `electron/`、`renderer/`、`shared/`、`tests/` 目录

**Interfaces:**
- Produces: npm scripts —— `dev`、`build`、`test`、`lint`；依赖清单（electron、next、typescript、better-sqlite3、chokidar、vitest 等）

- [ ] **Step 1:** `git init`，写 `.gitignore`（`node_modules/`、`.next/`、`out/`、`*.db`、`.env*`）与 `.env.example`（仅字段名与注释，无真实值）
- [ ] **Step 2:** 写 `package.json` 依赖与脚本，`npm install` 跑通
- [ ] **Step 3:** 写主进程 / 渲染层两套 tsconfig，`npm run lint` 与 `tsc --noEmit` 通过
- [ ] **Step 4:** Commit: `chore: init sift repo skeleton`

#### Task 0.2: Next.js standalone 子进程 + /health 就绪轮询 + 开窗

**Files:**
- Create: `electron/server.ts`、`electron/main.ts`（最小版）
- Modify: `package.json`（next build 输出 standalone）

**Interfaces:**
- Produces:
  - `startNextServer(): Promise<{ port: number; token: string }>` —— fork 子进程、生成随机端口 + 启动令牌、轮询 `/health` 直到 200
  - `createMainWindow(): BrowserWindow` —— `contextIsolation: true`、`sandbox: true`、`webPreferences.preload`

- [ ] **Step 1:** 写集成测试：`startNextServer` 返回端口后，带启动令牌请求 `/health` 得 200；错误令牌得 401/403
- [ ] **Step 2:** 跑测试，确认 FAIL（无实现）
- [ ] **Step 3:** 实现 `server.ts` 与 Next 端 `/health` route（校验令牌）
- [ ] **Step 4:** 跑测试 PASS；手动 `npm run dev` 验证窗口在健康检查通过后打开
- [ ] **Step 5:** Commit: `feat(electron): standalone next server with health gate`

#### Task 0.3: preload 最小 IPC + 渲染层冒烟

**Files:**
- Create: `electron/preload.ts`、`shared/ipc-contract.ts`、`renderer/lib/ipc.ts`、`renderer/app/page.tsx`
- Modify: `electron/ipc/handlers.ts`

**Interfaces:**
- Produces:
  - `window.sift.ping(): Promise<'pong'>`
  - `window.sift.getVersion(): Promise<string>`
  - `shared/ipc-contract.ts` 中定义 channel 常量与 payload 类型（后续所有 IPC 都走这里）

- [ ] **Step 1:** 写测试：`ipc-contract` 导出 channel 清单且无重复
- [ ] **Step 2:** 实现 preload `contextBridge.exposeInMainWorld` + 渲染层调用
- [ ] **Step 3:** 手动验证：DevTools 里渲染层只能访问 `window.sift.*`，无 `require`/`process`
- [ ] **Step 4:** Commit: `feat(ipc): minimal preload bridge`

---

### 里程碑 M1：SQLite 建库 + 迁移 + 表结构

#### Task 1.1: 数据库连接 + 自动建库

**Files:**
- Create: `electron/db/connection.ts`
- Test: `tests/unit/db/connection.test.ts`

**Interfaces:**
- Produces: `getDb(): Database.Database` —— 打开 `app.getPath('userData')/sift.db`，`journal_mode=WAL`，不存在则自动创建

- [ ] **Step 1:** 写测试：临时目录下首次调用自动生成 `.db` 文件且 WAL 生效
- [ ] **Step 2:** 跑测试 FAIL
- [ ] **Step 3:** 实现连接（注入 dbPath 以便测试，生产用 userData）
- [ ] **Step 4:** PASS + Commit: `feat(db): sqlite connection with WAL`

#### Task 1.2: 迁移 runner + schema（10 张表）

**Files:**
- Create: `electron/db/migrations.ts`、`electron/db/schema.sql`
- Test: `tests/unit/db/migrations.test.ts`

**Interfaces:**
- Produces: `runMigrations(db): void` —— 用版本表 `_migrations` 幂等执行

**表结构（照抄 spec §关键数据表）：**
```sql
files(id, path, hash, size, mime, extracted_text, indexed_at, status)
tags(id, name)
file_tags(file_id, tag_id, confidence)
suggestions(id, file_id, proposed_tag, confidence, reason, status, created_at)
feedback_events(id, suggestion_id, user_action, from_tag, to_tag, created_at)
preferences(id, pattern, preferred_tag, weight, updated_at)
operation_log(id, batch_id, source_path, target_path, op_type, suggestion_id, confidence, user_decision, created_at)
undo_batches(id, batch_id, undone_at, reason)
settings(key, value)
providers(id, provider_id, base_url, model, encrypted_api_key, enabled, created_at, updated_at)
```

- [ ] **Step 1:** 写测试：`runMigrations` 幂等（跑两遍结果一致）、10 表齐全、`operation_log` 无 DELETE 触发器（账本 append-only 由 repo 层保证 + 测试钉死）
- [ ] **Step 2:** 跑测试 FAIL
- [ ] **Step 3:** 实现迁移 runner + schema.sql（含必要索引：`files.path`、`files.hash`、`operation_log.batch_id`、`operation_log.created_at`）
- [ ] **Step 4:** PASS + Commit: `feat(db): migrations and schema`

#### Task 1.3: 每表 repo 层

**Files:**
- Create: `electron/db/repos/*.ts`（files/tags/file_tags/suggestions/feedback_events/preferences/operation_log/undo_batches/settings/providers）
- Test: `tests/unit/db/repos/*.test.ts`

**Interfaces:**
- Produces（关键签名）:
  - `FileRepo.upsertByHash(f): File`、`FileRepo.listByStatus(status): File[]`
  - `SuggestionRepo.create(s): Suggestion`、`SuggestionRepo.updateStatus(id, status)`
  - `OperationLogRepo.append(entry): OperationLogEntry`、`OperationLogRepo.listByBatch(batchId)`
  - `SettingsRepo.get(key)/set(key,value)`
  - `ProviderRepo.upsert(p)/list()`

- [ ] **Step 1:** 每个 repo 先写 CRUD 单测
- [ ] **Step 2:** FAIL → 实现 → PASS
- [ ] **Step 3:** 特别测试：`OperationLogRepo.append` 只允许 INSERT，无 update/delete 方法暴露
- [ ] **Step 4:** Commit: `feat(db): repository layer`

---

### 里程碑 M2：目录授权 + 只读索引 + 虚拟视图（无 AI）

#### Task 2.1: 目录授权 + settings 存储

**Files:**
- Create: `electron/ipc/handlers.ts`（扩展）、`shared/ipc-contract.ts`（扩展）
- Test: `tests/integration/ipc/directory.test.ts`

**Interfaces:**
- Produces:
  - `window.sift.pickDirectory(): Promise<string | null>`（原生目录选择）
  - `window.sift.setAuthorizedRoot(path): Promise<{ok: boolean}>`（写入 settings）

- [ ] **Step 1:** 写测试：授权根写入 settings，重启可读回
- [ ] **Step 2:** 实现 IPC + onboarding 目录选择按钮
- [ ] **Step 3:** Commit: `feat(indexer): directory authorization`

#### Task 2.2: hasher + extractor（文本 / PDF，图片仅元数据）

**Files:**
- Create: `electron/indexer/hasher.ts`、`electron/indexer/extractor.ts`
- Test: `tests/unit/indexer/extractor.test.ts`、`tests/unit/indexer/hasher.test.ts`

**Interfaces:**
- Produces:
  - `hashFile(path): Promise<string>`（内容指纹，流式）
  - `extractText(path, mime): Promise<string>` —— PDF 用 pdf-parse；文本读 UTF-8；图片/二进制返回 `''` 并标记仅元数据

- [ ] **Step 1:** 写测试（覆盖 Review Focus #3）：损坏 PDF / 二进制 / 非 UTF-8 → 返回空串不抛异常
- [ ] **Step 2:** FAIL → 实现（抽取用 try/catch 兜底，任何失败降级为空文本）→ PASS
- [ ] **Step 3:** Commit: `feat(indexer): hasher and extractor`

#### Task 2.3: 只读 scanner + 进度上报

**Files:**
- Create: `electron/indexer/scanner.ts`
- Test: `tests/unit/indexer/scanner.test.ts`

**Interfaces:**
- Produces: `scanTree(root, onProgress): Promise<IndexedFile[]>` —— 只读遍历，写 `files` 表，进度 `已索引 N / 总数 M` 经 SSE 或 IPC 推给渲染层

- [ ] **Step 1:** 写测试：构造临时目录 500 个文件，扫描后 `files` 表数量/内容正确，且全程无 `rename/move/delete`（用只读 FS 断言）
- [ ] **Step 2:** FAIL → 实现 → PASS
- [ ] **Step 3:** onboarding 进度条 UI 对接
- [ ] **Step 4:** Commit: `feat(indexer): read-only scanner with progress`

#### Task 2.4: FTS5 检索 + 虚拟视图 + 手动标签

**Files:**
- Create: `electron/search/fts.ts`、`renderer/app/library/page.tsx`
- Test: `tests/unit/search/fts.test.ts`

**Interfaces:**
- Produces:
  - `searchFiles(q, {tagIds?}): SearchResult[]`（FTS5 关键词召回 + 可选标签过滤）
  - `window.sift.search(q)`、`window.sift.addManualTag(fileId, tagId)`

- [ ] **Step 1:** 写测试：中文/英文关键词命中、标签过滤命中
- [ ] **Step 2:** 实现 FTS5 虚拟表同步（files 写入时同步 FTS 索引）+ library 页面（标签分组、搜索框、"待归类"区、归档入口）
- [ ] **Step 3:** 手动标签写入 `file_tags`
- [ ] **Step 4:** Commit: `feat(search): FTS5 and virtual library view`

#### Task 2.5: chokidar 增量监听 + 待整理队列（无 AI 分支）

**Files:**
- Create: `electron/indexer/watcher.ts`
- Test: `tests/unit/indexer/watcher.test.ts`

**Interfaces:**
- Produces: `watchRoot(root): WatcherHandle` —— 新文件落地进入"待整理队列"，写入 `files`（status=`pending`）；无 Provider 时 UI 标记"待归类"、托盘无红点

- [ ] **Step 1:** 写测试：模拟文件落地 → `files` 出现 pending 记录；模拟执行器移动（Review Focus #5）→ 不重复入队
- [ ] **Step 2:** 实现 + 托盘集成（红点逻辑留到 M4）
- [ ] **Step 3:** Commit: `feat(indexer): incremental watcher`

---

### 里程碑 M3：Provider 配置层 + safeStorage + IPC 边界

#### Task 3.1: key-store（safeStorage 加解密）+ providers repo

**Files:**
- Create: `electron/providers/key-store.ts`
- Test: `tests/unit/providers/key-store.test.ts`

**Interfaces:**
- Produces:
  - `encryptKey(plain: string): Promise<string>`（safeStorage.encryptString；不可用时抛错，绝不落明文）
  - `decryptKey(cipher: string): Promise<string>`（仅主进程内部使用）
  - `keyHint(encrypted): string`（尾 4 位，如 `sk-...xxxx`）

- [ ] **Step 1:** 写测试（Review Focus #2）：mock `safeStorage.encryptString` 抛错 → 返回明确错误、不落盘明文、Provider 状态仍为未配置
- [ ] **Step 2:** FAIL → 实现 → PASS
- [ ] **Step 3:** 测试：密文写入 `providers.encrypted_api_key`，db 里查不到明文
- [ ] **Step 4:** Commit: `feat(providers): safeStorage key store`

#### Task 3.2: OpenAI 兼容 Provider 客户端（统一 LLMClient）

**Files:**
- Create: `electron/providers/llm-client.ts`、`electron/providers/openai-compatible.ts`
- Test: `tests/unit/providers/llm-client.test.ts`

**Interfaces:**
- Produces:
  - `LLMClient.chat(messages, opts): Promise<ChatResult>`（SSE 流式）
  - `resolveEndpoint(providerId): { baseUrl, defaultModel }` —— OpenAI / DeepSeek / Groq / 自定义各一个默认 baseUrl 与常用模型占位
  - 渲染层只传业务参数，不传 Key

- [ ] **Step 1:** 写测试：四种 Provider 默认 baseUrl 映射正确；自定义 baseUrl 优先生效
- [ ] **Step 2:** 实现（标准 `fetch` + SSE，Key 由主进程从 key-store 解密注入）
- [ ] **Step 3:** 测试：mock HTTP 服务器验证请求头带 Key 但响应不把 Key 回传渲染层
- [ ] **Step 4:** Commit: `feat(providers): unified OpenAI-compatible client`

#### Task 3.3: 设置页 + 测试连接 + IPC 边界

**Files:**
- Create: `renderer/app/settings/page.tsx`
- Modify: `shared/ipc-contract.ts`、`electron/ipc/handlers.ts`

**Interfaces:**
- Produces:
  - `window.sift.saveProvider(config): Promise<{configured: boolean}>`（单向提交明文，提交后清空输入框）
  - `window.sift.getProviderStatus(): Promise<{configured: boolean, hint: string}>`（**永不返回完整 Key**）
  - `window.sift.testConnection(providerId): Promise<{ok: boolean, error?: string}>`

- [ ] **Step 1:** 写测试：`getProviderStatus` 的 IPC 返回值里断言不含 Key 明文（仅 hint）；遍历所有 IPC channel 无任何返回完整 Key 的接口
- [ ] **Step 2:** 实现设置页 UI（Provider 下拉、Key 密码掩码、Base URL 条件显示、模型名、测试连接、说明文字）+ IPC handlers
- [ ] **Step 3:** 手动验证 DevTools 抓渲染层内存无 Key
- [ ] **Step 4:** Commit: `feat(providers): settings UI and IPC boundary`

#### Task 3.4: 未配置 Key 优雅降级

**Files:**
- Modify: `renderer/app/*`（顶部提示条组件）

**Interfaces:**
- Produces: 未配置时主界面顶部可关闭提示条「未配置 AI，自动建议已关闭。点击配置。」

- [ ] **Step 1:** 写组件测试：未配置状态显示提示条，配置后消失
- [ ] **Step 2:** 实现
- [ ] **Step 3:** Commit: `feat(ui): graceful no-key banner`

---

### 里程碑 M4：Provider 生成标签与建议（分层 + 理由）

#### Task 4.1: 建议引擎（结构化 JSON 计划）

**Files:**
- Create: `electron/suggestions/engine.ts`
- Test: `tests/unit/suggestions/engine.test.ts`

**Interfaces:**
- Produces:
  - `generateSuggestion(file, taxonomy, history): Promise<SuggestionDraft>` —— 输出 `{proposed_tag, confidence, reason}`，prompt 含文件元数据 + 标签体系 + 历史反馈；未配置 Provider 直接跳过
  - `parsePlan(text): OperationPlan`（校验 LLM 输出为合法 JSON，非法则丢弃进待定箱）

- [ ] **Step 1:** 写测试：合法 JSON → 结构化建议；非法 JSON / 缺字段 → 不崩溃、进待定箱；低置信度 (<0.5) → 无移动建议仅猜测+理由
- [ ] **Step 2:** FAIL → 实现（LLM 只产出计划，不触碰 fs）→ PASS
- [ ] **Step 3:** Commit: `feat(suggestions): engine with structured plan`

#### Task 4.2: 高/低两档 UI（inbox / pending）

**Files:**
- Create: `renderer/app/inbox/page.tsx`、`renderer/app/pending/page.tsx`、建议卡片组件

**Interfaces:**
- Produces:
  - `window.sift.getInbox(): Promise<SuggestionView[]>`（高置信度 ≥0.8）
  - `window.sift.getPending(): Promise<SuggestionView[]>`（低置信度 <0.5）
  - `window.sift.acceptSuggestions(ids: string[])`
  - `window.sift.assignTag(suggestionId, tagId)` / `window.sift.ignore(suggestionId)`

- [ ] **Step 1:** 写测试：阈值 0.8/0.5 分档正确；高置信度默认勾选可一键接受；低置信度无"接受"按钮只有"指定标签/忽略"
- [ ] **Step 2:** 实现两档页面 + 建议状态机（pending → accepted/rejected/redirected）
- [ ] **Step 3:** Commit: `feat(suggestions): high/low tier UI`

#### Task 4.3: 中档 + 可解释理由 + 阈值可配

**Files:**
- Modify: `renderer/app/inbox/page.tsx`（待确认区）、`renderer/app/settings/page.tsx`

**Interfaces:**
- Produces:
  - 中置信度（0.5–0.8）进入"待确认区"，逐条勾选后"接受所选"
  - 每条建议显示理由（非仅百分比）
  - `window.sift.getThresholds()/setThresholds(high, mid)`（默认 0.8 / 0.5 可调）

- [ ] **Step 1:** 写测试：三档边界（0.79/0.8/0.81）分档正确；阈值修改后重新分档
- [ ] **Step 2:** 实现 + 理由展示
- [ ] **Step 3:** Commit: `feat(suggestions): medium tier, reasons, tunable thresholds`

#### Task 4.4: 托盘红点 + 新建议通知

**Files:**
- Modify: `electron/main.ts`、`electron/suggestions/engine.ts`

**Interfaces:**
- Produces: 已配置 AI 时新文件落地 → 托盘红点「有 N 条新建议」，点击落在建议区；未配置则无红点

- [ ] **Step 1:** 写测试：建议数变化触发托盘 badge 更新
- [ ] **Step 2:** 实现
- [ ] **Step 3:** Commit: `feat(tray): suggestion badge`

---

### 里程碑 M5：执行器 + dry-run + 账本 + 撤销

#### Task 5.1: OperationPlan + planner

**Files:**
- Create: `electron/executor/planner.ts`、`shared/ipc-contract.ts`（OperationPlan 类型）

**Interfaces:**
- Produces:
  - `type OperationPlan = { batch_id, entries: [{source_path, target_path, op_type, suggestion_id?, confidence?, user_decision}] }`
  - `buildPlan(fileIds, targetDir): Promise<OperationPlan>`（生成 move 计划，不执行）

- [ ] **Step 1:** 写测试：选择 N 文件 → 计划含 N 条 move 条目、目标路径唯一不冲突
- [ ] **Step 2:** 实现
- [ ] **Step 3:** Commit: `feat(executor): operation planner`

#### Task 5.2: 路径 ACL

**Files:**
- Create: `electron/executor/acl.ts`
- Test: `tests/unit/executor/acl.test.ts`

**Interfaces:**
- Produces: `assertAllowed(root, source, target): void` —— 仅授权根内、禁跨盘符、禁系统目录、realpath 解析拒绝 symlink 逃逸

- [ ] **Step 1:** 写测试（Review Focus #4）：symlink 指向根外 → 拒绝；跨盘符 → 拒绝；系统目录 → 拒绝
- [ ] **Step 2:** 实现 → PASS
- [ ] **Step 3:** Commit: `feat(executor): path ACL`

#### Task 5.3: dry-run 预览页

**Files:**
- Create: `renderer/app/archive/preview/page.tsx`

**Interfaces:**
- Produces: 逐条路径变更 + 低置信度标黄「请确认」；无 dry-run 预览则执行按钮禁用；整批拒绝时提示原因

- [ ] **Step 1:** 写组件测试：预览逐条渲染、标黄逻辑、未预览时执行按钮 disabled
- [ ] **Step 2:** 实现
- [ ] **Step 3:** Commit: `feat(executor): dry-run preview`

#### Task 5.4: 确定性执行器 + 账本写入

**Files:**
- Create: `electron/executor/executor.ts`、`electron/ledger/log.ts`
- Test: `tests/integration/executor/executor.test.ts`

**Interfaces:**
- Produces:
  - `executePlan(plan): Promise<ExecutionResult>` —— 执行前 ACL 校验，任一条越界/删除请求**整批拒绝**；执行用确定性 move（无 delete 能力）；每条写 `operation_log`
  - 执行前用 hash 重新解析当前路径（Review Focus #1）
  - 忽略执行器自身操作触发的 watcher 事件（Review Focus #5）

- [ ] **Step 1:** 写测试：整批越界 → 全部不执行；正常 move → 账本 N 条；外部改过路径 → 该条拒绝；重复下载（同 hash 不同路径）→ 按 path 执行不串
- [ ] **Step 2:** 实现
- [ ] **Step 3:** Commit: `feat(executor): deterministic executor with ledger`

#### Task 5.5: 账本页 + 撤销 + 导出

**Files:**
- Create: `electron/ledger/undo.ts`、`renderer/app/ledger/page.tsx`
- Test: `tests/integration/ledger/undo.test.ts`

**Interfaces:**
- Produces:
  - `undoEntry(id)` / `undoBatch(batchId)` / `undoByCondition({since, fromSuggestion})`
  - `exportLedger(): Promise<string>`（JSON 导出）
  - 撤销反向执行 + 新写一条记录，原记录保留

- [ ] **Step 1:** 写测试：单条撤销、batch 撤销、条件撤销均反向执行且新增记录；重启后仍可撤销（跨会话）
- [ ] **Step 2:** 实现账本页（时间倒序、按日期/批次/标签筛选、展开详情、撤销按钮、导出）
- [ ] **Step 3:** Commit: `feat(ledger): audit page, undo, export`

---

### 里程碑 M6：纠正反馈学习

#### Task 6.1: feedback_events 写入

**Files:**
- Create: `electron/suggestions/preferences.ts`
- Test: `tests/unit/suggestions/feedback.test.ts`

**Interfaces:**
- Produces: `recordFeedback(suggestionId, action, fromTag, toTag)` —— 接受/改到/拒绝三类，写入 `feedback_events`

- [ ] **Step 1:** 写测试：三类 action 落库字段正确
- [ ] **Step 2:** 实现（在 M4 的 accept/redirect/reject 流程里挂接）
- [ ] **Step 3:** Commit: `feat(feedback): record user decisions`

#### Task 6.2: preferences 权重更新

**Files:**
- Modify: `electron/suggestions/preferences.ts`

**Interfaces:**
- Produces: `updatePreference(pattern, preferredTag)` —— 从"含 invoice → 工作/报销"类事件更新 `preferences(weight)`；重复纠正提升权重

- [ ] **Step 1:** 写测试：重复纠正同一 pattern → weight 递增；新 pattern 插入
- [ ] **Step 2:** 实现
- [ ] **Step 3:** Commit: `feat(feedback): preference weights`

#### Task 6.3: 建议引擎应用 preferences

**Files:**
- Modify: `electron/suggestions/engine.ts`

**Interfaces:**
- Consumes: `preferences` 表
- Produces: 命中 pattern 的建议优先级受 preferences 影响（下次同类文件建议落到用户改过的标签）

- [ ] **Step 1:** 写测试：命中 `invoice → 工作/报销` 的文件，建议的 `proposed_tag` 被纠正为偏好标签
- [ ] **Step 2:** 实现
- [ ] **Step 3:** Commit: `feat(feedback): apply preferences in engine`

---

### 里程碑 M7：指标 + README + 演示

#### Task 7.1: 指标埋点

**Files:**
- Create: `electron/metrics.ts`（或并入现有模块）
- Test: `tests/unit/metrics.test.ts`

**Interfaces:**
- Produces: 冷启动到可交互耗时、新文件落地到建议出现耗时（不含模型调用）、索引进度、撤销成功率等可观测指标

- [ ] **Step 1:** 写测试：指标记录与读取正确
- [ ] **Step 2:** 实现埋点 + 对齐验收标准（§9 五项量化指标）
- [ ] **Step 3:** Commit: `feat(metrics): acceptance instrumentation`

#### Task 7.2: README + 演示录屏 + 验收清单核对

**Files:**
- Create: `README.md`、`README.en.md`、`docs/ACCEPTANCE.md`

**Interfaces:**
- Produces: 中英 README（功能、安装、Provider 配置、隐私说明）；演示录屏脚本；逐条验收清单

- [x] **Step 1:** 写验收清单，逐条对照 §9 勾选
- [x] **Step 2:** 写 README + 录屏
- [x] **Step 3:** Commit: `docs: readme and acceptance checklist`

---

## 验收标准 → Task 覆盖对照

| 验收标准（§9） | 覆盖 Task |
|---|---|
| 首次索引 500 文件，冷启动 ≤5s（不含索引），有进度条 | 2.3 / 7.1 |
| 新文件落地到建议出现 ≤2s（不含模型调用），模型异步补齐 | 2.5 / 4.4 / 7.1 |
| 未配置 Key：索引/虚拟视图/手动标签/归档/账本 100% 可用 | 3.4 / 全链路 |
| 渲染层 IPC 不存在返回完整 Key 接口；内存/日志无法还原明文 | 3.3 |
| dry-run 预览 100% 覆盖每个路径变更 | 5.3 |
| 任意归档可在重启后经账本完整撤销 | 5.5 |
| 低置信度 100% 进待定箱，不产生自动移动建议 | 4.1 / 4.2 |
| 账本可导出 JSON | 5.5 |

---

## Self-Review 结论

- **Spec 覆盖**：M1–M6 六大模块、§12 九步顺序、§7 MVP 范围、§9 验收标准均已映射到 Task；§8 非目标（删除/跨盘/云同步/内置额度/自动移动/规则 DSL/OCR/多 Agent/移动端）在 Global Constraints 与 ACL/执行器 Task 中显式排除。
- **占位符扫描**：无 TBD/TODO；每个 Task 有明确文件、接口签名、测试步骤与提交信息。
- **类型一致性**：`OperationPlan`、`LLMClient.chat`、`window.sift.*` channel 名统一由 `shared/ipc-contract.ts` 承载，前后文引用一致。
- **Review Focus**：5 条失败模式均有对应 Task 内测试（2.2 / 3.1 / 5.2 / 5.4）。
- **开放决策**：D1（包管理器）、D2（PDF 抽取库）、D3（本地 embedding 方案）需实施前拍板，已列入"开放决策点"。
