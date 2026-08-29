import { useState, useEffect } from 'react';

interface PreloadState {
  isLoaded: boolean;
  isLoading: boolean;
  src: string;
  error: Error | null;
  progress: number; // 0 to 100%
}

// In-memory cache for the blob URL so page navigations / component remounts don't re-download
let cachedBlobUrl: string | null = null;
let activeFetchPromise: Promise<string> | null = null;

export function useVideoPreload(videoSrc: string = '/background.mp4'): PreloadState {
  const [state, setState] = useState<PreloadState>({
    isLoaded: !!cachedBlobUrl,
    isLoading: !cachedBlobUrl,
    src: cachedBlobUrl || videoSrc,
    error: null,
    progress: cachedBlobUrl ? 100 : 0,
  });

  useEffect(() => {
    let isMounted = true;

    if (cachedBlobUrl) {
      setState({
        isLoaded: true,
        isLoading: false,
        src: cachedBlobUrl,
        error: null,
        progress: 100,
      });
      return;
    }

    if (!activeFetchPromise) {
      activeFetchPromise = (async () => {
        try {
          const response = await fetch(videoSrc, {
            headers: {
              'Cache-Control': 'public, max-age=31536000',
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to preload video: ${response.statusText}`);
          }

          const contentLengthHeader = response.headers.get('content-length');
          const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

          if (response.body && totalBytes > 0) {
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let receivedBytes = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                receivedBytes += value.length;
                if (isMounted) {
                  const percent = Math.min(Math.round((receivedBytes / totalBytes) * 100), 99);
                  setState((prev) => ({ ...prev, progress: percent }));
                }
              }
            }

            const blob = new Blob(chunks, { type: 'video/mp4' });
            cachedBlobUrl = URL.createObjectURL(blob);
            return cachedBlobUrl;
          } else {
            const blob = await response.blob();
            cachedBlobUrl = URL.createObjectURL(blob);
            return cachedBlobUrl;
          }
        } catch (err) {
          activeFetchPromise = null;
          throw err;
        }
      })();
    }

    activeFetchPromise
      .then((blobUrl) => {
        if (isMounted) {
          setState({
            isLoaded: true,
            isLoading: false,
            src: blobUrl,
            error: null,
            progress: 100,
          });
        }
      })
      .catch((err) => {
        if (isMounted) {
          // Graceful fallback to direct videoSrc if blob prefetching fails
          setState({
            isLoaded: true,
            isLoading: false,
            src: videoSrc,
            error: err as Error,
            progress: 100,
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [videoSrc]);

  return state;
}
