import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliCompress, createGzip } from "node:zlib";

import { filesize } from "filesize";
import colors from "picocolors";

import { forRoot } from "../../config/index.mjs";
import { getContext } from "../../server/context.mjs";
import { init$ as runtime_init$, runtime$ } from "../../server/runtime.mjs";
import { CONFIG_CONTEXT } from "../../server/symbols.mjs";
import ssrHandler from "../start/ssr-handler.mjs";
import { cwd } from "../sys.mjs";
import banner from "./banner.mjs";

const size = (bytes) => {
  const s = filesize(bytes);
  return " ".repeat(Math.max(0, 8 - s.length)) + s;
};

export default async function staticSiteGenerator(root, options) {
  banner("static", options.dev);
  const config = getContext(CONFIG_CONTEXT);

  await runtime_init$(async () => {
    runtime$(CONFIG_CONTEXT, config);

    const configRoot = forRoot();

    if (configRoot?.export) {
      const paths =
        typeof configRoot.export === "function"
          ? await configRoot.export()
          : configRoot.export;

      const render = await ssrHandler();
      await Promise.all(
        paths.map(async ({ path }) => {
          const stream = await render({
            request: {
              url: `http${config.server?.https ? "s" : ""}://${
                config.host ?? "localhost"
              }:${config.port ?? 3000}${path}`,
              headers: new Headers({
                accept: "text/html",
              }),
            },
          });
          const html = await stream.text();
          await mkdir(join(cwd(), ".react-server/dist", path), {
            recursive: true,
          });
          const basename = `${path.replace(/^\/+/g, "")}/index.html`;
          const filename = join(cwd(), ".react-server/dist", basename);
          const gzip = createGzip();
          const brotli = createBrotliCompress();
          const gzipWriteStream = createWriteStream(`${filename}.gz`);
          const brotliWriteStream = createWriteStream(`${filename}.br`);
          await Promise.all([
            pipeline(Readable.from(html), gzip, gzipWriteStream),
            pipeline(Readable.from(html), brotli, brotliWriteStream),
            writeFile(filename, html, "utf8"),
          ]);
          const [htmlStat, gzipStat, brotliStat] = await Promise.all([
            stat(filename),
            stat(`${filename}.gz`),
            stat(`${filename}.br`),
          ]);
          console.log(
            `${colors.dim(".react-server/dist/")}${colors.green(
              path.length < 30
                ? `${path.replace(/^\/+/g, "")}${colors.cyan("/index.html")}`
                : `${path.replace(/^\/+/g, "").slice(0, 27)}...`
            )}${`${" ".repeat(Math.max(0, 30 - path.length))}${colors.gray(
              colors.bold(size(htmlStat.size))
            )} ${colors.dim(
              `│ gzip: ${size(gzipStat.size)} │ brotli: ${size(
                brotliStat.size
              )}`
            )}`}`
          );
        })
      );
    }
  });
}
