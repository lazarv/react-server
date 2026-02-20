import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/server-reference-map.mjs");

export const serverReferenceMap = mod.serverReferenceMap;
