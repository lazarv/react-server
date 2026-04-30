import { usePathname } from "@lazarv/react-server";

// Tiny dynamic page used by the static-export-at-scale spec. The static
// exporter renders this component once per path yielded by the
// async-generator `export` in this directory's react-server.config.mjs.
// The body output captures whichever path was rendered so the spec can
// spot-check that paths from across the range made it to disk.
export default function StaticExportManyPage() {
  const pathname = usePathname();
  return (
    <html lang="en">
      <body>
        <h1 id="page">Static {pathname}</h1>
      </body>
    </html>
  );
}
