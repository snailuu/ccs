/**
 * 同步后端
 * 仅支持 WebDAV，提供索引 + 按需下载能力
 */

import type { WebDavBackend } from "../config.ts";
import { WebDavClient } from "./webdav.ts";

export function createWebDavClient(backend: WebDavBackend): WebDavClient {
  return new WebDavClient(backend);
}
