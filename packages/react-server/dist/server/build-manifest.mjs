import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/build-manifest.mjs");

export default mod.default;
