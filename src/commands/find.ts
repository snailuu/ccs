/**
 * ccs find - 浏览本地 MCP / Skill / Prompt 配置
 *
 * 带搜索框的交互式列表，选中后展示详情。
 */

import * as p from "@clack/prompts";
import { readAllMcp, type McpEntry } from "../readers/mcp.ts";
import { readAllPrompts, type PromptEntry } from "../readers/prompt.ts";
import { scanAllSkills, type ScannedSkill } from "../readers/skill.ts";

type FindType = "mcp" | "skill" | "prompt";

const VALID_TYPES: FindType[] = ["mcp", "skill", "prompt"];

export async function findCommand(typeArg?: string): Promise<void> {
  p.intro("ccs find");

  let type: FindType;

  if (typeArg && VALID_TYPES.includes(typeArg as FindType)) {
    type = typeArg as FindType;
  } else if (typeArg) {
    p.log.error(`未知类型: ${typeArg}（可选: mcp, skill, prompt）`);
    process.exit(1);
  } else {
    const result = await p.select({
      message: "查找哪种类型？",
      options: [
        { value: "mcp" as const, label: "MCP 服务器", hint: "本地已配置的 MCP 服务" },
        { value: "skill" as const, label: "Skill", hint: "本地已安装的 Skill 包" },
        { value: "prompt" as const, label: "Prompt", hint: "各客户端的 Prompt 文件" },
      ],
    });
    if (p.isCancel(result)) return;
    type = result;
  }

  switch (type) {
    case "mcp":
      await findMcp();
      break;
    case "skill":
      await findSkill();
      break;
    case "prompt":
      await findPrompt();
      break;
  }
}

// ============================================================
// MCP
// ============================================================

async function findMcp(): Promise<void> {
  const entries = readAllMcp();
  if (entries.length === 0) {
    p.log.warn("未检测到任何 MCP 服务器");
    return;
  }

  const options = entries.map((e) => {
    const apps = Object.entries(e.apps)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    const type = e.type ?? "stdio";
    return { value: e.id, label: e.id, hint: `${type} · ${apps}` };
  });

  const selected = await p.autocomplete({
    message: `MCP 服务器 (${entries.length} 个)`,
    options,
    placeholder: "输入关键词搜索…",
  });
  if (p.isCancel(selected)) return;

  const entry = entries.find((e) => e.id === selected);
  if (entry) showMcpDetail(entry);
}

function showMcpDetail(e: McpEntry): void {
  const type = e.type ?? "stdio";
  const apps = Object.entries(e.apps)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");
  const target = e.command
    ? `${e.command}${e.args?.length ? " " + e.args.join(" ") : ""}`
    : e.url ?? "—";

  const lines = [
    `  ID:      ${e.id}`,
    `  类型:    ${type}`,
    `  命令:    ${target}`,
    `  应用:    ${apps}`,
  ];

  if (e.env && Object.keys(e.env).length > 0) {
    lines.push(`  环境变量:`);
    for (const [k, v] of Object.entries(e.env)) {
      // 隐藏 token/secret 类变量的值
      const masked = /token|secret|key|password/i.test(k) ? "***" : v;
      lines.push(`    ${k}=${masked}`);
    }
  }

  p.note(lines.join("\n"), e.id);
}

// ============================================================
// Skill
// ============================================================

async function findSkill(): Promise<void> {
  const skills = scanAllSkills();
  if (skills.length === 0) {
    p.log.warn("未检测到任何 Skill");
    return;
  }

  const options = skills.map((s) => {
    const size =
      s.files.reduce((sum, f) => sum + f.content.length, 0);
    const sizeStr = size < 1024 ? `${size}B` : `${(size / 1024).toFixed(1)}KB`;
    const desc = s.description ? ` · ${s.description.slice(0, 30)}` : "";
    const cmd = s.directory !== s.name ? ` (/${s.directory})` : "";
    return {
      value: s.directory,
      label: `${s.name || s.directory}${cmd}`,
      hint: `${s.files.length} 个文件 · ${sizeStr}${desc}`,
    };
  });

  const selected = await p.autocomplete({
    message: `Skill (${skills.length} 个)`,
    options,
    placeholder: "输入关键词搜索…",
  });
  if (p.isCancel(selected)) return;

  const skill = skills.find((s) => s.directory === selected);
  if (skill) showSkillDetail(skill);
}

function showSkillDetail(s: ScannedSkill): void {
  const size = s.files.reduce((sum, f) => sum + f.content.length, 0);
  const sizeStr = size < 1024 ? `${size}B` : `${(size / 1024).toFixed(1)}KB`;
  const source = s.repo
    ? `${s.repo.owner}/${s.repo.name}${s.repo.branch ? `@${s.repo.branch}` : ""}`
    : s.sourceType === "local"
      ? "本地"
      : "未知";
  const agents = Object.entries(s.agents)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");

  const lines = [
    `  名称:      ${s.name || s.directory}`,
    `  目录:      ${s.directory}`,
    `  路径:      ${s.path}`,
    `  来源:      ${source}`,
    `  文件数:    ${s.files.length} (${sizeStr})`,
    `  发现于:    ${s.foundIn.join(", ")}`,
  ];

  if (agents) lines.push(`  启用 Agent: ${agents}`);
  if (s.description) lines.push(`  简述:      ${s.description}`);
  if (s.sourceUrl) lines.push(`  源 URL:    ${s.sourceUrl}`);

  p.note(lines.join("\n"), s.name || s.directory);
}

// ============================================================
// Prompt
// ============================================================

async function findPrompt(): Promise<void> {
  const prompts = readAllPrompts();
  if (prompts.length === 0) {
    p.log.warn("未检测到任何 Prompt 文件");
    return;
  }

  const options = prompts.map((e) => ({
    value: e.app,
    label: e.app,
    hint: `${e.content.split("\n").length} 行 · ${e.filePath}`,
  }));

  const selected = await p.autocomplete({
    message: `Prompt (${prompts.length} 个)`,
    options,
    placeholder: "输入关键词搜索…",
  });
  if (p.isCancel(selected)) return;

  const entry = prompts.find((e) => e.app === selected);
  if (entry) showPromptDetail(entry);
}

function showPromptDetail(e: PromptEntry): void {
  const lineCount = e.content.split("\n").length;
  const separator = "─".repeat(40);
  p.note(
    `  应用: ${e.app}\n  路径: ${e.filePath}\n  行数: ${lineCount}\n\n${separator}\n${e.content}\n${separator}`,
    `Prompt [${e.app}]`,
  );
}
