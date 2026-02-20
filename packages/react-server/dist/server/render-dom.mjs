import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/render-dom.mjs");

export const createRenderer = mod.createRenderer;
