import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/error.mjs");

export default mod.default;
