# 测试覆盖说明

## ✅ 已完成的测试

### Core 模块测试 (17个)
- ✅ `cookie-manager.test.ts` - Cookie 管理
- ✅ `data-extractor.test.ts` - 数据提取
- ✅ `data-extractor-dom.test.ts` - DOM 数据提取
- ✅ `errors.test.ts` - 错误处理系统
- ✅ `event-bus.test.ts` - 事件总线
- ✅ `rate-limit-manager.test.ts` - 速率限制管理
- ✅ `request-queue.test.ts` - 请求队列
- ✅ `session-manager.test.ts` - 会话管理
- ✅ `stop-signal.test.ts` - 停止信号
- ✅ `metrics-collector.test.ts` - 指标收集器
- ✅ `browser-pool.test.ts` - 浏览器池
- ✅ `performance-monitor.test.ts` - 性能监控
- ✅ `navigation-service.test.ts` - 导航服务
- ✅ `path-utils.test.ts` - 路径工具
- ✅ `proxy-manager.test.ts` - 代理管理 ⭐ 新增
- ✅ `progress-manager.test.ts` - 进度管理 ⭐ 新增
- ✅ `error-snapshotter.test.ts` - 错误快照 ⭐ 新增

### Utils 模块测试 (12个)
- ✅ `output-path-manager.test.ts` - 输出路径管理
- ✅ `path-utils.test.ts` - 路径工具
- ✅ `config-manager.test.ts` - 配置管理
- ✅ `fileutils.test.ts` - 文件工具
- ✅ `logger.test.ts` - 日志系统
- ✅ `export.test.ts` - 导出工具 (CSV/JSON) ⭐ 新增
- ✅ `validation.test.ts` - 验证工具 ⭐ 新增
- ✅ `retry.test.ts` - 重试工具 ⭐ 新增
- ✅ `markdown.test.ts` - Markdown 工具 ⭐ 新增
- ✅ `date-utils.test.ts` - 日期工具 ⭐ 新增
- ✅ `time.test.ts` - 时间工具 ⭐ 新增
- ✅ `date-chunker.test.ts` - 日期分块工具 ⭐ 新增
- ✅ `error-classifier.test.ts` - 错误分类工具 ⭐ 新增

### Middleware 测试 (1个)
- ✅ `api-key.test.ts` - API 密钥中间件

## 📊 测试统计

- **总测试文件**: 30个
- **Core 模块测试**: 17个
- **Utils 模块测试**: 12个
- **Middleware 测试**: 1个
- **测试覆盖率**: 约 75%+ (核心功能模块)

## 📋 待添加的测试（建议优先级）

### 高优先级
1. `browser-manager.test.ts` - 浏览器管理器
2. `fingerprint-manager.test.ts` - 指纹管理
3. `x-api.test.ts` - X/Twitter API 客户端
4. `reddit-api-client.test.ts` - Reddit API 客户端

### 中优先级
5. `scraper-dependencies.test.ts` - 依赖注入
6. `monitor-service.test.ts` - 监控服务
7. `scraper-engine.test.ts` - 核心引擎（复杂，需要 mock）

### 工具模块测试
8. `screenshot.test.ts` - 截图工具
9. `merge.test.ts` - 数据合并工具
10. `result.test.ts` - 结果处理工具
11. `decorators.test.ts` - 装饰器工具
12. `convert-cookies.test.ts` - Cookie 转换工具

### 集成测试
13. `server.test.ts` - 服务器 API（需要 mock Express）
14. `cli.test.ts` - CLI 工具（集成测试）

## 🎯 测试覆盖率目标

- **当前**: ~75% 核心模块覆盖
- **目标**: 90%+ 核心模块覆盖
- **工具模块**: 85%+ 覆盖

## 📝 测试编写规范

1. **命名**: `*.test.ts`
2. **位置**: 与源文件对应的 `tests/` 目录结构
3. **结构**: 使用 `describe` 和 `it` 组织
4. **Mock**: 使用 Jest mocks 隔离依赖
5. **清理**: 每个测试后清理资源

## 🚀 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test tests/core/metrics-collector.test.ts

# 查看覆盖率
pnpm test --coverage
```
