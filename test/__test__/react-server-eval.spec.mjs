// Unit tests for the `react-server:eval` Vite plugin.
//
// Guards the contract:
//   • stdin is NEVER auto-consumed — even if fd 0 is a pipe/file, the plugin
//     must not read it unless `--eval` was explicitly passed.
//   • `--eval <code>` (string option) → the load handler returns that code
//     verbatim as the virtual entrypoint.
//   • `--eval` bare (boolean option === true) → the load handler reads the
//     entire entrypoint from stdin.
//
// We exercise the plugin's `load` handler directly rather than spawning the
// CLI because: (a) the decision lives entirely inside the plugin, (b) it's
// synchronous to set up, and (c) we can assert the "stdin is NOT touched"
// case by installing a process.stdin that would throw on read — something a
// black-box HTTP test cannot observe.

import { Readable } from "node:stream";

import { afterEach, describe, expect, test } from "vitest";

// The plugin isn't in the package `exports`, so import it via its workspace
// file path. The `@lazarv/react-server` package is symlinked into
// test/node_modules, so this resolves to the same source file the CLI loads.
import reactServerEval from "@lazarv/react-server/lib/plugins/react-server-eval.mjs";

// Invoke the plugin's load hook the way Vite would: the exported plugin has
// `load` as an object with a `handler` function (filtered load hook shape).
async function invokeLoad(plugin) {
  const fn =
    typeof plugin.load === "function" ? plugin.load : plugin.load.handler;
  return fn.call({}, "virtual:react-server-eval.jsx");
}

const originalStdin = process.stdin;

function installStdin(stream) {
  Object.defineProperty(process, "stdin", {
    value: stream,
    configurable: true,
    writable: true,
  });
}

function restoreStdin() {
  Object.defineProperty(process, "stdin", {
    value: originalStdin,
    configurable: true,
    writable: true,
  });
}

// A stdin stand-in that blows up if anything tries to read from it.
// Used to prove that the "no --eval" path never touches stdin.
function poisonStdin() {
  const s = new Readable({
    read() {
      throw new Error("stdin was read without --eval — auto-eval regression!");
    },
  });
  // `for await (chunk of stream)` calls setEncoding on the source; make
  // sure that call alone does not count as "reading".
  s.setEncoding = () => {};
  return s;
}

// A stdin stand-in that yields a fixed payload and then ends — used for
// the "bare --eval reads stdin" path.
function fakeStdin(payload) {
  return Readable.from([payload]);
}

describe("react-server:eval plugin", () => {
  afterEach(() => {
    restoreStdin();
  });

  test("no --eval: returns the throw stub and never reads stdin", async () => {
    installStdin(poisonStdin());
    const plugin = reactServerEval({});
    const code = await invokeLoad(plugin);
    expect(code).toContain("Root module not provided");
  });

  test("no --eval: `eval: false` is also treated as not passed", async () => {
    installStdin(poisonStdin());
    const plugin = reactServerEval({ eval: false });
    const code = await invokeLoad(plugin);
    expect(code).toContain("Root module not provided");
  });

  test("--eval <code>: returns the inline string verbatim and does not read stdin", async () => {
    installStdin(poisonStdin());
    const inline = "export default () => 'inline-eval-marker';";
    const plugin = reactServerEval({ eval: inline });
    const code = await invokeLoad(plugin);
    expect(code).toBe(inline);
  });

  test("--eval (bare): reads the full entrypoint from stdin", async () => {
    const payload = "export default () => 'stdin-eval-marker';";
    installStdin(fakeStdin(payload));
    const plugin = reactServerEval({ eval: true });
    const code = await invokeLoad(plugin);
    expect(code).toBe(payload);
  });

  test("--eval (bare): concatenates multi-chunk stdin", async () => {
    const chunks = ["export default ", "() => 'multi", "-chunk';"];
    installStdin(Readable.from(chunks));
    const plugin = reactServerEval({ eval: true });
    const code = await invokeLoad(plugin);
    expect(code).toBe(chunks.join(""));
  });
});
