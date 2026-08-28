import { describe, expect, it } from "vitest";

import { getScrollProgress } from "./useScrollVideo";

describe("getScrollProgress", () => {
  const scene = { sceneTop: 0, sceneHeight: 1000, viewportHeight: 800 };

  it("clamps progress before and after the scroll scene", () => {
    expect(getScrollProgress({ ...scene, scrollY: -20 })).toBe(0);
    expect(getScrollProgress({ ...scene, scrollY: 1400 })).toBe(1);
  });

  it("returns proportional progress within the scroll scene", () => {
    expect(getScrollProgress({ ...scene, scrollY: 560 })).toBeCloseTo(0.5, 3);
  });
});
