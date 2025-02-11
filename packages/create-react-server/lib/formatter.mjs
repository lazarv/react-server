import prettier from "prettier";

export async function format(code, parser) {
  return prettier.format(code, {
    parser,
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
}
