import { createRequire } from "module";

const _require = createRequire(import.meta.url);

export default function Builtin() {
  return <>{_require.resolve("react")}</>;
}
