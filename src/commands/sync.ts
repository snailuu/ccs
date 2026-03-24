/**
 * ccs sync - 从云端下载配置并应用到 CLI 工具
 *
 * 流程：
 *   1. 从云端拉取 bundle → 缓存到本地
 *   2. 选择类别（MCP / Prompt / Skill）
 *   3. 进入每个类别选择条目
 *   4. 选择目标 CLI 工具
 *   5. 预览 → 确认 → 写入
 */

import * as p from "@clack/prompts";
import type { Flags } from "../../ccs.ts";
import type { McpEntry } from "../readers/mcp.ts";
import type { PromptEntry } from "../readers/prompt.ts";
import type { SkillMeta } from "../readers/skill.ts";
import { readConfig, requireBackend, writeConfig, writeCachedBundle } from "../config.ts";
import { createBackend } from "../backends/index.ts";
import { writeMcp } from "../writers/mcp.ts";
import { writePrompts } from "../writers/prompt.ts";
import { writeSkills, formatPendingSkills } from "../writers/skill.ts";
import {
  selectMcpEntries, selectPromptEntries, selectSkillEntries,
  selectTargetApps,
  previewMcp, previewPrompts, previewSkills,
} from "../preview.ts";

export async function syncCommand(flags: Flags): Promise<void> {
  const config = readConfig();
  const backend = requireBackend(config);

  p.intro("ccs 同步");

  const s = p.spinner();
  s.start(`正在从 ${backend.type} 后端拉取配置...`);
  const adapter = createBackend(backend);
  const bundle = await adapter.read();
  s.stop("拉取完成");

  if (!bundle) {
    p.log.error("云端暂无配置，请先在其他机器上运行 ccs push");
    p.outro("已退出");
    process.exit(1);
  }

  // 缓存到本地
  writeCachedBundle(bundle);

  p.log.info(
    `云端 bundle:\n` +
    `  来源机器: ${bundle.hostname}\n` +
    `  推送时间: ${bundle.pushedAt}\n` +
    `  MCP: ${bundle.mcp.length} 个 | Prompt: ${bundle.prompts.length} 个应用 | Skill: ${bundle.skills.length} 个`
  );

  config.lastSync = new Date().toISOString();
  writeConfig(config);

  // 选择类别
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

  // 选择条目
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

  // 选择目标客户端
  const targetApps = await selectTargetApps();
  if (targetApps === null) { p.outro("已取消"); return; }

  // 预览
  previewMcp(selectedMcp);
  previewPrompts(selectedPrompts);
  previewSkills(selectedSkills);
  p.log.step(`目标客户端: ${targetApps.join(", ")}`);

  // 确认
  const confirmed = await p.confirm({
    message: "确认同步以上配置？",
  });
  if (p.isCancel(confirmed) || !confirmed) { p.outro("已取消"); return; }

  // 写入
  if (selectedMcp.length > 0) {
    const counts = writeMcp(selectedMcp, false, targetApps);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    p.log.success(`MCP: 写入 ${total} 条 (${targetApps.map((a) => `${a}:${counts[a]}`).join(" ")})`);
  }

  if (selectedPrompts.length > 0) {
    const written = writePrompts(selectedPrompts, false, targetApps);
    const apps = Object.entries(written)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    p.log.success(`Prompt: 写入应用 [${apps || "无"}]`);
  }

  if (selectedSkills.length > 0) {
    const result = writeSkills(selectedSkills, false, targetApps);
    p.log.success(`Skill: 跳过 ${result.skipped.length} 个（已安装），补充链接 ${result.linked.length} 个`);
    const pending = formatPendingSkills(result.pending);
    if (pending) p.log.warn(pending);
  }

  p.outro("同步完成");
}
