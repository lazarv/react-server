import { readFile } from "node:fs/promises";

export default async function logo() {
  if (!process.env.CI) {
    const maxLineWidth = Math.min(process.stdout.columns, 80);

    if (maxLineWidth >= 80) {
      console.log(
        await readFile(
          new URL(
            process.env.NO_COLOR ? "./ascii-art.txt" : "./ascii-art.ans",
            import.meta.url
          ),
          "utf8"
        )
      );
    }
  }
}
