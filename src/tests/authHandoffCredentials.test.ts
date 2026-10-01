import { parseAuthHandoffClientCredentials } from "../modules/auth/auth-handoff.credentials";

describe("authentication handoff HTTP Basic credentials", () => {
  it("parses a client ID and server-only secret", () => {
    const encoded = Buffer.from(
      "admin-dashboard:server-only-client-secret",
    ).toString("base64");

    expect(parseAuthHandoffClientCredentials(`Basic ${encoded}`)).toEqual({
      clientId: "admin-dashboard",
      clientSecret: "server-only-client-secret",
    });
  });

  it.each([undefined, "Bearer token", "Basic !!!", "Basic YWRtaW4="])(
    "rejects missing or malformed credentials",
    (header) => {
      expect(() => parseAuthHandoffClientCredentials(header)).toThrow(
        "Invalid authentication handoff",
      );
    },
  );
});
