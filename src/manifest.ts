/**
 * ccs 同步协议 v3
 *
 * 索引 + 按需下载模式：
 * - manifest.json 包含 MCP/Prompt 完整内容 + Skill 索引元数据
 * - skills/<name>.json 包含单个 skill 的完整文件
 */

import type { McpEntry } from "./readers/mcp.ts";
import type { PromptEntry } from "./readers/prompt.ts";

// ============================================================
// Manifest（索引文件，上传到云端根路径）
// ============================================================

export interface Manifest {
  version: "3";
  pushedAt: string;
  hostname: string;
  /** MCP 完整内容（体积小，直接内嵌） */
  mcp: McpEntry[];
  /** Prompt 完整内容（体积小，直接内嵌） */
  prompts: PromptEntry[];
  /** Skill 仅索引元数据（文件按需下载） */
  skills: SkillIndex[];
}

// ============================================================
// Skill 索引（manifest 中的条目）
// ============================================================

export interface SkillIndex {
  /** 目录名 */
  directory: string;
  /** 显示名称 */
  name: string;
  /** 简述 */
  description: string;
  /** 仓库信息 */
  repo?: { owner: string; name: string; branch?: string };
  /** 安装源 URL */
  sourceUrl?: string;
  /** 来源类型 */
  sourceType?: "github" | "local" | "unknown";
  /** 在哪些 agent 中启用 */
  agents: Record<string, boolean>;
  /** 在哪些目录中发现（如 ["agents", "claude-code"]） */
  foundIn: string[];
  /** 文件数量 */
  fileCount: number;
  /** 总大小（字节） */
  totalSize: number;
}

// ============================================================
// Skill 文件包（单独上传/下载）
// ============================================================

export interface SkillFile {
  /** 相对路径（如 "SKILL.md" 或 "references/guide.md"） */
  path: string;
  /** 文件内容 */
  content: string;
}

export interface SkillPackage {
  directory: string;
  files: SkillFile[];
}
