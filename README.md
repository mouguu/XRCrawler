# XRCrawler

> AI-powered Twitter/X & Reddit archiver with queue workers, live SSE telemetry, and WASM acceleration.

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3+-f472b6)](https://bun.sh/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-blue)](https://www.docker.com/)
[![Redis](https://img.shields.io/badge/Redis-Queue-red)](https://redis.io/)
[![WASM](https://img.shields.io/badge/WASM-Rust-orange)](https://webassembly.org/)

---

## 🖥️ Web UI

<p align="center">
  <img src="docs/images/web-ui-screenshot.png" alt="XRCrawler Web UI" width="100%" />
</p>

**Modern, minimalist interface** inspired by [Paradigm.xyz](https://paradigm.xyz) design principles:

- **📊 Platform Selector** — Choose between Profile, Thread, Search, or Reddit modes with intuitive cards
- **⚡ Real-time Dashboard** — Monitor active jobs with live progress, logs, and SSE streaming
- **🔐 Session Manager** — Upload and manage multiple cookie files with custom naming
- **🎯 Smart Configuration** — GraphQL API-only / Puppeteer modes, automatic search fallback, session rotation, date chunking

---

## ✨ Highlights

- **Break the ~800 tweet wall**: Intelligent session rotation + **automatic search mode fallback** for deep timelines (up to 1000+ tweets). When Timeline API hits its depth limit (~800 tweets), automatically switches to Search API (`from:username until:date`) to continue scraping older tweets.
- **API-only mode**: Pure GraphQL API scraping without browser overhead. Fast, lightweight, and perfect for large-scale operations. Automatically enabled when using GraphQL mode.
- **Smart Session Rotation**: Automatic session switching on timeouts, rate limits, or API errors. Intelligently rotates through available sessions to maximize success rate.
- **Rust/WASM micro-kernel**: Fast, low-memory dedupe/normalization; LLM-ready Markdown export.
- **Modern Web UI**: Real-time SSE streaming, live progress/logs, one-click **Download .md**, with **database-backed session management** (upload, rename, delete sessions).
- **Queue-first architecture**: BullMQ on Redis; workers publish progress/logs via Pub/Sub, server streams to `/api/job/:id/stream`.
- **Multi-platform**: Twitter/X + Reddit, all in TypeScript with plugin-style adapters.
- **Advanced Anti-Detection**: Multi-layer protection with fingerprint spoofing, human behavior simulation, and smart proxy rotation.

---

## 🚀 Advanced Features

### Automatic Search Mode Fallback

When scraping user timelines, XRCrawler intelligently handles Twitter/X API depth limits:

1. **Timeline API Mode** (default): Fast GraphQL API scraping, typically gets ~800 tweets
2. **Automatic Detection**: When Timeline API returns 0 tweets but cursor exists, system detects the limit
3. **Smart Session Rotation**: Tries different sessions first (up to 4 sessions) to maximize timeline depth
4. **Search Mode Fallback**: If session rotation doesn't help, automatically switches to Search API using `from:username until:date` queries
5. **Seamless Continuation**: Continues scraping older tweets beyond the ~800 limit, potentially reaching 1000+ tweets

**Example Flow:**
```
Timeline API: 831 tweets → Session rotation (tries 4 sessions) → Search API: from:username until:2025-11-14 → +40 more tweets = 871 total
```

### GraphQL Mode

XRCrawler supports **GraphQL API scraping** with two different approaches:

#### For Timeline/Profile Scraping (API-Only)
- **Fast & Lightweight**: Direct Axios HTTP requests, no browser launch, minimal memory usage
- **True API-only**: Pure GraphQL API calls without browser overhead
- **Session Management**: Database-backed session storage with automatic rotation
- **Rate Limit Handling**: Smart retry logic with session switching on errors

#### For Search Queries (Passive Interception)
- **Browser-based interception**: Uses browser to navigate and intercept GraphQL responses
- **More reliable**: Bypasses TLS fingerprint detection and other protections
- **Still efficient**: Intercepts clean JSON responses (no DOM parsing)
- **Note**: Search queries require browser even in GraphQL mode due to Twitter's protections

**When to use GraphQL mode:**
- ✅ Timeline/Profile scraping (true API-only, fastest)
- ✅ Search queries (passive interception, most reliable)
- ✅ Large-scale scraping (1000+ tweets)
- ✅ Production environments

**When to use Puppeteer mode:**
- ✅ Need to scrape protected/private accounts
- ✅ Complex interactions (likes, retweets)
- ✅ When you need full browser control

### Smart Session Rotation

Automatic session switching on:
- ⚡ **Timeouts**: API requests stuck >35 seconds
- 🚫 **Rate Limits**: 429 errors or rate limit headers
- 🔐 **Auth Errors**: 401/403 authentication failures
- 🌐 **Network Errors**: Connection resets, socket hang ups
- 📊 **Empty Responses**: 0 tweets with cursor (possible API boundary)

**Rotation Strategy:**
- Tries up to 4 different sessions before giving up
- Tracks attempted sessions to avoid redundant switches
- Resets error counters on successful session switch
- Falls back to search mode if all sessions exhausted

---

## 🛡️ Anti-Detection System

XRCrawler features a **comprehensive anti-detection system** with three layers of protection:

### Layer 1: Fingerprint Spoofing 🎭

| Feature                 | Description                                       |
| ----------------------- | ------------------------------------------------- |
| **Canvas Fingerprint**  | Noise injection to randomize canvas rendering     |
| **WebGL Fingerprint**   | GPU vendor/renderer spoofing (NVIDIA, AMD, Intel) |
| **Audio Fingerprint**   | Subtle noise added to AudioContext processing     |
| **Hardware Spoofing**   | Device memory, CPU cores, touch points            |
| **Timezone & Language** | Customizable timezone and language settings       |
| **Webdriver Detection** | Hidden automation traces                          |

### Layer 2: Human Behavior Simulation 🤖→🧑

| Feature                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| **Bezier Mouse Movement** | Natural curved mouse paths, not straight lines       |
| **Typing Patterns**       | Variable speed, occasional typos, punctuation pauses |
| **Scrolling Behavior**    | Gradual scrolling with random pauses (like reading)  |
| **Random Delays**         | Gaussian-distributed delays between actions          |
| **Rest Periods**          | Probability-based breaks during long sessions        |

### Layer 3: Smart Proxy Management 🔄

| Feature                   | Description                                         |
| ------------------------- | --------------------------------------------------- |
| **Intelligent Selection** | Prioritizes proxies by success rate + response time |
| **Auto-Rotation**         | Switches on rate limits or consecutive failures     |
| **Cooldown Mechanism**    | Failed proxies recover after cooling period         |
| **Health Monitoring**     | Real-time stats and health reports                  |
| **Session Affinity**      | Consistent proxy per session (preserves cookies)    |

### Detection Levels

Configure protection intensity based on your needs:

```typescript
import { AntiDetection } from "./core/anti-detection";

const ad = new AntiDetection({ level: "high" }); // 'low' | 'medium' | 'high' | 'paranoid'
await ad.prepare(page, "sessionId");
```

| Level      | Basic FP | Advanced FP | Human Behavior      | Use Case                 |
| ---------- | -------- | ----------- | ------------------- | ------------------------ |
| `low`      | ✓        | ✗           | ✗                   | Testing, trusted targets |
| `medium`   | ✓        | ✓           | ✗                   | Normal scraping          |
| `high`     | ✓        | ✓           | ✓ (fast)            | **Recommended**          |
| `paranoid` | ✓        | ✓           | ✓ (slow, realistic) | High-security targets    |

---

## ⚡ Performance (Powered by Bun)

Migrated from Node.js to Bun for **blazing fast performance**:

| Metric              | Before (Node.js) | After (Bun)          | Improvement                  |
| ------------------- | ---------------- | -------------------- | ---------------------------- |
| **Package Install** | ~30s             | **5.59s**            | 🚀 **5.4x faster**           |
| **Startup Time**    | ~3s              | **Instant**          | ⚡ **No compilation needed** |
| **Memory Usage**    | 400MB            | **~120MB**           | 💾 **70% reduction**         |
| **Dev Experience**  | Compile first    | **Run .ts directly** | 🎯 **Zero config**           |

> **Why Bun?** Native TypeScript support, faster package manager, lower memory footprint, and full Node.js compatibility.

---

## 🧰 Requirements

- **Bun** 1.3+ (replaces Node.js + pnpm for blazing fast performance)
- **Redis** on `localhost:6379` (for queue + SSE pub/sub)
- **PostgreSQL** 14+ (for data persistence, session management, and resume capabilities)

**Using Docker Compose?** All services (Redis + PostgreSQL) are included.

**Session Management**: Sessions are now stored in PostgreSQL database (not just files). Upload cookies via Web UI or use the session management API.

---

## 🚀 Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/mouguu/XRCrawler.git
cd XRcrawler

# Sessions are managed via Web UI or API (stored in PostgreSQL)
# You can also place cookie files in data/cookies/ for automatic import
mkdir -p data/cookies
# Export cookies via EditThisCookie or DevTools → Upload via Web UI at http://localhost:5001

# One command to rule them all
docker compose up -d --build
```

Open **http://localhost:5001** — everything included (PostgreSQL, Redis, Server, Worker, Prisma Studio).

**Access Points**:

- 🌐 **Web UI**: http://localhost:5001
- 📊 **Queue Monitor**: http://localhost:5001/queue-monitor.html
- 🗄️ **Prisma Studio**: http://localhost:5555 (Database GUI)

```bash
docker compose logs -f app worker  # View logs
docker compose ps                   # Check status
```

---

### Local Development (Alternative)

```bash
bun install                 # Installs deps + builds WASM (5s!)
bun run install:frontend    # Frontend deps

# Requires: Redis + PostgreSQL running locally
docker compose up -d postgres redis  # Or use your own

bunx prisma db push         # Push schema
bun run dev                 # Start all services
```

Access at **http://localhost:5001** | Queue Dashboard: `/admin/queues`

---

## 🛠️ CLI Usage

No build required - Bun runs TypeScript directly!

```bash
# Twitter Profile
bun run cmd/cli.ts twitter -u elonmusk -c 50

# Twitter Thread
bun run cmd/cli.ts twitter --thread https://x.com/user/status/123456

# Twitter Search
bun run cmd/cli.ts twitter --query "climate change" -c 100

# Reddit
bun run cmd/cli.ts reddit -r programming -c 500
```

---

## 📚 Documentation

Essential documentation for using and configuring XRCrawler:

| Document                          | Description                                          |
| --------------------------------- | ---------------------------------------------------- |
| [**API_REFERENCE.md**](docs/API_REFERENCE.md) | REST API endpoints documentation                     |
| [**CONFIGURATION.md**](docs/CONFIGURATION.md) | Configuration system guide (ConfigManager, env vars) |
| [**DATABASE.md**](docs/DATABASE.md) | PostgreSQL schema and Prisma repositories            |

---

## 🔌 Realtime Pipeline

**How live progress works**:

1. **BullMQ** enqueues jobs
2. **Worker** processes jobs and publishes:
   - `job:{id}:progress` (current/total)
   - `job:{id}:log` (info/warn/error messages)
   - Via **Redis Pub/Sub**
3. **Server** streams via **SSE** at `/api/job/:id/stream`
4. **Frontend** renders live progress/logs; on completion shows **Download .md**

If SSE payload lacks `downloadUrl`, UI fetches `/api/job/{id}` as fallback.

---

## 🧩 Platform Adapter System

XRCrawler uses a **plugin-style architecture** for multi-platform support:

- **Core worker** dispatches by platform name via adapters (`core/platforms/*-adapter.ts`)
- **Direct imports** in `core/queue/worker.ts` (explicit switch case for type safety)
- **Contract**: `PlatformAdapter.process(job, ctx)` → `ScrapeJobResult`
  - Optional: `init()`, `classifyError()`
- **Shared types**: `core/platforms/types.ts`

**Existing platforms**:

- ✅ Twitter/X (`twitter-adapter.ts`)
- ✅ Reddit (`reddit-adapter.ts`)

**To add a new platform**:

1. Create `core/platforms/yourplatform-adapter.ts`
2. Implement `PlatformAdapter` interface
3. Import and add to switch case in `core/queue/worker.ts`:
   ```typescript
   import { yourPlatformAdapter } from '../platforms/yourplatform-adapter';
   // ... in process function:
   } else if (type === 'yourplatform') {
     if (yourPlatformAdapter.init) await yourPlatformAdapter.init();
     result = await yourPlatformAdapter.process(job.data, ctx);
   }
   ```
4. Pass `job.data.type = 'yourplatform'` from API

---

## 📂 Output Layout

```
output/
├── x/{username}/run-{timestamp}/
│   ├── index.md           # Human-readable summary
│   ├── tweets.json        # Full raw data
│   ├── tweets.md          # All tweets in Markdown
│   ├── metadata.json      # Run statistics
│   └── ai-persona.txt     # LLM analysis prompt (auto-generated)
└── reddit/{subreddit}/run-{timestamp}/
    ├── {post-title}.md      # Single post: uses post title as filename
    └── index.md              # Multiple posts: summary with links
        # Individual posts saved as: {number}-{post-title}.md
```

---

## 🧪 Development

### Run Tests

```bash
# Backend tests (bun:test)
bun test                              # 389 tests across 39 files (~50s)

# Frontend tests (vitest)
cd frontend && bun run test           # 16 tests across 4 files
```

| Suite                | Tests   | Coverage                               |
| -------------------- | ------- | -------------------------------------- |
| Backend (`bun:test`) | 389     | Core, utils, platforms, anti-detection |
| Frontend (`vitest`)  | 16      | Components, integration                |
| **Total**            | **405** | ✅ All passing                         |

### Lint & Type Check

### Lint & Check

```bash
bun run check         # Run Biome check (Lint + Format)
bun run lint          # Run Biome lint
```

### Format Code

```bash
bun run format        # Auto-format all code with Biome
```

### Build WASM (if editing Rust)

```bash
bun run build:wasm:all
```

---

## 🧭 Troubleshooting

### No live logs/progress in UI

- **Check Redis**: Ensure Redis is running on `localhost:6379`
- **Inspect Network**: Watch `/api/job/{id}/stream` events in DevTools

### Download button missing URL

- Click **"Get Download"** (fetches `/api/job/{id}`)
- Ensure worker sets `downloadUrl` in job result

### Redis connection errors

- Verify Redis host/port in configuration
- Default: `localhost:6379`
- Set via env: `REDIS_HOST=yourhost REDIS_PORT=6379`

### TypeScript compilation errors

```bash
bun run lint  # Check for type errors
```

### WASM build errors

```bash
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Rebuild WASM
bun run build:wasm:all
```

---

## 🗂️ Project Structure

```
XRcrawler/
├── cmd/                    # Entry points
│   ├── cli.ts             # CLI application
│   ├── start-server.ts    # API server
│   └── start-worker.ts    # Queue worker
├── core/                   # Core business logic
│   ├── scrape-unified.ts  # Main scraping API
│   ├── platforms/         # Platform adapters
│   └── queue/             # BullMQ workers
├── frontend/               # React UI (Vite)
├── utils/                  # Utilities
├── types/                  # Shared TypeScript types
├── wasm/                   # Rust/WASM modules
│   ├── tweet-cleaner/
│   ├── reddit-cleaner/
│   └── url-normalizer/
├── docs/                   # Documentation
└── config/                 # Constants and config
```

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Code style guidelines (EditorConfig, Biome)
- Testing requirements
- Pull request process

---

## 🛠️ Tech Stack

### Backend

| Technology                                            | Purpose                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| **[Bun](https://bun.sh/) 1.3+**                       | Ultra-fast JavaScript runtime with native TypeScript support          |
| **[TypeScript](https://www.typescriptlang.org/) 5.9** | Type-safe JavaScript                                                  |
| **[Hono](https://hono.dev/)**                         | Ultrafast web framework for the Edge (Express replacement)            |
| **[BullMQ](https://docs.bullmq.io/)**                 | Redis-backed job queue with retries, backoff, and concurrency control |
| **[Prisma](https://www.prisma.io/) 7.1**              | Type-safe ORM for PostgreSQL                                          |
| **[Puppeteer](https://pptr.dev/)**                    | Headless Chrome for dynamic content scraping                          |

### Database & Cache

| Technology                                       | Purpose                                                      |
| ------------------------------------------------ | ------------------------------------------------------------ |
| **[PostgreSQL](https://www.postgresql.org/) 15** | Persistent storage for jobs, tweets, checkpoints, error logs |
| **[Redis](https://redis.io/) 7**                 | Job queue, Pub/Sub for real-time SSE, caching                |

### Frontend

| Technology                                          | Purpose                                   |
| --------------------------------------------------- | ----------------------------------------- |
| **[React](https://react.dev/) 19**                  | UI components                             |
| **[Vite](https://vitejs.dev/)**                     | Fast dev server and build tool            |
| **[TypeScript](https://www.typescriptlang.org/)**   | Type-safe frontend code                   |
| **[Tailwind CSS](https://tailwindcss.com/)**        | Utility-first CSS framework               |
| **[shadcn/ui](https://ui.shadcn.com/)**             | High-quality accessible component library |
| **[Framer Motion](https://www.framer.com/motion/)** | Smooth animations and transitions         |

### Performance (Rust/WASM)

| Module               | Purpose                                    |
| -------------------- | ------------------------------------------ |
| **`tweet-cleaner`**  | Fast tweet deduplication and normalization |
| **`reddit-cleaner`** | Reddit post/comment cleaning               |
| **`url-normalizer`** | URL canonicalization for dedup             |

> Built with Rust + `wasm-pack`, compiled to WebAssembly for near-native performance in Bun runtime.

### DevOps

| Technology                                             | Purpose                       |
| ------------------------------------------------------ | ----------------------------- |
| **[Docker](https://www.docker.com/)**                  | Containerization              |
| **[Docker Compose](https://docs.docker.com/compose/)** | Multi-container orchestration |
| **Custom Queue Monitor**                               | Built-in queue monitoring UI  |
| **[Prisma Studio](https://www.prisma.io/studio)**      | Database GUI                  |

### Architecture Patterns

- **Queue-first design**: All scraping jobs go through BullMQ for reliability
- **Event-driven**: Redis Pub/Sub for real-time progress streaming via SSE
- **Platform adapters**: Plugin architecture for multi-platform support
- **Rescue-capable**: Checkpoints saved to PostgreSQL for crash recovery
- **Error classification**: Smart retry strategies based on error types

### 🧑‍💻 Best-in-Class DX

We prioritize developer happiness with a modern, fast toolchain:

| Tool                                                     | Benefit                                                                   |
| :------------------------------------------------------- | :------------------------------------------------------------------------ |
| **[Biome](https://biomejs.dev/)**                        | Instant linting & formatting (replaced Prettier/ESLint)                   |
| **[Lefthook](https://github.com/evilmartians/lefthook)** | Fast, parallel Git hooks ensuring code quality on commit                  |
| **Typed Env**                                            | `core/env.ts` with **Zod** validation for type-safe environment variables |
| **Path Aliases**                                         | Clean imports via `@/core/*` and `@/utils/*`                              |

---

## 📜 License

ISC - See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built with:

- [Bun](https://bun.sh/) - Blazing fast JavaScript runtime
- [BullMQ](https://github.com/taskforcesh/bullmq) - Robust queue system
- [Puppeteer](https://pptr.dev/) - Browser automation
- [Redis](https://redis.io/) - Fast data store
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [Rust/WASM](https://www.rust-lang.org/what/wasm) - High-performance data processing
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) - Frontend
