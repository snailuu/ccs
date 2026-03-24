/**
 * ccs push - 交互式预览并上传本机配置到云端
 *
 * 流程：
 *   A. 全部推送：展示摘要 → 确认 → 上传
 *   B. 选择性推送：逐类分步选择 → 预览 → 确认 → 上传
 */

import * as p from "@clack/prompts";
import type { Flags } from "../../ccs.ts";
import type { McpEntry } from "../readers/mcp.ts";
import type { PromptEntry } from "../readers/prompt.ts";
import type { SkillMeta } from "../readers/skill.ts";
import { readAllMcp } from "../readers/mcp.ts";
import { readAllPrompts } from "../readers/prompt.ts";
import { readAllSkills } from "../readers/skill.ts";
import { readConfig, requireBackend, writeConfig } from "../config.ts";
import { createBackend } from "../backends/index.ts";
import {
  selectMcpEntries, selectPromptEntries, selectSkillEntries,
  previewMcp, previewPrompts, previewSkills,
} from "../preview.ts";
import { hostname } from "node:os";
import type { SyncBundle } from "../bundle.ts";

export async function pushCommand(flags: Flags): Promise<void> {
  const config = readConfig();
  const backend = requireBackend(config);

  p.intro("ccs 推送配置");

  // 读取本机全部配置
  const allMcp = readAllMcp();
  const allPrompts = readAllPrompts();
  const allSkills = readAllSkills();

  p.log.info(
    `本机配置:\n` +
    `  MCP 服务器: ${allMcp.length} 个\n` +
    `  Prompt: ${allPrompts.length} 个应用\n` +
    `  Skill: ${allSkills.length} 个`
  );

  if (allMcp.length === 0 && allPrompts.length === 0 && allSkills.length === 0) {
    p.log.warn("本机无可推送的配置");
    p.outro("已退出");
    return;
  }

  // 收集选中的条目
  let selectedMcp: McpEntry[];
  let selectedPrompts: PromptEntry[];
  let selectedSkills: SkillMeta[];

  if (flags.only) {
    // --only 模式：指定类别全量推送，跳过交互
    selectedMcp = flags.only.includes("mcp") ? allMcp : [];
    selectedPrompts = flags.only.includes("prompt") ? allPrompts : [];
    selectedSkills = flags.only.includes("skill") ? allSkills : [];
  } else {
    // 选择推送方式
    const mode = await p.select({
      message: "推送方式",
      options: [
        { value: "all", label: "全部推送", hint: "推荐" },
        { value: "selective", label: "选择性推送", hint: "逐类分步选择" },
      ],
    });
    if (p.isCancel(mode)) { p.outro("已取消"); return; }

    if (mode === "all") {
      // 全部推送：直接使用全量数据
      selectedMcp = allMcp;
      selectedPrompts = allPrompts;
      selectedSkills = allSkills;
    } else {
      // 选择性推送：逐类分步
      selectedMcp = [];
      selectedPrompts = [];
      selectedSkills = [];

      // Step 1: MCP
      if (allMcp.length > 0) {
        p.log.step(`Step 1/3 · MCP 服务器 (${allMcp.length} 个)`);
        const result = await selectMcpEntries(allMcp);
        if (result === null) { p.outro("已取消"); return; }
        selectedMcp = result;
      }

      // Step 2: Prompt
      if (allPrompts.length > 0) {
        p.log.step(`Step 2/3 · Prompt (${allPrompts.length} 个应用)`);
        const result = await selectPromptEntries(allPrompts);
        if (result === null) { p.outro("已取消"); return; }
        selectedPrompts = result;
      }

      // Step 3: Skill
      if (allSkills.length > 0) {
        p.log.step(`Step 3/3 · Skill (${allSkills.length} 个)`);
        const result = await selectSkillEntries(allSkills);
        if (result === null) { p.outro("已取消"); return; }
        selectedSkills = result;
      }
    }
  }

  // 预览
  previewMcp(selectedMcp);
  previewPrompts(selectedPrompts);
  previewSkills(selectedSkills);

  if (flags.dryRun) {
    p.log.warn("[dry-run] 预览模式，不会上传");
    p.outro("已退出");
    return;
  }

  // 确认
  const confirmed = await p.confirm({
    message: `确认推送到 ${backend.type} 后端？`,
  });
  if (p.isCancel(confirmed) || !confirmed) { p.outro("已取消"); return; }

  // 构建 bundle 并上传
  const bundle: SyncBundle = {
    version: "1",
    pushedAt: new Date().toISOString(),
    hostname: hostname(),
    mcp: selectedMcp,
    prompts: selectedPrompts,
    skills: selectedSkills,
  };

  const s = p.spinner();
  s.start(`正在上传到 ${backend.type} 后端...`);
  const adapter = createBackend(backend);
  const { url } = await adapter.write(bundle);
  s.stop("上传完成");

  // 记录 lastPush
  config.lastPush = bundle.pushedAt;
  writeConfig(config);

  p.log.success(`上传成功 (${bundle.pushedAt})`);
  if (url) p.log.step(`地址: ${url}`);

  p.outro("推送完成");
}
