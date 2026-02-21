#!/bin/bash
set -euo pipefail

RUNTIME=${1:-node}
PRESET=${2:-blank}
MODE=${3:-all}

# Ports can be overridden via env vars to allow concurrent containers
# on --network=host without port collisions.
DEV_PORT=${DEV_PORT:-3000}
START_PORT=${START_PORT:-3001}

# Package manager: npm (default), pnpm, or bun (bun container only)
PKG_MGR=${PKG_MGR:-npm}

# Timing helper — prints elapsed seconds since a given epoch-seconds value.
# Usage: PHASE_START=$(date +%s); ... ; timer_end "phase-name" $PHASE_START
timer_end() {
  local label=$1
  local start=$2
  local end
  end=$(date +%s)
  local elapsed=$((end - start))
  echo "TIMING ${label} ${elapsed}s"
}

TOTAL_START=$(date +%s)

echo "=== CREATE-REACT-SERVER TEST ==="
echo "RUNTIME=$RUNTIME"
echo "PRESET=$PRESET"
echo "MODE=$MODE"
echo "PKG_MGR=$PKG_MGR"
echo "================================"

TOOL_DIR="/tool"
WORKSPACE="/workspace"

cd "$WORKSPACE"

# Build the create-react-server command based on runtime.
# Each runtime needs to invoke index.mjs so that detectRuntime() picks up
# the correct global (globalThis.Bun / globalThis.Deno / default node).
case "$RUNTIME" in
  node)
    CREATE_CMD="node $TOOL_DIR/node_modules/@lazarv/create-react-server/index.mjs"
    ;;
  bun)
    CREATE_CMD="bun $TOOL_DIR/node_modules/@lazarv/create-react-server/index.mjs"
    ;;
  deno)
    # Create deno.json in /tool so Deno resolves npm packages from /tool/node_modules
    echo '{"nodeModulesDir":"manual","unstable":["byonm"]}' > "$TOOL_DIR/deno.json"
    CREATE_CMD="deno run -A --config $TOOL_DIR/deno.json $TOOL_DIR/node_modules/@lazarv/create-react-server/index.mjs"
    ;;
esac

echo ">>> Creating app with: $CREATE_CMD"
CREATION_START=$(date +%s)

# Run create-react-server with all options to avoid interactive prompts.
# Use 'script' to allocate a pseudo-TTY (required by the wizard's isTTY check).
# --clean allows overwriting the test-app dir (which may be a volume mount).
script -qec "$CREATE_CMD \
  --name test-app \
  --preset $PRESET \
  --deploy none \
  --clean \
  --no-install" /dev/null 2>&1 || true

timer_end "creation" $CREATION_START

# Verify the app was created
if [ ! -d "$WORKSPACE/test-app" ]; then
  echo "CREATION_FAILED"
  exit 1
fi
echo "CREATION_OK"

cd "$WORKSPACE/test-app"

# Replace @lazarv/react-server version with local tarball
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.dependencies['@lazarv/react-server'] = 'file:///workspace/react-server.tgz';
delete pkg.trustedDependencies;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('Updated package.json: deps');
console.log('Scripts:', JSON.stringify(pkg.scripts, null, 2));
"

# Install dependencies using the chosen package manager.
# Install into a container-local temp directory first, then move node_modules
# into the volume mount. This avoids npm TAR_ENTRY_ERROR ENOENT warnings
# caused by parallel tar extraction racing with slow Docker volume I/O on macOS.
INSTALL_START=$(date +%s)
echo ">>> Installing dependencies with $PKG_MGR..."
INSTALL_TMP=$(mktemp -d)
cp package.json "$INSTALL_TMP/"
[ -f package-lock.json ] && cp package-lock.json "$INSTALL_TMP/"
[ -f pnpm-lock.yaml ] && cp pnpm-lock.yaml "$INSTALL_TMP/"
[ -f bun.lockb ] && cp bun.lockb "$INSTALL_TMP/"
cd "$INSTALL_TMP"
case "$PKG_MGR" in
  npm)
    npm install
    ;;
  pnpm)
    pnpm install --no-frozen-lockfile --shamefully-hoist
    ;;
  bun)
    bun install
    ;;
  *)
    echo "Unknown PKG_MGR: $PKG_MGR"
    exit 1
    ;;
esac
mv node_modules "$WORKSPACE/test-app/node_modules"
cd "$WORKSPACE/test-app"
rm -rf "$INSTALL_TMP"

timer_end "install" $INSTALL_START
echo "INSTALL_OK"

# Log the resolved React version for debugging version mismatch issues
echo ">>> Resolved React version: $(node -p "require('react/package.json').version" 2>/dev/null || echo 'NOT FOUND')"

