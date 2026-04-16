import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempHome = mkdtempSync(join(tmpdir(), "ccs-skill-writer-"));
const originalHome = process.env.HOME;
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

process.env.HOME = tempHome;
process.env.CLAUDE_CONFIG_DIR = join(tempHome, ".claude-missing");

const { writeSkillPackages } = await import("./skill.ts");

process.on("exit", () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;

  if (originalClaudeConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;

  rmSync(tempHome, { recursive: true, force: true });
});

describe("writeSkillPackages", () => {
  test("用户显式选择 claude-code 时，即使源索引未启用也不会跳过链接计划", () => {
    const directory = `git-ignore-explicit-${Date.now()}`;

    const result = writeSkillPackages(
      [
        {
          directory,
          files: [{ path: "SKILL.md", content: "# Git Ignore\n" }],
        },
      ],
      [
        {
          directory,
          name: "Git 本地忽略技能",
          description: "test",
          agents: { "claude-code": false },
          foundIn: ["agents"],
          fileCount: 1,
          totalSize: 10,
        },
      ],
      true,
      ["claude-code"],
    );

    expect(result.installed).toEqual([`${directory} (dry-run)`]);
    expect(result.linked).toEqual([`claude-code/${directory} (dry-run)`]);
  });

  test("未显式指定目标 agent 时，仍遵循源索引中的启用信息", () => {
    const directory = `git-ignore-fallback-${Date.now()}`;

    const result = writeSkillPackages(
      [
        {
          directory,
          files: [{ path: "SKILL.md", content: "# Git Ignore\n" }],
        },
      ],
      [
        {
          directory,
          name: "Git 本地忽略技能",
          description: "test",
          agents: { "claude-code": false },
          foundIn: ["agents"],
          fileCount: 1,
          totalSize: 10,
        },
      ],
      true,
    );

    expect(result.linked).toEqual([]);
  });
});
