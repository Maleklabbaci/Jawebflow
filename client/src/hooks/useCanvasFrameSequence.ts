import { useEffect, useRef, useState } from 'react';

interface UseCanvasFrameSequenceOptions {
  totalFrames?: number;
  framePathPrefix?: string;
  frameExtension?: string;
  lerpFactor?: number;
}

export function useCanvasFrameSequence(options: UseCanvasFrameSequenceOptions = {}) {
  const {
    totalFrames = 201,
    framePathPrefix = '/robot_frames/frame_',
    frameExtension = '.jpg',
    lerpFactor = 0.14,
  } = options;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Cached image elements and render state
  const imagesRef = useRef<Array<HTMLImageElement | null>>([]);
  const loadedMapRef = useRef<Uint8Array>(new Uint8Array(totalFrames));
  const targetFrameRef = useRef(0);
  const currentFrameRef = useRef(0);
  const lastRenderedFrameRef = useRef(-1);
  const dimensionsRef = useRef({ cw: 0, ch: 0, dpr: 1 });

  // Helper to format frame numbers (0001 -> 0201)
  const getFrameUrl = (index: number) => {
    const padded = String(index + 1).padStart(4, '0');
    return `${framePathPrefix}${padded}${frameExtension}`;
  };

  // High-performance tiered progressive preloading
  useEffect(() => {
    let isMounted = true;
    const images: Array<HTMLImageElement | null> = new Array(totalFrames).fill(null);
    const loadedMap = new Uint8Array(totalFrames);
    loadedMapRef.current = loadedMap;
    imagesRef.current = images;

    // Helper to load a single frame
    const loadFrame = (index: number, onComplete?: () => void) => {
      if (images[index]) return;
      const img = new Image();
      img.src = getFrameUrl(index);

      const handleDone = () => {
        if (!isMounted) return;
        loadedMap[index] = 1;
        if (onComplete) onComplete();
      };

      if (img.decode) {
        img.decode().then(handleDone).catch(handleDone);
      } else {
        img.onload = handleDone;
      }
      images[index] = img;
    };

    // 1. Instant First-Frame paint (<20ms)
    loadFrame(0, () => {
      if (isMounted) {
        setIsReady(true);
        drawFrame(0);
      }
    });

    // 2. Preload keyframes evenly for instant scrubbing responsiveness
    const keyframes = [10, 25, 50, 75, 100, 125, 150, 175, 200];
    keyframes.forEach(k => {
      if (k < totalFrames) loadFrame(k);
    });

    // 3. Batch preload all remaining frames smoothly
    let nextIdx = 1;
    const loadBatch = () => {
      if (!isMounted || nextIdx >= totalFrames) return;

      const batchSize = 10;
      let count = 0;
      while (nextIdx < totalFrames && count < batchSize) {
        if (!images[nextIdx]) {
          loadFrame(nextIdx);
          count++;
        }
        nextIdx++;
      }

      if (nextIdx < totalFrames) {
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(loadBatch, { timeout: 80 });
        } else {
          setTimeout(loadBatch, 16);
        }
      }
    };

    const timer = setTimeout(loadBatch, 40);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [totalFrames, framePathPrefix, frameExtension]);

  // Find the nearest loaded and valid image
  const getValidImage = (index: number): HTMLImageElement | null => {
    const clamped = Math.max(0, Math.min(totalFrames - 1, index));
    const images = imagesRef.current;
    const loadedMap = loadedMapRef.current;

    if (loadedMap[clamped] === 1 && images[clamped]) {
      return images[clamped];
    }

    // Bidirectional proximity search (closest loaded frame)
    for (let offset = 1; offset < 30; offset++) {
      const prev = clamped - offset;
      if (prev >= 0 && loadedMap[prev] === 1 && images[prev]) {
        return images[prev];
      }
      const next = clamped + offset;
      if (next < totalFrames && loadedMap[next] === 1 && images[next]) {
        return images[next];
      }
    }

    return images[0] && loadedMap[0] === 1 ? images[0] : null;
  };

  // Razor-sharp single frame render (100% crisp, zero ghosting, zero motion blur)
  const drawFrame = (frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const { cw, ch } = dimensionsRef.current;
    if (cw === 0 || ch === 0) return;

    const targetIdx = Math.max(0, Math.min(totalFrames - 1, Math.round(frameIndex)));
    const img = getValidImage(targetIdx);
    if (!img || img.naturalWidth === 0) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const canvasRatio = cw / ch;
    const imgRatio = iw / ih;

    let sx = 0, sy = 0, sWidth = iw, sHeight = ih;

    if (imgRatio > canvasRatio) {
      sWidth = ih * canvasRatio;
      sx = (iw - sWidth) / 2;
    } else {
      sHeight = iw / canvasRatio;
      sy = (ih - sHeight) / 2;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, cw, ch);
    lastRenderedFrameRef.current = targetIdx;
  };

  // Pure 60fps/120fps Glide Loop (Smooth inertia LERP without double-vision blur)
  useEffect(() => {
    let animationFrameId: number;

    const renderLoop = () => {
      const target = targetFrameRef.current;
      const current = currentFrameRef.current;
      const diff = target - current;

      if (Math.abs(diff) > 0.001) {
        currentFrameRef.current = current + diff * lerpFactor;
        const targetFrameInt = Math.round(currentFrameRef.current);
        
        if (targetFrameInt !== lastRenderedFrameRef.current) {
          drawFrame(targetFrameInt);
        }
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [totalFrames, lerpFactor]);

  // Optimized Scroll & Resize Listeners (Zero React state updates)
  useEffect(() => {
    const updateDimensions = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      const cw = width * dpr;
      const ch = height * dpr;

      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      dimensionsRef.current = { cw, ch, dpr };

      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }

      drawFrame(currentFrameRef.current);
    };

    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = totalScroll > 0 ? Math.min(Math.max(scrollY / totalScroll, 0), 1) : 0;

      targetFrameRef.current = progress * (totalFrames - 1);

      // Direct DOM update for top progress line (0 React re-renders)
      if (progressBarRef.current) {
        progressBarRef.current.style.transform = `scaleX(${progress})`;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateDimensions, { passive: true });

    updateDimensions();
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateDimensions);
    };
  }, [totalFrames]);

  return {
    canvasRef,
    progressBarRef,
    isReady,
  };
}
