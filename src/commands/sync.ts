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
    // --only 模式：跳过类别选择
    categories = flags.only;
  } else {
    // 交互式选择类别
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

  // 收集所有选中的条目
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

// ============================================================
// 条目选择器
// ============================================================

async function selectMcpEntries(entries: McpEntry[]): Promise<McpEntry[] | null> {
  const result = await p.multiselect({
    message: "选择要同步的 MCP 服务器",
    options: entries.map((e) => {
      const apps = Object.entries(e.apps)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ");
      return { value: e.id, label: e.id, hint: apps };
    }),
    required: true,
  });
  if (p.isCancel(result)) return null;
  const ids = new Set(result);
  return entries.filter((e) => ids.has(e.id));
}

async function selectPromptEntries(entries: PromptEntry[]): Promise<PromptEntry[] | null> {
  const result = await p.multiselect({
    message: "选择要同步的 Prompt",
    options: entries.map((e) => {
      const lines = e.content.split("\n").length;
      return { value: e.app, label: e.app, hint: `${lines} 行` };
    }),
    required: true,
  });
  if (p.isCancel(result)) return null;
  const apps = new Set(result);
  return entries.filter((e) => apps.has(e.app));
}

async function selectSkillEntries(entries: SkillMeta[]): Promise<SkillMeta[] | null> {
  const result = await p.multiselect({
    message: "选择要同步的 Skill",
    options: entries.map((e) => {
      const apps = Object.entries(e.apps)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ");
      const hint = e.description
        ? `${e.description.slice(0, 30)}${e.description.length > 30 ? "…" : ""} | ${apps}`
        : apps;
      return { value: e.directory, label: e.name || e.directory, hint };
    }),
    required: true,
  });
  if (p.isCancel(result)) return null;
  const dirs = new Set(result);
  return entries.filter((e) => dirs.has(e.directory));
}

// ============================================================
// 预览
// ============================================================

function previewMcp(entries: McpEntry[]): void {
  if (entries.length === 0) return;

  const lines = entries.map((e) => {
    const apps = Object.entries(e.apps)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    const type = e.type ?? "stdio";
    const target = e.command
      ? `${e.command}${e.args?.length ? " " + e.args.join(" ") : ""}`
      : e.url ?? "";
    return `  ${e.id} (${type})\n    命令: ${target}\n    应用: ${apps}`;
  });

  p.log.step(`MCP 服务器 (${entries.length} 个):\n${lines.join("\n")}`);
}

function previewPrompts(entries: PromptEntry[]): void {
  if (entries.length === 0) return;

  for (const e of entries) {
    const separator = "─".repeat(40);
    p.log.step(
      `Prompt [${e.app}] (${e.content.split("\n").length} 行):\n` +
      `${separator}\n${e.content}\n${separator}`
    );
  }
}

function previewSkills(entries: SkillMeta[]): void {
  if (entries.length === 0) return;

  const lines = entries.map((e) => {
    const apps = Object.entries(e.apps)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    const repo = e.repo ? `${e.repo.owner}/${e.repo.name}` : "本地";
    return `  ${e.name || e.directory}\n    目录: ${e.directory} | 来源: ${repo}\n    应用: ${apps}`;
  });

  p.log.step(`Skill (${entries.length} 个):\n${lines.join("\n")}`);
}
