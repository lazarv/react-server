import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/action-secret.mjs");

export default mod.default;
