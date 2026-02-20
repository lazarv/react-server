import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("client/browser-manifest.mjs");

export default mod.default;
