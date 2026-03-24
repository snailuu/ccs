/**
 * 将 bundle 中的 Skill 元数据应用到本机
 *
 * 策略：只同步元数据，在目标机器上执行安装
 * - 若 SSOT 目录已有该 skill → 跳过（已安装）
 * - 若有 repo 信息 → 提示用户通过 cc-switch 安装，或记录待安装列表
 * - 同步各 app 的 skills 目录软链接/目录存在性
 */

import { existsSync, mkdirSync, symlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SkillMeta } from "../readers/skill.ts";
import { Paths, type AppName } from "../readers/paths.ts";

const SSOT_DIR = join(homedir(), ".cc-switch", "skills");

export interface SkillSyncResult {
  /** 已跳过（SSOT 已有） */
  skipped: string[];
  /** 需要手动安装（有 repo 信息但 SSOT 无对应目录） */
  pending: SkillMeta[];
  /** 已同步 app 链接（SSOT 有但 app 目录缺失，已补充） */
  linked: string[];
}

export function writeSkills(
  entries: SkillMeta[],
  dryRun: boolean,
  targetApps?: AppName[]
): SkillSyncResult {
  const result: SkillSyncResult = { skipped: [], pending: [], linked: [] };

  for (const skill of entries) {
    const ssotPath = join(SSOT_DIR, skill.directory);

    if (existsSync(ssotPath)) {
      // SSOT 已有该 skill，尝试同步 app 链接
      const linked = syncAppLinks(skill, ssotPath, dryRun, targetApps);
      if (linked.length > 0) result.linked.push(...linked);
      else result.skipped.push(skill.directory);
    } else {
      // SSOT 无此 skill，记录为待安装
      result.pending.push(skill);
    }
  }

  return result;
}

/** 确保各 app 的 skills 目录中有对应的 symlink */
function syncAppLinks(
  skill: SkillMeta,
  ssotPath: string,
  dryRun: boolean,
  targetApps?: AppName[]
): string[] {
  const apps: AppName[] = targetApps ?? ["claude", "codex", "gemini", "opencode"];
  const linked: string[] = [];

  for (const app of apps) {
    if (!skill.apps[app]) continue;
    const appSkillsDir = Paths[app].skills();
    const dest = join(appSkillsDir, skill.directory);
    if (existsSync(dest)) continue;

    if (!dryRun) {
      if (!existsSync(appSkillsDir)) mkdirSync(appSkillsDir, { recursive: true });
      try {
        symlinkSync(ssotPath, dest, "dir");
        linked.push(`${app}/${skill.directory}`);
      } catch (e) {
        // symlink 失败（如 Windows 无权限），记录但不中断
        console.warn(`  警告: 无法创建 symlink ${dest}: ${e}`);
      }
    } else {
      linked.push(`${app}/${skill.directory} (dry-run)`);
    }
  }

  return linked;
}

/** 格式化待安装列表，供用户参考 */
export function formatPendingSkills(pending: SkillMeta[]): string {
  if (pending.length === 0) return "";
  const lines = ["以下 Skill 需要在本机安装（在 cc-switch 中搜索安装，或使用 agents CLI）:"];
  for (const s of pending) {
    if (s.repo) {
      lines.push(`  - ${s.directory}  (${s.repo.owner}/${s.repo.name}${
        s.repo.branch ? `@${s.repo.branch}` : ""
      })`);
    } else {
      lines.push(`  - ${s.directory}  (来源未知，请手动安装)`);
    }
  }
  return lines.join("\n");
}
