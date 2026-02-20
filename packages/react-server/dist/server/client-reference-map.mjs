import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/client-reference-map.mjs");

export const clientReferenceMap = mod.clientReferenceMap;
export default mod.default;
