/**
 * 将 bundle 中的 Prompt 写入各 AI 客户端
 */

import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { PromptEntry } from "../readers/prompt.ts";
import { Paths, type AppName } from "../readers/paths.ts";

const APP_PROMPT_PATH: Record<AppName, () => string> = {
  claude: Paths.claude.prompt,
  codex: Paths.codex.prompt,
  gemini: Paths.gemini.prompt,
  opencode: Paths.opencode.prompt,
};

export function writePrompts(
  entries: PromptEntry[],
  dryRun: boolean,
  targetApps?: AppName[]
): Record<AppName, boolean> {
  const result: Record<AppName, boolean> = {
    claude: false,
    codex: false,
    gemini: false,
    opencode: false,
  };

  for (const entry of entries) {
    if (targetApps && !targetApps.includes(entry.app)) continue;
    const getter = APP_PROMPT_PATH[entry.app];
    if (!getter) continue;
    const path = getter();
    const dir = dirname(path);
    if (!existsSync(dir)) {
      if (!dryRun) mkdirSync(dir, { recursive: true });
    }
    if (!dryRun) writeFileSync(path, entry.content, "utf-8");
    result[entry.app] = true;
  }

  return result;
}
