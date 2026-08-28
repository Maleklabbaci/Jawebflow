import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalUser, authenticateLocalUser, hashPassword } from "./auth";
import { getDb } from "./db";

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

const mockedGetDb = vi.mocked(getDb);

describe("JawebFlow authentication persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a normalized database user with a salted password hash", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
      insert: () => ({
        values: async (value: Record<string, unknown>) => {
          inserted.push(value);
        },
      }),
    };
    mockedGetDb.mockResolvedValue(db as never);

    const user = await createLocalUser("  MARCHAND@EXAMPLE.DZ ", "mot-de-passe-solide");

    expect(user.email).toBe("marchand@example.dz");
    expect(user.passwordHash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ id: user.id, email: "marchand@example.dz", passwordHash: user.passwordHash });
  });

  it("authenticates a database user using the stored hash", async () => {
    const passwordHash = await hashPassword("mot-de-passe-solide");
    const storedUser = {
      id: "user-1",
      email: "marchand@example.dz",
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [storedUser],
          }),
        }),
      }),
    };
    mockedGetDb.mockResolvedValue(db as never);

    await expect(authenticateLocalUser("MARCHAND@EXAMPLE.DZ", "mot-de-passe-solide")).resolves.toEqual(storedUser);
    await expect(authenticateLocalUser("marchand@example.dz", "mauvais-mot-de-passe")).rejects.toThrow("Email ou mot de passe incorrect.");
  });
});
