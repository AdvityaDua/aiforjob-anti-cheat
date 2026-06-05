import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceMesh, type Results } from '@mediapipe/face_mesh';
import type { ViolationEventType } from './useIntegrityEngine';

export type GazeDirection =
  | 'center'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'unknown';

interface GazeTrackingOptions {
  videoElement: HTMLVideoElement | null;
  onEvent: (type: ViolationEventType, details?: string) => void;
  onViolation?: (type: string) => void;
  enabled: boolean;
}

// MediaPipe Face Mesh landmark indices
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const LEFT_EAR = 234;
const RIGHT_EAR = 454;
const LEFT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;

function estimateGazeDirection(landmarks: any[]): GazeDirection {
  if (!landmarks || landmarks.length < 468) return 'unknown';

  const nose = landmarks[NOSE_TIP];
  const leftEar = landmarks[LEFT_EAR];
  const rightEar = landmarks[RIGHT_EAR];
  const forehead = landmarks[FOREHEAD];
  const chin = landmarks[CHIN];

  // Calculate face width and yaw
  const faceWidth = Math.abs(rightEar.x - leftEar.x);
  const noseCenterX = (leftEar.x + rightEar.x) / 2;
  const yawRatio = (nose.x - noseCenterX) / (faceWidth / 2);

  // Calculate pitch
  const faceHeight = Math.abs(chin.y - forehead.y);
  const noseCenterY = (forehead.y + chin.y) / 2;
  const pitchRatio = (nose.y - noseCenterY) / (faceHeight / 2);

  // Determine direction based on head pose thresholds
  if (Math.abs(yawRatio) > 0.35) {
    return yawRatio > 0 ? 'right' : 'left';
  }
  if (pitchRatio > 0.25) {
    return 'down';
  }
  if (pitchRatio < -0.35) {
    return 'up';
  }

  // If head is relatively straight, check true eye gaze using Iris landmarks
  if (landmarks.length >= 478) {
    const leftIris = landmarks[LEFT_IRIS];
    const rightIris = landmarks[RIGHT_IRIS];

    // Left eye (screen coordinates)
    const leftEyeScreenLeft = Math.min(landmarks[LEFT_EYE_OUTER].x, landmarks[LEFT_EYE_INNER].x);
    const leftEyeScreenRight = Math.max(landmarks[LEFT_EYE_OUTER].x, landmarks[LEFT_EYE_INNER].x);
    const leftIrisRatio = (leftIris.x - leftEyeScreenLeft) / (leftEyeScreenRight - leftEyeScreenLeft + 0.0001);

    // Right eye (screen coordinates)
    const rightEyeScreenLeft = Math.min(landmarks[RIGHT_EYE_OUTER].x, landmarks[RIGHT_EYE_INNER].x);
    const rightEyeScreenRight = Math.max(landmarks[RIGHT_EYE_OUTER].x, landmarks[RIGHT_EYE_INNER].x);
    const rightIrisRatio = (rightIris.x - rightEyeScreenLeft) / (rightEyeScreenRight - rightEyeScreenLeft + 0.0001);

    const avgIrisRatio = (leftIrisRatio + rightIrisRatio) / 2;

    // Center is ~0.5. < 0.4 is looking left, > 0.6 is looking right.
    if (avgIrisRatio < 0.4) return 'left';
    if (avgIrisRatio > 0.6) return 'right';
  }

  return 'center';
}

export function useGazeTracking({
  videoElement,
  onEvent,
  onViolation,
  enabled,
}: GazeTrackingOptions) {
  const [gazeDirection, setGazeDirection] = useState<GazeDirection>('unknown');
  const [awayDuration, setAwayDuration] = useState(0);
  const [isWarning, setIsWarning] = useState(false);
  const [isViolation, setIsViolation] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const faceMeshRef = useRef<FaceMesh | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const awayStartRef = useRef<number | null>(null);
  const warningFiredRef = useRef(false);
  const violationFiredRef = useRef(false);
  const awayTimerRef = useRef<ReturnType<typeof setInterval>>();

  const onResults = useCallback(
    (results: Results) => {
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        setGazeDirection('unknown');
        return;
      }

      const landmarks = results.multiFaceLandmarks[0];
      const direction = estimateGazeDirection(landmarks);
      setGazeDirection(direction);

      const isLookingAway = direction !== 'center';

      if (isLookingAway) {
        if (!awayStartRef.current) {
          awayStartRef.current = Date.now();
          warningFiredRef.current = false;
          violationFiredRef.current = false;
        }
      } else {
        // Reset when looking at screen
        awayStartRef.current = null;
        warningFiredRef.current = false;
        violationFiredRef.current = false;
        setAwayDuration(0);
        setIsWarning(false);
        setIsViolation(false);
      }
    },
    []
  );

  // Timer to update away duration and fire events
  useEffect(() => {
    if (!enabled) return;

    awayTimerRef.current = setInterval(() => {
      if (awayStartRef.current) {
        const duration = (Date.now() - awayStartRef.current) / 1000;
        setAwayDuration(duration);

        if (duration > 15 && !violationFiredRef.current) {
          violationFiredRef.current = true;
          setIsViolation(true);
          onEvent(
            'looking_away',
            `Candidate looked away for ${duration.toFixed(0)}s — violation`
          );
          onViolation?.('looking_away');
        } else if (duration > 5 && !warningFiredRef.current) {
          warningFiredRef.current = true;
          setIsWarning(true);
          onEvent(
            'gaze_warning',
            `Candidate looking away for ${duration.toFixed(0)}s — warning`
          );
        }
      }
    }, 500);

    return () => {
      if (awayTimerRef.current) {
        clearInterval(awayTimerRef.current);
      }
    };
  }, [enabled, onEvent, onViolation]);

  // Initialize FaceMesh — use manual frame sending instead of MediaPipe Camera
  // (Camera utility hijacks the video stream and causes flickering)
  useEffect(() => {
    if (!enabled || !videoElement) return;

    let cancelled = false;

    const init = async () => {
      try {
        const faceMesh = new FaceMesh({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults(onResults);
        faceMeshRef.current = faceMesh;

        if (!cancelled) {
          setIsModelLoaded(true);
        }
      } catch (err) {
        console.error('[GazeTracking] Init failed:', err);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
    };
  }, [enabled, videoElement, onResults]);

  // Send frames to FaceMesh manually on an interval
  // This avoids using MediaPipe Camera which hijacks the video stream
  useEffect(() => {
    if (!enabled || !isModelLoaded || !videoElement || !faceMeshRef.current) return;

    let processing = false;

    intervalRef.current = setInterval(async () => {
      if (processing || !faceMeshRef.current || !videoElement || videoElement.readyState < 2) return;
      processing = true;
      try {
        await faceMeshRef.current.send({ image: videoElement });
      } catch (err) {
        // Suppress transient errors during cleanup
      }
      processing = false;
    }, 200); // ~5 FPS for gaze tracking

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, isModelLoaded, videoElement]);

  return {
    gazeDirection,
    awayDuration,
    isWarning,
    isViolation,
    isModelLoaded,
  };
}
