# Active Jobs Persistence Fix

> **Date**: 2025-12-05  
> **Issue**: Active Jobs 刷新后消失 + Cancel 按钮无效

## 🐛 问题描述

### 症状

1. 在 Dashboard 中启动爬虫任务后，刷新页面任务就消失了
2. 任务卡片显示 "connecting" 状态，无法获取进度
3. 点击 Cancel 按钮没有任何反应
4. 控制台报错 `SyntaxError: Unexpected token '<'`

### 根本原因分析

经过深入调试，发现这是**多重问题并发**导致的：

#### 1. 路由单复数不一致 (致命)

- **后端**: 路由注册为 `/api/jobs` (复数)
- **前端**: 部分请求使用 `/api/job` (单数)
- **结果**: 前端请求 404，Express 返回 HTML 错误页

```typescript
// ❌ 错误 - 前端 queueClient.ts
const response = await fetch(`/api/job/${jobId}`);

// ✅ 正确
const response = await fetch(`/api/jobs/${jobId}`);
```

#### 2. 环境配置问题 (.env)

- `.env` 文件中两个 `DATABASE_URL` 被错误地写在同一行
- 导致第一个无效的 Prisma Accelerate URL 覆盖了正确的本地配置
- 报错: `Can't reach database server`

```bash
# ❌ 错误 (两行合成一行)
DATABASE_URL="prisma+postgres://..."DATABASE_URL="postgresql://..."

# ✅ 正确
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/xrcrawler"
```

#### 3. Worker 未启动

- 只启动了 Server (`start-server.ts`)，没有启动 Worker (`start-worker.ts`)
- 任务被提交到队列，但没有进程处理
- 任务状态一直是 `waiting` 或 `prioritized`

#### 4. Cancel 功能未实现

- `worker.ts` 中的 `getShouldStop()` 方法直接返回 `false`
- 没有实际的取消机制
- 对于 active 状态的任务，`job.remove()` 会失败（Job is locked）

---

## ✅ 修复方案

### 1. 统一路由为复数形式

**修改文件**:

- `frontend/src/components/DashboardPanel.tsx`
- `frontend/src/utils/queueClient.ts`

```typescript
// DashboardPanel.tsx - Line 45
-      const res = await fetch(`/api/job/${jobId}`);
+      const res = await fetch(`/api/jobs/${jobId}`);

// queueClient.ts - Lines 84, 97, 119
-  const response = await fetch(`/api/job/${jobId}`);
+  const response = await fetch(`/api/jobs/${jobId}`);

-  const response = await fetch(`/api/job/${jobId}/cancel`, {
+  const response = await fetch(`/api/jobs/${jobId}/cancel`, {

-  const eventSource = new EventSource(`/api/job/${jobId}/stream`);
+  const eventSource = new EventSource(`/api/jobs/${jobId}/stream`);
```

### 2. 修复 .env 配置

```bash
# Database Configuration
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/xrcrawler"

# Redis Configuration
REDIS_URL="redis://localhost:6379"
```

### 3. 实现任务取消机制

**修改文件**: `core/queue/worker.ts`

```typescript
// 添加取消任务跟踪 Map
const cancelledJobs = new Map<string, number>();

export function markJobAsCancelled(jobId: string): void {
  cancelledJobs.set(jobId, Date.now());
  logger.info(`Job ${jobId} marked for cancellation`);

  // 1小时后自动清理
  setTimeout(() => {
    cancelledJobs.delete(jobId);
  }, 3600000);
}

export function isJobCancelled(jobId: string): boolean {
  return cancelledJobs.has(jobId);
}

// 更新 JobContext.getShouldStop()
getShouldStop(): boolean {
  return isJobCancelled(this.job.id || '');
}
```

**修改文件**: `server/routes/jobs.ts`

```typescript
// 导入取消函数
import { markJobAsCancelled } from "../../core/queue/worker";

// 更新 cancel endpoint
router.post("/:jobId/cancel", async (req, res) => {
  // ...
  if (state === "active") {
    // Active 任务不能直接删除，标记为取消
    markJobAsCancelled(jobId);
    return res.json({
      success: true,
      message: "Job cancellation requested. The job will stop shortly.",
    });
  }

  // Waiting/Delayed 任务可以直接删除
  await job.remove();
  // ...
});
```

---

## 📁 清理的临时文件

删除了以下调试用临时文件：

- `create-test-job.ts`
- `debug-queue.ts`
- `debug-routes.ts`
- `quick-test-jobs.ts`
- `test-api-jobs.ts`
- `test-frontend-api.html`
- `test-progress/`
- `test_output.txt`

---

## 🚀 验证步骤

1. 启动所有服务:

   ```bash
   docker-compose up -d
   ```

2. 访问 `http://localhost:5001`

3. 提交一个爬虫任务

4. **刷新页面** - 任务应该仍然显示在 Active Jobs 面板中 ✅

5. 点击 **Cancel** - 正在运行的任务应该被标记为取消 ✅

---

## 🔑 关键经验

1. **路由命名要一致** - 前后端必须使用相同的路径命名规范
2. **检查 .env 文件格式** - 确保每个配置项独占一行
3. **完整启动所有服务** - Server + Worker + Database + Redis
4. **Active 任务的取消需要特殊处理** - 不能直接 `remove()`，需要信号机制
