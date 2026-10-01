import crypto from "crypto";
import { UserRole } from "../entities/User";
import { env } from "./env";

export const AUTH_HANDOFF_CLIENT_IDS = [
  "admin-dashboard",
  "vendor-dashboard",
] as const;

export type AuthHandoffClientId = (typeof AUTH_HANDOFF_CLIENT_IDS)[number];

export interface AuthHandoffClient {
  readonly clientId: AuthHandoffClientId;
  readonly callbackUrl: string;
  readonly requiredRole: UserRole;
  verifySecret(candidate: string): boolean;
}

export type AuthHandoffClientRegistry = Readonly<
  Record<AuthHandoffClientId, AuthHandoffClient>
>;

export interface AuthHandoffClientConfiguration {
  adminCallbackUrl?: string;
  vendorCallbackUrl?: string;
  adminClientSecret?: string;
  vendorClientSecret?: string;
}

function constantTimeSecretMatches(expected: string, candidate: string): boolean {
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  const candidateDigest = crypto.createHash("sha256").update(candidate).digest();
  return crypto.timingSafeEqual(expectedDigest, candidateDigest);
}

function createClient(
  clientId: AuthHandoffClientId,
  callbackUrl: string,
  requiredRole: UserRole,
  secret: string,
): AuthHandoffClient {
  return Object.freeze({
    clientId,
    callbackUrl,
    requiredRole,
    verifySecret: (candidate: string) =>
      constantTimeSecretMatches(secret, candidate),
  });
}

export function createAuthHandoffClientRegistry(
  config: AuthHandoffClientConfiguration,
): AuthHandoffClientRegistry {
  const {
    adminCallbackUrl,
    vendorCallbackUrl,
    adminClientSecret,
    vendorClientSecret,
  } = config;

  if (
    !adminCallbackUrl ||
    !vendorCallbackUrl ||
    !adminClientSecret ||
    !vendorClientSecret
  ) {
    throw new Error(
      "Cross-domain authentication handoff is not fully configured",
    );
  }

  return Object.freeze({
    "admin-dashboard": createClient(
      "admin-dashboard",
      adminCallbackUrl,
      UserRole.ADMIN,
      adminClientSecret,
    ),
    "vendor-dashboard": createClient(
      "vendor-dashboard",
      vendorCallbackUrl,
      UserRole.VENDOR,
      vendorClientSecret,
    ),
  });
}

let configuredRegistry: AuthHandoffClientRegistry | undefined;

export function getAuthHandoffClientRegistry(): AuthHandoffClientRegistry {
  configuredRegistry ??= createAuthHandoffClientRegistry({
    adminCallbackUrl: env.AUTH_HANDOFF_ADMIN_CALLBACK_URL,
    vendorCallbackUrl: env.AUTH_HANDOFF_VENDOR_CALLBACK_URL,
    adminClientSecret: env.AUTH_HANDOFF_ADMIN_CLIENT_SECRET,
    vendorClientSecret: env.AUTH_HANDOFF_VENDOR_CLIENT_SECRET,
  });

  return configuredRegistry;
}

export function isAuthHandoffClientId(
  value: string,
): value is AuthHandoffClientId {
  return AUTH_HANDOFF_CLIENT_IDS.includes(value as AuthHandoffClientId);
}
