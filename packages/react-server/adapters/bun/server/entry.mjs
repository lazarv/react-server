import { reactServer } from "@lazarv/react-server/edge";
import { createContext } from "@lazarv/react-server/http";

export const port = parseInt(process.env.PORT || "3000", 10);
export const hostname = process.env.HOST || "0.0.0.0";

export const { handler } = await reactServer({
  origin: process.env.ORIGIN || `http://${hostname}:${port}`,
  outDir: ".",
});

export { createContext };
