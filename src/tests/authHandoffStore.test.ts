import {
  AuthHandoffRecord,
  hashAuthHandoffCode,
  InMemoryAuthHandoffStore,
} from "../modules/auth/auth-handoff.store";

const record: AuthHandoffRecord = {
  userId: "64007ee4-e5af-4424-a902-a5d0fb47f3bb",
  clientId: "admin-dashboard",
  codeChallenge: "A".repeat(43),
  codeChallengeMethod: "S256",
  createdAt: "2026-10-01T00:00:00.000Z",
};

describe("authentication handoff store", () => {
  it("hashes raw codes before they are used as storage identifiers", () => {
    const rawCode = "raw-one-time-code";
    const codeHash = hashAuthHandoffCode(rawCode);

    expect(codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(codeHash).not.toContain(rawCode);
  });

  it("consumes a record exactly once", async () => {
    const store = new InMemoryAuthHandoffStore();
    const codeHash = hashAuthHandoffCode("single-use-code");
    await store.create(codeHash, record, 60);

    await expect(store.consume(codeHash)).resolves.toEqual(record);
    await expect(store.consume(codeHash)).resolves.toBeNull();
  });

  it("allows only one concurrent consumer to receive a record", async () => {
    const store = new InMemoryAuthHandoffStore();
    const codeHash = hashAuthHandoffCode("concurrent-code");
    await store.create(codeHash, record, 60);

    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.consume(codeHash)),
    );

    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it("does not return an expired record", async () => {
    let now = Date.parse("2026-10-01T00:00:00.000Z");
    const store = new InMemoryAuthHandoffStore(() => now);
    const codeHash = hashAuthHandoffCode("expired-code");
    await store.create(codeHash, record, 1);

    now += 1001;

    await expect(store.consume(codeHash)).resolves.toBeNull();
  });
});
