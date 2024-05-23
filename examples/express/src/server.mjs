import express from "express";

const app = express();

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
  middlewares(req, res, next);
});

app.listen(3000, () => {
  console.log("Example app listening on port 3000!");
});
