/**
 * 各 AI 客户端配置文件路径
 * 与 cc-switch 后端保持一致的路径逻辑
 *
 * Paths / AppName — MCP 和 Prompt 使用（仅 4 个主要客户端）
 * AGENTS / AgentName — Skill 同步使用（覆盖 agents CLI 生态）
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const CONFIG_HOME = process.env.XDG_CONFIG_HOME?.trim() || join(HOME, ".config");
const CODEX_HOME = process.env.CODEX_HOME?.trim() || join(HOME, ".codex");
const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR?.trim() || join(HOME, ".claude");

// ============================================================
// MCP / Prompt 路径（仅 4 个主要客户端）
// ============================================================

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

// ============================================================
// Skill 同步 — Agent 定义（对齐 agents CLI 生态）
// ============================================================

/** agents CLI 的 canonical skills 目录 */
export const CANONICAL_SKILLS_DIR = join(HOME, ".agents", "skills");

/** 旧 SSOT 目录（用于迁移检测） */
export const LEGACY_SSOT_DIR = join(HOME, ".cc-switch", "skills");

/** agents CLI 的 lock 文件 */
export const SKILL_LOCK_PATH = join(HOME, ".agents", ".skill-lock.json");

export interface AgentDef {
  displayName: string;
  /** agent 的全局 skills 目录 */
  globalSkillsDir: string;
  /** 是否使用 universal (.agents/skills) 目录，true 则无需 symlink */
  isUniversal: boolean;
  /** 检测目录（用于判断 agent 是否已安装） */
  detectDir: string;
}

/**
 * Agent 路径映射，从 skills 项目 src/agents.ts 提取
 * 分为 Universal（共享 .agents/skills）和 Non-Universal（各自目录）
 */
export const AGENTS: Record<string, AgentDef> = {
  // ---- Universal Agents（共享 .agents/skills，无需 symlink）----
  amp:              { displayName: "Amp",             globalSkillsDir: join(CONFIG_HOME, "agents", "skills"), isUniversal: true,  detectDir: join(CONFIG_HOME, "amp") },
  antigravity:      { displayName: "Antigravity",     globalSkillsDir: join(HOME, ".gemini", "antigravity", "skills"), isUniversal: true, detectDir: join(HOME, ".gemini", "antigravity") },
  cline:            { displayName: "Cline",           globalSkillsDir: join(HOME, ".agents", "skills"),      isUniversal: true,  detectDir: join(HOME, ".cline") },
  codex:            { displayName: "Codex",           globalSkillsDir: join(CODEX_HOME, "skills"),           isUniversal: true,  detectDir: CODEX_HOME },
  cursor:           { displayName: "Cursor",          globalSkillsDir: join(HOME, ".cursor", "skills"),      isUniversal: true,  detectDir: join(HOME, ".cursor") },
  deepagents:       { displayName: "Deep Agents",     globalSkillsDir: join(HOME, ".deepagents", "agent", "skills"), isUniversal: true, detectDir: join(HOME, ".deepagents") },
  "gemini-cli":     { displayName: "Gemini CLI",      globalSkillsDir: join(HOME, ".gemini", "skills"),      isUniversal: true,  detectDir: join(HOME, ".gemini") },
  "github-copilot": { displayName: "GitHub Copilot",  globalSkillsDir: join(HOME, ".copilot", "skills"),     isUniversal: true,  detectDir: join(HOME, ".copilot") },
  "kimi-cli":       { displayName: "Kimi Code CLI",   globalSkillsDir: join(CONFIG_HOME, "agents", "skills"), isUniversal: true, detectDir: join(HOME, ".kimi") },
  opencode:         { displayName: "OpenCode",        globalSkillsDir: join(CONFIG_HOME, "opencode", "skills"), isUniversal: true, detectDir: join(CONFIG_HOME, "opencode") },
  warp:             { displayName: "Warp",            globalSkillsDir: join(HOME, ".agents", "skills"),      isUniversal: true,  detectDir: join(HOME, ".warp") },

  // ---- Non-Universal Agents（各自目录，需要 symlink）----
  "claude-code":    { displayName: "Claude Code",     globalSkillsDir: join(CLAUDE_HOME, "skills"),          isUniversal: false, detectDir: CLAUDE_HOME },
  augment:          { displayName: "Augment",         globalSkillsDir: join(HOME, ".augment", "skills"),     isUniversal: false, detectDir: join(HOME, ".augment") },
  openclaw:         { displayName: "OpenClaw",        globalSkillsDir: join(HOME, ".openclaw", "skills"),    isUniversal: false, detectDir: join(HOME, ".openclaw") },
  continue:         { displayName: "Continue",        globalSkillsDir: join(HOME, ".continue", "skills"),    isUniversal: false, detectDir: join(HOME, ".continue") },
  windsurf:         { displayName: "Windsurf",        globalSkillsDir: join(HOME, ".codeium", "windsurf", "skills"), isUniversal: false, detectDir: join(HOME, ".codeium", "windsurf") },
  roo:              { displayName: "Roo Code",        globalSkillsDir: join(HOME, ".roo", "skills"),         isUniversal: false, detectDir: join(HOME, ".roo") },
  trae:             { displayName: "Trae",            globalSkillsDir: join(HOME, ".trae", "skills"),        isUniversal: false, detectDir: join(HOME, ".trae") },
  goose:            { displayName: "Goose",           globalSkillsDir: join(CONFIG_HOME, "goose", "skills"), isUniversal: false, detectDir: join(CONFIG_HOME, "goose") },
};

export type AgentName = string;
export const ALL_AGENT_NAMES = Object.keys(AGENTS);

/** 检测哪些 agent 已安装 */
export function detectInstalledAgents(): string[] {
  return ALL_AGENT_NAMES.filter((name) => existsSync(AGENTS[name].detectDir));
}
