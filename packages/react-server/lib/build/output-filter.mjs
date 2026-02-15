// Output filtering for build process
// Note: Native Rolldown output (transforming, modules transformed, etc.)
// writes directly to the OS file descriptor and cannot be intercepted
// from Node.js. This filter only catches Node.js-level stdout writes.

import { relative, resolve } from "node:path";
import colors from "picocolors";

let originalStdoutWrite = null;

// Patterns to filter out from build output (only works for Node.js level output)
const FILTER_PATTERNS = [
  /transforming/i,
  /modules transformed/i,
  /rendering chunks/i,
  /computing gzip/i,
  /built in \d+/i,
  /rolldown-vite v[\d.]+/i,
];

/**
 * Check if a line should be filtered out
 */
function shouldFilter(line) {
  return FILTER_PATTERNS.some((pattern) => pattern.test(line));
}

// File groups with colors for file listing (order determines display order)
const FILE_GROUPS = [
  { name: "Assets", color: colors.green },
  { name: "CSS", color: colors.magenta },
  { name: "JS", color: colors.cyan },
];

function displaySize(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`;
}

function withTrailingSlash(path) {
  return path.endsWith("/") ? path : path + "/";
}

function normalizePath(path) {
  return path.replace(/\\/g, "/");
}

/**
 * Custom file listing reporter plugin.
 * Replaces the native Vite reporter to only show file listings,
 * without the progress messages (transforming, rendering chunks, etc.)
 */

// Detect if we're in a TTY (interactive terminal) or CI/verbose environment
export function isInteractive() {
  // Check for verbose mode (--verbose flag)
  if (process.env.REACT_SERVER_VERBOSE) {
    return false;
  }
  // Check for CI environment variables
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    return false;
  }
  // Check if stderr is a TTY (we use stderr for spinner)
  return process.stderr.isTTY === true;
}

// Shared state across all plugin instances (for parallel builds)
let sharedSpinnerInterval = null;
let sharedSpinnerFrame = 0;
let sharedCurrentFile = "";
let sharedCurrentSize = "";
let sharedCurrentGroup = "JS";
let sharedFileCount = 0;
let activeBuildCount = 0;
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Use stderr for spinner to avoid interference with native stdout writes
const spinnerStream = process.stderr;

function writeLine(text) {
  spinnerStream.write(`\r\x1b[K${text}`);
}

function getGroupColor(group) {
  const groupDef = FILE_GROUPS.find((g) => g.name === group);
  return groupDef ? groupDef.color : colors.dim;
}

function updateSpinner() {
  const frame = spinnerFrames[sharedSpinnerFrame];
  const termWidth = spinnerStream.columns || process.stdout.columns || 80;

  if (sharedCurrentFile) {
    // Use same format as file listing: dim prefix, colored filename, bold size
    const groupColor = getGroupColor(sharedCurrentGroup);
    const sizeStr = sharedCurrentSize.padStart(10);
    const maxFileLen = termWidth - 4 - sizeStr.length - 2; // spinner + spaces

    let displayName = sharedCurrentFile;
    if (displayName.length > maxFileLen && maxFileLen > 10) {
      const halfLen = Math.floor((maxFileLen - 3) / 2);
      displayName =
        displayName.slice(0, halfLen) + "..." + displayName.slice(-halfLen);
    }

    writeLine(
      `${colors.cyan(frame)} ${groupColor(displayName.padEnd(maxFileLen))}  ${colors.bold(colors.dim(sizeStr))}`
    );
  } else {
    writeLine(`${colors.cyan(frame)} ${colors.dim("bundling...")}`);
  }
}

function startSharedSpinner() {
  if (!isInteractive()) return; // Skip spinner in CI/non-TTY
  if (sharedSpinnerInterval) return;
  sharedSpinnerFrame = 0;
  sharedCurrentFile = "";
  sharedCurrentSize = "";
  // Hide cursor for cleaner spinner
  spinnerStream.write("\x1b[?25l");
  updateSpinner();
  sharedSpinnerInterval = setInterval(() => {
    sharedSpinnerFrame = (sharedSpinnerFrame + 1) % spinnerFrames.length;
    updateSpinner();
  }, 80);
}

function stopSharedSpinner() {
  if (!isInteractive()) return; // Skip in CI/non-TTY
  if (sharedSpinnerInterval) {
    clearInterval(sharedSpinnerInterval);
    sharedSpinnerInterval = null;
    // Show cursor again
    spinnerStream.write("\x1b[?25h");
    // Show final count before clearing
    if (sharedFileCount > 0) {
      writeLine(
        `${colors.green("✔")} ${colors.dim(`${sharedFileCount} files processed`)}\n`
      );
    } else {
      writeLine("");
      spinnerStream.write("\r\x1b[K");
    }
    // Reset for next build
    sharedCurrentFile = "";
    sharedCurrentSize = "";
  }
}

function setCurrentFile(name, size, group = "JS") {
  sharedCurrentFile = name;
  sharedCurrentSize = size;
  sharedCurrentGroup = group;
  sharedFileCount++;
}

// CI: Track if we've shown the initial "bundling..." message
let ciInitialMessageShown = false;

// Accumulate entries across all builds for CI file listing
let accumulatedEntries = [];
let lastOutDir = "";
let lastChunkLimit = 1024;

export function fileListingReporterPlugin(buildLabel = "") {
  let config;
  let ciChunkCount = 0; // Per-instance chunk count for CI logging
  let writeBundleCalled = false; // Track if writeBundle was called for this build
  const interactive = isInteractive();

  // Helper to finalize build count
  const finalizeBuild = () => {
    activeBuildCount--;
    if (activeBuildCount <= 0) {
      if (interactive) {
        stopSharedSpinner();
      } else if (accumulatedEntries.length > 0) {
        // In CI/non-TTY: print full file listing with all accumulated entries
        printFileListing(
          config,
          accumulatedEntries,
          lastOutDir,
          lastChunkLimit
        );
        accumulatedEntries = [];
      }
      activeBuildCount = 0;
      sharedFileCount = 0;
      ciInitialMessageShown = false;
    }
  };

  return {
    name: "react-server:file-listing-reporter",
    enforce: "post",

    configResolved(resolvedConfig) {
      config = resolvedConfig;

      // Remove the native reporter plugin
      const pluginIndex = config.plugins.findIndex(
        (p) => p.name === "native:reporter" || p.name === "vite:reporter"
      );
      if (pluginIndex !== -1) {
        config.plugins.splice(pluginIndex, 1);
      }

      // Also disable any remaining reporter hooks
      for (const plugin of config.plugins) {
        if (
          plugin.name === "native:reporter" ||
          plugin.name === "vite:reporter"
        ) {
          plugin.buildStart = undefined;
          plugin.buildEnd = undefined;
          plugin.writeBundle = undefined;
          plugin.closeBundle = undefined;
          plugin.transform = undefined;
          plugin.renderChunk = undefined;
          plugin.generateBundle = undefined;
        }
      }
    },

    buildStart() {
      activeBuildCount++;
      if (interactive) {
        startSharedSpinner();
      } else {
        // CI/non-TTY: Reset chunk count and show initial message once
        ciChunkCount = 0;
        if (!ciInitialMessageShown) {
          ciInitialMessageShown = true;
          accumulatedEntries = []; // Reset for new build session
          config.logger.info(
            `${colors.cyan("●")} ${colors.dim("bundling...")}`
          );
        }
      }
    },

    renderStart() {
      // Silent in CI - we report in generateBundle
    },

    buildEnd(error) {
      // If build errored, finalize to prevent deadlock
      if (error) {
        writeBundleCalled = true; // Mark as handled
        finalizeBuild();
      }
    },

    renderChunk(code, chunk) {
      ciChunkCount++;
      if (interactive) {
        // Update spinner with current chunk being rendered
        const size = displaySize(Buffer.byteLength(code));
        setCurrentFile(chunk.fileName, size, "JS");
      }
      // In CI: silent during renderChunk, we log count in generateBundle
    },

    generateBundle() {
      if (!interactive) {
        const label = (buildLabel || "build").toLowerCase();
        // Pad labels to 6 chars (longest is "client") for alignment
        const paddedLabel = label.padEnd(6);
        config.logger.info(
          `${colors.magenta(paddedLabel)} ${colors.dim("→")} ${colors.bold(ciChunkCount)} chunks`
        );
      }
    },

    writeBundle({ dir }, output) {
      writeBundleCalled = true;
      const buildConfig = config.build || {};
      const chunkLimit = buildConfig.chunkSizeWarningLimit || 1024;

      // Collect file entries
      const entries = Object.values(output)
        .map((chunk) => {
          if (chunk.type === "chunk") {
            const size = Buffer.byteLength(chunk.code);
            if (interactive) {
              setCurrentFile(chunk.fileName, displaySize(size), "JS");
            }
            return {
              name: chunk.fileName,
              group: "JS",
              size,
            };
          } else {
            if (chunk.fileName.endsWith(".map")) return null;
            const isCSS = chunk.fileName.endsWith(".css");
            const group = isCSS ? "CSS" : "Assets";
            const size = Buffer.byteLength(
              typeof chunk.source === "string"
                ? chunk.source
                : Buffer.from(chunk.source)
            );
            if (interactive) {
              setCurrentFile(chunk.fileName, displaySize(size), group);
            }
            return {
              name: chunk.fileName,
              group,
              size,
            };
          }
        })
        .filter(Boolean);

      // Decrement active build count
      activeBuildCount--;

      // Accumulate entries for CI file listing
      if (!interactive) {
        accumulatedEntries.push(...entries);
        lastOutDir = dir;
        lastChunkLimit = chunkLimit;
      }

      finalizeBuild();
    },

    closeBundle() {
      // Fallback: if writeBundle wasn't called (empty bundle), finalize here
      if (!writeBundleCalled) {
        finalizeBuild();
      }
    },
  };
}

// Print file listing for CI/non-TTY environments
function printFileListing(config, entries, dir, chunkLimit) {
  if (entries.length === 0) return;

  // Deduplicate entries by name (same file can appear in multiple builds)
  entries = [...new Map(entries.map((e) => [e.name, e])).values()];

  const buildConfig = config.build || {};
  const terminalWidth = process.stdout.columns || 80;

  // Calculate size column width
  let biggestSize = 0;
  for (const entry of entries) {
    if (entry.size > biggestSize) biggestSize = entry.size;
  }
  const sizePad = displaySize(biggestSize).length;

  const outDir = dir || buildConfig.outDir || "dist";
  const relativeOutDir = normalizePath(
    relative(config.root, resolve(config.root, outDir))
  );
  const prefix = withTrailingSlash(relativeOutDir);

  // Calculate max filename length to fit in terminal
  const maxFileNameLength = terminalWidth - prefix.length - 2 - sizePad;

  // Print file listings by group, each group sorted by size
  for (const group of FILE_GROUPS) {
    const groupEntries = entries
      .filter((e) => e.group === group.name)
      .toSorted((a, z) => a.size - z.size);

    for (const entry of groupEntries) {
      const isLarge = entry.group === "JS" && entry.size / 1000 > chunkLimit;
      const sizeColor = isLarge ? colors.yellow : colors.dim;

      // Truncate filename if needed
      let displayName = entry.name;
      if (displayName.length > maxFileNameLength && maxFileNameLength > 10) {
        const halfLen = Math.floor((maxFileNameLength - 3) / 2);
        displayName =
          displayName.slice(0, halfLen) + "..." + displayName.slice(-halfLen);
      }

      let log = colors.dim(prefix);
      log += group.color(displayName.padEnd(maxFileNameLength));
      log += "  ";
      log += colors.bold(sizeColor(displaySize(entry.size).padStart(sizePad)));

      config.logger.info(log);
    }
  }

  // Warn about large chunks
  const hasLargeChunks = entries.some(
    (e) => e.group === "JS" && e.size / 1000 > chunkLimit
  );

  if (hasLargeChunks && buildConfig.minify && !config.build?.lib) {
    config.logger.warn(
      colors.yellow(
        `\n(!) Some chunks are larger than ${chunkLimit} kB after minification. Consider:\n` +
          `- Using dynamic import() to code-split the application\n` +
          `- Use build.rolldownOptions.output.advancedChunks to improve chunking\n` +
          `- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.`
      )
    );
  }
}

/**
 * Initialize stdout filtering.
 * Call this once before starting parallel builds.
 * Note: This only filters Node.js-level output, not native Rolldown output.
 */
export function initOutputFilter() {
  if (originalStdoutWrite) return; // Already initialized

  originalStdoutWrite = process.stdout.write.bind(process.stdout);

  let buffer = "";

  process.stdout.write = (chunk, encoding, callback) => {
    if (typeof chunk === "string") {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!shouldFilter(line)) {
          originalStdoutWrite(line + "\n", encoding);
        }
      }

      if (typeof callback === "function") callback();
      return true;
    }
    return originalStdoutWrite(chunk, encoding, callback);
  };
}

/**
 * Restore original stdout.
 * Call this after all builds complete.
 */
export function restoreStdout() {
  if (originalStdoutWrite) {
    process.stdout.write = originalStdoutWrite;
    originalStdoutWrite = null;
  }
}

/**
 * Create a spinner for long-running operations.
 * Returns an object with update() and stop() methods.
 * In CI/non-TTY mode, logs the message once and returns no-op methods.
 * @param {string} message - Initial spinner message
 * @param {object} options - Options: { color: 'cyan' | 'magenta' }
 * @returns {object} Spinner object with update and stop methods
 */
export function createSpinner(message, options = {}) {
  const { color = "cyan" } = options;
  const interactive = isInteractive();
  const stream = process.stderr;
  const colorFn = color === "magenta" ? colors.magenta : colors.cyan;

  if (!interactive) {
    // CI/non-TTY: just log the message once
    console.log(`${colorFn("●")} ${message}`);
    return {
      update: () => {},
      stop: (finalMessage) => {
        if (finalMessage) {
          console.log(finalMessage);
        }
      },
    };
  }

  // TTY: animated spinner
  let frame = 0;
  let currentMessage = message;
  let intervalId = null;

  const render = () => {
    const spinner = spinnerFrames[frame];
    stream.write(`\r\x1b[K${colorFn(spinner)} ${colors.dim(currentMessage)}`);
  };

  // Hide cursor
  stream.write("\x1b[?25l");
  render();

  intervalId = setInterval(() => {
    frame = (frame + 1) % spinnerFrames.length;
    render();
  }, 80);

  return {
    update: (newMessage) => {
      currentMessage = newMessage;
    },
    stop: (finalMessage) => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      // Show cursor
      stream.write("\x1b[?25h");
      // Clear line and show final message
      stream.write("\r\x1b[K");
      if (finalMessage) {
        console.log(finalMessage);
      }
    },
  };
}

// Alias for backwards compatibility - adapter uses magenta color
export const createAdapterSpinner = (message = "working...") =>
  createSpinner(message, { color: "magenta" });
