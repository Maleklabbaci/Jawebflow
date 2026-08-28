import { describe, expect, it } from "vitest";

import { buildDemoReply } from "./demoReply";

describe("buildDemoReply", () => {
  it("répond à une salutation sans inventer de détail commercial", () => {
    expect(buildDemoReply("bonjour")).toContain("Salam");
    expect(buildDemoReply("bonjour")).toContain("Quel produit");
  });

  it("demande une précision pour les informations non configurées", () => {
    expect(buildDemoReply("combien coûte le pack ?")).toContain("avant de confirmer un prix");
    expect(buildDemoReply("livraison à Oran ?")).toContain("votre wilaya");
  });
});
