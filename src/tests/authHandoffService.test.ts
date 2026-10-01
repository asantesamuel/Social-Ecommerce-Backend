import { User, UserRole } from "../entities/User";
import {
  createAuthHandoffClientRegistry,
} from "../config/authClients";
import { createPkceS256Challenge } from "../modules/auth/auth-handoff.crypto";
import { AuthHandoffService } from "../modules/auth/auth-handoff.service";
import { InMemoryAuthHandoffStore } from "../modules/auth/auth-handoff.store";

const ADMIN_SECRET = "admin-secret-with-at-least-thirty-two-bytes";
const VENDOR_SECRET = "vendor-secret-with-at-least-thirty-two-bytes";
const VERIFIER = "a-valid-pkce-verifier-with-at-least-forty-three-characters";
const STATE = "a-random-state-value-1234567890";

function makeUser(role: UserRole, overrides: Partial<User> = {}): User {
  return {
    id: "64007ee4-e5af-4424-a902-a5d0fb47f3bb",
    email: `${role}@example.com`,
    firstName: "Test",
    lastName: "User",
    role,
    isActive: true,
    ...overrides,
  } as User;
}

function createService(user: User) {
  const userRepository = {
    findOne: jest.fn().mockResolvedValue(user),
  };
  const session = {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  };
  const sessionIssuer = {
    issueSessionForUser: jest.fn().mockResolvedValue(session),
  };

  return {
    service: new AuthHandoffService({
      store: new InMemoryAuthHandoffStore(),
      clients: createAuthHandoffClientRegistry({
        adminCallbackUrl: "https://admin.example.com/auth/callback",
        vendorCallbackUrl: "https://vendor.example.com/auth/callback",
        adminClientSecret: ADMIN_SECRET,
        vendorClientSecret: VENDOR_SECRET,
      }),
      userRepository,
      sessionIssuer,
      ttlSeconds: 60,
      generateCode: () => "generated-one-time-code",
      now: () => new Date("2026-10-01T00:00:00.000Z"),
    }),
    sessionIssuer,
  };
}

describe("authentication handoff service", () => {
  it("authorizes and exchanges an admin handoff through the registered callback", async () => {
    const admin = makeUser(UserRole.ADMIN);
    const { service, sessionIssuer } = createService(admin);

    const authorization = await service.authorize({
      userId: admin.id,
      clientId: "admin-dashboard",
      state: STATE,
      codeChallenge: createPkceS256Challenge(VERIFIER),
      codeChallengeMethod: "S256",
    });

    expect(authorization.expiresIn).toBe(60);
    expect(authorization.redirectUrl).toBe(
      `https://admin.example.com/auth/callback?code=generated-one-time-code&state=${STATE}`,
    );

    await expect(
      service.exchange({
        clientId: "admin-dashboard",
        clientSecret: ADMIN_SECRET,
        code: "generated-one-time-code",
        codeVerifier: VERIFIER,
      }),
    ).resolves.toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(sessionIssuer.issueSessionForUser).toHaveBeenCalledWith(admin);
  });

  it("rejects authorization when the user's current role does not match", async () => {
    const vendor = makeUser(UserRole.VENDOR);
    const { service } = createService(vendor);

    await expect(
      service.authorize({
        userId: vendor.id,
        clientId: "admin-dashboard",
        state: STATE,
        codeChallenge: createPkceS256Challenge(VERIFIER),
        codeChallengeMethod: "S256",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("consumes a code after an invalid PKCE exchange attempt", async () => {
    const admin = makeUser(UserRole.ADMIN);
    const { service } = createService(admin);
    await service.authorize({
      userId: admin.id,
      clientId: "admin-dashboard",
      state: STATE,
      codeChallenge: createPkceS256Challenge(VERIFIER),
      codeChallengeMethod: "S256",
    });

    await expect(
      service.exchange({
        clientId: "admin-dashboard",
        clientSecret: ADMIN_SECRET,
        code: "generated-one-time-code",
        codeVerifier: "wrong-verifier-that-is-still-at-least-forty-three-characters",
      }),
    ).rejects.toMatchObject({ status: 401 });

    await expect(
      service.exchange({
        clientId: "admin-dashboard",
        clientSecret: ADMIN_SECRET,
        code: "generated-one-time-code",
        codeVerifier: VERIFIER,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rechecks account activity before issuing a session", async () => {
    const admin = makeUser(UserRole.ADMIN);
    const { service, sessionIssuer } = createService(admin);
    await service.authorize({
      userId: admin.id,
      clientId: "admin-dashboard",
      state: STATE,
      codeChallenge: createPkceS256Challenge(VERIFIER),
      codeChallengeMethod: "S256",
    });
    admin.isActive = false;

    await expect(
      service.exchange({
        clientId: "admin-dashboard",
        clientSecret: ADMIN_SECRET,
        code: "generated-one-time-code",
        codeVerifier: VERIFIER,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(sessionIssuer.issueSessionForUser).not.toHaveBeenCalled();
  });
});
