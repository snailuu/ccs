/**
 * ccs push - 扫描本机配置，聚合到 ~/.ccs/，上传到 WebDAV
 *
 * 流程：
 *   1. 扫描本机 MCP / Prompt / Skill（多源合并）
 *   2. 交互选择条目
 *   3. 聚合到 ~/.ccs/（manifest.json + skills/*.json）
 *   4. 从 ~/.ccs/ 上传到 WebDAV
 */

import * as p from "@clack/prompts";
import type { Flags } from "../../ccs.ts";
import { readAllMcp } from "../readers/mcp.ts";
import { readAllPrompts } from "../readers/prompt.ts";
import { scanAllSkills, toSkillIndex, toSkillPackage } from "../readers/skill.ts";
import {
  readConfig, requireBackend, writeConfig,
  writeCachedManifest, writeCachedSkillFiles,
  getManifestPath,
} from "../config.ts";
import { createWebDavClient } from "../backends/index.ts";
import {
  selectMcpEntries, selectPromptEntries, selectSkillEntries,
  previewMcp, previewPrompts, previewSkills,
} from "../preview.ts";
import { hostname } from "node:os";
import type { Manifest, SkillPackage } from "../manifest.ts";

export async function pushCommand(flags: Flags): Promise<void> {
  const config = readConfig();
  const backend = requireBackend(config);

  p.intro("ccs 推送配置");

  // 1. 扫描本机所有配置
  const allMcp = readAllMcp();
  const allPrompts = readAllPrompts();
  const allSkills = scanAllSkills();

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

  // 2. 交互选择条目
  let selectedMcp = allMcp;
  let selectedPrompts = allPrompts;
  let selectedSkills = allSkills;

  if (flags.only) {
    if (!flags.only.includes("mcp")) selectedMcp = [];
    if (!flags.only.includes("prompt")) selectedPrompts = [];
    if (!flags.only.includes("skill")) selectedSkills = [];
  } else {
    const mode = await p.select({
      message: "推送方式",
      options: [
        { value: "all", label: "全部推送", hint: "推荐" },
        { value: "selective", label: "选择性推送", hint: "逐类分步选择" },
      ],
    });
    if (p.isCancel(mode)) { p.outro("已取消"); return; }

    if (mode === "selective") {
      selectedMcp = [];
      selectedPrompts = [];
      selectedSkills = [];

      if (allMcp.length > 0) {
        p.log.step(`Step 1/3 · MCP 服务器 (${allMcp.length} 个)`);
        const result = await selectMcpEntries(allMcp);
        if (result === null) { p.outro("已取消"); return; }
        selectedMcp = result;
      }

      if (allPrompts.length > 0) {
        p.log.step(`Step 2/3 · Prompt (${allPrompts.length} 个应用)`);
        const result = await selectPromptEntries(allPrompts);
        if (result === null) { p.outro("已取消"); return; }
        selectedPrompts = result;
      }

      if (allSkills.length > 0) {
        p.log.step(`Step 3/3 · Skill (${allSkills.length} 个)`);
        const indices = allSkills.map(toSkillIndex);
        const result = await selectSkillEntries(indices);
        if (result === null) { p.outro("已取消"); return; }
        const selectedDirs = new Set(result.map((s) => s.directory));
        selectedSkills = allSkills.filter((s) => selectedDirs.has(s.directory));
      }
    }
  }

  // 预览
  previewMcp(selectedMcp);
  previewPrompts(selectedPrompts);
  const selectedIndices = selectedSkills.map(toSkillIndex);
  previewSkills(selectedIndices);

  if (flags.dryRun) {
    p.log.warn("[dry-run] 预览模式，不会上传");
    p.outro("已退出");
    return;
  }

  const confirmed = await p.confirm({
    message: `确认推送到 WebDAV？`,
  });
  if (p.isCancel(confirmed) || !confirmed) { p.outro("已取消"); return; }

  // 3. 聚合到 ~/.ccs/
  const manifest: Manifest = {
    version: "3",
    pushedAt: new Date().toISOString(),
    hostname: hostname(),
    mcp: selectedMcp,
    prompts: selectedPrompts,
    skills: selectedIndices,
  };

  writeCachedManifest(manifest);
  p.log.step(`聚合索引到 ${getManifestPath()}`);

  const skillPackages: SkillPackage[] = [];
  for (const skill of selectedSkills) {
    const pkg = toSkillPackage(skill);
    writeCachedSkillFiles(pkg);
    skillPackages.push(pkg);
  }
  if (skillPackages.length > 0) {
    p.log.step(`聚合 ${skillPackages.length} 个 Skill 到 ~/.ccs/skills/`);
  }

  // 4. 从 ~/.ccs/ 上传到 WebDAV
  const client = createWebDavClient(backend);
  const s = p.spinner();

  s.start("正在上传索引...");
  const manifestUrl = await client.uploadManifest(manifest);
  s.stop("索引上传完成");

  if (skillPackages.length > 0) {
    const total = skillPackages.length;
    s.start(`正在上传 ${total} 个 Skill...`);
    for (let i = 0; i < total; i++) {
      const pkg = skillPackages[i];
      s.message(`上传 Skill [${i + 1}/${total}] ${pkg.directory} (${pkg.files.length} 个文件)`);
      await client.uploadSkillPackage(pkg);
    }
    s.stop(`${total} 个 Skill 上传完成`);
  }

  config.lastPush = manifest.pushedAt;
  writeConfig(config);

  p.log.success(`推送完成 (${manifest.pushedAt})`);
  p.log.step(`地址: ${manifestUrl}`);
  p.outro("推送完成");
}
