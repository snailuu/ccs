/**
 * 同步后端接口
 * 所有后端实现相同的 read/write 接口
 */

import type { SyncBundle } from "../bundle.ts";
import type { SyncBackend } from "../config.ts";
import { GistBackendImpl } from "./gist.ts";
import { WebDavBackendImpl } from "./webdav.ts";
import { LocalBackendImpl } from "./local.ts";

export interface BackendAdapter {
  /** 读取云端 bundle，不存在时返回 null */
  read(): Promise<SyncBundle | null>;
  /** 写入 bundle 到云端 */
  write(bundle: SyncBundle): Promise<{ url?: string }>;
}

export function createBackend(
  backend: SyncBackend
): BackendAdapter {
  switch (backend.type) {
    case "gist":
      return new GistBackendImpl(backend);
    case "webdav":
      return new WebDavBackendImpl(backend);
    case "local":
      return new LocalBackendImpl(backend);
  }
}
