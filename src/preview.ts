/**
 * 共享的预览展示和条目选择函数
 */

import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import type { McpEntry } from "./readers/mcp.ts";
import type { PromptEntry } from "./readers/prompt.ts";
import type { SkillIndex } from "./manifest.ts";
import { Paths, ALL_APPS, type AppName, AGENTS, ALL_AGENT_NAMES, detectInstalledAgents } from "./readers/paths.ts";

// ============================================================
// 客户端选择器（MCP / Prompt 用）
// ============================================================

const APP_LABELS: Record<AppName, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
};

export async function selectTargetApps(): Promise<AppName[] | null> {
  const detected = ALL_APPS.filter((app) => existsSync(Paths[app].dir()));
  const options = ALL_APPS.map((app) => ({
    value: app,
    label: APP_LABELS[app],
    hint: detected.includes(app) ? Paths[app].dir() : "未检测到",
  }));

  const result = await p.multiselect({
    message: "同步到哪些客户端？",
    options,
    initialValues: detected,
  });
  if (p.isCancel(result)) return null;
  return result;
}

// ============================================================
// Agent 选择器（Skill 用）
// ============================================================

export async function selectTargetAgents(): Promise<string[] | null> {
  const installed = detectInstalledAgents();

  const universalOptions: { value: string; label: string; hint: string }[] = [];
  const additionalOptions: { value: string; label: string; hint: string }[] = [];

  for (const name of ALL_AGENT_NAMES) {
    const agent = AGENTS[name];
    const isInstalled = installed.includes(name);
    const option = {
      value: name,
      label: agent.displayName,
      hint: isInstalled ? agent.globalSkillsDir : "未检测到",
    };
    if (agent.isUniversal) universalOptions.push(option);
    else additionalOptions.push(option);
  }

  const result = await p.multiselect({
    message: "同步 Skill 到哪些 Agent？（Universal agents 共享 ~/.agents/skills/）",
    options: [...additionalOptions, ...universalOptions],
    initialValues: installed,
  });
  if (p.isCancel(result)) return null;
  return result;
}

// ============================================================
// 带全选/自定义的 multiselect
// ============================================================

interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

async function multiselectWithAllToggle(
  message: string,
  options: SelectOption[],
): Promise<string[] | null> {
  const mode = await p.select({
    message,
    options: [
      { value: "all", label: "全部选择", hint: `共 ${options.length} 项` },
      { value: "custom", label: "自定义选择", hint: "逐项勾选" },
    ],
  });
  if (p.isCancel(mode)) return null;

  if (mode === "all") {
    const result = await p.multiselect({
      message: `${message}（取消不需要的）`,
      options,
      initialValues: options.map((o) => o.value),
    });
    if (p.isCancel(result)) return null;
    return result;
  }

  const result = await p.multiselect({
    message: `${message}（勾选需要的）`,
    options,
  });
  if (p.isCancel(result)) return null;
  return result;
}

// ============================================================
// 条目选择器
// ============================================================

export async function selectMcpEntries(entries: McpEntry[]): Promise<McpEntry[] | null> {
  const options = entries.map((e) => {
    const apps = Object.entries(e.apps).filter(([, v]) => v).map(([k]) => k).join(", ");
    return { value: e.id, label: e.id, hint: apps };
  });
  const selected = await multiselectWithAllToggle("MCP 服务器", options);
  if (selected === null) return null;
  const ids = new Set(selected);
  return entries.filter((e) => ids.has(e.id));
}

export async function selectPromptEntries(entries: PromptEntry[]): Promise<PromptEntry[] | null> {
  const options = entries.map((e) => ({
    value: e.app,
    label: e.app,
    hint: `${e.content.split("\n").length} 行`,
  }));
  const selected = await multiselectWithAllToggle("Prompt", options);
  if (selected === null) return null;
  const apps = new Set(selected);
  return entries.filter((e) => apps.has(e.app));
}

export async function selectSkillEntries(entries: SkillIndex[]): Promise<SkillIndex[] | null> {
  const options = entries.map((e) => {
    const size = e.totalSize < 1024 ? `${e.totalSize}B` : `${(e.totalSize / 1024).toFixed(1)}KB`;
    const hint = `${e.fileCount} 个文件 (${size})${e.description ? " | " + e.description.slice(0, 25) : ""}`;
    return { value: e.directory, label: e.name || e.directory, hint };
  });
  const selected = await multiselectWithAllToggle("Skill", options);
  if (selected === null) return null;
  const dirs = new Set(selected);
  return entries.filter((e) => dirs.has(e.directory));
}

// ============================================================
// 预览
// ============================================================

export function previewMcp(entries: McpEntry[]): void {
  if (entries.length === 0) return;
  const lines = entries.map((e) => {
    const apps = Object.entries(e.apps).filter(([, v]) => v).map(([k]) => k).join(", ");
    const type = e.type ?? "stdio";
    const target = e.command
      ? `${e.command}${e.args?.length ? " " + e.args.join(" ") : ""}`
      : e.url ?? "";
    return `  ${e.id} (${type})\n    命令: ${target}\n    应用: ${apps}`;
  });
  p.log.step(`MCP 服务器 (${entries.length} 个):\n${lines.join("\n")}`);
}

export function previewPrompts(entries: PromptEntry[]): void {
  if (entries.length === 0) return;
  for (const e of entries) {
    const separator = "─".repeat(40);
    p.log.step(
      `Prompt [${e.app}] (${e.content.split("\n").length} 行):\n${separator}\n${e.content}\n${separator}`
    );
  }
}

export function previewSkills(entries: SkillIndex[]): void {
  if (entries.length === 0) return;
  const lines = entries.map((e) => {
    const source = e.repo ? `${e.repo.owner}/${e.repo.name}` : (e.sourceType === "local" ? "本地" : "未知");
    const size = e.totalSize < 1024 ? `${e.totalSize}B` : `${(e.totalSize / 1024).toFixed(1)}KB`;
    return `  ${e.name || e.directory}\n    来源: ${source} | ${e.fileCount} 个文件 (${size})`;
  });
  p.log.step(`Skill (${entries.length} 个):\n${lines.join("\n")}`);
}
