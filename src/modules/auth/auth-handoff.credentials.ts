import { AppError } from "../../utils/AppError";

export interface AuthHandoffClientCredentials {
  clientId: string;
  clientSecret: string;
}

export function parseAuthHandoffClientCredentials(
  authorizationHeader: string | undefined,
): AuthHandoffClientCredentials {
  const match = authorizationHeader?.match(/^Basic\s+([^\s]+)$/i);
  if (!match || !/^[A-Za-z0-9+/]+={0,2}$/.test(match[1])) {
    throw AppError.unauthorized("Invalid authentication handoff");
  }

  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) {
    throw AppError.unauthorized("Invalid authentication handoff");
  }

  return {
    clientId: decoded.slice(0, separatorIndex),
    clientSecret: decoded.slice(separatorIndex + 1),
  };
}
