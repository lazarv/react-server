import * as sys from "../sys.mjs";

const cwd = sys.cwd();

export default function asset() {
  return {
    name: "react-server:asset",
    transform(code) {
      if (code.startsWith(`export default "/@fs${cwd}`)) {
        return code.replace(`export default "/@fs${cwd}`, `export default "`);
      }
      return null;
    },
  };
}
