/**
 * ccs diff - 预览 pull 前本机与云端的差异
 */

import type { Flags } from "../../ccs.ts";
import { readConfig, requireBackend } from "../config.ts";
import { createBackend } from "../backends/index.ts";
import { readAllMcp } from "../readers/mcp.ts";
import { readAllPrompts } from "../readers/prompt.ts";
import { readAllSkills } from "../readers/skill.ts";
import type { McpEntry } from "../readers/mcp.ts";
import type { SkillMeta } from "../readers/skill.ts";

export async function diffCommand(_flags: Flags): Promise<void> {
  const config = readConfig();
  const backend = requireBackend(config);

  console.log(`正在从 ${backend.type} 后端读取云端配置...`);
  const adapter = createBackend(backend);
  const remote = await adapter.read();

  if (!remote) {
    console.log("云端暂无配置。");
    return;
  }

  const localMcp = readAllMcp();
  const localPrompts = readAllPrompts();
  const localSkills = readAllSkills();

  console.log(`\n云端 bundle: ${remote.hostname} @ ${remote.pushedAt}\n`);

  // ---- MCP diff ----
  console.log("── MCP ──────────────────────────────────────");
  const localMcpIds = new Set(localMcp.map((e) => e.id));
  const remoteMcpIds = new Set(remote.mcp.map((e) => e.id));

  const mcpNew = remote.mcp.filter((e) => !localMcpIds.has(e.id));
  const mcpRemoved = localMcp.filter((e) => !remoteMcpIds.has(e.id));

  if (mcpNew.length === 0 && mcpRemoved.length === 0) {
    console.log("  (无差异)");
  } else {
    mcpNew.forEach((e) => console.log(`  + ${e.id}`));
    mcpRemoved.forEach((e) => console.log(`  - ${e.id}`));
  }

  // ---- Prompt diff ----
  console.log("\n── Prompt ───────────────────────────────────");
  const localPromptApps = new Set(localPrompts.map((p) => p.app));
  const remotePromptApps = new Set(remote.prompts.map((p) => p.app));

  let promptDiff = false;
  for (const p of remote.prompts) {
    const local = localPrompts.find((l) => l.app === p.app);
    if (!local) {
      console.log(`  + ${p.app} (新增)`);
      promptDiff = true;
    } else if (local.content !== p.content) {
      const remoteLines = p.content.split("\n").length;
      const localLines = local.content.split("\n").length;
      console.log(`  ~ ${p.app} (本机 ${localLines} 行 → 云端 ${remoteLines} 行)`);
      promptDiff = true;
    }
  }
  for (const p of localPrompts) {
    if (!remotePromptApps.has(p.app)) {
      console.log(`  - ${p.app} (云端已删除)`);
      promptDiff = true;
    }
  }
  if (!promptDiff) console.log("  (无差异)");

  // ---- Skill diff ----
  console.log("\n── Skill ────────────────────────────────────");
  const localSkillDirs = new Set(localSkills.map((s) => s.directory));
  const remoteSkillDirs = new Set(remote.skills.map((s) => s.directory));

  const skillNew = remote.skills.filter((s) => !localSkillDirs.has(s.directory));
  const skillRemoved = localSkills.filter((s) => !remoteSkillDirs.has(s.directory));

  if (skillNew.length === 0 && skillRemoved.length === 0) {
    console.log("  (无差异)");
  } else {
    skillNew.forEach((s) => {
      const repo = s.repo ? `  (${s.repo.owner}/${s.repo.name})` : "";
      console.log(`  + ${s.directory}${repo}`);
    });
    skillRemoved.forEach((s) => console.log(`  - ${s.directory}`));
  }

  console.log("");
  console.log("运行 ccs pull 应用上述变更。");
}
