/**
 * ccs sync - 交互式选择并同步云端配置到本机
 *
 * 流程：
 *   1. 从云端拉取 bundle
 *   2. 选择要同步的类别（MCP / Prompt / Skill）
 *   3. 在每个类别中选择具体条目
 *   4. 预览选中的内容
 *   5. 用户确认后写入
 */

import * as p from "@clack/prompts";
import type { Flags } from "../../ccs.ts";
import type { McpEntry } from "../readers/mcp.ts";
import type { PromptEntry } from "../readers/prompt.ts";
import type { SkillMeta } from "../readers/skill.ts";
import { readConfig, requireBackend, writeConfig } from "../config.ts";
import { createBackend } from "../backends/index.ts";
import { writeMcp } from "../writers/mcp.ts";
import { writePrompts } from "../writers/prompt.ts";
import { writeSkills, formatPendingSkills } from "../writers/skill.ts";
import {
  selectMcpEntries, selectPromptEntries, selectSkillEntries,
  previewMcp, previewPrompts, previewSkills,
} from "../preview.ts";

export async function syncCommand(flags: Flags): Promise<void> {
  const config = readConfig();
  const backend = requireBackend(config);

  p.intro("ccs 交互式同步");

  const s = p.spinner();
  s.start("正在从云端拉取配置...");
  const adapter = createBackend(backend);
  const bundle = await adapter.read();
  s.stop("拉取完成");

  if (!bundle) {
    p.log.error("云端暂无配置，请先在其他机器上运行 ccs push");
    p.outro("已退出");
    process.exit(1);
  }

  p.log.info(
    `云端 bundle:\n` +
    `  来源机器: ${bundle.hostname}\n` +
    `  推送时间: ${bundle.pushedAt}\n` +
    `  MCP: ${bundle.mcp.length} 个 | Prompt: ${bundle.prompts.length} 个应用 | Skill: ${bundle.skills.length} 个`
  );

  // 确定要同步的类别
  let categories: string[];

  if (flags.only) {
    categories = flags.only;
  } else {
    const categoryOptions: { value: string; label: string; hint: string }[] = [];
    if (bundle.mcp.length > 0)
      categoryOptions.push({ value: "mcp", label: "MCP 服务器", hint: `${bundle.mcp.length} 个` });
    if (bundle.prompts.length > 0)
      categoryOptions.push({ value: "prompt", label: "Prompt", hint: `${bundle.prompts.length} 个应用` });
    if (bundle.skills.length > 0)
      categoryOptions.push({ value: "skill", label: "Skill", hint: `${bundle.skills.length} 个` });

    if (categoryOptions.length === 0) {
      p.log.warn("云端 bundle 为空，没有可同步的内容");
      p.outro("已退出");
      return;
    }

    const selected = await p.multiselect({
      message: "选择要同步的类型",
      options: categoryOptions,
      required: true,
    });
    if (p.isCancel(selected)) { p.outro("已取消"); return; }
    categories = selected;
  }

  // 进入每个类别选择条目
  let selectedMcp: McpEntry[] = [];
  let selectedPrompts: PromptEntry[] = [];
  let selectedSkills: SkillMeta[] = [];

  if (categories.includes("mcp")) {
    const result = await selectMcpEntries(bundle.mcp);
    if (result === null) { p.outro("已取消"); return; }
    selectedMcp = result;
  }

  if (categories.includes("prompt")) {
    const result = await selectPromptEntries(bundle.prompts);
    if (result === null) { p.outro("已取消"); return; }
    selectedPrompts = result;
  }

  if (categories.includes("skill")) {
    const result = await selectSkillEntries(bundle.skills);
    if (result === null) { p.outro("已取消"); return; }
    selectedSkills = result;
  }

  // 预览
  previewMcp(selectedMcp);
  previewPrompts(selectedPrompts);
  previewSkills(selectedSkills);

  // 确认
  const confirmed = await p.confirm({
    message: "确认同步以上内容？",
  });
  if (p.isCancel(confirmed) || !confirmed) { p.outro("已取消"); return; }

  // 写入
  if (selectedMcp.length > 0) {
    const counts = writeMcp(selectedMcp, false);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    p.log.success(`MCP: 写入 ${total} 条 (claude:${counts.claude} codex:${counts.codex} gemini:${counts.gemini} opencode:${counts.opencode})`);
  }

  if (selectedPrompts.length > 0) {
    const written = writePrompts(selectedPrompts, false);
    const apps = Object.entries(written)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    p.log.success(`Prompt: 写入应用 [${apps || "无"}]`);
  }

  if (selectedSkills.length > 0) {
    const result = writeSkills(selectedSkills, false);
    p.log.success(`Skill: 跳过 ${result.skipped.length} 个（已安装），补充链接 ${result.linked.length} 个`);
    const pending = formatPendingSkills(result.pending);
    if (pending) p.log.warn(pending);
  }

  config.lastSync = new Date().toISOString();
  writeConfig(config);

  p.outro("同步完成");
}
