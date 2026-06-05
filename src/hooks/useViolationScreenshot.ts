import { useCallback, useRef, useState } from 'react';

export interface ViolationScreenshot {
  id: string;
  timestamp: number;
  type: string;
  dataUrl: string;
}

let screenshotIdCounter = 0;

export function useViolationScreenshot() {
  const [screenshots, setScreenshots] = useState<ViolationScreenshot[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Lazily create canvas
  const getCanvas = useCallback(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    return canvasRef.current;
  }, []);

  const captureScreenshot = useCallback(
    (videoElement: HTMLVideoElement | null, type: string): ViolationScreenshot | null => {
      if (!videoElement || videoElement.readyState < 2) return null;

      const canvas = getCanvas();
      canvas.width = videoElement.videoWidth || 320;
      canvas.height = videoElement.videoHeight || 240;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

      const screenshot: ViolationScreenshot = {
        id: `ss-${++screenshotIdCounter}`,
        timestamp: Date.now(),
        type,
        dataUrl,
      };

      setScreenshots((prev) => [screenshot, ...prev]);
      return screenshot;
    },
    [getCanvas]
  );

  const clearScreenshots = useCallback(() => {
    setScreenshots([]);
  }, []);

  return {
    screenshots,
    captureScreenshot,
    clearScreenshots,
  };
}
