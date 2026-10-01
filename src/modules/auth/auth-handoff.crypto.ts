import crypto from "crypto";

const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const PKCE_S256_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HANDOFF_STATE_PATTERN = /^[A-Za-z0-9._~-]{16,256}$/;

export function generateAuthHandoffCode(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function createPkceS256Challenge(codeVerifier: string): string {
  return crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
}

export function isValidPkceVerifier(value: string): boolean {
  return PKCE_VERIFIER_PATTERN.test(value);
}

export function isValidPkceS256Challenge(value: string): boolean {
  return PKCE_S256_CHALLENGE_PATTERN.test(value);
}

export function isValidAuthHandoffState(value: string): boolean {
  return HANDOFF_STATE_PATTERN.test(value);
}

export function constantTimeValueMatches(
  expected: string,
  candidate: string,
): boolean {
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  const candidateDigest = crypto.createHash("sha256").update(candidate).digest();
  return crypto.timingSafeEqual(expectedDigest, candidateDigest);
}
