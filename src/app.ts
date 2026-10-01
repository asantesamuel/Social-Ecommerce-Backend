import "reflect-metadata";
import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./public/swagger.json";
import { RegisterRoutes } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import {
  authRateLimiter,
  handoffAuthorizeRateLimiter,
  handoffExchangeRateLimiter,
  loginRateLimiter,
} from "./middlewares/rateLimiter";
import { env } from "./config/env";
import { isAllowedFrontendOrigin } from "./config/frontendOrigins";
import { AppError } from "./utils/AppError";

export function createApp(): Express {
  const app = express();
  app.disable("etag"); // prevent Express from running full DB queries just to confirm a 304

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedFrontendOrigin(origin, env.FRONTEND_URLS)) {
          callback(null, true);
          return;
        }

        callback(AppError.forbidden("Origin is not allowed by CORS"));
      },
      credentials: true,
    }),
  );
  app.use(morgan("dev"));

  // Raw body for Paystack webhook signature verification
  // Must come before express.json()
  app.use(
    "/payments/webhook",
    express.raw({ type: "application/json" }),
    (req: any, _res: any, next: any) => {
      try {
        req.rawBody = req.body;
        req.body = JSON.parse(req.body.toString("utf8"));
        next();
      } catch {
        const error: any = new Error("Invalid JSON payload");
        error.status = 400;
        next(error);
      }
    },
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/auth", authRateLimiter);
  app.use("/auth/login", loginRateLimiter);
  app.use("/auth/handoff/authorize", handoffAuthorizeRateLimiter);
  app.use("/auth/handoff/exchange", handoffExchangeRateLimiter);

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  RegisterRoutes(app);
  app.use(errorHandler);

  return app;
}