# Helper: wait for server to respond on a given port
wait_for_server() {
  local port=$1
  local timeout=${2:-120}
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    if curl -sf "http://localhost:$port" > /dev/null 2>&1; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

# Helper: check server response
check_server() {
  local port=$1
  local http_code
  http_code=$(curl -so /dev/null -w '%{http_code}' "http://localhost:$port" 2>/dev/null || echo "000")
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 400 ]; then
    return 0
  fi
  echo "HTTP_CODE=$http_code"
  return 1
}

# Helper: kill all processes listening on a given port, plus the background job
kill_server() {
  local pid=$1
  local port=$2
  # Kill all processes listening on the port (catches the actual server
  # regardless of process tree depth from script/pnpm/bun wrappers)
  local pids
  pids=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -oP 'pid=\K\d+' | sort -u || true)
  for p in $pids; do
    kill -9 "$p" 2>/dev/null || true
  done
  # Also kill the background job itself (script wrapper)
  kill -9 "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

# ==========================================
# Test dev mode
# ==========================================
if [ "$MODE" = "dev" ] || [ "$MODE" = "all" ]; then
  echo ""
  echo "=== TESTING DEV MODE ==="
  DEV_PHASE_START=$(date +%s)

  # Use 'script' to allocate a pseudo-TTY so that process.stdin.isTTY is true
  # inside the dev server. Without this, react-server detects a non-interactive
  # environment and replaces the root module with virtual:react-server-eval.jsx.
  # Use PORT/HOST env vars instead of CLI args to avoid -- passthrough issues
  # with pnpm and bun package managers.
  script -qec "PORT=$DEV_PORT HOST=0.0.0.0 $PKG_MGR run dev" /dev/null &
  DEV_PID=$!

  if wait_for_server $DEV_PORT 120; then
    if check_server $DEV_PORT; then
      echo "DEV_OK"
    else
      echo "DEV_FAILED (bad response)"
      kill_server $DEV_PID $DEV_PORT
      exit 1
    fi
  else
    echo "DEV_FAILED (timeout)"
    kill_server $DEV_PID $DEV_PORT
    exit 1
  fi

  kill_server $DEV_PID $DEV_PORT
  sleep 2
  timer_end "dev" $DEV_PHASE_START
fi

# ==========================================
# Test build
# ==========================================
if [ "$MODE" = "build" ] || [ "$MODE" = "build-start" ] || [ "$MODE" = "all" ]; then
  echo ""
  echo "=== TESTING BUILD ==="
  BUILD_PHASE_START=$(date +%s)

  if $PKG_MGR run build; then
    echo "BUILD_OK"
  else
    echo "BUILD_FAILED (exit code $?)"
    exit 1
  fi

  # Debug: show build output structure
  echo ">>> Build output:"
  find .react-server -type f -name "*.mjs" | sort | head -30 || true
  if [ -d ".bun" ]; then
    echo ">>> Bun adapter output:"
    find .bun -type f | sort | head -30 || true
  fi
  timer_end "build" $BUILD_PHASE_START
fi

# ==========================================
# Test start (production mode)
# ==========================================
if [ "$MODE" = "start" ] || [ "$MODE" = "build-start" ] || [ "$MODE" = "all" ]; then
  # If we haven't built yet, build first
  if [ "$MODE" = "start" ]; then
    echo ""
    echo "=== BUILDING FOR START ==="
    if ! $PKG_MGR run build 2>&1; then
      echo "BUILD_FAILED (pre-start build)"
      exit 1
    fi
  fi

  echo ""
  echo "=== TESTING START (production) ==="
  START_PHASE_START=$(date +%s)

  # Verify the prebuilt config file is accessible before starting
  echo ">>> Pre-start file check:"
  PREBUILT=".react-server/server/__react_server_config__/prebuilt.mjs"
  if [ -f "$PREBUILT" ]; then
    echo "  stat: $(stat -c '%s bytes, perms=%a' "$PREBUILT" 2>/dev/null || stat -f '%z bytes, perms=%p' "$PREBUILT" 2>/dev/null)"
    echo "  head: $(head -c 80 "$PREBUILT")"
  else
    echo "  FILE NOT FOUND: $PREBUILT"
  fi

  # Flush filesystem writes (important for Docker volume mounts)
  sync

  # Use PORT/HOST env vars for all runtimes/package managers to avoid
  # -- passthrough issues with pnpm and bun.
  PORT=$START_PORT HOST=0.0.0.0 $PKG_MGR start &
  START_PID=$!

  if wait_for_server $START_PORT 60; then
    if check_server $START_PORT; then
      echo "START_OK"
    else
      echo "START_FAILED (bad response)"
      kill_server $START_PID $START_PORT
      exit 1
    fi
  else
    echo "START_FAILED (timeout)"
    kill_server $START_PID $START_PORT
    exit 1
  fi

  kill_server $START_PID $START_PORT
  timer_end "start" $START_PHASE_START
fi

timer_end "total" $TOTAL_START
echo ""
echo "=== ALL_PASSED ==="
