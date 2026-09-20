const ALLOWED_FRONTEND_PROTOCOLS = new Set(["http:", "https:"]);

export const DEFAULT_FRONTEND_URLS = ["http://localhost:5173"] as const;

export function parseFrontendUrls(value: string): string[] {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error("FRONTEND_URLS must contain at least one origin");
  }

  const invalidOrigin = origins.find((origin) => {
    try {
      const url = new URL(origin);
      return !ALLOWED_FRONTEND_PROTOCOLS.has(url.protocol);
    } catch {
      return true;
    }
  });

  if (invalidOrigin) {
    throw new Error(`FRONTEND_URLS contains an invalid URL: ${invalidOrigin}`);
  }

  return origins;
}

export function isAllowedFrontendOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  return !origin || allowedOrigins.includes(origin);
}
