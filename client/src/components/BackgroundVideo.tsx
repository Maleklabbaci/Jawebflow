import React, { RefObject, useEffect, useRef, useState } from "react";

type BackgroundVideoProps = {
  src: string;
  sceneRef: RefObject<HTMLElement | null>;
};

export default function BackgroundVideo({ src }: BackgroundVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      // Autoplay can be blocked in rare cases; the poster/first frame still shows.
    });
  }, [src]);

  return (
    <div className={`hero-video-stage${videoFailed ? " hero-video-stage--fallback" : ""}`} aria-hidden="true">
      {videoFailed ? <div className="hero-video-fallback-art" /> : null}
      <video
        ref={videoRef}
        className="hero-motion-video"
        muted
        loop
        autoPlay
        playsInline
        preload="auto"
        tabIndex={-1}
        onError={() => setVideoFailed(true)}
      >
        <source src={src} type="video/mp4" />
      </video>
    </div>
  );
}

export { BackgroundVideo };
