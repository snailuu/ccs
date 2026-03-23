/**
 * 各 AI 客户端配置文件路径
 * 与 cc-switch 后端保持一致的路径逻辑
 */

import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();

export const Paths = {
  // ---- Claude ----
  claude: {
    dir: () => join(HOME, ".claude"),
    mcpJson: () => join(HOME, ".claude.json"),
    prompt: () => join(HOME, ".claude", "CLAUDE.md"),
    skills: () => join(HOME, ".claude", "skills"),
  },

  // ---- Codex ----
  codex: {
    dir: () => join(HOME, ".codex"),
    config: () => join(HOME, ".codex", "config.toml"),
    prompt: () => join(HOME, ".codex", "AGENTS.md"),
    skills: () => join(HOME, ".codex", "skills"),
  },

  // ---- Gemini ----
  gemini: {
    dir: () => join(HOME, ".gemini"),
    // Gemini MCP 存在 settings.json 中
    settings: () => join(HOME, ".gemini", "settings.json"),
    prompt: () => join(HOME, ".gemini", "GEMINI.md"),
    skills: () => join(HOME, ".gemini", "skills"),
  },

  // ---- OpenCode ----
  opencode: {
    dir: () => join(HOME, ".config", "opencode"),
    config: () => join(HOME, ".config", "opencode", "opencode.json"),
    prompt: () => join(HOME, ".config", "opencode", "AGENTS.md"),
    skills: () => join(HOME, ".config", "opencode", "skills"),
  },
} as const;

export type AppName = keyof typeof Paths;
export const ALL_APPS: AppName[] = ["claude", "codex", "gemini", "opencode"];
