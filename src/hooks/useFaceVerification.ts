import { useState, useCallback, useEffect, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';
import type { ViolationEventType } from './useIntegrityEngine';

export type VerificationStatus = 'verified' | 'mismatch' | 'no_face' | 'idle';

interface FaceVerificationOptions {
  videoElement: HTMLVideoElement | null;
  referenceDescriptor: Float32Array | null;
  onEvent: (type: ViolationEventType, details?: string) => void;
  onViolation?: (type: string) => void; // for screenshot capture
  enabled: boolean;
  intervalMs?: number;
}

const MATCH_THRESHOLD = 0.6;

export function useFaceVerification({
  videoElement,
  referenceDescriptor,
  onEvent,
  onViolation,
  enabled,
  intervalMs = 5000,
}: FaceVerificationOptions) {
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [lastVerifiedAt, setLastVerifiedAt] = useState<number | null>(null);
  const [mismatchCount, setMismatchCount] = useState(0);
  const [noFaceCount, setNoFaceCount] = useState(0);
  const [distance, setDistance] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const noFaceStartRef = useRef<number | null>(null);
  const noFaceEventFiredRef = useRef(false);

  const verify = useCallback(async () => {
    if (!videoElement || !referenceDescriptor || videoElement.readyState < 2) return;

    try {
      const detection = await faceapi
        .detectSingleFace(videoElement)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setStatus('no_face');
        setDistance(null);

        // Start tracking no-face duration
        if (!noFaceStartRef.current) {
          noFaceStartRef.current = Date.now();
          noFaceEventFiredRef.current = false;
        }

        // Fire face_missing event after 10 seconds of no face
        if (
          noFaceStartRef.current &&
          Date.now() - noFaceStartRef.current > 10000 &&
          !noFaceEventFiredRef.current
        ) {
          noFaceEventFiredRef.current = true;
          setNoFaceCount((c) => c + 1);
          onEvent('face_missing', 'No face detected for over 10 seconds');
          onViolation?.('face_missing');
        }
        return;
      }

      // Reset no-face tracking
      noFaceStartRef.current = null;
      noFaceEventFiredRef.current = false;

      // Compare embeddings
      const dist = faceapi.euclideanDistance(
        Array.from(detection.descriptor),
        Array.from(referenceDescriptor)
      );
      setDistance(dist);

      if (dist < MATCH_THRESHOLD) {
        setStatus('verified');
        setLastVerifiedAt(Date.now());
        // Don't spam verified events - only log periodically
      } else {
        setStatus('mismatch');
        setMismatchCount((c) => c + 1);
        onEvent(
          'identity_mismatch',
          `Face mismatch detected (distance: ${dist.toFixed(3)})`
        );
        onViolation?.('identity_mismatch');
      }
    } catch (err) {
      console.error('[FaceVerification] Error:', err);
    }
  }, [videoElement, referenceDescriptor, onEvent, onViolation]);

  useEffect(() => {
    if (!enabled || !videoElement || !referenceDescriptor) {
      setStatus('idle');
      return;
    }

    // Run immediately
    verify();

    // Then run on interval
    intervalRef.current = setInterval(verify, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, videoElement, referenceDescriptor, intervalMs, verify]);

  return {
    verificationStatus: status,
    lastVerifiedAt,
    mismatchCount,
    noFaceCount,
    distance,
  };
}
