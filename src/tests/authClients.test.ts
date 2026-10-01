import {
  createAuthHandoffClientRegistry,
  isAuthHandoffClientId,
} from "../config/authClients";
import { environmentSchema } from "../config/env";
import { UserRole } from "../entities/User";

const ADMIN_SECRET = "admin-secret-with-at-least-thirty-two-bytes";
const VENDOR_SECRET = "vendor-secret-with-at-least-thirty-two-bytes";

describe("authentication handoff client configuration", () => {
  it("maps each registered client to its exact callback and required role", () => {
    const registry = createAuthHandoffClientRegistry({
      adminCallbackUrl: "https://admin.example.com/auth/callback",
      vendorCallbackUrl: "https://vendor.example.com/auth/callback",
      adminClientSecret: ADMIN_SECRET,
      vendorClientSecret: VENDOR_SECRET,
    });

    expect(registry["admin-dashboard"].callbackUrl).toBe(
      "https://admin.example.com/auth/callback",
    );
    expect(registry["admin-dashboard"].requiredRole).toBe(UserRole.ADMIN);
    expect(registry["vendor-dashboard"].requiredRole).toBe(UserRole.VENDOR);
  });

  it("compares each client secret without exposing it on the registry", () => {
    const registry = createAuthHandoffClientRegistry({
      adminCallbackUrl: "https://admin.example.com/auth/callback",
      vendorCallbackUrl: "https://vendor.example.com/auth/callback",
      adminClientSecret: ADMIN_SECRET,
      vendorClientSecret: VENDOR_SECRET,
    });

    expect(registry["admin-dashboard"].verifySecret(ADMIN_SECRET)).toBe(true);
    expect(registry["admin-dashboard"].verifySecret(VENDOR_SECRET)).toBe(false);
    expect(registry["admin-dashboard"]).not.toHaveProperty("secret");
    expect(isAuthHandoffClientId("admin-dashboard")).toBe(true);
    expect(isAuthHandoffClientId("unknown-dashboard")).toBe(false);
  });

  it("requires secure, distinct handoff configuration in production", () => {
    const validProductionEnvironment = {
      ...process.env,
      NODE_ENV: "production",
      FRONTEND_URLS: "https://store.example.com,https://admin.example.com",
      REDIS_URL: "rediss://redis.example.com:6379",
      AUTH_HANDOFF_ADMIN_CALLBACK_URL:
        "https://admin.example.com/auth/callback",
      AUTH_HANDOFF_VENDOR_CALLBACK_URL:
        "https://vendor.example.com/auth/callback",
      AUTH_HANDOFF_ADMIN_CLIENT_SECRET: ADMIN_SECRET,
      AUTH_HANDOFF_VENDOR_CLIENT_SECRET: VENDOR_SECRET,
    };

    expect(environmentSchema.safeParse(validProductionEnvironment).success).toBe(
      true,
    );

    expect(
      environmentSchema.safeParse({
        ...validProductionEnvironment,
        AUTH_HANDOFF_ADMIN_CALLBACK_URL:
          "http://admin.example.com/auth/callback",
      }).success,
    ).toBe(false);

    expect(
      environmentSchema.safeParse({
        ...validProductionEnvironment,
        AUTH_HANDOFF_VENDOR_CLIENT_SECRET: ADMIN_SECRET,
      }).success,
    ).toBe(false);
  });

  it("allows exact localhost HTTP callbacks outside production", () => {
    const result = environmentSchema.safeParse({
      ...process.env,
      NODE_ENV: "test",
      AUTH_HANDOFF_ADMIN_CALLBACK_URL: "http://localhost:3001/auth/callback",
      AUTH_HANDOFF_VENDOR_CALLBACK_URL: "http://127.0.0.1:3002/auth/callback",
      AUTH_HANDOFF_ADMIN_CLIENT_SECRET: ADMIN_SECRET,
      AUTH_HANDOFF_VENDOR_CLIENT_SECRET: VENDOR_SECRET,
    });

    expect(result.success).toBe(true);
  });
});
