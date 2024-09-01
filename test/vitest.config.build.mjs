import { setEnv } from "@lazarv/react-server/lib/sys.mjs";

import baseConfig from "./vitest.config.mjs";

setEnv("production");
export default baseConfig;
