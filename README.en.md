# Sift

> A local-first desktop app that turns your Downloads folder from "one-time cleanup" into a continuously understandable, searchable, and auditable organization system.

Sift is an Electron + Next.js desktop app. **By default it never moves any files**: it first builds a semantic index and virtual views, while physical archiving is an explicit, optional user action — fully auditable and undoable.

AI capabilities are powered by **your own API key**. The app does not proxy, resell, or bundle any model quota. Without a key, indexing, virtual views, manual tags, archiving, and the ledger all remain 100% functional — only "auto-generate suggestions" is unavailable.

---

## Features

- **Incremental watching + corrective feedback learning**: after authorizing a folder, new files automatically enter the intake queue; every accept / redirect / reject decision is recorded as feedback and influences future suggestions.
- **Virtual organization layer**: files get semantic tags and searchable virtual views; physical locations never change.
- **Confidence tiers**: high → Inbox, medium → To Confirm, low → Pending; every suggestion carries a human-readable reason.
- **Auditable ledger + conditional undo**: every physical operation is written to an append-only ledger; supports per-entry, per-batch, and conditional undo, across sessions.
- **Safe executor**: the model only emits a structured plan; file operations are performed by a deterministic executor in the main process with path ACL enforcement, delete disabled, and dry-run by default.
- **Multi-provider key management**: OpenAI / DeepSeek / Groq / custom OpenAI-compatible endpoints; API keys are encrypted with `safeStorage` and live only in the main process — zero plaintext in the renderer.

---

## Tech stack

- Electron 45 + Next.js 16 (App Router, standalone) + TypeScript 5.9
- SQLite (`better-sqlite3`, WAL mode)
- File watching: `chokidar`
- Content extraction: PDF / text
- Search: SQLite FTS5
- Tests: Vitest

---

## Requirements

- Node.js ≥ 20 (developed on Node 24)
- npm ≥ 10
- The native module `better-sqlite3` is compiled locally; on Windows, Visual Studio Build Tools are recommended

---

## Install & run

```bash
# Install dependencies
npm install

# Development (build renderer + main, then launch Electron)
npm run dev

# Production build
npm run build
# Outputs: .next/standalone (renderer) + dist-electron/ (main.cjs / preload.cjs)

# Type check
npm run typecheck

# Run tests
npm test
```

On first launch, click "Choose folder" on the welcome page to authorize a directory. Sift performs a **read-only index** (no files are moved). You can then configure an AI Provider in Settings, or skip.

---

## AI Provider configuration (optional)

Sift supports 4 provider types (OpenAI-compatible protocol):

| Provider | Default Base URL | Default model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Custom | user-provided | user-provided |

In **Settings → AI Provider**, enter your API key (password-masked) and click "Test connection". Once configured, only `configured · sk-...xxxx` (last 4 chars) is shown.

**Security guarantee**: keys are encrypted with Electron `safeStorage` and stored in the main process; the renderer never sees plaintext; all model calls originate from the main process. See [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) item 4.

Without a key, a dismissible banner "AI not configured — auto-suggestions disabled" is shown; everything else keeps working.

---

## Pages

| Route | Purpose |
|---|---|
| `/` | Welcome / authorize folder / health status |
| `/inbox` | Inbox (high confidence, batch accept) |
| `/to-confirm` | To Confirm (medium confidence, confirm selected) |
| `/pending` | Pending (low confidence, assign tag or ignore) |
| `/library` | Virtual views (tag groups + search) |
| `/archive/preview` | Archive dry-run preview |
| `/ledger` | Operation ledger (undo / export JSON) |
| `/settings` | Settings (folder / thresholds / Provider / privacy) |

---

## Privacy

- File content index, vectors, and operation logs are all stored locally (SQLite at `app.getPath('userData')/sift.db`).
- Only when the user triggers analysis are the necessary text snippets sent to the user's own configured Provider.
- Sift does not relay, proxy, or bundle any model quota.

---

## Environment variables

See [`.env.example`](.env.example). The main process can set a one-time startup token `SIFT_STARTUP_TOKEN` when launching the Next.js standalone child process (optional; a random token is generated per launch otherwise).

---

## Development conventions

- Branches: `feature/*` / `fix/*`; `main` is protected.
- Conventional Commits for messages.
- TDD: core logic has unit tests; IPC/executor have integration tests.

## License

Private project (`private: true`), not open-sourced yet.
