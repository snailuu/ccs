/**
 * ccs status - 显示本机当前配置摘要
 */

import type { Flags } from "../../ccs.ts";
import { readConfig } from "../config.ts";
import { readAllMcp } from "../readers/mcp.ts";
import { readAllPrompts } from "../readers/prompt.ts";
import { readAllSkills } from "../readers/skill.ts";
import { Paths, ALL_APPS } from "../readers/paths.ts";
import { existsSync } from "node:fs";

export async function statusCommand(_flags: Flags): Promise<void> {
  const config = readConfig();

  // 后端状态
  const backend = config.backend;
  console.log("── 同步后端 ──────────────────────────────");
  if (!backend) {
    console.log("  未配置（运行 ccs config set backend gist|webdav|local）");
  } else {
    console.log(`  类型: ${backend.type}`);
    if (backend.type === "gist") {
      console.log(`  Gist ID: ${backend.gistId ?? "(首次 push 后生成)"}`);
      console.log(`  Token: ${backend.token ? "已配置" : "未配置"}`);
    } else if (backend.type === "webdav") {
      console.log(`  URL: ${backend.url}`);
      console.log(`  路径: ${backend.path ?? "/ccs-sync/bundle.json"}`);
    } else if (backend.type === "local") {
      console.log(`  文件: ${backend.path}`);
    }
  }
  if (config.lastPush) console.log(`  上次 push: ${config.lastPush}`);
  if (config.lastPull) console.log(`  上次 pull: ${config.lastPull}`);

  // 检测已安装的客户端
  console.log("\n── 检测到的 AI 客户端 ───────────────────────");
  const detected: string[] = [];
  if (existsSync(Paths.claude.dir())) detected.push("Claude Code (~/.claude)");
  if (existsSync(Paths.codex.dir())) detected.push("Codex (~/.codex)");
  if (existsSync(Paths.gemini.dir())) detected.push("Gemini (~/.gemini)");
  if (existsSync(Paths.opencode.dir())) detected.push("OpenCode (~/.config/opencode)");
  if (detected.length === 0) console.log("  未检测到任何客户端配置目录");
  else detected.forEach((d) => console.log(`  ✓ ${d}`));

  // MCP
  const mcpEntries = readAllMcp();
  console.log(`\n── MCP (${mcpEntries.length} 个服务器) ──────────────────────────`);
  if (mcpEntries.length === 0) {
    console.log("  (无)");
  } else {
    for (const e of mcpEntries) {
      const apps = Object.entries(e.apps)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(",");
      console.log(`  ${e.id.padEnd(30)} [${apps}]`);
    }
  }

  // Prompts
  const prompts = readAllPrompts();
  console.log(`\n── Prompt (${prompts.length} 个) ────────────────────────────`);
  if (prompts.length === 0) {
    console.log("  (无)");
  } else {
    for (const p of prompts) {
      const lines = p.content.split("\n").length;
      console.log(`  ${p.app.padEnd(12)} ${p.filePath}  (${lines} 行)`);
    }
  }

  // Skills
  const skills = readAllSkills();
  console.log(`\n── Skill (${skills.length} 个) ─────────────────────────────`);
  if (skills.length === 0) {
    console.log("  (无)");
  } else {
    for (const s of skills) {
      const apps = Object.entries(s.apps)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(",");
      const repoStr = s.repo ? `  ${s.repo.owner}/${s.repo.name}` : "";
      console.log(`  ${s.directory.padEnd(30)} [${apps}]${repoStr}`);
    }
  }

  console.log("");
}
