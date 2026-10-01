import { z } from "zod";
import * as dotenv from "dotenv";
import {
  DEFAULT_FRONTEND_URLS,
  parseFrontendUrls,
} from "./frontendOrigins";

dotenv.config();

const HANDOFF_SECRET_MIN_BYTES = 32;

function validateHandoffCallbackUrl(
  value: string,
  nodeEnv: "development" | "test" | "production",
): string | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return "must be an absolute URL";
  }

  if (url.username || url.password) {
    return "must not include URL credentials";
  }

  if (url.search || url.hash || value.includes("*")) {
    return "must be an exact URL without query parameters, fragments, or wildcards";
  }

  if (nodeEnv === "production") {
    return url.protocol === "https:"
      ? null
      : "must use https:// when NODE_ENV=production";
  }

  if (url.protocol === "https:") return null;

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  return url.protocol === "http:" && loopbackHosts.has(url.hostname)
    ? null
    : "must use https:// or an exact http:// localhost URL";
}

export const environmentSchema = z
  .object({
    // App
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    FRONTEND_URLS: z
      .string()
      .transform((value, context) => {
        try {
          return parseFrontendUrls(value);
        } catch (error) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: error instanceof Error ? error.message : "Invalid frontend origins",
          });
          return z.NEVER;
        }
      })
      .optional(),

    // Database
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL URL"),
    DATABASE_URL_TEST: z
      .string()
      .url("DATABASE_URL_TEST must be a valid PostgreSQL URL")
      .optional(),
    TYPEORM_LOGGING: z.string().default("false"),

    // JWT
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

    // Cross-domain authentication handoff
    AUTH_HANDOFF_CODE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(300)
      .default(60),
    AUTH_HANDOFF_ADMIN_CALLBACK_URL: z.string().optional(),
    AUTH_HANDOFF_VENDOR_CALLBACK_URL: z.string().optional(),
    AUTH_HANDOFF_ADMIN_CLIENT_SECRET: z
      .string()
      .refine(
        (value) => Buffer.byteLength(value, "utf8") >= HANDOFF_SECRET_MIN_BYTES,
        "AUTH_HANDOFF_ADMIN_CLIENT_SECRET must be at least 32 bytes",
      )
      .optional(),
    AUTH_HANDOFF_VENDOR_CLIENT_SECRET: z
      .string()
      .refine(
        (value) => Buffer.byteLength(value, "utf8") >= HANDOFF_SECRET_MIN_BYTES,
        "AUTH_HANDOFF_VENDOR_CLIENT_SECRET must be at least 32 bytes",
      )
      .optional(),

    // Paystack
    PAYSTACK_SECRET_KEY: z
      .string()
      .startsWith("sk_", "PAYSTACK_SECRET_KEY must start with sk_"),

    // AWS / S3
    AWS_REGION: z.string().min(1),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET_PRODUCTS: z.string().min(1),
    S3_BUCKET_DOCUMENTS: z.string().min(1),
    CLOUDFRONT_DOMAIN: z.string().url("CLOUDFRONT_DOMAIN must be a valid URL"),

    // Infrastructure
    REDIS_URL: z
      .string()
      .url("REDIS_URL must be a valid URL")
      .refine(
        (value) =>
          value.startsWith("redis://") || value.startsWith("rediss://"),
        "REDIS_URL must use redis:// or rediss://",
      )
      .optional(),

    // Business
    VENDOR_ONBOARDING_FEE: z.coerce.number().int().positive().default(5000),
    TAX_RATE: z.coerce.number().min(0).max(1).default(0.15),
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV === "production" && !values.FRONTEND_URLS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FRONTEND_URLS"],
        message: "FRONTEND_URLS is required when NODE_ENV=production",
      });
    }

    if (values.NODE_ENV === "production" && !values.REDIS_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "REDIS_URL is required when NODE_ENV=production",
      });
    }

    const requiredProductionHandoffValues = [
      "AUTH_HANDOFF_ADMIN_CALLBACK_URL",
      "AUTH_HANDOFF_VENDOR_CALLBACK_URL",
      "AUTH_HANDOFF_ADMIN_CLIENT_SECRET",
      "AUTH_HANDOFF_VENDOR_CLIENT_SECRET",
    ] as const;

    if (values.NODE_ENV === "production") {
      requiredProductionHandoffValues.forEach((key) => {
        if (!values[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when NODE_ENV=production`,
          });
        }
      });
    }

    const callbackEntries = [
      ["AUTH_HANDOFF_ADMIN_CALLBACK_URL", values.AUTH_HANDOFF_ADMIN_CALLBACK_URL],
      ["AUTH_HANDOFF_VENDOR_CALLBACK_URL", values.AUTH_HANDOFF_VENDOR_CALLBACK_URL],
    ] as const;

    callbackEntries.forEach(([key, value]) => {
      if (!value) return;

      const error = validateHandoffCallbackUrl(value, values.NODE_ENV);
      if (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} ${error}`,
        });
      }
    });

    if (
      values.AUTH_HANDOFF_ADMIN_CALLBACK_URL &&
      values.AUTH_HANDOFF_ADMIN_CALLBACK_URL ===
        values.AUTH_HANDOFF_VENDOR_CALLBACK_URL
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_HANDOFF_VENDOR_CALLBACK_URL"],
        message: "Admin and vendor handoff callbacks must be different",
      });
    }

    if (
      values.AUTH_HANDOFF_ADMIN_CLIENT_SECRET &&
      values.AUTH_HANDOFF_ADMIN_CLIENT_SECRET ===
        values.AUTH_HANDOFF_VENDOR_CLIENT_SECRET
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_HANDOFF_VENDOR_CLIENT_SECRET"],
        message: "Admin and vendor handoff client secrets must be different",
      });
    }
  });

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\nEnvironment variable validation failed:\n");
  const errors = parsed.error.flatten().fieldErrors;
  Object.entries(errors).forEach(([key, messages]) => {
    console.error(`   ${key}: ${messages?.join(", ")}`);
  });
  console.error("\nPlease check your .env file and fix the above issues.\n");
  process.exit(1);
}

export const env = {
  ...parsed.data,
  FRONTEND_URLS: parsed.data.FRONTEND_URLS ?? [...DEFAULT_FRONTEND_URLS],
};

export const isDev = env.NODE_ENV === "development";
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
export const TAX_RATE = env.TAX_RATE;
export const ONBOARDING_FEE = env.VENDOR_ONBOARDING_FEE;
export const PAYSTACK_SIGNATURE_SECRET = env.PAYSTACK_SECRET_KEY;
