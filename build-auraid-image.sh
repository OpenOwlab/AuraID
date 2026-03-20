#!/usr/bin/env bash
set -euo pipefail

# 切到脚本所在目录（LoopClaw 根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="auraid:latest"

echo "构建 Docker 镜像：${IMAGE_NAME}"
docker build -t "${IMAGE_NAME}" .

echo "构建完成。当前镜像列表："
docker images "${IMAGE_NAME}"