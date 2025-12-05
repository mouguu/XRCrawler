# 🛠️ Post-Mortem: Active Jobs Persistence & Cancellation Fix

> **任务持久化与取消功能修复报告**

| 属性         | 详情                                                                       |
| :----------- | :------------------------------------------------------------------------- |
| **日期**     | 2025-12-05                                                                 |
| **状态**     | ✅ 已修复 (Fixed)                                                          |
| **严重等级** | 🔴 Critical (影响核心业务流程)                                             |
| **涉及模块** | Frontend (React), Backend (Express), Core (BullMQ Worker), DevOps (Docker) |

---

## 1. 🚨 故障现象 (Symptoms)

在开发 `XRcrawler` 的过程中，我们遇到了一个“幽灵般”的组合 Bug，严重破坏了用户体验：

1.  **刷新即失忆 (State Amnesia)**: 用户启动爬虫任务后，只要刷新浏览器 (F5)，底部的 "Active Jobs" 列表瞬间清空，仿佛任务从未存在过。
2.  **假死状态 (Zombie State)**: 即使任务还在，状态也卡在 `connecting`，前端收不到 SSE 进度推送。
3.  **无法取消 (Unstoppable)**: 点击 "Cancel" 按钮毫无反应，后台日志显示任务被锁定 ("Job is locked")。
4.  **环境诡异**: 修改本地代码后，后端似乎完全不生效（因为 Docker 容器占用了端口）。

---

## 2. 🔍 根本原因深度剖析 (Root Cause Analysis)

这不是单一的 Bug，而是一次**“多重器官衰竭”**。

### A. API 契约断裂 ( The "Singular vs. Plural" Trap)

这是最隐蔽的错误。前后端对资源命名的约定不一致：

- **后端定义**: `app.use('/api/job', ...)` (单数)
- **前端请求**: `fetch('/api/jobs?state=active')` (复数)
- **后果**: Express 路由匹配失败，默认返回 `index.html` (404 page)。前端尝试用 `res.json()` 解析这个 HTML，导致了经典的 `SyntaxError: Unexpected token '<'`。

### B. 架构割裂：有头无身 (Headless Architecture)

我们的系统基于 **Producer-Consumer** 模型：

- **Producer (Server)**: 负责接收 HTTP 请求，生产 Job。
- **Consumer (Worker)**: 负责处理 Job，运行 Puppeteer。
- **故障点**: 我们只启动了 `start-server.ts`，却**忘记启动** `start-worker.ts`。
- **后果**: 任务被成功写入 Redis，状态为 `waiting` 或 `prioritized`，但永远不会变成 `active`，因为根本没有厨师在后厨做菜。

### C. 环境幽灵：Docker 端口冲突 (The Docker Ghost)

这是导致调试过程“鬼打墙”的元凶。

- **现象**: 我们在本地修改了路由代码，但 `curl` 测试依然报 404。
- **原因**: Docker 容器 (`OrbStack`) 在后台默默占用了 `:5001` 端口，运行着**旧版本的代码镜像**。我们本地启动的新服务实际上没能成功绑定端口（或者被挤到了其他端口）。
- **教训**: **永远不要相信你的代码没生效，先检查你的端口被谁占了。**

### D. 取消机制的逻辑漏洞 (Cancellation Logic)

BullMQ 的机制决定了 `active` 状态的任务是**被锁定**的，不能直接从外部 `remove()`。

- **旧逻辑**: 直接调用 `job.remove()` -> 报错 "Job is locked"。
- **根本原因**: 缺少一个“信号系统”来通知正在跑 `while` 循环的 Worker 停下来。

---

## 3. 🏗️ 架构修复方案 (The Fix)

### 3.1 统一路由契约 (Standardize API)

强制统一使用 RESTful 标准的**复数形式**。

**`cmd/start-server.ts` & `frontend/...`**:

```typescript
// ✅ 统一标准：资源集合使用复数
app.use("/api/jobs", jobRoutes);
```

### 3.2 实现“软取消”信号机制 (Signal-Based Cancellation)

为了安全停止正在运行的爬虫，我们在内存/Redis 中引入了一个信号量。

**流程图**:

```mermaid
sequenceDiagram
    participant User
    participant Server
    participant Redis
    participant Worker

    User->>Server: POST /api/jobs/:id/cancel
    Server->>Redis: 标记任务为 "Cancelled" (Set Flag)
    Server-->>User: 200 OK "Cancellation requested"

    loop 爬虫循环
        Worker->>Worker: 爬取一个推文
        Worker->>Redis: check cancellation flag?
        alt Is Cancelled?
            Redis-->>Worker: Yes
            Worker->>Worker: 停止循环，清理浏览器资源
            Worker->>Redis: 更新状态为 Failed/Cancelled
        end
    end
```

**核心代码 (`core/queue/worker.ts`)**:

```typescript
// 简单的内存标记实现（生产环境建议用 Redis）
const cancelledJobs = new Map<string, number>();

export function markJobAsCancelled(jobId: string) {
    cancelledJobs.set(jobId, Date.now());
}

// 在 ScraperEngine 内部循环中调用
getShouldStop(): boolean {
    return cancelledJobs.has(this.job.id);
}
```

### 3.3 修正环境配置 (Config Hygiene)

修复了 `.env` 文件中致命的格式错误：

```ini
# ❌ 错误：两行配置挤在了一起，导致解析失败
DATABASE_URL="...prisma..."DATABASE_URL="postgresql://..."

# ✅ 修正
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/xrcrawler"
REDIS_URL="redis://localhost:6379"
```

---

## 4. 🚀 验证与测试 (Verification)

为了确保修复有效，我们执行了全链路测试：

1.  **冷启动测试**:
    - `docker-compose down` (彻底清除旧容器)
    - `docker-compose up -d` (重新构建并启动 Server + Worker)
2.  **持久化验证**:
    - 提交任务 -> 刷新页面 -> **任务依然存在且进度条在走** ✅
3.  **取消验证**:
    - 任务运行中 -> 点击 Cancel -> **进度条停止，状态变为 Failed/Cancelled** ✅
4.  **日志验证**:
    - Worker 日志显示: `Job xyz marked for cancellation` -> `Browser closed successfully` ✅

---

## 5. 💡 经验教训与未来建议 (Lessons Learned)

### 这里的坑，下次别踩：

1.  **开发环境隔离**: 在本地调试 API 时，**务必先杀死 Docker 容器**。推荐使用“混合开发模式”：Docker 只跑 Redis/Postgres，本地终端跑 Node/Bun 代码。
2.  **API 命名规范**: 团队（或个人）必须制定 API 命名规范（推荐全复数），并在代码 Review 阶段严格执行。
3.  **Worker 意识**: 在微服务/队列架构中，永远记得**Server 只是前台，Worker 才是干活的**。Debug 时要同时看两个终端的日志。

### 技术栈升级建议 (Future Tech Stack)：

考虑到我们正在迁移到 **Bun**，强烈建议未来将 Express 替换为 **Hono**。

- **理由**: Hono 支持 **RPC (Remote Procedure Call)**。
- **效果**: 前端代码可以直接引用后端的类型定义。如果你后端写了 `/job`，前端写 `/jobs`，**IDE 会直接标红报错**，根本不需要等到运行时才发现 404。这能从根源上消灭此类 Bug。

---

> **文档维护者**: XRCrawler Dev Team
> **最后更新**: 2025-12-05
