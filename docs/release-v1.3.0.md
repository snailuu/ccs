# v1.3.0

发布日期: 2026-03-25

## 📣 亮点 (Highlights)

本次版本对同步架构进行了全面重构：
- **索引 + 按需下载**：push 上传索引和 skill 原始文件到 WebDAV，sync 先拉索引让用户选择，再按需下载
- **多源 Skill 扫描**：自动扫描 ~/.agents/skills/、~/.cc-switch/skills/ 及各 agent 目录，合并去重
- **19 个 Agent 支持**：覆盖 Claude Code、Cursor、Gemini CLI、Codex、Cline、Amp 等主流 AI Agent

## ⚠️ 不兼容变更

- **后端简化**：移除 GitHub Gist 和本地文件后端，仅支持 WebDAV
- **协议升级**：v1/v2 bundle 格式升级为 v3 manifest + 原始目录结构
- 已有用户需重新运行 `ccs config` 配置 WebDAV 后端

## ✅ 升级指南

1. 运行 `ccs config` 重新配置 WebDAV
2. 运行 `ccs push` 以新格式上传配置
3. 在其他机器上 `ccs sync` 即可按需下载

---

## 👉 详细变更 (Changelog)

### 🚀 增强 (Enhancements)

- **[sync]**: 重构为索引 + 按需下载架构，manifest.json 含 MCP/Prompt 完整内容 + Skill 元数据索引 - by @snailuu
- **[sync]**: Skill 以原始目录结构存储到 WebDAV 和本地 ~/.ccs/skills/ - by @snailuu
- **[skill]**: 多源扫描合并去重，对齐 cc-switch Tauri 后端 scan_unmanaged 逻辑 - by @snailuu
- **[paths]**: 扩展 19 个 Agent 路径定义（Universal + Non-Universal），支持检测已安装 Agent - by @snailuu
- **[skill]**: 三层来源检测：lock 文件 → SKILL.md frontmatter → 本地 - by @snailuu
- **[cli]**: 新增 `ccs uninstall` 命令，支持卸载二进制和配置数据 - by @snailuu
- **[push]**: 上传过程显示逐个 Skill 进度 - by @snailuu

### 🩹 修复 (Fixes)

- **[update]**: 修复对 bun 编译二进制的误判（process.argv[0] 在 bun binary 中始终返回 "bun"） - by @snailuu
- **[build]**: 修复构建脚本 `__APP_VERSION__` 注入失败导致版本号为 "dev" 的问题 - by @snailuu
- **[webdav]**: 兼容旧配置路径（如 /ccs-sync/bundle.json 自动取父目录） - by @snailuu

### 💅 重构 (Refactors)

- **[backend]**: 移除 Gist 和 Local 后端，简化为 WebDAV Only - by @snailuu
- **[config]**: 简化配置结构，新增 manifest/skill 本地缓存管理 - by @snailuu
- **[bundle]**: bundle.ts 替换为 manifest.ts，定义 Manifest/SkillIndex/SkillPackage 类型 - by @snailuu

---

**Full Changelog**: https://github.com/snailuu/ccs/compare/v1.2.1...v1.3.0

## 📊 统计

- 🚀 增强: 7 个
- 🩹 修复: 3 个
- 💅 重构: 3 个
- 📝 总计 commits: 2 个
- 👥 贡献者: 1 人

## 👥 贡献者

- @snailuu
