import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/manifest-registry.mjs");

export const registerServerReference = mod.registerServerReference;
export const registry = mod.registry;
