# Sift

> 本地优先的文件整理桌面应用。把下载文件夹从「一次性整理」变成「持续可理解、可检索、可审计」的整理系统。

Sift 是一个 Electron + Next.js 桌面应用。**默认不移动任何文件**：它先建立语义索引与虚拟视图，物理归档是用户显式发起的可选动作，全程可审计、可撤销。

AI 能力由**用户自带的 API Key** 提供。应用不代理、不转售、不内置任何模型额度。未配置 Key 时，索引、虚拟视图、手动标签、归档、账本等核心功能完全可用，仅「自动生成建议」不可用。

---

## 功能

- **增量监听 + 纠正反馈学习**：授权下载目录后，新文件落地自动进入待整理队列；每次用户「接受 / 改到别的分类 / 拒绝」都会写入反馈，影响后续同类文件的建议。
- **虚拟整理层**：对文件打语义标签，提供按标签与语义搜索的虚拟视图，文件物理位置不变。
- **置信度分层**：高置信度进「建议区」、中置信度进「待确认区」、低置信度进「待定箱」，每条建议附带可解释理由。
- **可审计账本 + 条件撤销**：每次物理操作写入 append-only 账本，支持单条撤销、按批次撤销、按条件撤销，应用重启后仍可回滚。
- **安全执行器**：模型只输出结构化计划，文件操作由主进程确定性执行器完成；强制路径 ACL、禁用删除、默认 dry-run。
- **多 Provider 密钥管理**：支持 OpenAI / DeepSeek / Groq / 自定义 OpenAI 兼容端点；API Key 经 `safeStorage` 加密后仅存于主进程，渲染层零明文。

---

## 技术栈

- Electron 45 + Next.js 16（App Router，standalone）+ TypeScript 5.9
- SQLite（`better-sqlite3`，WAL 模式）
- 文件监听：`chokidar`
- 内容抽取：PDF / 文本
- 检索：SQLite FTS5
- 测试：Vitest

---

## 环境要求

- Node.js ≥ 20（开发使用 Node 24）
- npm ≥ 10
- 原生模块 `better-sqlite3` 需要在本机编译；Windows 上建议使用 Visual Studio Build Tools

---

## 安装与运行

```bash
# 安装依赖
npm install

# 开发模式（构建 renderer + main，然后启动 Electron）
npm run dev

# 生产构建
npm run build
# 产物：.next/standalone（renderer）+ dist-electron/（main.cjs / preload.cjs）

# 类型检查
npm run typecheck

# 运行测试
npm test
```

首次启动后，在欢迎页点击「选择目录」授权一个文件夹，Sift 会做**只读索引**（不移动任何文件）。随后可在「设置」中配置 AI Provider，也可跳过。

---

## AI Provider 配置（可选）

Sift 支持 4 类 Provider（OpenAI 兼容协议）：

| Provider | 默认 Base URL | 默认模型 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| 自定义 | 用户填写 | 用户填写 |

在「设置 → AI Provider」中填写 API Key（密码掩码），可点「测试连接」验证。已配置时只显示 `已配置 · sk-...xxxx`（尾 4 位）。

**安全保证**：API Key 经 Electron `safeStorage` 加密后存储在主进程侧；渲染层（页面 JavaScript）永远拿不到明文；所有模型调用由主进程发起。详见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) 第 4 条。

未配置 Key 时，应用顶部显示可关闭提示条「未配置 AI，自动建议已关闭」，其余功能不受影响。

---

## 页面

| 路由 | 功能 |
|---|---|
| `/` | 欢迎 / 授权目录 / 健康状态 |
| `/inbox` | 建议区（高置信度，可批量接受） |
| `/to-confirm` | 待确认区（中置信度，勾选后确认） |
| `/pending` | 待定箱（低置信度，指定标签或忽略） |
| `/library` | 虚拟视图（标签分组 + 搜索） |
| `/archive/preview` | 归档 dry-run 预览 |
| `/ledger` | 操作账本（撤销 / 导出 JSON） |
| `/settings` | 设置（目录 / 阈值 / Provider / 隐私） |

---

## 隐私

- 文件内容索引、向量、操作日志全部本地存储（SQLite，位于 `app.getPath('userData')/sift.db`）。
- 只有用户触发分析时，必要的文本片段才会发给用户自己配置的 Provider。
- Sift 不中转、不代理、不内置任何模型额度。

---

## 环境变量

参见 [`.env.example`](.env.example)。主进程启动 Next.js standalone 子进程时可设置一次性启动令牌 `SIFT_STARTUP_TOKEN`（可选，不设则每次启动自动生成随机令牌）。

---

## 开发约定

- 分支：`feature/*` / `fix/*`，`main` 受保护。
- 提交信息遵循 Conventional Commits。
- 测试先行（TDD），核心逻辑必须有单元测试，IPC/执行器有集成测试。

## 许可证

私有项目（`private: true`），暂未开源。
