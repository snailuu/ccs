/**
 * 将 SkillPackage 写入本机
 *
 * 流程：写入 canonical 目录 → 为 non-universal agent 补 symlink
 */

import { existsSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import type { SkillPackage } from "../manifest.ts";
import type { SkillIndex } from "../manifest.ts";
import { CANONICAL_SKILLS_DIR, AGENTS, ALL_AGENT_NAMES } from "../readers/paths.ts";

export interface SkillWriteResult {
  /** 已跳过（canonical 已有） */
  skipped: string[];
  /** 新写入到 canonical 的 */
  installed: string[];
  /** 补充的 agent symlink */
  linked: string[];
}

/** 将多个 SkillPackage 写入本机 */
export function writeSkillPackages(
  packages: SkillPackage[],
  indices: SkillIndex[],
  dryRun: boolean,
  targetAgents?: string[],
): SkillWriteResult {
  const result: SkillWriteResult = { skipped: [], installed: [], linked: [] };
  const indexMap = new Map(indices.map((i) => [i.directory, i]));

  for (const pkg of packages) {
    const canonicalPath = join(CANONICAL_SKILLS_DIR, pkg.directory);
    const index = indexMap.get(pkg.directory);

    if (existsSync(canonicalPath)) {
      result.skipped.push(pkg.directory);
    } else {
      // 写入 canonical
      if (!dryRun) {
        writeSkillFiles(canonicalPath, pkg);
      }
      result.installed.push(dryRun ? `${pkg.directory} (dry-run)` : pkg.directory);
    }

    // 补 symlink
    const linked = syncAgentLinks(pkg.directory, canonicalPath, index, dryRun, targetAgents);
    if (linked.length > 0) result.linked.push(...linked);
  }

  return result;
}

/** 将文件写入目录 */
function writeSkillFiles(canonicalPath: string, pkg: SkillPackage): void {
  for (const file of pkg.files) {
    const filePath = join(canonicalPath, file.path);
    const fileDir = dirname(filePath);
    if (!existsSync(fileDir)) mkdirSync(fileDir, { recursive: true });
    writeFileSync(filePath, file.content, "utf-8");
  }
}

/** 为 non-universal agent 补 symlink */
function syncAgentLinks(
  directory: string,
  canonicalPath: string,
  index: SkillIndex | undefined,
  dryRun: boolean,
  targetAgents?: string[],
): string[] {
  const agents = targetAgents ?? ALL_AGENT_NAMES;
  const linked: string[] = [];

  for (const agentName of agents) {
    const agent = AGENTS[agentName];
    if (!agent) continue;
    if (agent.isUniversal) continue;
    // 如果有 agent 启用信息，跳过未启用的
    if (index?.agents && Object.keys(index.agents).length > 0 && !index.agents[agentName]) continue;

    const dest = join(agent.globalSkillsDir, directory);
    if (existsSync(dest)) continue;

    if (!dryRun) {
      try {
        if (!existsSync(agent.globalSkillsDir)) mkdirSync(agent.globalSkillsDir, { recursive: true });
        const rel = relative(agent.globalSkillsDir, canonicalPath);
        symlinkSync(rel, dest, "dir");
        linked.push(`${agentName}/${directory}`);
      } catch (e) {
        console.warn(`  警告: 无法创建 symlink ${dest}: ${e}`);
      }
    } else {
      linked.push(`${agentName}/${directory} (dry-run)`);
    }
  }

  return linked;
}
