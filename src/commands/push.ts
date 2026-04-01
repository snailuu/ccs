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
import { scanClaudeSessions, readAndStripSession } from "../readers/session.ts";
import {
  readConfig, requireBackend, writeConfig,
  readCachedManifest, writeCachedManifest, writeCachedSkillFiles, writeCachedSession,
  readSessionsCache, writeSessionsCache,
  getManifestPath,
} from "../config.ts";
import { createWebDavClient } from "../backends/index.ts";
import {
  selectMcpEntries, selectPromptEntries, selectSkillEntries, selectSessionEntries,
  previewMcp, previewPrompts, previewSkills, previewSessions,
} from "../preview.ts";
import { hostname } from "node:os";
import type { Manifest, SkillPackage, SessionMeta } from "../manifest.ts";

export async function pushCommand(flags: Flags): Promise<void> {
  const config = readConfig();
  const backend = requireBackend(config);

  p.intro("ccs 推送配置");

  // 1. 扫描本机所有配置
  const allMcp = readAllMcp();
  const allPrompts = readAllPrompts();
  const allSkills = scanAllSkills();
  const allSessions = scanClaudeSessions();

  p.log.info(
    `本机配置:\n` +
    `  MCP 服务器: ${allMcp.length} 个\n` +
    `  Prompt: ${allPrompts.length} 个应用\n` +
    `  Skill: ${allSkills.length} 个\n` +
    `  Session: ${allSessions.length} 个`
  );

  if (allMcp.length === 0 && allPrompts.length === 0 && allSkills.length === 0 && allSessions.length === 0) {
    p.log.warn("本机无可推送的配置");
    p.outro("已退出");
    return;
  }

  // 准备 WebDAV 客户端和 spinner（增量模式在聚合阶段就需要）
  const client = createWebDavClient(backend);
  const s = p.spinner();

  // 2. 交互选择条目
  let selectedMcp = allMcp;
  let selectedPrompts = allPrompts;
  let selectedSkills = allSkills;
  let selectedSessions: SessionMeta[] = allSessions;
  let mode: string = "all";

  if (flags.only) {
    mode = "incremental";
    if (!flags.only.includes("mcp")) selectedMcp = [];
    if (!flags.only.includes("prompt")) selectedPrompts = [];
    if (!flags.only.includes("skill")) selectedSkills = [];
    if (!flags.only.includes("session")) selectedSessions = [];
  } else {
    // 先选推送模式
    const modeResult = await p.select({
      message: "推送模式",
      options: [
        { value: "full", label: "全量覆盖", hint: "选中的覆盖云端，未选的类型清空" },
        { value: "incremental", label: "增量更新", hint: "选中的更新到云端，未选的类型保留" },
      ],
    });
    if (p.isCancel(modeResult)) { p.outro("已取消"); return; }
    mode = modeResult;

    // 再选具体条目
    selectedMcp = [];
    selectedPrompts = [];
    selectedSkills = [];
    selectedSessions = [];

    const stepTotal = [allMcp.length, allPrompts.length, allSkills.length, allSessions.length].filter(n => n > 0).length;
    let step = 0;

    if (allMcp.length > 0) {
      step++;
      p.log.step(`Step ${step}/${stepTotal} · MCP 服务器 (${allMcp.length} 个)`);
      const result = await selectMcpEntries(allMcp);
      if (result === null) { p.outro("已取消"); return; }
      selectedMcp = result;
    }

    if (allPrompts.length > 0) {
      step++;
      p.log.step(`Step ${step}/${stepTotal} · Prompt (${allPrompts.length} 个应用)`);
      const result = await selectPromptEntries(allPrompts);
      if (result === null) { p.outro("已取消"); return; }
      selectedPrompts = result;
    }

    if (allSkills.length > 0) {
      step++;
      p.log.step(`Step ${step}/${stepTotal} · Skill (${allSkills.length} 个)`);
      const indices = allSkills.map(toSkillIndex);
      const result = await selectSkillEntries(indices);
      if (result === null) { p.outro("已取消"); return; }
      const selectedDirs = new Set(result.map((s) => s.directory));
      selectedSkills = allSkills.filter((s) => selectedDirs.has(s.directory));
    }

    if (allSessions.length > 0) {
      step++;
      p.log.step(`Step ${step}/${stepTotal} · Session (${allSessions.length} 个)`);
      const result = await selectSessionEntries(allSessions);
      if (result === null) { p.outro("已取消"); return; }
      selectedSessions = result;
    }
  }

  // 预览
  previewMcp(selectedMcp);
  previewPrompts(selectedPrompts);
  const selectedIndices = selectedSkills.map(toSkillIndex);
  previewSkills(selectedIndices);
  previewSessions(selectedSessions);

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
  //    增量模式：从云端拉取现有 manifest 合并，只替换选中的类型
  let prev: Manifest | null = null;
  if (mode === "incremental") {
    s.start("正在拉取云端索引（增量合并）...");
    prev = await client.downloadManifest();
    s.stop(prev ? "云端索引已拉取" : "云端暂无索引，将全量推送");
  }

  // 全量模式：未选的类型使用本机扫描数据；增量模式：未选的类型保留云端数据
  const fallbackMcp = mode === "incremental" ? (prev?.mcp ?? []) : allMcp;
  const fallbackPrompts = mode === "incremental" ? (prev?.prompts ?? []) : allPrompts;
  const fallbackSkills = mode === "incremental" ? (prev?.skills ?? []) : allSkills.map(toSkillIndex);
  const fallbackSessions = mode === "incremental" ? (prev?.sessions ?? undefined) : (allSessions.length > 0 ? allSessions : undefined);

  const manifest: Manifest = {
    version: "4",
    pushedAt: new Date().toISOString(),
    hostname: hostname(),
    mcp: selectedMcp.length > 0 ? selectedMcp : fallbackMcp,
    prompts: selectedPrompts.length > 0 ? selectedPrompts : fallbackPrompts,
    skills: selectedIndices.length > 0 ? selectedIndices : fallbackSkills,
    sessions: selectedSessions.length > 0 ? selectedSessions : fallbackSessions,
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

  // 4. 上传到 WebDAV
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

  // Session 增量上传（延迟精简：此时才执行 strip + sha256）
  if (selectedSessions.length > 0) {
    const sessionsCache = readSessionsCache();
    const total = selectedSessions.length;
    let uploaded = 0;
    let skipped = 0;

    s.start(`正在处理 ${total} 个 Session...`);
    for (let i = 0; i < total; i++) {
      const meta = selectedSessions[i];
      s.message(`精简 Session [${i + 1}/${total}] ${meta.projectName}/${meta.sessionId.slice(0, 8)}`);

      // 延迟精简：读取 + strip + sha256
      const result = readAndStripSession(meta);
      if (!result) continue;

      // 回填 meta 的 sha256 和 size（供 manifest 使用）
      meta.sha256 = result.sha256;
      meta.strippedSize = result.size;

      // 增量判断：sha256 没变则跳过上传
      if (sessionsCache[meta.sessionId]?.sha256 === result.sha256) {
        skipped++;
        continue;
      }

      s.message(`上传 Session [${i + 1}/${total}] ${meta.projectName}/${meta.sessionId.slice(0, 8)}`);
      writeCachedSession(meta.sessionId, result.content);
      await client.uploadSession(meta.sessionId, result.content);
      sessionsCache[meta.sessionId] = { sha256: result.sha256 };
      uploaded++;
    }

    writeSessionsCache(sessionsCache);
    const parts = [];
    if (uploaded > 0) parts.push(`上传 ${uploaded} 个`);
    if (skipped > 0) parts.push(`跳过 ${skipped} 个（未变化）`);
    s.stop(`Session: ${parts.join("，") || "无变化"}`);
  }

  config.lastPush = manifest.pushedAt;
  writeConfig(config);

  p.log.success(`推送完成 (${manifest.pushedAt})`);
  p.log.step(`地址: ${manifestUrl}`);
  p.outro("推送完成");
}
