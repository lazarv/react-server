import { reactServer } from "@lazarv/react-server/dev";
import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class ReactServerDevMiddleware implements NestMiddleware {
  private server: ReturnType<typeof reactServer>;

  constructor() {
    this.server = reactServer("./src/app/index.tsx");
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const { middlewares } = await this.server;
    middlewares(req, res, next);
  }
}
