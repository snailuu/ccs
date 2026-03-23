/**
 * ccs push - 导出本机配置并上传到云端
 */

import type { Flags } from "../../ccs.ts";
import { readConfig, requireBackend, writeConfig } from "../config.ts";
import { buildBundle } from "../bundle.ts";
import { createBackend } from "../backends/index.ts";

export async function pushCommand(flags: Flags): Promise<void> {
  const config = readConfig();
  const backend = requireBackend(config);

  console.log("正在读取本机配置...");
  const bundle = buildBundle(flags);

  const summary = [
    `  MCP 服务器: ${bundle.mcp.length} 个`,
    `  Prompt:     ${bundle.prompts.length} 个应用`,
    `  Skill:      ${bundle.skills.length} 个`,
  ].join("\n");
  console.log(summary);

  if (flags.dryRun) {
    console.log("\n[dry-run] 以下 bundle 将被上传：");
    console.log(JSON.stringify(bundle, null, 2));
    return;
  }

  console.log(`\n正在上传到 ${backend.type} 后端...`);
  const adapter = createBackend(backend);
  const { url } = await adapter.write(bundle);

  // 记录 lastPush 时间
  config.lastPush = bundle.pushedAt;
  writeConfig(config);

  console.log(`✓ 上传成功 (${bundle.pushedAt})`);
  if (url) console.log(`  地址: ${url}`);
}
