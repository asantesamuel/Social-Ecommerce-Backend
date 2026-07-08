import rateLimit, { MemoryStore } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import { env, isDev, isTest } from '../config/env';

// Reuse a single Redis instance for both request limits and failed-login counts.
export const redisClient = new Redis(env.REDIS_URL);

const createRateLimitStore = (prefix: string) => {
  return isTest
    ? new MemoryStore()
    : new RedisStore({
        prefix,
        sendCommand: (...args: string[]) => {
          if (typeof redisClient.call === 'function') {
            return redisClient.call(args[0], ...args.slice(1)) as any;
          }
          return (redisClient as any)[args[0].toLowerCase()](...args.slice(1));
        },
      });
};

// Applied globally to all /auth/* routes
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: (isTest || isDev) ? 5000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('rl:auth:'),
  message: {
    message: 'Too many requests from this IP. Please try again in 15 minutes.',
  },
});

// Stricter limiter specifically for login
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (isTest || isDev) ? 5000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('rl:login:'),
  message: {
    message: 'Too many login attempts from this IP. Please try again in 15 minutes.',
  },
});
