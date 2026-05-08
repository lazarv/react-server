#!/usr/bin/env bash
#
# Reproduce CI's "Test prod apps" job on Linux from a macOS host.
#
# Strategy:
#   - Bind-mount the repo READ-ONLY into the container at /source.
#   - Use a NAMED Docker volume (`react-server-linux-workspace`) for the
#     working copy at /workspace. Sync source from /source into it on
#     each run with rsync, excluding `node_modules`, `.react-server*`,
#     `.cache`, and `.git` so the Linux pnpm install AND build outputs
#     persist across invocations.
#   - Run `pnpm install --frozen-lockfile` (idempotent — fast no-op on
#     warm volume) and the same vitest pattern CI runs.
#
# Why a named volume rather than a workspace bind mount: macOS's
# `node_modules` is full of Darwin-specific binaries (rolldown native
# binding, fsevents, esbuild, etc.). Bind-mounting it into a Linux
# container surfaces the wrong arch and `pnpm install` thrashes
# rebuilding native modules on every run. Keeping the working copy
# in a Linux-native volume mirrors how CI's runner sees the workspace,
# which is the whole point of this script.
#
# Usage:
#   ./test/docker/run-linux.sh                     # runs ALL prod-apps specs
#   ./test/docker/run-linux.sh remote.spec         # runs a specific pattern
#   ./test/docker/run-linux.sh -- --reporter=verbose  # forwards extra vitest flags
#
# Reset:
#   docker volume rm react-server-linux-workspace  # wipes the working copy + cached install
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

IMAGE="react-server-linux-test"
VOLUME="react-server-linux-workspace"

# Build (or rebuild) the image. Cached layers keep this fast — only the
# `corepack enable` step runs on a clean build, the rest is the
# Playwright base which Docker pulls once.
docker build \
  -t "$IMAGE" \
  -f "$REPO_ROOT/test/docker/Dockerfile.linux" \
  "$REPO_ROOT/test/docker"

# All args after `--` go straight to vitest. Args before `--` are
# treated as a test-pattern shorthand (with `--clean` as a special arg
# that wipes stale build outputs in the volume before running). Both
# are optional.
#
# Why `--clean`: the rsync below excludes `.react-server*` to preserve
# build state across runs (incremental builds skip already-built
# auxes). When the runtime's bundle ABI changes between runs (e.g. a
# symbol rename, a new export, switching the live transport plumbing),
# the cached bundles become stale and load with confusing errors like
# "Live transport not initialized" because the new runtime can't find
# what the old bundle wrote. `--clean` drops only the build outputs,
# keeping the volume's pnpm-installed `node_modules` so install isn't
# re-paid (~minutes saved per run).
CLEAN=0
PATTERN_ARGS=()
EXTRA_ARGS=()
SAW_DASHDASH=0
for a in "$@"; do
  if [[ "$a" == "--" ]]; then
    SAW_DASHDASH=1
    continue
  fi
  if [[ $SAW_DASHDASH -eq 0 ]]; then
    if [[ "$a" == "--clean" ]]; then
      CLEAN=1
      continue
    fi
    PATTERN_ARGS+=("$a")
  else
    EXTRA_ARGS+=("$a")
  fi
done

# CI runs the apps subset with `--exclude "**/__test__/*.spec.mjs"`.
# Mirror that here so a no-arg invocation reproduces exactly what CI
# runs in the failing job.
DEFAULT_EXCLUDE='--exclude=**/__test__/*.spec.mjs'

# Compose the vitest command line. Pattern args go positional; extras
# (after `--`) get appended verbatim.
VITEST_CMD="pnpm test-build-start ${DEFAULT_EXCLUDE}"
for p in "${PATTERN_ARGS[@]:-}"; do
  [[ -z "$p" ]] && continue
  VITEST_CMD+=" $(printf '%q' "$p")"
done
for e in "${EXTRA_ARGS[@]:-}"; do
  [[ -z "$e" ]] && continue
  VITEST_CMD+=" $(printf '%q' "$e")"
done

# `--init` gives us a proper PID 1 (tini), so Ctrl-C kills child
# processes cleanly when interactively running locally.
docker run --rm --init -it \
  -v "$REPO_ROOT":/source:ro \
  -v "$VOLUME":/workspace \
  -e CI=true \
  -e NODE_ENV=production \
  -e CLEAN="$CLEAN" \
  -w /workspace \
  "$IMAGE" \
  bash -c '
    set -euo pipefail

    # Sync source from the read-only bind mount into the writable
    # volume. `--delete` keeps the volume coherent with the host
    # (renames/removals propagate). Excludes: per-package node_modules
    # (Linux install lives in the volume, not the bind mount), build
    # outputs (`.react-server*`), pnpm/vite caches, and `.git`.
    rsync -a --delete \
      --exclude=node_modules \
      --exclude=".react-server*" \
      --exclude=".cache" \
      --exclude=".git" \
      --exclude=".turbo" \
      /source/ /workspace/

    if [ "${CLEAN:-0}" = "1" ]; then
      # Drop stale build outputs so the next build runs clean. Keep
      # node_modules — that is the expensive part to reinstall.
      echo "==> --clean: removing cached build outputs"
      find /workspace -maxdepth 4 -type d -name ".react-server*" \
        -not -path "*/node_modules/*" -prune -exec rm -rf {} +
      find /workspace -maxdepth 4 -type d -name ".cache" \
        -not -path "*/node_modules/*" -prune -exec rm -rf {} +
    fi

    cd /workspace

    # `--frozen-lockfile` is the CI behavior. If the volume already
    # has node_modules from a previous run AND the lockfile matches,
    # this is a fast no-op.
    pnpm install --frozen-lockfile

    # Playwright Chromium is preinstalled in the base image — this
    # is essentially a version-check no-op on a warm image, but
    # mirrors the explicit step in `.github/workflows/actions/common-playwright`.
    cd test
    pnpm playwright install chromium

    echo "==> Running: '"$VITEST_CMD"'"
    eval '"$VITEST_CMD"'
  '
