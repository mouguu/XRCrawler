# Git 清理说明

## 问题

WASM 编译产生了大量 Rust 构建产物（`target/`目录等），导致 Git 显示 400+个 changed files。

## 解决方案

### 1. 更新 `.gitignore`

已添加以下规则：

```gitignore
# WASM & Rust build artifacts
wasm/**/target/
wasm/**/Cargo.lock
wasm/**/.cargo-ok
wasm/**/pkg/.gitignore
```

### 2. 从 Git 索引移除构建产物

```bash
git rm -r --cached wasm/*/target/
```

### 3. 保留必要的 WASM 包

`wasm/*/pkg/` 目录需要保留用于部署，但排除其中的 `.gitignore` 文件。

## 验证

```bash
git status --short
# 应该只显示实际修改的文件（约10个）
```

## 当前 Git 状态

只包含实际的代码变更，不再包含构建产物。
