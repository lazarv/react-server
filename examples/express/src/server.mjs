import { createServer } from "node:http";

import express from "express";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const [reactServerModule, ...reactServerArgs] =
  process.env.NODE_ENV !== "production"
    ? ["@lazarv/react-server/dev", "./src/app/index.jsx"]
    : ["@lazarv/react-server/node", { origin: "http://localhost:3000" }];
const { reactServer } = await import(reactServerModule);
const server = await reactServer(...reactServerArgs);
app.use("/react-server", async (req, res, next) => {
  const { middlewares } = await server;
  req.user = { id: "admin" };
  middlewares(req, res, next);
});

io.on("connection", (socket) => {
  let count = 0;
  const timer = setInterval(() => {
    socket.emit("message", `Hello from server (${++count}x)`);
  }, 200);

  socket.on("disconnect", () => {
    clearInterval(timer);
  });
});

httpServer.listen(3000, () => {
  console.log("Example app listening on port 3000!");
});
