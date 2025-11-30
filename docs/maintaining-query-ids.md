# Query ID 维护指南

## 概述

Twitter/X 的 GraphQL API 使用 **Query ID** 来标识不同的操作。这些 ID 会定期轮换（几周到几个月），当 ID 过期时会导致 `400 Bad Request` 错误。

## 当前使用的 Query IDs

| 操作端点              | Query ID                 | 最后更新   | 位置                      |
| --------------------- | ------------------------ | ---------- | ------------------------- |
| `TweetResultByRestId` | `kLXoXTloWpv9d2FSXRg-Tg` | 2025-11-29 | `config/constants.ts:319` |
| `UserByScreenName`    | `G3KGOASz96M-Qu0nwmGXNg` | -          | `config/constants.ts:302` |
| `UserTweets`          | `lZRf8IC-GTuGxDwcsHW8aw` | -          | `config/constants.ts:306` |
| `SearchTimeline`      | `bshMIjqDk8LTXTq4w91WKw` | -          | `config/constants.ts:312` |

## 🚨 何时需要更新

**症状：**

- API 返回 `400 Bad Request`
- 日志显示"API request failed: 400"
- 之前工作的功能突然失效

**触发条件：**

- Twitter 轮换 Query ID（不定期）
- 每次更新通常影响 1-2 个端点

## 📋 更新步骤

### 1. 准备工作

```bash
# 确保你有 Twitter 账号并已登录
# 浏览器：Chrome 或 Firefox（推荐）
```

### 2. 抓包获取 Query ID

#### 方法一：从推文详情页获取 TweetResultByRestId

1. **打开 DevTools**

   - 访问 https://x.com
   - 按 `F12` 打开开发者工具
   - 切换到 **Network** 标签

2. **清空请求列表**

   - 点击 "🚫" 清除按钮

3. **访问任意推文**

   - 点击任意推文进入详情页
   - 例如：https://x.com/anyone/status/XXXXX

4. **搜索 GraphQL 请求**

   - 在 Filter 框输入：`TweetResultByRestId`
   - 找到形如这样的请求：
     ```
     https://x.com/i/api/graphql/QUERY_ID_HERE/TweetResultByRestId?variables=...
     ```

5. **复制 Query ID**
   - URL 中 `/graphql/` 和 `/TweetResultByRestId` 之间的字符串
   - 例如：`kLXoXTloWpv9d2FSXRg-Tg`

#### 方法二：从时间线获取 UserTweets

1. 访问任意用户主页：https://x.com/username
2. 在 Network 搜索：`UserTweets`
3. 从 URL 复制 Query ID

#### 方法三：从搜索页获取 SearchTimeline

1. 访问搜索页：https://x.com/search?q=test
2. 在 Network 搜索：`SearchTimeline`
3. 从 URL 复制 Query ID

### 3. 更新代码

编辑 `config/constants.ts`：

```typescript
// 找到对应的操作
TweetDetail: {
  queryId: "YOUR_NEW_QUERY_ID_HERE",  // 更新这里
  operationName: "TweetResultByRestId",
  operationType: "query",
}
```

### 4. 验证更新

```bash
# 运行测试脚本
npx ts-node scripts/test-batch-lookup.ts

# 或测试完整 API
npx ts-node scripts/test-api.ts
```

**预期输出：**

```
✅ Successfully retrieved X tweets...
```

**如果仍然失败：**

- 检查 Query ID 是否复制完整
- 确认操作名称（operationName）是否匹配
- 尝试重新抓包（可能复制错误）

## 🔍 高级：批量提取所有 Query IDs

如果多个端点同时失效，可以从 Twitter 的 JS 文件提取：

```bash
# 1. 找到 main.{hash}.js
# 打开 x.com → DevTools → Sources → 搜索 "main." 开头的 JS 文件

# 2. 搜索关键字
# 在 JS 文件中搜索："queryId"

# 3. 提取所有 Query IDs
# 你会看到类似这样的代码：
# {queryId:"kLXoXTloWpv9d2FSXRg-Tg",operationName:"TweetResultByRestId",...}
```

## 📊 健康监控

### 在日志中识别 Query ID 问题

**正常日志：**

```
Fetching tweets for user elonmusk...
Fetched 40 tweets, added 38 new. Total: 38
```

**Query ID 过期日志：**

```
❌ API request failed: 400 Bad Request
Error: { operation: "TweetDetail", url: "..." }
```

### 自动化检测（未来）

可以添加健康检查端点：

```typescript
// 建议添加到 server.ts
app.get("/api/health/query-ids", async (req, res) => {
  const checks = await testAllQueryIds();
  res.json({
    healthy: checks.every((c) => c.status === 200),
    details: checks,
  });
});
```

## 📝 维护记录

| 日期       | 更新的端点          | 旧 ID                    | 新 ID                    | 更新人 |
| ---------- | ------------------- | ------------------------ | ------------------------ | ------ |
| 2025-11-29 | TweetResultByRestId | `VwKJcAd7zqlBOitPLUrB8A` | `kLXoXTloWpv9d2FSXRg-Tg` | -      |

## 🤝 贡献

如果你发现某个 Query ID 过期：

1. 按照上述步骤获取新 ID
2. 更新 `config/constants.ts`
3. 在本文档添加维护记录
4. 提交 PR 或通知团队

## ⚠️ 注意事项

- ❌ **不要** 过于频繁地抓包（可能触发 Twitter 的反爬机制）
- ✅ **建议** 在本地开发环境测试后再部署
- ✅ **推荐** 定期（每月）验证 Query IDs 的有效性
- ⚠️ 如果连续失败，考虑检查 cookies 是否过期而非 Query ID 问题

## 🔗 相关文件

- [`config/constants.ts`](file:///Users/wanshiwu/Downloads/XRcrawler/config/constants.ts) - Query ID 定义
- [`core/x-api.ts`](file:///Users/wanshiwu/Downloads/XRcrawler/core/x-api.ts) - API 客户端实现
- [`scripts/test-api.ts`](file:///Users/wanshiwu/Downloads/XRcrawler/scripts/test-api.ts) - API 测试脚本
- [`scripts/test-batch-lookup.ts`](file:///Users/wanshiwu/Downloads/XRcrawler/scripts/test-batch-lookup.ts) - 批量查询测试
