/**
 * 本地文件后端
 * 将 bundle.json 写到本地指定路径，由用户自行通过网盘同步
 */

import type { BackendAdapter } from "./index.ts";
import type { LocalBackend } from "../config.ts";
import type { SyncBundle } from "../bundle.ts";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class LocalBackendImpl implements BackendAdapter {
  constructor(private cfg: LocalBackend) {}

  async read(): Promise<SyncBundle | null> {
    const { path } = this.cfg;
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as SyncBundle;
    } catch (e) {
      throw new Error(`读取本地文件失败 (${path}): ${e}`);
    }
  }

  async write(bundle: SyncBundle): Promise<{ url?: string }> {
    const { path } = this.cfg;
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(bundle, null, 2) + "\n", "utf-8");
    return { url: `file://${path}` };
  }
}
