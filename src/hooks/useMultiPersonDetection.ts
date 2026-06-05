import { useState, useEffect, useRef, useCallback } from 'react';
import type { ViolationEventType } from './useIntegrityEngine';

interface MultiPersonDetectionOptions {
  videoElement: HTMLVideoElement | null;
  onEvent: (type: ViolationEventType, details?: string) => void;
  onViolation?: (type: string) => void;
  enabled: boolean;
  intervalMs?: number;
}

// We'll load COCO-SSD dynamically
let cocoSsdModel: any = null;
let modelLoading = false;

async function loadCocoSsd() {
  if (cocoSsdModel) return cocoSsdModel;
  if (modelLoading) {
    // Wait for existing load
    while (modelLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return cocoSsdModel;
  }

  modelLoading = true;
  try {
    const cocoSsd = await import('@tensorflow-models/coco-ssd');
    // Ensure TensorFlow.js backend is loaded
    await import('@tensorflow/tfjs');
    cocoSsdModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    return cocoSsdModel;
  } finally {
    modelLoading = false;
  }
}

export function useMultiPersonDetection({
  videoElement,
  onEvent,
  onViolation,
  enabled,
  intervalMs = 1000,
}: MultiPersonDetectionOptions) {
  const [personCount, setPersonCount] = useState(0);
  const [isWarning, setIsWarning] = useState(false);
  const [isViolation, setIsViolation] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const lastViolationRef = useRef(0);

  const detect = useCallback(async () => {
    if (!videoElement || videoElement.readyState < 2 || !cocoSsdModel) return;

    try {
      const predictions = await cocoSsdModel.detect(videoElement);
      const people = predictions.filter(
        (p: any) => p.class === 'person' && p.score > 0.5
      );
      const count = people.length;

      setPersonCount(count);

      const now = Date.now();
      if (count >= 3) {
        setIsViolation(true);
        setIsWarning(true);
        if (now - lastViolationRef.current > 5000) {
          lastViolationRef.current = now;
          onEvent(
            'multiple_people_detected',
            `${count} people detected — violation`
          );
          onViolation?.('multiple_people_detected');
        }
      } else if (count === 2) {
        setIsViolation(false);
        setIsWarning(true);
        if (now - lastViolationRef.current > 10000) {
          lastViolationRef.current = now;
          onEvent(
            'multiple_people_detected',
            `${count} people detected — warning`
          );
          onViolation?.('multiple_people_detected');
        }
      } else {
        setIsViolation(false);
        setIsWarning(false);
      }
    } catch (err) {
      console.error('[MultiPersonDetection] Error:', err);
    }
  }, [videoElement, onEvent, onViolation]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const init = async () => {
      try {
        await loadCocoSsd();
        if (!cancelled) {
          setIsModelLoaded(true);
        }
      } catch (err) {
        console.error('[MultiPersonDetection] Model load failed:', err);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isModelLoaded || !videoElement) return;

    // Run immediately
    detect();

    intervalRef.current = setInterval(detect, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, isModelLoaded, videoElement, intervalMs, detect]);

  return {
    personCount,
    isWarning,
    isViolation,
    isModelLoaded,
  };
}
