import { importDist } from "@lazarv/react-server/dist/import";

const mod = await importDist("server/__react_server_config__/prebuilt.mjs");

export default mod.default;
