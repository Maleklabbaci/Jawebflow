import { RefObject, useEffect } from "react";

export function getScrollProgress({
  scrollY,
  sceneTop,
  sceneHeight,
  viewportHeight,
}: {
  scrollY: number;
  sceneTop: number;
  sceneHeight: number;
  viewportHeight: number;
}) {
  const distance = Math.max(sceneHeight * 1.08, viewportHeight * 1.4, 1);
  return Math.min(Math.max((scrollY - sceneTop) / distance, 0), 1);
}

export function useScrollVideo({
  videoRef,
  sceneRef,
  enabled,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  sceneRef: RefObject<HTMLElement | null>;
  enabled: boolean;
}) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    video.muted = true;
    video.pause();
    if (reducedMotion) return;

    let animationFrame = 0;
    let targetTime = 0;
    let displayedTime = video.currentTime || 0;
    let progress = 0;

    const updateScrollTarget = () => {
      const scene = sceneRef.current;
      if (!scene || !Number.isFinite(video.duration)) return;
      progress = getScrollProgress({
        scrollY: window.scrollY,
        sceneTop: scene.offsetTop,
        sceneHeight: scene.offsetHeight,
        viewportHeight: window.innerHeight,
      });
      targetTime = video.duration * progress;
    };

    const render = () => {
      displayedTime += (targetTime - displayedTime) * 0.09;
      if (Math.abs(video.currentTime - displayedTime) > 0.025) video.currentTime = displayedTime;
      video.style.transform = `translate3d(0, ${progress * 3}%, 0) scale(${1.1 - progress * 0.045})`;
      video.style.opacity = String(0.94 - progress * 0.18);
      animationFrame = window.requestAnimationFrame(render);
    };

    const initialise = () => {
      displayedTime = video.currentTime || 0;
      updateScrollTarget();
    };

    video.addEventListener("loadedmetadata", initialise, { once: true });
    updateScrollTarget();
    animationFrame = window.requestAnimationFrame(render);
    window.addEventListener("scroll", updateScrollTarget, { passive: true });
    window.addEventListener("resize", updateScrollTarget);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", updateScrollTarget);
      window.removeEventListener("resize", updateScrollTarget);
      video.removeEventListener("loadedmetadata", initialise);
    };
  }, [enabled, sceneRef, videoRef]);
}
