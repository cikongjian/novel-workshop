#!/bin/sh
set -eu

IMAGE="${IMAGE:-}"
if [ -z "$IMAGE" ]; then
  echo "Usage: IMAGE=registry.cn-hangzhou.aliyuncs.com/<namespace>/novel-workshop:main sh scripts/publish-arm64.sh"
  exit 1
fi

PLATFORM="${PLATFORM:-linux/arm64}"

docker buildx build \
  --platform "$PLATFORM" \
  -f Dockerfile \
  -t "$IMAGE" \
  --push \
  .
