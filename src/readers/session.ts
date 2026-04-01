/**
 * Claude Code 会话扫描和精简
 *
 * 扫描 ~/.claude/projects/ 下的 .jsonl 会话文件，
 * 精简内容（去 progress、去 thinking.signature），
 * 返回元数据索引用于 manifest。
 */

import { homedir } from "node:os";
import { join, basename } from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

// ============================================================
// 类型
// ============================================================

export interface SessionMeta {
  sessionId: string;
  app: "claude";
  /** Claude projects 下的原始目录名（如 -Users-snailuu-project-my-ai-cli-make-ccs） */
  projectDirName: string;
  /** 原始项目路径（从 cwd 提取，如 /Users/snailuu/project/my/ai-cli-make/ccs） */
  projectPath: string;
  /** 可读项目名（如 ai-cli-make/ccs） */
  projectName: string;
  /** user + assistant + system 消息数 */
  messageCount: number;
  /** 最后消息时间 */
  lastMessageAt: string;
  /** 精简后字节数（延迟计算，扫描时为 0） */
  strippedSize: number;
  /** 精简内容的 SHA256（延迟计算，扫描时为空） */
  sha256: string;
  /** 首条用户提问（截取前 60 字符） */
  firstQuestion?: string;
  /** Git 分支名 */
  gitBranch?: string;
}

// ============================================================
// 项目路径提取
// ============================================================

/** 从项目路径提取可读名（最后 1-2 段） */
function extractProjectName(projectPath: string): string {
  const parts = projectPath.split("/").filter(Boolean);
  if (parts.length === 0) return "unknown";
  if (parts.length === 1) return parts[0];
  return parts.slice(-2).join("/");
}

// ============================================================
// Session 精简
// ============================================================

const KEPT_TYPES = new Set(["user", "assistant", "system", "file-history-snapshot"]);

/** 精简 .jsonl 内容：去 progress、去 thinking.signature */
export function stripSession(raw: string): string {
  const lines: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (!KEPT_TYPES.has(obj.type)) continue;

      // assistant 消息：去掉 thinking.signature
      if (obj.type === "assistant" && obj.message?.content) {
        for (const block of obj.message.content) {
          if (block.type === "thinking") {
            delete block.signature;
          }
        }
        lines.push(JSON.stringify(obj));
      } else {
        lines.push(line);
      }
    } catch {
      // 无法解析的行保留原样
      lines.push(line);
    }
  }
  return lines.join("\n") + "\n";
}

interface SessionStats {
  messageCount: number;
  lastMessageAt: string;
  firstQuestion?: string;
  gitBranch?: string;
  cwd?: string;
}

/** 从 .jsonl 一次遍历提取：消息统计 + cwd + 首条用户提问 + git 分支 */
function scanSessionStats(raw: string): SessionStats {
  let messageCount = 0;
  let lastMessageAt = "";
  let firstQuestion: string | undefined;
  let gitBranch: string | undefined;
  let cwd: string | undefined;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type === "user" || obj.type === "assistant" || obj.type === "system") {
        messageCount++;
        if (obj.timestamp && obj.timestamp > lastMessageAt) {
          lastMessageAt = obj.timestamp;
        }
      }
      // 从首条 user 消息提取 cwd、提问内容和 git 分支
      if (obj.type === "user" && firstQuestion === undefined) {
        cwd = obj.cwd;
        gitBranch = obj.gitBranch;
        const content = obj.message?.content;
        if (typeof content === "string") {
          firstQuestion = content.slice(0, 60);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && typeof block.text === "string") {
              firstQuestion = block.text.slice(0, 60);
              break;
            }
          }
        }
        firstQuestion ??= "";
      }
    } catch {
      // 跳过
    }
  }

  return { messageCount, lastMessageAt, firstQuestion, gitBranch, cwd };
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

// ============================================================
// 扫描
// ============================================================

const CLAUDE_PROJECTS_DIR = () => join(homedir(), ".claude", "projects");

/** 扫描所有 Claude Code 会话，返回元数据索引 */
export function scanClaudeSessions(): SessionMeta[] {
  const projectsDir = CLAUDE_PROJECTS_DIR();
  if (!existsSync(projectsDir)) return [];

  const results: SessionMeta[] = [];

  for (const dirName of readdirSync(projectsDir)) {
    const projectDir = join(projectsDir, dirName);
    if (!statSync(projectDir).isDirectory()) continue;

    // 找所有 .jsonl 文件
    for (const file of readdirSync(projectDir)) {
      if (!file.endsWith(".jsonl")) continue;
      const sessionId = basename(file, ".jsonl");
      const filePath = join(projectDir, file);

      try {
        const raw = readFileSync(filePath, "utf-8");
        const stats = scanSessionStats(raw);

        // 跳过空会话
        if (stats.messageCount === 0) continue;

        // 从 cwd 获取真实路径
        const projectPath = stats.cwd ?? dirName;
        const projectName = extractProjectName(projectPath);

        // 扫描阶段不做精简和 sha256（延迟到用户选择后）
        results.push({
          sessionId,
          app: "claude",
          projectDirName: dirName,
          projectPath,
          projectName,
          messageCount: stats.messageCount,
          lastMessageAt: stats.lastMessageAt,
          strippedSize: 0,
          sha256: "",
          firstQuestion: stats.firstQuestion,
          gitBranch: stats.gitBranch,
        });
      } catch {
        // 跳过无法读取的文件
      }
    }
  }

  // 按最后活跃时间倒序
  results.sort((a, b) => (b.lastMessageAt > a.lastMessageAt ? 1 : -1));
  return results;
}

/** 读取并精简单个 session 文件，返回精简内容 + sha256 + size */
export function readAndStripSession(meta: SessionMeta): { content: string; sha256: string; size: number } | null {
  const filePath = join(CLAUDE_PROJECTS_DIR(), meta.projectDirName, `${meta.sessionId}.jsonl`);
  if (!existsSync(filePath)) return null;
  try {
    const stripped = stripSession(readFileSync(filePath, "utf-8"));
    return {
      content: stripped,
      sha256: sha256Hex(stripped),
      size: Buffer.byteLength(stripped, "utf-8"),
    };
  } catch {
    return null;
  }
}
