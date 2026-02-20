import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/client-manifest.mjs");

export default mod.default;
