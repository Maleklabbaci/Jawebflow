import { describe, expect, it } from "vitest";
import { makeWidgetSnippet } from "./widget";

describe("widget snippet theme configuration", () => {
  it("includes the selected theme and position", () => {
    expect(makeWidgetSnippet("bot-1", "token-1", "cyan", "bottom-left")).toContain('data-theme="cyan" data-position="bottom-left"');
  });

  it("ignores unsupported appearance values", () => {
    const snippet = makeWidgetSnippet("bot-1", "token-1", "javascript:alert(1)", "top");
    expect(snippet).not.toContain("javascript");
    expect(snippet).not.toContain("data-theme");
    expect(snippet).not.toContain("data-position");
  });
});
