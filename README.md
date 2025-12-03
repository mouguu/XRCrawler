# XRCrawler

> AI-powered Twitter/X & Reddit archiver with queue workers, live SSE telemetry, and WASM acceleration.

---

## ✨ Highlights
- **Break the ~800 tweet wall**: Date chunking + resilient session rotation for deep timelines.
- **Rust/WASM micro-kernel**: Fast, low-memory dedupe/normalization; LLM-ready Markdown export.
- **Mission Control UI**: Live EventSource logs/progress, Abort/Dismiss, one-click **Download .md**, friendly session labels for `account1.json`–`account4.json` (Sistine Fibel, pretextyourmama, Shirone, Jeanne Howard).
- **Queue-first architecture**: BullMQ on Redis; workers publish progress/logs via Pub/Sub, server streams to `/api/job/:id/stream`.
- **Multi-platform**: Twitter/X + optional Reddit helper API.

---

## 🧰 Requirements
- Node.js 18+
- pnpm
- Redis on `localhost:6379` (queue + SSE)
- Python 3 (for the optional Reddit helper started by `pnpm run dev`)

---

## 🚀 Install
```bash
git clone https://github.com/mouguu/XRCrawler.git
cd XRCrawler
pnpm install
pnpm run install:frontend   # install frontend deps
```

Optional (if you edit Rust code):
```bash
pnpm run build:wasm:all
```

---

## 🍪 Configure Cookies
- Export Twitter cookies (e.g., EditThisCookie) to `cookies/account1.json`, `account2.json`, …  
- UI shows friendly labels for the first four accounts; rotation happens automatically.

---

## 🖥️ Run (Web UI)
```bash
pnpm run dev
# Opens http://localhost:5173
# Starts server, worker, frontend, and Reddit helper (auto-venv under platforms/reddit)
```
> Ensure Redis is running; otherwise progress/log streaming will be missing.

---

## 🛠️ Run (CLI)
```bash
pnpm run build
node dist/cli.js twitter -u elonmusk --mode search --deep-search --start-date 2020-01-01
```
More options: `docs/CLI_USAGE.md` (profile/thread/search, limits, date ranges, etc.).

---

## 🔌 Realtime Pipeline
1. BullMQ enqueues jobs.  
2. Worker publishes `job:{id}:progress` / `job:{id}:log` via Redis Pub/Sub.  
3. Server streams via SSE at `/api/job/:id/stream`.  
4. Mission Control renders live progress/logs; on completion shows **Download .md**.  
   If SSE payload lacks `downloadUrl`, UI fetches `/api/job/{id}` as a fallback.

---

## 📂 Output Layout
```
output/
├── x/{username}/run-{timestamp}/
│   ├── index.md        # summary / entry point
│   ├── tweets.json     # full raw data
│   ├── metadata.json   # run stats
│   └── 001-xxxx.md     # optional per-tweet markdown
```

---

## 🧭 Troubleshooting
- No live logs/progress: Check Redis; watch `/api/job/{id}/stream` events in DevTools Network.
- Download button missing URL: Click “Get Download” (fetches `/api/job/{id}`); ensure worker sets `downloadUrl`.
- Redis errors: Confirm host/port; defaults to `localhost:6379`.
- Reddit helper fails: Ensure Python 3; script creates `.venv` under `platforms/reddit`.

---

## 📜 License
ISC (see `LICENSE`).
