#!/usr/bin/env bash
# ccs 一键安装脚本
# 用法: curl -fsSL <CDN_BASE_URL>/ccs/install.sh | bash

set -euo pipefail

CDN_BASE="${CCS_CDN_BASE:-https://sh.snailuu.cn}"
SERVICE="ccs"
INSTALL_DIR="${CCS_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="ccs"

# 检测平台和架构
detect_platform() {
  local os arch

  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *) echo "不支持的操作系统: $(uname -s)"; exit 1 ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)  arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) echo "不支持的架构: $(uname -m)"; exit 1 ;;
  esac

  if [ "$os" = "windows" ]; then
    echo "${os}-${arch}.exe"
  else
    echo "${os}-${arch}"
  fi
}

main() {
  echo "正在安装 ccs..."

  local platform version url target

  platform=$(detect_platform)
  echo "检测到平台: ${platform}"

  # 获取版本（支持指定版本: CCS_VERSION=v1.0.0）
  if [ -n "${CCS_VERSION:-}" ]; then
    version="$CCS_VERSION"
    url="${CDN_BASE}/${SERVICE}/${version}/ccs-${platform}"
  else
    version="latest"
    url="${CDN_BASE}/${SERVICE}/latest/ccs-${platform}"
  fi
  echo "版本: ${version}"

  target="${INSTALL_DIR}/${BINARY_NAME}"

  # 创建安装目录
  mkdir -p "$INSTALL_DIR"

  # 下载
  echo "下载: ${url}"
  curl -fsSL -o "$target" "$url"
  chmod +x "$target"

  echo ""
  echo "安装成功: ${target}"
  echo "版本: $("${target}" --version 2>/dev/null || echo "${version}")"

  # 检查 PATH
  if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    echo ""
    echo "提示: ${INSTALL_DIR} 不在 PATH 中，请添加:"
    echo ""
    echo "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.zshrc"
    echo ""
  fi
}

main
