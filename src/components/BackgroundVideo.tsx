import React from 'react';
import { useCanvasFrameSequence } from '../hooks/useCanvasFrameSequence';

interface BackgroundVideoProps {
  opacity?: number;
  totalFrames?: number;
  lerpFactor?: number;
}

export const BackgroundVideo: React.FC<BackgroundVideoProps> = ({ 
  opacity = 0.92,
  totalFrames = 201,
  lerpFactor = 0.25
}) => {
  // Ultra-fluid Canvas Frame Sequence Engine (Crisp, zero-latency 60fps scroll scrubbing)
  const { canvasRef, progressBarRef, isReady } = useCanvasFrameSequence({
    totalFrames,
    framePathPrefix: '/robot_frames/frame_',
    frameExtension: '.jpg',
    lerpFactor,
  });

  return (
    <div 
      id="background-canvas-container"
      className="fixed inset-0 z-0 w-full h-full overflow-hidden pointer-events-none select-none bg-neutral-950"
      aria-hidden="true"
    >
      {/* 
        High-Performance 60fps/120fps Canvas:
        - 201 high-density frames with sub-pixel interpolation
        - Zero React state re-render overhead during scrolling
      */}
      <canvas
        ref={canvasRef}
        id="bg-interactive-canvas"
        className="w-full h-full object-cover scale-[1.01] transition-opacity duration-500 ease-out"
        style={{
          opacity: isReady ? opacity : 0.8,
          filter: 'contrast(1.08) saturate(1.15) brightness(1.02)',
        }}
      />

      {/* Ultra-light ambient veil for text readability without hiding the robot animation */}
      <div className="absolute inset-0 bg-neutral-950/20" />

      {/* Subtle Radial Vignette for framing */}
      <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_40%,rgba(8,6,15,0.7)_100%]" />
      
      {/* Soft Edge Gradient Fades */}
      <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-neutral-950/80 via-neutral-950/30 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-neutral-950/80 via-neutral-950/30 to-transparent" />

      {/* Ambient Purple & Violet Light Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 md:left-1/4 md:translate-x-0 w-72 sm:w-96 h-72 sm:h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 md:left-auto md:right-1/4 md:translate-x-0 w-80 sm:w-[500px] h-80 sm:h-[500px] bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Elegant Purple Progress Line Indicator at the Top (Hardware accelerated GPU transform) */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-neutral-900/60 z-30 overflow-hidden">
        <div 
          ref={progressBarRef}
          className="h-full w-full origin-left bg-gradient-to-r from-purple-500 via-fuchsia-500 to-indigo-400 will-change-transform"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>
    </div>
  );
};
