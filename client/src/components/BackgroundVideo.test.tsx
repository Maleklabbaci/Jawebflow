// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import BackgroundVideo from "./BackgroundVideo";

const source = "/manus-storage/test-hero.mp4";
let root: Root | null = null;
let container: HTMLDivElement | null = null;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderBackgroundVideo() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const sceneRef = { current: document.createElement("section") };
  Object.defineProperty(sceneRef.current, "offsetHeight", { value: 1000 });
  Object.defineProperty(sceneRef.current, "offsetTop", { value: 0 });
  act(() => root?.render(<BackgroundVideo src={source} sceneRef={sceneRef} />));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.querySelectorAll(`link[href="${source}"]`).forEach(link => link.remove());
});

describe("BackgroundVideo", () => {
  it("preloads the media and renders it without controls", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);

    const view = renderBackgroundVideo();
    const video = view.querySelector("video");
    const preload = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="video"]')).find(link => link.href.endsWith(source));

    expect(video?.getAttribute("preload")).toBe("auto");
    expect(video?.hasAttribute("controls")).toBe(false);
    expect(preload).not.toBeNull();
  });

  it("switches to the fallback scene when video loading fails", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);

    const view = renderBackgroundVideo();
    const video = view.querySelector("video");
    act(() => video?.dispatchEvent(new Event("error", { bubbles: true })));

    expect(view.querySelector(".hero-video-stage")?.classList.contains("hero-video-stage--fallback")).toBe(true);
    expect(view.querySelector(".hero-video-fallback-art")).not.toBeNull();
  });
});
