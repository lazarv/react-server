import { reactServer } from "@lazarv/react-server/node";
import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class ReactServerProdMiddleware implements NestMiddleware {
  private server: ReturnType<typeof reactServer>;

  constructor() {
    this.server = reactServer({
      origin: "http://localhost:3000",
    });
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const { middlewares } = await this.server;
    middlewares(req, res, next);
  }
}
