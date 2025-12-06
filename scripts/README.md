# 脚本工具说明 (Scripts Documentation)

本目录包含用于维护和管理 XRCrawler 系统的实用脚本。

## 🚨 紧急维护脚本 (Emergency Maintenance)

### `reset-queue.sh` - 队列重置脚本

**用途**: 紧急情况下清空所有任务队列并重启 worker

**使用场景**:
- 系统出现大量卡住的任务
- 需要完全重置任务队列
- Worker 进程异常需要重启

**使用方法**:
```bash
# 交互式确认（推荐）
./scripts/reset-queue.sh

# 跳过确认，直接执行
./scripts/reset-queue.sh --force
```

**⚠️ 警告**: 此操作会删除所有待处理和正在运行的任务！

---

### `force-cancel-job.ts` - 强制取消单个任务

**用途**: 当 UI 取消按钮无效时，强制取消指定任务

**使用场景**:
- UI 取消按钮点击后任务仍在运行
- 任务卡在 `active` 状态无法取消
- 需要立即中断某个特定任务

**使用方法**:
```bash
# 取消任务 ID 为 14 的任务
bun run scripts/force-cancel-job.ts 14

# 跳过数据库更新（仅清理 Redis）
bun run scripts/force-cancel-job.ts 14 --skip-db
```

**功能**:
1. 设置 Redis 取消标记（立即生效）
2. 从队列中移除任务
3. 更新 PostgreSQL 状态为 `failed`

---

### `cleanup-stuck-jobs.ts` - 批量清理卡住的任务

**用途**: 批量清理已取消或卡住的任务

**使用场景**:
- 系统异常后残留大量卡住的任务
- 定期清理已取消但未清理的任务
- 需要批量处理多个任务

**使用方法**:
```bash
# 只清理已标记为取消的任务（推荐）
bun run scripts/cleanup-stuck-jobs.ts

# 强制清理所有活跃任务（危险）
bun run scripts/cleanup-stuck-jobs.ts --force

# 预览模式：只查看，不执行清理
bun run scripts/cleanup-stuck-jobs.ts --dry-run

# 跳过数据库更新
bun run scripts/cleanup-stuck-jobs.ts --skip-db

# 组合使用
bun run scripts/cleanup-stuck-jobs.ts --force --dry-run
```

**功能**:
1. 扫描所有活跃任务
2. 识别已取消或卡住的任务
3. 从 Redis 队列中移除
4. 清理取消标记
5. 更新 PostgreSQL 状态

---

## 🧹 维护脚本 (Maintenance Scripts)

### `cleanup-outputs.sh` - 清理输出文件

**用途**: 清理旧的 Reddit 抓取结果，保留最新的运行记录

**使用方法**:
```bash
./scripts/cleanup-outputs.sh
```

**功能**:
- 删除所有废弃的 `scraped_*` 目录
- 保留最新的 2 个 `run-*` 目录
- 自动统计和报告清理结果

---

## 📊 分析脚本 (Analysis Scripts)

### `check-user-stats.ts` - 检查用户统计

**用途**: 检查 Twitter 用户的统计信息

### `analyze-scraped-tweets.ts` - 分析抓取的推文

**用途**: 分析已抓取的推文数据

### `fetch-api-ids.ts` - 获取 API ID

**用途**: 从 Twitter API 获取用户 ID

---

## 🔧 工具脚本 (Utility Scripts)

### `clean-cookies.ts` - 清理 Cookie

**用途**: 清理无效的 Cookie 文件

### `create-output-dir.ts` - 创建输出目录

**用途**: 创建输出目录结构

### `test-proxy.ts` - 测试代理

**用途**: 测试代理服务器连接

---

## 📝 使用建议

### 正常情况下的任务取消

1. **优先使用 UI**: 在 Web 界面点击 "Cancel" 按钮
2. **检查任务状态**: 等待几秒后刷新页面查看状态
3. **如果无效**: 使用 `force-cancel-job.ts` 强制取消

### 系统异常处理流程

1. **检查任务状态**: 查看 Dashboard 了解当前任务情况
2. **尝试批量清理**: 运行 `cleanup-stuck-jobs.ts --dry-run` 预览
3. **执行清理**: 确认后运行 `cleanup-stuck-jobs.ts`
4. **如果仍无效**: 使用 `reset-queue.sh` 完全重置（最后手段）

### 定期维护

建议定期运行：
- `cleanup-stuck-jobs.ts` - 清理残留任务（每周）
- `cleanup-outputs.sh` - 清理旧输出文件（每月）

---

## ⚠️ 注意事项

1. **备份数据**: 在执行清理操作前，确保重要数据已备份
2. **确认操作**: 使用 `--dry-run` 预览操作结果
3. **生产环境**: 在生产环境使用前，先在测试环境验证
4. **日志记录**: 所有脚本都会输出详细日志，便于追踪问题

---

## 🔗 相关文档

- [架构文档](../docs/ARCHITECTURE.md)
- [故障排除指南](../docs/TROUBLESHOOTING_GUIDE.md)
- [数据库文档](../docs/DATABASE.md)

