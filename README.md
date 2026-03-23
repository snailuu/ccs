# ccs - CC Switch Sync CLI

将 MCP、Skill、Prompt 配置在多台机器间同步的 CLI 工具。

设计理念来自 [cc-switch](https://github.com/farion1231/cc-switch)，将其管理的三类配置抽离为独立的命令行同步工具。

## 安装

```bash
# 进入 CLI 目录
cd CLI

# 安装依赖（仅开发时需要）
bun install

# 编译为单文件可执行程序
bun build ccs.ts --compile --outfile ccs

# 放入 PATH
sudo mv ccs /usr/local/bin/ccs
```

## 发布流程

npm 包改为**本地手动发布**，GitHub Actions 只负责在 tag 推送后构建跨平台二进制并创建 GitHub Release。

```bash
# 本地发布 npm 包
npm publish --access public
```

- 发布 npm 包前，先确认本机 `npm whoami` 可用，必要时执行 `npm login`
- 推送版本 tag 后，`.github/workflows/release.yml` 会自动构建二进制并上传到 GitHub Release
- GitHub Actions 不再执行 `npm publish`

## 快速开始

### 1. 配置同步后端

**GitHub Gist（推荐）**
```bash
ccs config set backend gist
ccs config set gist.token ghp_your_token_here
```

**WebDAV（如 Nextcloud、坚果云）**
```bash
ccs config set backend webdav
ccs config set webdav.url https://your-webdav-server.com/dav
ccs config set webdav.username youruser
ccs config set webdav.password yourpass
```

**本地文件（手动网盘同步）**
```bash
ccs config set backend local
ccs config set local.path ~/Dropbox/ccs-bundle.json
```

### 2. 推送本机配置

```bash
ccs push
```

### 3. 在另一台机器上拉取

```bash
# 先配置相同的后端
ccs config set backend gist
ccs config set gist.token ghp_your_token_here
ccs config set gist.id <gist_id_from_push_output>

# 预览差异
ccs diff

# 应用配置
ccs pull
```

## 命令

| 命令 | 说明 |
|------|------|
| `ccs push` | 导出本机配置并上传云端 |
| `ccs pull` | 从云端下载并应用配置 |
| `ccs status` | 显示本机配置摘要 |
| `ccs diff` | 预览本机与云端的差异 |
| `ccs config` | 查看同步配置 |
| `ccs config set <k> <v>` | 设置配置项 |

### 选项

| 选项 | 说明 |
|------|------|
| `--dry-run` | 预览操作，不实际写入文件 |
| `--only mcp,skill,prompt` | 只同步指定类型（逗号分隔）|
| `--verbose` | 显示详细日志 |

## 同步的数据

### MCP 服务器
读取各客户端的 MCP 配置文件：
- Claude: `~/.claude.json` → `mcpServers`
- Codex: `~/.codex/config.toml` → `[mcp_servers.*]`
- Gemini: `~/.gemini/settings.json` → `mcpServers`
- OpenCode: `~/.config/opencode/opencode.json` → `mcp`

### Prompt 文件
读取各客户端的系统提示文件：
- Claude: `~/.claude/CLAUDE.md`
- Codex: `~/.codex/AGENTS.md`
- Gemini: `~/.gemini/GEMINI.md`
- OpenCode: `~/.config/opencode/AGENTS.md`

### Skill 元数据
只同步元数据（目录名、仓库信息），**不同步文件内容**。
目标机器上 SSOT 未安装的 skill 会在 `ccs pull` 后显示待安装列表，
需在 cc-switch 中手动安装或使用 `agents` CLI 安装。

SSO 目录：`~/.cc-switch/skills/`

## Bundle 格式

云端存储的 JSON 文件（`ccs-bundle.json`）结构：

```json
{
  "version": "1",
  "pushedAt": "2026-03-23T10:00:00.000Z",
  "hostname": "my-macbook",
  "mcp": [...],
  "prompts": [...],
  "skills": [...]
}
```

## 与 cc-switch 的关系

`ccs` 是 cc-switch 的 **无 GUI 命令行补充工具**，适用于：
- 无法安装 cc-switch 的 Linux 服务器
- CI/CD 环境中的配置分发
- 多机器快速同步场景

两者独立运行，`ccs` 直接读写各客户端配置文件，不依赖 cc-switch 数据库。
