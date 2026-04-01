/**
 * 将精简后的 session 写入目标 Claude Code projects 目录
 * 并追加 history.jsonl 记录以支持 claude --resume
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import type { SessionMeta } from "../readers/session.ts";

/**
 * 将精简后的 session 写入 ~/.claude/projects/<projectDirName>/<sessionId>.jsonl
 */
export function writeSession(
  meta: SessionMeta,
  content: string,
  dryRun: boolean,
): void {
  const targetDir = join(homedir(), ".claude", "projects", meta.projectDirName);

  if (dryRun) return;

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }
  writeFileSync(join(targetDir, `${meta.sessionId}.jsonl`), content, "utf-8");
}

/**
 * 加载 history.jsonl 中已有的 sessionId 集合（用于去重）。
 * 在 sync 循环开始前调用一次，避免每个 session 都全量读取。
 */
export function loadExistingHistorySessionIds(): Set<string> {
  const historyPath = join(homedir(), ".claude", "history.jsonl");
  const ids = new Set<string>();
  if (!existsSync(historyPath)) return ids;
  try {
    for (const line of readFileSync(historyPath, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.sessionId) ids.add(obj.sessionId);
      } catch { /* skip */ }
    }
  } catch { /* 读取失败返回空 Set */ }
  return ids;
}

/**
 * 追加 history.jsonl 记录，使 claude --resume 能找到同步过来的 session。
 * 传入已有 sessionId 集合用于去重。
 */
export function appendSessionToHistory(meta: SessionMeta, existingIds: Set<string>): void {
  if (existingIds.has(meta.sessionId)) return;

  const historyPath = join(homedir(), ".claude", "history.jsonl");
  const entry = {
    display: meta.firstQuestion ?? "(synced session)",
    pastedContents: {},
    timestamp: meta.lastMessageAt ? new Date(meta.lastMessageAt).getTime() : Date.now(),
    project: meta.projectPath,
    sessionId: meta.sessionId,
  };

  appendFileSync(historyPath, JSON.stringify(entry) + "\n", "utf-8");
  existingIds.add(meta.sessionId);
}
