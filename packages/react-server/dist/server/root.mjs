import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/root.mjs");

export default mod.default;
