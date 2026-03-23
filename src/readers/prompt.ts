/**
 * 读取各 AI 客户端的 Prompt 配置
 *
 * Prompt 数据格式：每个应用一个文件内容
 */

import { existsSync, readFileSync } from "node:fs";
import { Paths, type AppName } from "./paths.ts";

export interface PromptEntry {
  app: AppName;
  /** 文件路径（调试用） */
  filePath: string;
  /** 文件内容 */
  content: string;
}

const PROMPT_FILES: { app: AppName; getter: () => string }[] = [
  { app: "claude", getter: Paths.claude.prompt },
  { app: "codex", getter: Paths.codex.prompt },
  { app: "gemini", getter: Paths.gemini.prompt },
  { app: "opencode", getter: Paths.opencode.prompt },
];

export function readAllPrompts(): PromptEntry[] {
  const results: PromptEntry[] = [];
  for (const { app, getter } of PROMPT_FILES) {
    const filePath = getter();
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf-8");
    if (content.trim()) {
      results.push({ app, filePath, content });
    }
  }
  return results;
}

export function readPromptForApp(app: AppName): PromptEntry | null {
  const pair = PROMPT_FILES.find((p) => p.app === app);
  if (!pair) return null;
  const filePath = pair.getter();
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  if (!content.trim()) return null;
  return { app, filePath, content };
}
