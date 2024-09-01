import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";

import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  async configure(consumer: MiddlewareConsumer) {
    if (process.env.NODE_ENV === "production") {
      const { ReactServerProdMiddleware } = await import(
        "./react-server-prod.middleware.js"
      );
      consumer.apply(ReactServerProdMiddleware).forRoutes("react-server");
    } else {
      const { ReactServerDevMiddleware } = await import(
        "./react-server-dev.middleware.js"
      );
      consumer.apply(ReactServerDevMiddleware).forRoutes("react-server");
    }
  }
}
