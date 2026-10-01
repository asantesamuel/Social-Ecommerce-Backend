import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "./testHelpers";
import { AppDataSource } from "../config/database";
import { User, UserRole } from "../entities/User";
import { RefreshToken } from "../entities/RefreshToken";
import { signAccessToken } from "../utils/jwt";
import { createPkceS256Challenge } from "../modules/auth/auth-handoff.crypto";

const ADMIN_SECRET = "test-admin-client-secret-with-at-least-32-bytes";
const VENDOR_SECRET = "test-vendor-client-secret-with-at-least-32-bytes";
const VERIFIER = "v".repeat(64);
const WRONG_VERIFIER = "w".repeat(64);
const STATE = "state-value-with-sufficient-randomness-12345";

interface TestIdentity {
  user: User;
  token: string;
}

function basicAuthorization(clientId: string, secret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
}

async function createIdentity(
  email: string,
  role: UserRole,
): Promise<TestIdentity> {
  const repository = AppDataSource.getRepository(User);
  const user = await repository.save(
    repository.create({
      email,
      passwordHash: "not-used-by-handoff-tests",
      firstName: "Handoff",
      lastName: "Tester",
      role,
      isActive: true,
    }),
  );

  return {
    user,
    token: signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    }),
  };
}

async function authorize(
  identity: TestIdentity,
  clientId: "admin-dashboard" | "vendor-dashboard",
  overrides: Record<string, unknown> = {},
) {
  return request(app)
    .post("/auth/handoff/authorize")
    .set("Authorization", `Bearer ${identity.token}`)
    .send({
      clientId,
      state: STATE,
      codeChallenge: createPkceS256Challenge(VERIFIER),
      codeChallengeMethod: "S256",
      ...overrides,
    });
}

function getCode(authorizationResponse: request.Response): string {
  return new URL(authorizationResponse.body.redirectUrl).searchParams.get(
    "code",
  )!;
}

async function exchange(
  clientId: "admin-dashboard" | "vendor-dashboard",
  secret: string,
  code: string,
  codeVerifier = VERIFIER,
) {
  return request(app)
    .post("/auth/handoff/exchange")
    .set("Authorization", basicAuthorization(clientId, secret))
    .send({ clientId, code, codeVerifier });
}

