# ccs

将 MCP、Skill、Prompt 配置在多台机器之间同步的 CLI 工具，支持
Claude、Codex、Gemini、OpenCode。

`ccs` 适合这些场景：

- 新电脑初始化时快速恢复 AI 客户端配置
- 在工作机、个人机、远程机之间同步常用配置
- 把 MCP、提示词、Skill 元数据统一存放到 Gist、WebDAV 或本地文件

## 特性

- 同步三类配置：MCP、Prompt、Skill 元数据
- 支持三种后端：GitHub Gist、WebDAV、本地文件
- 支持交互式选择与预览，避免误覆盖
- 支持 `--only` 精确同步 `mcp`、`prompt`、`skill`
- 单文件二进制分发，适合直接下载使用

> [!IMPORTANT]
> Skill 目前只同步元数据，不同步实际文件内容。
> 如果目标机器缺少对应 Skill，`ccs sync` 会提示你手动安装。

## 安装

### 一键安装

安装最新版本：

```bash
curl -fsSL https://sh.snailuu.cn/ccs/install.sh | bash
```

指定安装目录：

```bash
curl -fsSL https://sh.snailuu.cn/ccs/install.sh | CCS_INSTALL_DIR="$HOME/.local/bin" bash
```

### 手动下载二进制

最新版本下载地址：

- macOS Apple Silicon: [ccs-darwin-arm64](https://sh.snailuu.cn/ccs/latest/ccs-darwin-arm64)
- macOS Intel: [ccs-darwin-x64](https://sh.snailuu.cn/ccs/latest/ccs-darwin-x64)
- Linux x64: [ccs-linux-x64](https://sh.snailuu.cn/ccs/latest/ccs-linux-x64)
- Linux ARM64: [ccs-linux-arm64](https://sh.snailuu.cn/ccs/latest/ccs-linux-arm64)
- Windows x64: [ccs-windows-x64.exe](https://sh.snailuu.cn/ccs/latest/ccs-windows-x64.exe)

示例：

```bash
curl -fsSL -o ccs https://sh.snailuu.cn/ccs/latest/ccs-darwin-arm64
chmod +x ccs
mv ccs "$HOME/.local/bin/ccs"
```

### 更新已安装的 ccs

如果当前 `ccs` 是通过 `sh.snailuu.cn` 安装的单文件二进制，可以直接执行：

```bash
ccs update
```

> [!NOTE]
> `ccs update` 只支持通过 `sh.snailuu.cn` 安装的单文件二进制版本，
> 不支持 `bun run`、源码运行或其他安装方式。

## 快速开始

### 1. 配置同步后端

推荐先用交互式向导：

```bash
ccs config
```

也可以直接通过命令设置。

GitHub Gist：

```bash
ccs config set backend gist
ccs config set gist.token ghp_xxxxx
```

WebDAV：

```bash
ccs config set backend webdav
ccs config set webdav.url https://your-webdav-server.com/dav
ccs config set webdav.username youruser
ccs config set webdav.password yourpass
```

本地文件：

```bash
ccs config set backend local
ccs config set local.path ~/Dropbox/ccs-bundle.json
```

### 2. 推送当前机器配置

```bash
ccs push
```

只推送部分内容：

```bash
ccs push --only mcp,prompt
```

预览但不上传：

```bash
ccs push --dry-run
```

### 3. 在另一台机器上同步

```bash
ccs diff
ccs sync
```

> [!NOTE]
> `sync` 是实际的拉取并写入命令。它会先从云端读取 bundle，再让你选择同步类型、条目和目标客户端。

## 命令

| 命令 | 说明 |
| --- | --- |
| `ccs push` | 采集本机配置并上传到云端 |
| `ccs sync` | 从云端拉取并应用配置到目标客户端 |
| `ccs status` | 显示本机当前配置摘要 |
| `ccs diff` | 预览本机与云端配置差异 |
| `ccs config` | 启动交互式配置向导 |
| `ccs config show` | 显示当前后端配置 |
| `ccs config set <key> <value>` | 通过脚本方式设置配置项 |
| `ccs update` | 检测最新版本并在确认后更新当前二进制 |

常用选项：

| 选项 | 说明 |
| --- | --- |
| `--help`, `-h` | 显示帮助 |
| `--version`, `-v` | 显示版本 |
| `--only mcp,skill,prompt` | 只操作指定类型，适用于 `push` 和 `sync` |
| `--dry-run` | 仅预览，不实际上传，适用于 `push` |

## 同步内容

### MCP

读取这些客户端中的 MCP 配置：

- Claude: `~/.claude.json`
- Codex: `~/.codex/config.toml`
- Gemini: `~/.gemini/settings.json`
- OpenCode: `~/.config/opencode/opencode.json`

### Prompt

读取这些提示词文件：

- Claude: `~/.claude/CLAUDE.md`
- Codex: `~/.codex/AGENTS.md`
- Gemini: `~/.gemini/GEMINI.md`
- OpenCode: `~/.config/opencode/AGENTS.md`

### Skill 元数据

同步内容包括：

- Skill 目录名
- `SKILL.md` 中解析出的名称和描述
- 仓库来源信息
- 在哪些客户端中启用

不包含：

- Skill 目录内的实际文件
- 仓库克隆内容
- 运行时生成的缓存

## 下载地址

### 安装脚本

- 默认安装脚本: [install.sh](https://sh.snailuu.cn/ccs/install.sh)
- Latest 安装脚本: [latest/install.sh](https://sh.snailuu.cn/ccs/latest/install.sh)

### Latest

| 平台 | 地址 |
| --- | --- |
| macOS Apple Silicon | [ccs-darwin-arm64](https://sh.snailuu.cn/ccs/latest/ccs-darwin-arm64) |
| macOS Intel | [ccs-darwin-x64](https://sh.snailuu.cn/ccs/latest/ccs-darwin-x64) |
| Linux x64 | [ccs-linux-x64](https://sh.snailuu.cn/ccs/latest/ccs-linux-x64) |
| Linux ARM64 | [ccs-linux-arm64](https://sh.snailuu.cn/ccs/latest/ccs-linux-arm64) |
| Windows x64 | [ccs-windows-x64.exe](https://sh.snailuu.cn/ccs/latest/ccs-windows-x64.exe) |

## Bundle 格式

云端存储的 bundle 会缓存到本地 `~/.ccs/bundle.json`，结构如下：

```json
{
  "version": "1",
  "pushedAt": "2026-03-23T10:00:00.000Z",
  "hostname": "my-macbook",
  "mcp": [],
  "prompts": [],
  "skills": []
}
```

配置文件位于 `~/.ccs/config.json`。
