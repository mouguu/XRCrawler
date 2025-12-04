# XRCrawler 基础设施升级复盘：Prisma v7 迁移与容器稳定性

**日期：** 2025-12-04  
**事件：** Docker 容器无限重启 (Crash Loop)  
**状态：** ✅ 已解决  
**涉及组件：** Docker, Prisma v7, TypeScript, Node.js, PostgreSQL Driver Adapter  
**调试时长：** ~2 小时  
**Git 分支：** `feature/prisma-v7-driver-adapter`

---

## 1. 背景 (Context)

### 1.1 升级动机

为了提升数据库性能并支持 Serverless 部署架构（Cloudflare Workers、Vercel Edge），我们决定将 ORM 层从 Prisma v5.22 升级至 v7.1.0，并采用最新的 **Driver Adapter** 模式。

### 1.2 Prisma v7 核心变化

Prisma v7 引入了重大架构调整：

1. **强制使用 Driver Adapter**：不再支持直接连接数据库，必须通过适配器（如 `@prisma/adapter-pg`）
2. **CLI 与 Runtime 配置分离**：
   - CLI 工具（migrate, studio）使用 `prisma.config.ts`
   - 运行时连接使用代码中的 `adapter` 参数
3. **WASM 引擎模式**：Client 默认使用 WebAssembly 引擎，体积更小，适合 Edge 环境
4. **环境变量显式加载**：不再自动加载 `.env`，需要手动 `import 'dotenv/config'`
5. **Generator 输出变化**：`prisma-client` provider 生成 TypeScript 源文件而非编译后的 JavaScript

---

## 2. 问题现象 (Symptoms)

### 2.1 容器行为

```bash
# 容器启动后立即退出
docker compose logs -f app

app-1  | DEBUG: Process starting...
app-1  | DEBUG: Express imported
app-1 exited with code 1 (restarting)
app-1  | DEBUG: Process starting...
app-1  | DEBUG: Express imported
app-1 exited with code 1 (restarting)
# ... 无限循环
```

### 2.2 关键特征

- **静默崩溃**：无明显错误堆栈，只有简单的 `exit code 1`
- **日志截断**：只能看到前两行调试日志，之后立即退出
- **重启循环**：Docker 的 `restart: unless-stopped` 策略导致容器不断重启
- **Studio 正常**：Prisma Studio 容器能正常运行，说明数据库连接本身没问题

---

## 3. 排查路径 (Investigation Path)

### 阶段一：系统依赖问题

**假设：** Alpine Linux 缺少 Prisma v7 需要的 OpenSSL 3.x 库

**验证步骤：**
```bash
# 检查 Dockerfile 基础镜像
FROM node:22-alpine  # 原配置

# 尝试安装 OpenSSL
RUN apk add --no-cache openssl
```

**结果：** ❌ 验证失败，即使安装库也报错

**采取行动：**
- 切换基础镜像至 `node:22-slim` (Debian based)
- Debian 提供更标准的系统库路径和 OpenSSL 3.0.x 支持

---

### 阶段二：Prisma Studio 命令参数问题

**假设：** Prisma v7 CLI 参数发生变化

**现象：**
```bash
studio-1 | ! unknown or unexpected option: --hostname
```

**验证步骤：**
```bash
# 检查 docker-compose.yml 中的 studio 命令
command: ["npx", "prisma", "studio", "--hostname", "0.0.0.0"]
```

**结果：** ✅ 确认问题

**采取行动：**
```yaml
# 修复后的命令
command: ["npx", "prisma", "studio", "--port", "5555", "--browser", "none"]
```

**原因：** Prisma v7 移除了 `--hostname` 参数，默认绑定所有接口

---

### 阶段三：依赖包位置检查

**假设：** 运行时依赖被错误地放在 `devDependencies` 中

**验证步骤：**
```bash
# 检查 package.json
cat package.json | grep -A 20 '"dependencies"'
```

**结果：** ✅ 依赖位置正确

**确认清单：**
- ✅ `pg` - PostgreSQL 驱动
- ✅ `@prisma/adapter-pg` - Prisma 适配器
- ✅ `@prisma/client` - Prisma Client
- ✅ `dotenv` - 环境变量加载

---

### 阶段四：配置文件缺失

**假设：** Dockerfile 未复制 `prisma.config.ts`

**验证步骤：**
```dockerfile
# 检查 Dockerfile
COPY prisma ./prisma
RUN npx prisma generate  # ❌ 缺少 prisma.config.ts
```

**结果：** ✅ 确认问题

