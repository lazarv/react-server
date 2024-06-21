import { reactServer } from "@lazarv/react-server/node";

const server = reactServer({
  origin: process.env.ORIGIN || "http://localhost:3000",
});
export default async (req, res) => {
  try {
    const { middlewares } = await server;
    middlewares(req, res);
  } catch (e) {
    console.error(e);
    res.setHeader("Content-Type", "text/plain");
    res.statusCode = 500;
    res.end(e.message || e.toString());
  }
};
