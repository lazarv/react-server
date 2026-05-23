import readline from "node:readline";
import { PassThrough } from "node:stream";
import { setTimeout } from "node:timers/promises";

import { search } from "@inquirer/prompts";
import { algoliasearch } from "algoliasearch";
import open from "open";
import colors from "picocolors";

const algolia = {
  appId: "OVQLOZDOSH",
  apiKey: "5a8224f70c312c69121f92482ff2df82",
  indexName: "react-server",
};

let algoliaClient;
let initialized = false;

export function getInitialSearchInput(input, key) {
  if (typeof input !== "string" || input.length === 0) return "";
  if (key?.ctrl || key?.meta) return "";
  for (const char of input) {
    const code = char.codePointAt(0);
    if (code <= 0x1f || code === 0x7f) return "";
  }
  return input;
}

export function writeInitialSearchInput(input, value) {
  if (!value) return;

  setImmediate(() => {
    if (!input.destroyed) {
      input.write(value);
    }
  });
}

export function restoreCommandInput(input) {
  if (input.destroyed) return;

  if (input.isTTY && typeof input.setRawMode === "function") {
    input.setRawMode(true);
  }
  input.resume();
}

export async function command({ logger, server, resolvedUrls, restartServer }) {
  if (!process.stdin.isTTY) return;

  if (!initialized) {
    // catch SIGINT and exit
    process.stdin.on("data", (key) => {
      if (key == "\u0003") {
        process.exit(0);
      }
    });

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    algoliaClient = algoliasearch(algolia.appId, algolia.apiKey);
    initialized = true;
  }

  const controller = new AbortController();
  const availableCommands = {
    r: {
      name: "Restart the development server 🔄",
      async execute() {
        logger?.warn?.(`Restarting server... 🚧`);
        controller.abort();
      },
      disabled: typeof Bun !== "undefined",
    },
    l: {
      name: "Reload the application 🔥",
      execute: () => {
        server.environments.client.hot.send({
          type: "full-reload",
          path: "*",
        });
      },
    },
    u: {
      name: "Print the server URLs 🔗",
      execute: () => {
        server.printUrls(resolvedUrls);
      },
    },
    c: {
      name: "Clear the console 🧹",
      execute: () => {
        console.clear();
        logger?.info?.(`${colors.green("✔")} Console cleared! 🧹`);
      },
    },
    o: {
      name: "Open application in the default browser 🌐",
      execute: () => {
        open(resolvedUrls[0].toString());
      },
    },
    q: {
      name: "Quit the development server 🚫",
      execute: () => {
        process.exit(0);
      },
    },
  };
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  let activeCommand = false;
  let searchCommands = {};
  const command = async (input, key) => {
    if (activeCommand) return;
    const stdin = new PassThrough();
    let restart = false;
    try {
      activeCommand = true;
      process.stdin.pipe(stdin);

      const answerPromise = search(
        {
          message: "",
          theme: {
            prefix: {
              idle:
                colors.gray(timeFormatter.format(new Date())) +
                colors.bold(colors.cyan(" [react-server]")),
              done:
                colors.gray(timeFormatter.format(new Date())) +
                colors.bold(colors.cyan(" [react-server]")),
            },
            style: {
              answer: colors.white,
              highlight: (message) => colors.bold(colors.magenta(message)),
              message: () => colors.green("➜"),
            },
          },
          source: async (input, { signal }) => {
            if (!input) {
              return Object.entries(availableCommands).map(
                ([value, command]) => ({ ...command, value })
              );
            }

            const term = input.toLowerCase().trim();

            let results = [];
            if (term.length > 2) {
              await setTimeout(300);
              if (signal.aborted) return [];

              const { hits } = await algoliaClient.searchSingleIndex({
                indexName: algolia.indexName,
                searchParams: {
                  query: term,
                },
              });

              searchCommands = {};
              results = hits.map((hit) => {
                const command = {
                  value: hit.url,
                  name: `Open ${Object.values(hit.hierarchy).reduce(
                    (acc, value) =>
                      value
                        ? acc.length > 0
                          ? `${acc} > ${value}`
                          : colors.bold("https://react-server.dev")
                        : acc,
                    ""
                  )} 🔍`,
                  execute: () => {
                    open(hit.url);
                  },
                };
                searchCommands[command.value] = command;
                return command;
              });
            }

            return [
              ...Object.entries(availableCommands)
                .filter(([, command]) => !command.disabled)
                .reduce((source, [value, command]) => {
                  const name = command.name.toLowerCase().trim();
                  if (name.startsWith(term) || name.includes(term)) {
                    source.push({ ...command, value });
                  }
                  return source;
                }, [])
                .toSorted((a, b) => {
                  // if the term is at the beginning of the name, it should be sorted first
                  if (a.name.toLowerCase().trim().startsWith(term)) {
                    return -1;
                  }
                  if (b.name.toLowerCase().trim().startsWith(term)) {
                    return 1;
                  }
                  return a.name.localeCompare(b.name);
                }),
              ...results,
            ];
          },
        },
        {
          input: stdin,
          signal: controller.signal,
        }
      );
      writeInitialSearchInput(stdin, getInitialSearchInput(input, key));

      const answer = await answerPromise;

      const selectedCommand =
        availableCommands[answer] ?? searchCommands[answer];
      if (selectedCommand) {
        try {
          await selectedCommand.execute();
        } catch {
          logger?.error?.(`✖︎ ${selectedCommand.name.slice(0, -3)} failed! 🚑`);
        }
      }
      if (controller.signal.aborted) {
        restart = true;
      }
    } catch {
      // prompt was cancelled
    } finally {
      process.stdin.unpipe(stdin);
      stdin.destroy();
      restoreCommandInput(process.stdin);
      process.stdout.removeAllListeners();
      activeCommand = false;
      if (restart) {
        restartServer();
      } else {
        process.stdin.once("keypress", command);
      }
    }
  };

  process.stdin.once("keypress", command);
}
