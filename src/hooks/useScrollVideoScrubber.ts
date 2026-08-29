import { useEffect, useState, RefObject } from 'react';

interface UseScrollVideoScrubberOptions {
  lerpFactor?: number;
  smoothScrubbing?: boolean;
}

export function useScrollVideoScrubber(
  videoRef: RefObject<HTMLVideoElement | null>,
  options: UseScrollVideoScrubberOptions = {}
) {
  const { lerpFactor = 0.12, smoothScrubbing = true } = options;
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let targetTime = 0;
    let currentTime = 0;
    let animationFrameId: number | null = null;
    let isSeeking = false;

    const markVideoReady = () => {
      setIsVideoReady(true);
      calculateAndSetTarget();
    };

    const onLoadedMetadata = () => {
      markVideoReady();
    };

    const onCanPlay = () => {
      markVideoReady();
    };

    const onSeeked = () => {
      isSeeking = false;
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadeddata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);

    // If metadata was already cached/loaded
    if (video.readyState >= 1) {
      setIsVideoReady(true);
    }

    const calculateAndSetTarget = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = totalScroll > 0 ? Math.min(Math.max(scrollY / totalScroll, 0), 1) : 0;
      setScrollProgress(progress);

      if (video.duration && !isNaN(video.duration)) {
        targetTime = progress * video.duration;
      }
    };

    // Frame-rate synchronized RAF loop for ultra-smooth scrubbing without lag
    const scrubLoop = () => {
      if (video && video.duration && !isNaN(video.duration)) {
        if (smoothScrubbing) {
          const diff = targetTime - currentTime;
          // Apply linear interpolation (lerp)
          currentTime += diff * lerpFactor;

          if (Math.abs(diff) > 0.002) {
            const clamped = Math.max(0, Math.min(currentTime, video.duration - 0.04));
            if (!isSeeking && Math.abs(video.currentTime - clamped) > 0.01) {
              try {
                video.currentTime = clamped;
              } catch {
                // Ignore seek interruptions
              }
            }
          }
        } else {
          // Direct scrub without interpolation
          const clamped = Math.max(0, Math.min(targetTime, video.duration - 0.04));
          if (!isSeeking && Math.abs(video.currentTime - clamped) > 0.01) {
            try {
              video.currentTime = clamped;
            } catch {
              // Ignore seek interruptions
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(scrubLoop);
    };

    animationFrameId = requestAnimationFrame(scrubLoop);

    const onScroll = () => {
      calculateAndSetTarget();
    };

    const onResize = () => {
      calculateAndSetTarget();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    calculateAndSetTarget();

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadeddata', onLoadedMetadata);
      video.removeEventListener('seeked', onSeeked);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [videoRef, lerpFactor, smoothScrubbing]);

  return { scrollProgress, isVideoReady };
}