**采取行动：**
```dockerfile
# 修复后
COPY prisma ./prisma
COPY prisma.config.ts ./  # ✅ 添加配置文件
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
```

**原因：** Prisma v7 的 `prisma.config.ts` 中调用 `env('DATABASE_URL')`，构建时需要提供环境变量

---

### 阶段五：深度调试 - 捕获未处理异常

**假设：** 存在未捕获的异常导致静默退出

**验证步骤：**
```bash
# 禁用自动重启
docker update --restart=no xrcrawler-app-1
docker stop xrcrawler-app-1

# 手动启动并捕获异常
docker run --rm -it \
  -e DATABASE_URL="postgresql://postgres:postgres@postgres:5432/xrcrawler" \
  --network xrcrawler_default \
  --entrypoint sh xrcrawler-app \
  -c "node -e \"
    process.on('uncaughtException', (err) => { 
      console.error('UNCAUGHT EXCEPTION:', err); 
      process.exit(1); 
    }); 
    require('./dist/cmd/start-server.js');
  \" 2>&1"
```

**结果：** 🎯 **找到真凶！**

```
UNCAUGHT EXCEPTION: Error: Cannot find module './internal/class.ts'
Require stack:
- /app/generated/prisma/client.js:53:29
```

---

### 阶段六：根本原因分析

**问题定位：**

1. **Prisma v7 生成 TypeScript 源文件**
   ```bash
   # 检查生成的文件
   ls -la /app/generated/prisma/
   # client.ts, models.ts, enums.ts, internal/class.ts ...
   ```

2. **Dockerfile 构建顺序错误**
   ```dockerfile
   # ❌ 错误的顺序
   RUN npx prisma generate    # 生成 .ts 文件
   COPY core ./core            # 复制源码
   RUN npm run build           # 编译 TypeScript（但 generated/ 还不存在！）
   ```

3. **运行时尝试加载 .ts 文件**
   ```javascript
   // generated/prisma/client.js 中
   const $Class = require("./internal/class");  // ❌ 找不到 .js 文件
   ```

**根本原因：**

Prisma v7 的 `prisma-client` provider 生成的是 **TypeScript 源文件**，需要被 `tsc` 编译成 JavaScript。但原 Dockerfile 在生成 Prisma Client **之后**才复制源码并编译，导致 `generated/prisma/*.ts` 没有被编译，运行时 Node.js 无法加载模块。

---

## 4. 解决方案 (Resolution)

### 4.1 Dockerfile 构建顺序调整

**核心修复：** 确保 Prisma Client 生成在 TypeScript 编译**之前**

```dockerfile
# ✅ 正确的顺序

# 1. 复制源码（包括 prisma schema）
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY core ./core
COPY cmd ./cmd
# ... 其他源码目录

# 2. 生成 Prisma Client（生成 TypeScript 源文件）
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    npx prisma generate

# 3. 编译所有 TypeScript（包括 generated/prisma）
RUN npm run build
```

**关键点：**
- `prisma generate` 必须在 `npm run build` **之前**
- 构建时的 `DATABASE_URL` 仅用于配置解析，不会实际连接数据库
- `tsc` 会将 `generated/prisma/*.ts` 编译到 `dist/generated/prisma/*.js`

---

### 4.2 Prisma v7 完整配置

#### 4.2.1 `prisma.config.ts` (CLI 配置)

```typescript
import { defineConfig, env } from 'prisma/config'
import 'dotenv/config'  // ⚠️ v7 必须显式加载

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),  // CLI 工具使用
  },
})
```

#### 4.2.2 `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  // ⚠️ v7 中 url 已移至 prisma.config.ts
}
```

#### 4.2.3 `core/db/prisma.ts` (Runtime 配置)

```typescript
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

// 1. 创建 pg 连接池
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

// 2. 创建 Prisma 适配器
const adapter = new PrismaPg(pool);

// 3. 初始化 Client（注入适配器）
export const prisma = new PrismaClient({ adapter });
```

---

### 4.3 依赖清单

```json
{
  "dependencies": {
    "@prisma/client": "^7.1.0",
    "@prisma/adapter-pg": "^7.1.0",
    "pg": "^8.16.3",
    "dotenv": "^17.2.3"
  },
  "devDependencies": {
    "prisma": "^7.1.0",
    "@types/pg": "^8.15.6"
  }
}
```

---

### 4.4 Docker Compose 调整

```yaml
services:
  studio:
    command: ["npx", "prisma", "studio", "--port", "5555", "--browser", "none"]
    # ❌ 移除了 --hostname 参数
```

---

## 5. 验证步骤

### 5.1 本地验证

```bash
# 1. 生成 Prisma Client
npx prisma generate

