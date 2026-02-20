import { execSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCKER_DIR = resolve(__dirname, "../docker");
const PACKAGES_DIR = resolve(__dirname, "../../..");
const BUILD_DIR = resolve(__dirname, "../.build");
// Persistent npm cache shared across all container runs
const NPM_CACHE_DIR = resolve(__dirname, "../.npm-cache");
// Persistent pnpm store shared across all container runs
const PNPM_CACHE_DIR = resolve(__dirname, "../.pnpm-store");
// Persistent bun cache shared across bun container runs
const BUN_CACHE_DIR = resolve(__dirname, "../.bun-cache");

/**
 * Recursively collect files from a directory.
 * Returns a sorted object mapping relative paths to file contents.
 * Skips node_modules and build output directories to avoid OOM.
 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".react-server",
  ".bun",
  ".deno",
  ".vercel",
  ".netlify",
  ".cloudflare",
  ".wrangler",
]);

const SKIP_FILES = new Set(["deno.lock"]);

export function collectFiles(dir, base = dir) {
  const result = {};
  if (!existsSync(dir)) return result;

  for (const entry of readdirSync(dir).toSorted()) {
    const fullPath = join(dir, entry);
    const relPath = relative(base, fullPath);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      Object.assign(result, collectFiles(fullPath, base));
    } else {
      if (SKIP_FILES.has(entry)) continue;
      result[relPath] = readFileSync(fullPath, "utf-8");
    }
  }
  return result;
}

/**
 * Run a command and return stdout. Throws on non-zero exit.
 */
export function exec(cmd, options = {}) {
  return execSync(cmd, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  }).trim();
}

/**
 * Pack workspace packages into tarballs and place them in the build directory.
 * Uses pnpm pack to correctly resolve workspace:* protocol references.
 */
export function packPackages() {
  const packStart = performance.now();

  mkdirSync(BUILD_DIR, { recursive: true });

  // Always copy the entrypoint script so changes are picked up without REPACK
  copyFileSync(
    join(DOCKER_DIR, "entrypoint.sh"),
    join(BUILD_DIR, "entrypoint.sh")
  );

  if (
    existsSync(join(BUILD_DIR, "react-server.tgz")) &&
    existsSync(join(BUILD_DIR, "create-react-server.tgz")) &&
    !process.env.REPACK
  ) {
    console.log("Packages already packed (set REPACK=1 to force re-pack).");
    return;
  }

  console.log("Packing @lazarv/react-server...");
  const reactServerDir = join(PACKAGES_DIR, "react-server");
  const rsOutput = exec("pnpm pack --pack-destination /tmp", {
    cwd: reactServerDir,
  });
  const rsTarball = rsOutput.split("\n").pop().trim();
  copyFileSync(rsTarball, join(BUILD_DIR, "react-server.tgz"));

  console.log("Packing @lazarv/create-react-server...");
  const createDir = join(PACKAGES_DIR, "create-react-server");
  const csOutput = exec("pnpm pack --pack-destination /tmp", {
    cwd: createDir,
  });
  const csTarball = csOutput.split("\n").pop().trim();
  copyFileSync(csTarball, join(BUILD_DIR, "create-react-server.tgz"));

  console.log("Packages packed successfully.");
  const packElapsed = ((performance.now() - packStart) / 1000).toFixed(1);
  console.log(`TIMING pack ${packElapsed}s`);
}

/**
 * Build a Docker image for the given runtime.
 */
export function buildImage(runtime) {
  const buildStart = performance.now();
  const dockerfile = join(DOCKER_DIR, `Dockerfile.${runtime}`);
  if (!existsSync(dockerfile)) {
    throw new Error(`Dockerfile not found: ${dockerfile}`);
  }

  const tag = `create-react-server-test-${runtime}`;
  console.log(`Building Docker image: ${tag}...`);

  execSync(`docker build -t ${tag} -f ${dockerfile} .`, {
    cwd: BUILD_DIR,
    stdio: "inherit",
    timeout: 600_000, // 10 minutes
  });

  console.log(`Docker image built: ${tag}`);
  const buildElapsed = ((performance.now() - buildStart) / 1000).toFixed(1);
  console.log(`TIMING docker-build-${runtime} ${buildElapsed}s`);
  return tag;
}

/**
 * Track running Docker container IDs so we can clean them up on process exit
 * (e.g. when the user presses Ctrl+C and --rm doesn't fire).
 */
const runningContainers = new Set();

