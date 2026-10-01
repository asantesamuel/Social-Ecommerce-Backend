import Redis from "ioredis";
import { env, isTest } from "./env";

const shouldUseRedis = !isTest && Boolean(env.REDIS_URL);

// Production requires REDIS_URL through environment validation. Development
// and tests use explicit in-memory adapters when no Redis URL is configured.
export const redisClient = shouldUseRedis
  ? new Redis(env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      retryStrategy: (retries) => {
        if (retries > 5) return null;
        return Math.min(retries * 200, 2000);
      },
    })
  : null;

redisClient?.on("error", (error) => {
  console.error(`Redis connection error: ${error.message}`);
});