# 2. 检查生成的文件
ls -la generated/prisma/
# 应该看到 .ts 文件

# 3. 编译 TypeScript
npm run build

# 4. 检查编译产物
ls -la dist/generated/prisma/
# 应该看到 .js 文件

# 5. 本地运行
npm start
```

### 5.2 Docker 验证

```bash
# 1. 清理旧容器
docker compose down -v

# 2. 重新构建（无缓存）
docker compose build --no-cache

# 3. 启动服务
docker compose up -d

# 4. 查看日志（应该看到成功启动）
docker compose logs -f app

# 预期输出：
# [Prisma Init] Checking DATABASE_URL: Present
# [Prisma Init] Initializing pg Pool...
# [Prisma Init] Initializing PrismaPg adapter...
# [Prisma Init] Initializing PrismaClient...
# [Prisma Init] Successfully initialized.
# 服务器启动 { port: 5001, host: 'localhost' }
```

---

## 6. 经验总结 (Key Takeaways)

### 6.1 调试技巧

1. **静默崩溃的排查**
   ```bash
   # 禁用自动重启
   docker update --restart=no <container>
   
   # 手动启动并捕获异常
   docker start -ai <container>
   
   # 或者进入容器 shell
   docker run --rm -it --entrypoint sh <image>
   ```

2. **模块加载问题的直觉**
   - 当报错为 `Cannot find module` 且文件明明存在时
   - 第一时间检查 **编译产物** (`.js`) 而非源文件 (`.ts`)
   - 使用 `ls -la dist/` 确认文件是否被正确编译

3. **构建顺序的重要性**
   - 代码生成工具（如 Prisma）必须在编译**之前**运行
   - 使用 `RUN echo "Step X"` 在 Dockerfile 中添加调试标记

### 6.2 Prisma v7 迁移检查清单

- [ ] 安装 `pg` 和 `@prisma/adapter-pg`
- [ ] 创建 `prisma.config.ts` 并配置 `datasource.url`
- [ ] 从 `schema.prisma` 移除 `datasource.url`
- [ ] 修改 `provider` 为 `"prisma-client"`
- [ ] 设置 `output` 路径（如 `"../generated/prisma"`）
- [ ] 在代码中使用 `Pool + PrismaPg` 初始化 Client
- [ ] 调整 Dockerfile 顺序：generate → build
- [ ] 添加构建时的 `DATABASE_URL` 环境变量
- [ ] 更新所有导入路径为 `generated/prisma/client`
- [ ] 移除 Prisma Studio 的 `--hostname` 参数

### 6.3 架构优势

采用 Prisma v7 + Driver Adapter 模式后：

1. **Serverless Ready**：代码架构已为 Cloudflare Workers/Vercel Edge 做好准备
2. **更小的内存占用**：WASM 引擎比传统 C++ Binary 更轻量
3. **更好的可移植性**：不依赖特定平台的二进制文件
4. **显式配置**：CLI 和 Runtime 分离，配置更清晰

### 6.4 避坑指南

1. **不要在 Alpine 上使用 Prisma v7**
   - OpenSSL 路径问题难以解决
   - 推荐使用 `node:22-slim` (Debian)

2. **构建时必须提供 DATABASE_URL**
   - 即使是 dummy 值也可以
   - 用于 `prisma.config.ts` 的 `env()` 解析

3. **检查 TypeScript 编译范围**
   - 确保 `tsconfig.json` 包含 `generated/` 目录
   - 或者使用默认的 `include: ["**/*"]`

4. **运行时环境变量**
   - 真正的 `DATABASE_URL` 在运行时通过 Docker Compose 传入
   - 构建时的值不会影响运行时连接

---

## 7. 相关资源

- [Prisma v7 升级指南](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [Driver Adapters 文档](https://www.prisma.io/docs/orm/overview/databases/database-drivers)
- [Prisma Config 文件](https://www.prisma.io/docs/orm/prisma-schema/overview/prisma-config-file)
- [本次迁移的 Git Commits](https://github.com/your-repo/commits/feature/prisma-v7-driver-adapter)

---

## 8. 后续优化

- [ ] 添加 Prisma Client 的连接池监控
- [ ] 实现数据库连接的健康检查
- [ ] 优化 Docker 镜像大小（多阶段构建）
- [ ] 添加 Prisma Migrate 的 CI/CD 集成
- [ ] 探索 Prisma Accelerate 用于生产环境

---

**文档维护者：** AI Assistant + Development Team  
**最后更新：** 2025-12-04  
**版本：** 1.0