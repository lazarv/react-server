import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/preload-manifest.mjs");

export const collectClientModules = mod.collectClientModules;
export const collectStylesheets = mod.collectStylesheets;
