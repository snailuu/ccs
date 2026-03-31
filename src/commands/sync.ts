/**
 * ccs sync - 从 WebDAV 拉取索引，按需下载并应用配置
 *
 * 流程：
 *   1. 拉取 manifest.json（轻量索引）
 *   2. 选择类别和条目
 *   3. MCP/Prompt 直接从 manifest 获取
 *   4. Skill 按需下载 → 写入 canonical → 补 symlink
 */

import * as p from "@clack/prompts";
import type { Flags } from "../../ccs.ts";
import type { McpEntry } from "../readers/mcp.ts";
import type { PromptEntry } from "../readers/prompt.ts";
import type { SkillIndex, SkillPackage } from "../manifest.ts";
import {
  readConfig, requireBackend, writeConfig,
  writeCachedManifest, readCachedSkillPackage, writeCachedSkillFiles,
} from "../config.ts";
import { createWebDavClient } from "../backends/index.ts";
import { writeMcp } from "../writers/mcp.ts";
import { writePrompts } from "../writers/prompt.ts";
import { writeSkillPackages } from "../writers/skill.ts";
import {
  selectMcpEntries, selectPromptEntries, selectSkillEntries,
  selectTargetApps, selectTargetAgents,
  previewMcp, previewPrompts, previewSkills,
} from "../preview.ts";

export async function syncCommand(flags: Flags): Promise<void> {
  const config = readConfig();
  const backend = requireBackend(config);
  const client = createWebDavClient(backend);

  p.intro("ccs 同步");

  // 1. 拉取索引
  const s = p.spinner();
  s.start("正在拉取索引...");
  const manifest = await client.downloadManifest();
  s.stop("索引拉取完成");

  if (!manifest) {
    p.log.error("云端暂无配置，请先在其他机器上运行 ccs push");
    p.outro("已退出");
    process.exit(1);
  }

  writeCachedManifest(manifest);

  p.log.info(
    `云端配置:\n` +
    `  来源机器: ${manifest.hostname}\n` +
    `  推送时间: ${manifest.pushedAt}\n` +
    `  MCP: ${manifest.mcp.length} 个 | Prompt: ${manifest.prompts.length} 个 | Skill: ${manifest.skills.length} 个`
  );

  config.lastSync = new Date().toISOString();
  writeConfig(config);

  // 2. 选择类别
  let categories: string[];

  if (flags.only) {
    categories = flags.only;
  } else {
    const categoryOptions: { value: string; label: string; hint: string }[] = [];
    if (manifest.mcp.length > 0)
      categoryOptions.push({ value: "mcp", label: "MCP 服务器", hint: `${manifest.mcp.length} 个` });
    if (manifest.prompts.length > 0)
      categoryOptions.push({ value: "prompt", label: "Prompt", hint: `${manifest.prompts.length} 个` });
    if (manifest.skills.length > 0)
      categoryOptions.push({ value: "skill", label: "Skill", hint: `${manifest.skills.length} 个` });

    if (categoryOptions.length === 0) {
      p.log.warn("云端配置为空");
      p.outro("已退出");
      return;
    }

    const selected = await p.multiselect({
      message: "选择要同步的类型",
      options: categoryOptions,
    });
    if (p.isCancel(selected)) { p.outro("已取消"); return; }
    if (selected.length === 0) { p.outro("未选择任何类型"); return; }
    categories = selected;
  }

  // 3. 选择条目
  let selectedMcp: McpEntry[] = [];
  let selectedPrompts: PromptEntry[] = [];
  let selectedSkills: SkillIndex[] = [];

  if (categories.includes("mcp")) {
    const result = await selectMcpEntries(manifest.mcp);
    if (result === null) { p.outro("已取消"); return; }
    selectedMcp = result;
  }

  if (categories.includes("prompt")) {
    const result = await selectPromptEntries(manifest.prompts);
    if (result === null) { p.outro("已取消"); return; }
    selectedPrompts = result;
  }

  if (categories.includes("skill")) {
    const result = await selectSkillEntries(manifest.skills);
    if (result === null) { p.outro("已取消"); return; }
    selectedSkills = result;
  }

  // 4. 选择目标
  let targetApps: string[] | null = null;
  if (selectedMcp.length > 0 || selectedPrompts.length > 0) {
    targetApps = await selectTargetApps();
    if (targetApps === null) { p.outro("已取消"); return; }
  }

  let targetAgents: string[] | null = null;
  if (selectedSkills.length > 0) {
    targetAgents = await selectTargetAgents();
    if (targetAgents === null) { p.outro("已取消"); return; }
  }

  // 5. 预览 + 确认
  previewMcp(selectedMcp);
  previewPrompts(selectedPrompts);
  previewSkills(selectedSkills);
  if (targetApps) p.log.step(`MCP/Prompt 目标客户端: ${targetApps.join(", ")}`);
  if (targetAgents) p.log.step(`Skill 目标 Agent: ${targetAgents.join(", ")}`);

  const confirmed = await p.confirm({ message: "确认同步？" });
  if (p.isCancel(confirmed) || !confirmed) { p.outro("已取消"); return; }

  // 6. 写入
  if (selectedMcp.length > 0 && targetApps) {
    const counts = writeMcp(selectedMcp, false, targetApps as any);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    p.log.success(`MCP: 写入 ${total} 条`);
  }

  if (selectedPrompts.length > 0 && targetApps) {
    const written = writePrompts(selectedPrompts, false, targetApps as any);
    const apps = Object.entries(written).filter(([, v]) => v).map(([k]) => k).join(", ");
    p.log.success(`Prompt: 写入 [${apps || "无"}]`);
  }

  if (selectedSkills.length > 0) {
    // 按需下载 skill 文件包
    const total = selectedSkills.length;
    const packages: SkillPackage[] = [];
    s.start(`正在下载 ${total} 个 Skill...`);
    for (let i = 0; i < total; i++) {
      const skill = selectedSkills[i];
      let pkg = readCachedSkillPackage(skill.directory);
      if (pkg) {
        s.message(`下载 Skill [${i + 1}/${total}] ${skill.directory} (已缓存)`);
      } else {
        s.message(`下载 Skill [${i + 1}/${total}] ${skill.directory} (${skill.fileCount} 个文件)`);
        pkg = await client.downloadSkillPackage(skill.directory);
        if (!pkg) {
          p.log.warn(`  跳过 ${skill.directory}（云端文件不存在）`);
          continue;
        }
        writeCachedSkillFiles(pkg);
      }
      packages.push(pkg);
    }
    s.stop(`${packages.length} 个 Skill 下载完成`);

    // 写入
    const result = writeSkillPackages(packages, selectedSkills, false, targetAgents ?? undefined);
    const parts: string[] = [];
    if (result.installed.length > 0) parts.push(`新安装 ${result.installed.length} 个`);
    if (result.skipped.length > 0) parts.push(`跳过 ${result.skipped.length} 个（已有）`);
    if (result.linked.length > 0) parts.push(`补充链接 ${result.linked.length} 个`);
    if (parts.length > 0) p.log.success(`Skill: ${parts.join("，")}`);
  }

  p.outro("同步完成");
}
