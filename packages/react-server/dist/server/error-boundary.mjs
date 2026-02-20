import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/error-boundary.mjs");

export default mod.default;
