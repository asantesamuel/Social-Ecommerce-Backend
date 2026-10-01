import rateLimit, { MemoryStore } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { isDev, isTest } from "../config/env";
import { redisClient } from "../config/redis";

interface FailedLoginStore {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<unknown>;
}

class MemoryFailedLoginStore implements FailedLoginStore {
  private entries = new Map<
    string,
    { value: number; expiresAt: number | null }
  >();

  private getEntry(key: string) {
    const entry = this.entries.get(key);

    if (!entry) return null;

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    return entry;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.getEntry(key);
    return entry ? String(entry.value) : null;
  }

  async incr(key: string): Promise<number> {
    const entry = this.getEntry(key);
    const nextValue = (entry?.value ?? 0) + 1;
    this.entries.set(key, {
      value: nextValue,
      expiresAt: entry?.expiresAt ?? null,
    });
    return nextValue;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.getEntry(key);
    if (!entry) return 0;

    entry.expiresAt = Date.now() + seconds * 1000;
    this.entries.set(key, entry);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.getEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;

    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async del(key: string): Promise<number> {
    return this.entries.delete(key) ? 1 : 0;
  }
}

export const failedLoginStore: FailedLoginStore =
  redisClient ?? new MemoryFailedLoginStore();

const createRateLimitStore = (prefix: string) => {
  const client = redisClient;

  return !client
    ? new MemoryStore()
    : new RedisStore({
        prefix,
        sendCommand: (...args: string[]) => {
          if (typeof client.call === "function") {
            return client.call(args[0], ...args.slice(1)) as any;
          }
          return (client as any)[args[0].toLowerCase()](...args.slice(1));
        },
      });
};

// Applied globally to all /auth/* routes
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest || isDev ? 5000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore("rl:auth:"),
  message: {
    message: "Too many requests from this IP. Please try again in 15 minutes.",
  },
});

// Stricter limiter specifically for login
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest || isDev ? 5000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore("rl:login:"),
  message: {
    message:
      "Too many login attempts from this IP. Please try again in 15 minutes.",
  },
});

export const handoffAuthorizeRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: isTest || isDev ? 5000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore("rl:handoff:authorize:"),
  message: {
    message: "Too many handoff requests. Please try again later.",
  },
});

export const handoffExchangeRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: isTest || isDev ? 5000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore("rl:handoff:exchange:"),
  message: {
    message: "Too many handoff exchange attempts. Please try again later.",
  },
});
