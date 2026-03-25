/**
 * ccs status - 显示本机当前配置摘要
 */

import type { Flags } from "../../ccs.ts";
import { readConfig, readCachedManifest } from "../config.ts";
import { readAllMcp } from "../readers/mcp.ts";
import { readAllPrompts } from "../readers/prompt.ts";
import { scanAllSkills, toSkillIndex } from "../readers/skill.ts";
import { AGENTS, detectInstalledAgents } from "../readers/paths.ts";

export async function statusCommand(_flags: Flags): Promise<void> {
  const config = readConfig();

  // 后端状态
  console.log("── 同步后端 ──────────────────────────────");
  const b = config.backend;
  if (!b) {
    console.log("  未配置（运行 ccs config）");
  } else {
    console.log(`  类型: webdav`);
    console.log(`  URL: ${b.url}`);
    console.log(`  路径: ${b.path ?? "/ccs-sync"}`);
  }
  if (config.lastPush) console.log(`  上次 push: ${config.lastPush}`);
  if (config.lastSync) console.log(`  上次 sync: ${config.lastSync}`);

  // 检测已安装的 agent
  console.log("\n── 检测到的 Agent ──────────────────────────");
  const installed = detectInstalledAgents();
  if (installed.length === 0) {
    console.log("  未检测到任何 agent");
  } else {
    for (const name of installed) {
      const agent = AGENTS[name];
      console.log(`  ${agent.displayName.padEnd(20)} ${agent.globalSkillsDir}`);
    }
  }

  // MCP
  const mcpEntries = readAllMcp();
  console.log(`\n── MCP (${mcpEntries.length} 个) ──────────────────────────────`);
  if (mcpEntries.length === 0) {
    console.log("  (无)");
  } else {
    for (const e of mcpEntries) {
      const apps = Object.entries(e.apps).filter(([, v]) => v).map(([k]) => k).join(",");
      console.log(`  ${e.id.padEnd(30)} [${apps}]`);
    }
  }

  // Prompts
  const prompts = readAllPrompts();
  console.log(`\n── Prompt (${prompts.length} 个) ────────────────────────────`);
  if (prompts.length === 0) {
    console.log("  (无)");
  } else {
    for (const pr of prompts) {
      const lines = pr.content.split("\n").length;
      console.log(`  ${pr.app.padEnd(12)} ${pr.filePath}  (${lines} 行)`);
    }
  }

  // Skills
  const skills = scanAllSkills();
  const indices = skills.map(toSkillIndex);
  console.log(`\n── Skill (${indices.length} 个) ─────────────────────────────`);
  if (indices.length === 0) {
    console.log("  (无)");
  } else {
    for (const s of indices) {
      const source = s.repo ? `${s.repo.owner}/${s.repo.name}` : (s.sourceType === "local" ? "本地" : "");
      const size = s.totalSize < 1024 ? `${s.totalSize}B` : `${(s.totalSize / 1024).toFixed(1)}KB`;
      console.log(`  ${s.directory.padEnd(30)} ${s.fileCount} 文件 (${size})  ${source}`);
    }
  }

  console.log("");
}