function cleanupContainers() {
  for (const id of runningContainers) {
    try {
      execSync(`docker rm -f ${id}`, { stdio: "ignore", timeout: 10_000 });
    } catch {
      // best-effort
    }
  }
  runningContainers.clear();
}

process.on("exit", cleanupContainers);
process.on("SIGINT", () => {
  cleanupContainers();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanupContainers();
  process.exit(143);
});

/**
 * Run a test inside a Docker container.
 * Mounts a host tmp directory as /output in the container so we can read
 * the generated project files directly for snapshot testing.
 * Returns { exitCode, stdout, stderr, passed, files, outputDir }
 */
export function runTest(
  runtime,
  preset,
  mode = "all",
  { portOffset = 0, pkgMgr = "npm" } = {}
) {
  const runStart = performance.now();
  const tag = `create-react-server-test-${runtime}`;
  // Use high port range (10000+) to avoid collisions with local services
  const devPort = 10000 + portOffset * 2;
  const startPort = 10001 + portOffset * 2;
  const containerName = `crs-test-${runtime}-${preset}-${pkgMgr}-${Date.now()}`;

  // Create a unique tmp directory for this test's output
  const outputDir = join(
    tmpdir(),
    `crs-test-${runtime}-${preset}-${pkgMgr}-${Date.now()}`
  );
  mkdirSync(outputDir, { recursive: true });

  // Ensure the shared cache directories exist
  mkdirSync(NPM_CACHE_DIR, { recursive: true });
  mkdirSync(PNPM_CACHE_DIR, { recursive: true });
  mkdirSync(BUN_CACHE_DIR, { recursive: true });

  return new Promise((resolve, reject) => {
    const args = [
      "run",
      "--rm",
      "--name",
      containerName,
      "-t", // allocate pseudo-TTY (required by the wizard's isTTY check)
      "--network=host",
      "-e",
      `DEV_PORT=${devPort}`,
      "-e",
      `START_PORT=${startPort}`,
      "-e",
      `PKG_MGR=${pkgMgr}`,
      "-v",
      `${outputDir}:/workspace/test-app`,
      "-v",
      `${NPM_CACHE_DIR}:/root/.npm`,
      "-v",
      `${PNPM_CACHE_DIR}:/root/.local/share/pnpm/store`,
      // Mount bun cache only for bun runtime containers
      ...(runtime === "bun"
        ? ["-v", `${BUN_CACHE_DIR}:/root/.bun/install/cache`]
        : []),
      tag,
      runtime,
      preset,
      mode,
    ];

    let stdout = "";
    let stderr = "";

    runningContainers.add(containerName);

    const proc = spawn("docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000, // 5 minutes
    });

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    proc.on("error", (err) => {
      reject(err);
    });

    proc.on("close", (code) => {
      runningContainers.delete(containerName);

      const passed = stdout.includes("ALL_PASSED");
      const creationOk = stdout.includes("CREATION_OK");
      const devOk = stdout.includes("DEV_OK");
      const buildOk = stdout.includes("BUILD_OK");
      const startOk = stdout.includes("START_OK");

      // Parse TIMING lines from container output
      const timings = {};
      for (const match of stdout.matchAll(/TIMING (\S+) (\d+)s/g)) {
        timings[match[1]] = parseInt(match[2], 10);
      }

      const runElapsed = ((performance.now() - runStart) / 1000).toFixed(1);
      console.log(`\n--- Timings for ${runtime}/${preset}/${mode} ---`);
      for (const [phase, secs] of Object.entries(timings)) {
        console.log(`  ${phase}: ${secs}s`);
      }
      console.log(`  container-total (host): ${runElapsed}s`);
      console.log(`---`);

      // Read the generated project files from the mounted output directory.
      const files = collectFiles(outputDir);

      // Clean up the tmp directory
      try {
        rmSync(outputDir, { recursive: true, force: true });
      } catch {
        // best-effort
      }

      resolve({
        exitCode: code,
        stdout,
        stderr,
        passed,
        creationOk,
        devOk,
        buildOk,
        startOk,
        files,
        timings,
      });
    });
  });
}

/**
 * Check if Docker is available.
 */
export function isDockerAvailable() {
  try {
    exec("docker info");
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove Docker image for a specific runtime (or all runtimes if not specified).
 */
export function cleanupImages(runtime) {
  const runtimes = runtime ? [runtime] : ["node", "bun", "deno"];
  for (const rt of runtimes) {
    try {
      exec(`docker rmi create-react-server-test-${rt}`);
    } catch {
      // ignore
    }
  }
}
