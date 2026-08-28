import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  hashPassword,
  makeWidgetToken,
  verifyPassword,
  verifySessionToken,
} from "./auth";

describe("local JawebFlow authentication", () => {
  it("hashes passwords and accepts only the matching value", async () => {
    const passwordHash = await hashPassword("un-mot-de-passe-sur");

    await expect(verifyPassword("un-mot-de-passe-sur", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("mauvais-mot-de-passe", passwordHash)).resolves.toBe(false);
  });

  it("creates a signed session tied to a single user", async () => {
    const token = await createSessionToken({ id: "d9b4e552-d9ad-4c49-b035-58e204f8cc31", email: "marchand@example.dz" });
    const session = await verifySessionToken(token);

    expect(session).toEqual({ id: "d9b4e552-d9ad-4c49-b035-58e204f8cc31", email: "marchand@example.dz" });
  });

  it("makes a non-empty token for each widget", () => {
    expect(makeWidgetToken()).toMatch(/^[a-f0-9]{32}$/);
    expect(makeWidgetToken()).not.toBe(makeWidgetToken());
  });
});
