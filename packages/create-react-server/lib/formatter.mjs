import { format as oxfmt } from "oxfmt";

const parserToExtension = {
  babel: "js",
  typescript: "ts",
  json: "json",
  js: "js",
  ts: "ts",
};

export async function format(code, parser) {
  const ext = parserToExtension[parser] || parser;
  const { code: formatted } = await oxfmt(`file.${ext}`, code, {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
    quoteProps: "as-needed",
    trailingComma: "es5",
    bracketSpacing: true,
    bracketSameLine: false,
  });
  return formatted;
}