describe("Cross-domain authentication handoff API", () => {
  let admin: TestIdentity;
  let vendor: TestIdentity;
  let customer: TestIdentity;
  let securityLog: jest.SpyInstance;

  beforeAll(async () => {
    admin = await createIdentity("handoff-admin@example.com", UserRole.ADMIN);
    vendor = await createIdentity("handoff-vendor@example.com", UserRole.VENDOR);
    customer = await createIdentity(
      "handoff-customer@example.com",
      UserRole.CUSTOMER,
    );
  });

  beforeEach(() => {
    securityLog = jest.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    securityLog.mockRestore();
    jest.restoreAllMocks();
  });

  it.each([
    {
      label: "admin",
      getIdentity: () => admin,
      clientId: "admin-dashboard" as const,
      secret: ADMIN_SECRET,
      callback: "http://localhost:3001/auth/callback",
    },
    {
      label: "vendor",
      getIdentity: () => vendor,
      clientId: "vendor-dashboard" as const,
      secret: VENDOR_SECRET,
      callback: "http://localhost:3002/auth/callback",
    },
  ])(
    "completes the $label handoff and persists the issued refresh token",
    async ({ getIdentity, clientId, secret, callback }) => {
      const identity = getIdentity();
      const authorization = await authorize(identity, clientId);

      expect(authorization.status).toBe(201);
      expect(authorization.body.expiresIn).toBe(60);

      const redirect = new URL(authorization.body.redirectUrl);
      expect(`${redirect.origin}${redirect.pathname}`).toBe(callback);
      expect(redirect.searchParams.get("state")).toBe(STATE);
      expect([...redirect.searchParams.keys()].sort()).toEqual([
        "code",
        "state",
      ]);

      const response = await exchange(
        clientId,
        secret,
        redirect.searchParams.get("code")!,
      );

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        id: identity.user.id,
        role: identity.user.role,
      });
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.refreshToken).toEqual(expect.any(String));

      const persistedToken = await AppDataSource.getRepository(
        RefreshToken,
      ).findOne({ where: { token: response.body.refreshToken } });
      expect(persistedToken).not.toBeNull();

      const accessPayload = jwt.decode(response.body.accessToken) as {
        sub: string;
        role: string;
        iat: number;
        exp: number;
      };
      const refreshPayload = jwt.decode(response.body.refreshToken) as {
        sub: string;
        role: string;
        iat: number;
        exp: number;
      };
      expect(accessPayload).toMatchObject({
        sub: identity.user.id,
        role: identity.user.role,
      });
      expect(refreshPayload).toMatchObject({
        sub: identity.user.id,
        role: identity.user.role,
      });
      expect(accessPayload.exp - accessPayload.iat).toBe(15 * 60);
      expect(refreshPayload.exp - refreshPayload.iat).toBe(7 * 24 * 60 * 60);
    },
  );

  it.each([
    ["customer to admin", () => customer, "admin-dashboard"],
    ["customer to vendor", () => customer, "vendor-dashboard"],
    ["admin to vendor", () => admin, "vendor-dashboard"],
    ["vendor to admin", () => vendor, "admin-dashboard"],
  ] as const)("rejects the %s role/client mismatch", async (_label, identity, clientId) => {
    const response = await authorize(identity(), clientId);
    expect(response.status).toBe(403);
  });

  it("rejects caller-supplied callback URLs", async () => {
    const response = await authorize(admin, "admin-dashboard", {
      callbackUrl: "https://attacker.example/callback",
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("requires valid HTTP Basic client credentials and consumes wrong-secret attempts", async () => {
    const authorization = await authorize(admin, "admin-dashboard");
    const code = getCode(authorization);

    const missing = await request(app)
      .post("/auth/handoff/exchange")
      .send({ clientId: "admin-dashboard", code, codeVerifier: VERIFIER });
    expect(missing.status).toBe(401);
    expect(missing.body.message).toBe("Invalid authentication handoff");

    const wrongSecret = await exchange(
      "admin-dashboard",
      "wrong-secret-with-at-least-thirty-two-bytes",
      code,
    );
    expect(wrongSecret.status).toBe(401);
    expect(wrongSecret.body.message).toBe("Invalid authentication handoff");

    const replay = await exchange("admin-dashboard", ADMIN_SECRET, code);
    expect(replay.status).toBe(401);
  });

  it("consumes a code after a wrong PKCE verifier", async () => {
    const authorization = await authorize(admin, "admin-dashboard");
    const code = getCode(authorization);

    const wrongVerifier = await exchange(
      "admin-dashboard",
      ADMIN_SECRET,
      code,
      WRONG_VERIFIER,
    );
    expect(wrongVerifier.status).toBe(401);
    expect(wrongVerifier.body.message).toBe("Invalid authentication handoff");

    const replay = await exchange("admin-dashboard", ADMIN_SECRET, code);
    expect(replay.status).toBe(401);
  });

  it("rejects a code presented by the wrong registered client", async () => {
    const authorization = await authorize(admin, "admin-dashboard");
    const code = getCode(authorization);

    const wrongClient = await exchange(
      "vendor-dashboard",
      VENDOR_SECRET,
      code,
    );
    expect(wrongClient.status).toBe(401);
    expect(wrongClient.body.message).toBe("Invalid authentication handoff");

    const replay = await exchange("admin-dashboard", ADMIN_SECRET, code);
    expect(replay.status).toBe(401);
  });

  it("rejects a code after its configured TTL", async () => {
    const authorization = await authorize(admin, "admin-dashboard");
    const code = getCode(authorization);
    const realNow = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(realNow + 61_000);

    const response = await exchange("admin-dashboard", ADMIN_SECRET, code);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid authentication handoff");
  });

  it("rejects replay after a successful exchange", async () => {
    const authorization = await authorize(admin, "admin-dashboard");
    const code = getCode(authorization);

    expect((await exchange("admin-dashboard", ADMIN_SECRET, code)).status).toBe(
      200,
    );
    expect((await exchange("admin-dashboard", ADMIN_SECRET, code)).status).toBe(
      401,
    );
  });

  it("allows only one concurrent exchange to create a session", async () => {
    const authorization = await authorize(admin, "admin-dashboard");
    const code = getCode(authorization);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        exchange("admin-dashboard", ADMIN_SECRET, code),
      ),
    );
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 401)).toHaveLength(9);
  });

  it("rechecks account activity between authorization and exchange", async () => {
    const identity = await createIdentity(
      "handoff-inactive@example.com",
      UserRole.ADMIN,
    );
    const authorization = await authorize(identity, "admin-dashboard");
    await AppDataSource.getRepository(User).update(identity.user.id, {
      isActive: false,
    });

    const response = await exchange(
      "admin-dashboard",
      ADMIN_SECRET,
      getCode(authorization),
    );
    expect(response.status).toBe(403);
  });

  it("rechecks the current role between authorization and exchange", async () => {
    const identity = await createIdentity(
      "handoff-role-change@example.com",
      UserRole.ADMIN,
    );
    const authorization = await authorize(identity, "admin-dashboard");
    await AppDataSource.getRepository(User).update(identity.user.id, {
      role: UserRole.VENDOR,
    });

    const response = await exchange(
      "admin-dashboard",
      ADMIN_SECRET,
      getCode(authorization),
    );
    expect(response.status).toBe(403);
  });

  it("keeps codes, verifiers, secrets, and tokens out of security events", async () => {
    const authorization = await authorize(admin, "admin-dashboard");
    const code = getCode(authorization);
    const response = await exchange("admin-dashboard", ADMIN_SECRET, code);
    expect(response.status).toBe(200);

    const logged = securityLog.mock.calls.flat().join(" ");
    expect(logged).not.toContain(code);
    expect(logged).not.toContain(VERIFIER);
    expect(logged).not.toContain(ADMIN_SECRET);
    expect(logged).not.toContain(response.body.accessToken);
    expect(logged).not.toContain(response.body.refreshToken);
  });
});
