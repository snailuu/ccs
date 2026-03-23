/**
 * ccs pull - 从云端下载配置并应用到本机
 */

import type { Flags } from "../../ccs.ts";
import { readConfig, requireBackend, writeConfig } from "../config.ts";
import { createBackend } from "../backends/index.ts";
import { writeMcp } from "../writers/mcp.ts";
import { writePrompts } from "../writers/prompt.ts";
import { writeSkills, formatPendingSkills } from "../writers/skill.ts";

export async function pullCommand(flags: Flags): Promise<void> {
  const config = readConfig();
  const backend = requireBackend(config);
  const only = flags.only;

  console.log(`正在从 ${backend.type} 后端拉取配置...`);
  const adapter = createBackend(backend);
  const bundle = await adapter.read();

  if (!bundle) {
    console.error("云端暂无配置，请先在其他机器上运行 ccs push");
    process.exit(1);
  }

  console.log(`\n云端 bundle 信息:`);
  console.log(`  来源机器: ${bundle.hostname}`);
  console.log(`  推送时间: ${bundle.pushedAt}`);
  console.log(`  MCP 服务器: ${bundle.mcp.length} 个`);
  console.log(`  Prompt:     ${bundle.prompts.length} 个应用`);
  console.log(`  Skill:      ${bundle.skills.length} 个`);

  if (flags.dryRun) {
    console.log("\n[dry-run] 预览模式，不会写入任何文件");
    console.log("运行 ccs diff 可查看详细差异");
    return;
  }

  console.log("");

  // MCP
  if (!only || only.includes("mcp")) {
    const counts = writeMcp(bundle.mcp, false);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`✓ MCP: 写入 ${total} 条 (claude:${counts.claude} codex:${counts.codex} gemini:${counts.gemini} opencode:${counts.opencode})`);
  }

  // Prompt
  if (!only || only.includes("prompt")) {
    const written = writePrompts(bundle.prompts, false);
    const apps = Object.entries(written)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    console.log(`✓ Prompt: 写入应用 [${apps || "无"}]`);
  }

  // Skill
  if (!only || only.includes("skill")) {
    const result = writeSkills(bundle.skills, false);
    console.log(`✓ Skill: 跳过 ${result.skipped.length} 个（已安装），补充链接 ${result.linked.length} 个`);
    const pending = formatPendingSkills(result.pending);
    if (pending) console.log("\n" + pending);
  }

  // 记录 lastPull
  config.lastPull = new Date().toISOString();
  writeConfig(config);

  console.log("\n完成。");
}
