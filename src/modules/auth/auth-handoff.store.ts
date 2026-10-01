import crypto from "crypto";
import type Redis from "ioredis";
import { redisClient } from "../../config/redis";
import { AuthHandoffClientId } from "../../config/authClients";

const KEY_PREFIX = "auth:handoff:code:";

const CONSUME_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if value then
  redis.call("DEL", KEYS[1])
end
return value
`;

export interface AuthHandoffRecord {
  userId: string;
  clientId: AuthHandoffClientId;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  createdAt: string;
}

export interface AuthHandoffStore {
  create(
    codeHash: string,
    record: AuthHandoffRecord,
    ttlSeconds: number,
  ): Promise<void>;
  consume(codeHash: string): Promise<AuthHandoffRecord | null>;
}

export function hashAuthHandoffCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function keyForHash(codeHash: string): string {
  return `${KEY_PREFIX}${codeHash}`;
}

export class RedisAuthHandoffStore implements AuthHandoffStore {
  constructor(private readonly client: Redis) {}

  async create(
    codeHash: string,
    record: AuthHandoffRecord,
    ttlSeconds: number,
  ): Promise<void> {
    const result = await this.client.set(
      keyForHash(codeHash),
      JSON.stringify(record),
      "EX",
      ttlSeconds,
      "NX",
    );

    if (result !== "OK") {
      throw new Error("Unable to create a unique authentication handoff code");
    }
  }

  async consume(codeHash: string): Promise<AuthHandoffRecord | null> {
    const value = (await this.client.eval(
      CONSUME_SCRIPT,
      1,
      keyForHash(codeHash),
    )) as string | null;

    return value ? (JSON.parse(value) as AuthHandoffRecord) : null;
  }
}

interface InMemoryEntry {
  record: AuthHandoffRecord;
  expiresAt: number;
}

export class InMemoryAuthHandoffStore implements AuthHandoffStore {
  private readonly entries = new Map<string, InMemoryEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  async create(
    codeHash: string,
    record: AuthHandoffRecord,
    ttlSeconds: number,
  ): Promise<void> {
    const key = keyForHash(codeHash);
    const existing = this.entries.get(key);

    if (existing && existing.expiresAt > this.now()) {
      throw new Error("Unable to create a unique authentication handoff code");
    }

    this.entries.set(key, {
      record: { ...record },
      expiresAt: this.now() + ttlSeconds * 1000,
    });
  }

  async consume(codeHash: string): Promise<AuthHandoffRecord | null> {
    const key = keyForHash(codeHash);
    const entry = this.entries.get(key);

    // Read and delete happen synchronously before this method yields, matching
    // the atomic single-consumer semantics of the Redis Lua script.
    this.entries.delete(key);

    if (!entry || entry.expiresAt <= this.now()) return null;
    return { ...entry.record };
  }
}

export const authHandoffStore: AuthHandoffStore = redisClient
  ? new RedisAuthHandoffStore(redisClient)
  : new InMemoryAuthHandoffStore();
