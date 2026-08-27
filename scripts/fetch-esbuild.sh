#!/bin/bash
#
# Downloads the esbuild binaries that bundle widgets inside Gailan.app. npm only
# installs the one matching the build machine, and the app is universal, so both
# are fetched here. npm's own integrity hashes are the checksums.

set -euo pipefail

ESBUILD_VERSION="0.25.10"

# from npm view @esbuild/darwin-<arch>@${ESBUILD_VERSION} dist.integrity
SHA512_X64="tguWg1olF6DGqzws97pKZ8G2L7Ig1vjDmGTwcTuYHbuU6TTjJe5FXbgs5C1BBzHbJ2bo1m3WkQDbWO2PvamRcg=="
SHA512_ARM64="JC74bdXcQEpW9KkV326WpZZjLguSZ3DfS8wrrvPMHgQOIEIG/sPXEN/V8IssoJhbefLRcRqw6RQH2NnpdprtMA=="

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${ROOT}/server/release/node_modules/@esbuild"
CACHE_DIR="${TMPDIR:-/tmp}/gailan-esbuild-${ESBUILD_VERSION}"

sha512_base64() {
  if command -v shasum > /dev/null 2>&1; then
    shasum -a 512 -b "$1" | cut -d' ' -f1 | xxd -r -p | base64
  else
    sha512sum "$1" | cut -d' ' -f1 | xxd -r -p | base64
  fi
}

fetch_arch() {
  local arch="$1" expected="$2"
  local target="${DEST_DIR}/darwin-${arch}"
  local tarball="${CACHE_DIR}/darwin-${arch}-${ESBUILD_VERSION}.tgz"

  if [ -x "${target}/bin/esbuild" ]; then
    echo "esbuild-${arch}: already installed, skipping"
    return 0
  fi

  mkdir -p "$CACHE_DIR" "$target"

  if [ ! -f "$tarball" ]; then
    echo "esbuild-${arch}: downloading ${ESBUILD_VERSION}"
    curl -fsSL --retry 3 -o "${tarball}.part" \
      "https://registry.npmjs.org/@esbuild/darwin-${arch}/-/darwin-${arch}-${ESBUILD_VERSION}.tgz"
    mv "${tarball}.part" "$tarball"
  fi

  local actual="$(sha512_base64 "$tarball")"
  if [ "$actual" != "$expected" ]; then
    echo "esbuild-${arch}: SHA512 mismatch" >&2
    echo "  expected ${expected}" >&2
    echo "  actual   ${actual}" >&2
    rm -f "$tarball"
    exit 1
  fi

  tar xzf "$tarball" -C "$target" --strip-components=1
  chmod +x "${target}/bin/esbuild"
  echo "esbuild-${arch}: installed ${ESBUILD_VERSION} -> ${target}"
}

fetch_arch x64 "$SHA512_X64"
fetch_arch arm64 "$SHA512_ARM64"
