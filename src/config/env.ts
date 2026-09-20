import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const schema = z
  .object({
    // App
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    FRONTEND_URL: z
      .string()
      .url("FRONTEND_URL must be a valid URL")
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
    if (values.NODE_ENV === "production" && !values.FRONTEND_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FRONTEND_URL"],
        message: "FRONTEND_URL is required when NODE_ENV=production",
      });
    }

    if (values.NODE_ENV === "production" && !values.REDIS_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "REDIS_URL is required when NODE_ENV=production",
      });
    }
  });

const parsed = schema.safeParse(process.env);

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
  FRONTEND_URL: parsed.data.FRONTEND_URL ?? "http://localhost:5173",
};

export const isDev = env.NODE_ENV === "development";
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
export const TAX_RATE = env.TAX_RATE;
export const ONBOARDING_FEE = env.VENDOR_ONBOARDING_FEE;
export const PAYSTACK_SIGNATURE_SECRET = env.PAYSTACK_SECRET_KEY;
