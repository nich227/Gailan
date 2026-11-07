#!/bin/bash
#
# Downloads the node runtime bundled into Gailan.app. The binaries are too big
# for git (~145MB each), so they are fetched and checksummed instead.

set -euo pipefail

NODE_VERSION="26.13.0"

# from https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt
SHA256_X64="525c9b29bb0263d687de60a4cec0e2a6db876a8eb032369e5795eca71e7c358e"
SHA256_ARM64="d38bd5e5a2ddce6bbb5ce45e46e208337da4d51fffe611e567fd32073d6439f6"

DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/server/release"
BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
CACHE_DIR="${TMPDIR:-/tmp}/gailan-node-${NODE_VERSION}"

sha256() {
  if command -v shasum > /dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    sha256sum "$1" | cut -d' ' -f1
  fi
}

# only the native arch can report its version, the other one is taken on faith
is_current() {
  [ -x "$1" ] || return 1
  local reported="$("$1" --version 2> /dev/null || true)"
  [ "$reported" = "v${NODE_VERSION}" ] || [ -z "$reported" ]
}

fetch_arch() {
  local arch="$1" expected_sha="$2"
  local target="${DEST_DIR}/node-${arch}"
  local tarball="${CACHE_DIR}/node-v${NODE_VERSION}-darwin-${arch}.tar.gz"

  if is_current "$target"; then
    echo "node-${arch}: already at v${NODE_VERSION}, skipping"
    return 0
  fi

  mkdir -p "$CACHE_DIR" "$DEST_DIR"

  if [ ! -f "$tarball" ]; then
    echo "node-${arch}: downloading v${NODE_VERSION}"
    curl -fsSL --retry 3 -o "${tarball}.part" \
      "${BASE_URL}/node-v${NODE_VERSION}-darwin-${arch}.tar.gz"
    mv "${tarball}.part" "$tarball"
  fi

  local actual_sha="$(sha256 "$tarball")"
  if [ "$actual_sha" != "$expected_sha" ]; then
    echo "node-${arch}: SHA256 mismatch" >&2
    echo "  expected ${expected_sha}" >&2
    echo "  actual   ${actual_sha}" >&2
    rm -f "$tarball"
    exit 1
  fi

  tar xzf "$tarball" -C "$CACHE_DIR" "node-v${NODE_VERSION}-darwin-${arch}/bin/node"
  mv "${CACHE_DIR}/node-v${NODE_VERSION}-darwin-${arch}/bin/node" "$target"
  chmod +x "$target"
  rm -rf "${CACHE_DIR}/node-v${NODE_VERSION}-darwin-${arch}"
  echo "node-${arch}: installed v${NODE_VERSION} -> ${target}"
}

fetch_arch x64 "$SHA256_X64"
fetch_arch arm64 "$SHA256_ARM64"
