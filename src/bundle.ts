/**
 * 同步 Bundle 格式
 *
 * 这是 ccs push/sync 在云端存储的 JSON 格式。
 * 设计原则：
 * - 自描述（包含版本、时间戳、来源机器信息）
 * - 幂等（sync 多次结果一致）
 * - Skill 只存元数据，不存文件内容
 */

import type { McpEntry } from "./readers/mcp.ts";
import type { PromptEntry } from "./readers/prompt.ts";
import type { SkillMeta } from "./readers/skill.ts";

export interface SyncBundle {
  /** bundle 版本，用于后向兼容 */
  version: "1";
  /** push 时间（ISO 8601） */
  pushedAt: string;
  /** 来源机器 hostname */
  hostname: string;
  /** MCP 服务器列表 */
  mcp: McpEntry[];
  /** Prompt 内容列表 */
  prompts: PromptEntry[];
  /** Skill 元数据列表（不含文件内容） */
  skills: SkillMeta[];
}
