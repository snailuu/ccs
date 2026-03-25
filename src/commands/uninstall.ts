/**
 * ccs uninstall - 卸载 ccs 二进制和配置数据
 */

import * as p from "@clack/prompts";
import { existsSync, unlinkSync, rmSync } from "node:fs";
import { basename, dirname } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".ccs");

export async function uninstallCommand(): Promise<void> {
  p.intro("ccs 卸载");

  // 检测二进制位置
  const execBase = basename(process.execPath).toLowerCase();
  const isBunRuntime = execBase === "bun" || execBase === "bun.exe";
  const binaryPath = isBunRuntime ? null : process.execPath;

  // 展示将要清理的内容
  const items: string[] = [];
  if (binaryPath && existsSync(binaryPath)) {
    items.push(`二进制文件: ${binaryPath}`);
  }
  if (existsSync(CONFIG_DIR)) {
    items.push(`配置目录:   ${CONFIG_DIR}`);
  }

  if (items.length === 0) {
    p.log.info("未检测到需要清理的内容");
    p.outro("已退出");
    return;
  }

  p.log.info(`将要删除:\n  ${items.join("\n  ")}`);

  const confirmed = await p.confirm({
    message: "确认卸载？此操作不可恢复",
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.outro("已取消");
    return;
  }

  // 删除配置目录
  if (existsSync(CONFIG_DIR)) {
    try {
      rmSync(CONFIG_DIR, { recursive: true, force: true });
      p.log.success(`已删除配置目录: ${CONFIG_DIR}`);
    } catch (e) {
      p.log.error(`删除配置目录失败: ${e}`);
    }
  }

  // 删除二进制（最后执行，因为当前进程还在用）
  if (binaryPath && existsSync(binaryPath)) {
    try {
      unlinkSync(binaryPath);
      p.log.success(`已删除二进制文件: ${binaryPath}`);
    } catch (e) {
      p.log.error(`删除二进制文件失败: ${e}`);
      p.log.warn(`请手动删除: rm ${binaryPath}`);
    }
  }

  p.outro("卸载完成");
}
