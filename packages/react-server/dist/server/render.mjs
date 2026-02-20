import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/render.mjs");

export const render = mod.render;
