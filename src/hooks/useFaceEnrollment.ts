import { useState, useCallback, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';

export interface EnrollmentState {
  status: 'idle' | 'loading_models' | 'capturing' | 'enrolled' | 'error';
  progress: number; // 0-5 captured frames
  error?: string;
}

const REQUIRED_CAPTURES = 5;
const CAPTURE_INTERVAL_MS = 800;

export function useFaceEnrollment() {
  const [state, setState] = useState<EnrollmentState>({
    status: 'idle',
    progress: 0,
  });
  const referenceDescriptorRef = useRef<Float32Array | null>(null);
  const modelsLoadedRef = useRef(false);

  const loadModels = useCallback(async () => {
    if (modelsLoadedRef.current) return;

    setState({ status: 'loading_models', progress: 0 });
    try {
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoadedRef.current = true;
    } catch (err) {
      setState({
        status: 'error',
        progress: 0,
        error: `Failed to load face-api models: ${err}`,
      });
      throw err;
    }
  }, []);

  const enroll = useCallback(
    async (videoElement: HTMLVideoElement) => {
      try {
        await loadModels();

        setState({ status: 'capturing', progress: 0 });
        const descriptors: Float32Array[] = [];

        for (let i = 0; i < REQUIRED_CAPTURES; i++) {
          // Wait for interval between captures
          if (i > 0) {
            await new Promise((r) => setTimeout(r, CAPTURE_INTERVAL_MS));
          }

          const detection = await faceapi
            .detectSingleFace(videoElement)
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detection) {
            descriptors.push(detection.descriptor);
            setState({ status: 'capturing', progress: i + 1 });
          } else {
            // Retry this frame
            i--;
            await new Promise((r) => setTimeout(r, 300));
          }
        }

        // Average the descriptors
        const avgDescriptor = new Float32Array(128);
        for (const desc of descriptors) {
          for (let j = 0; j < 128; j++) {
            avgDescriptor[j] += desc[j] / descriptors.length;
          }
        }

        referenceDescriptorRef.current = avgDescriptor;
        setState({ status: 'enrolled', progress: REQUIRED_CAPTURES });
      } catch (err) {
        setState({
          status: 'error',
          progress: 0,
          error: `Enrollment failed: ${err}`,
        });
      }
    },
    [loadModels]
  );

  const getReferenceDescriptor = useCallback(() => {
    return referenceDescriptorRef.current;
  }, []);

  const resetEnrollment = useCallback(() => {
    referenceDescriptorRef.current = null;
    setState({ status: 'idle', progress: 0 });
  }, []);

  return {
    enrollmentState: state,
    enroll,
    getReferenceDescriptor,
    resetEnrollment,
    isEnrolled: state.status === 'enrolled',
  };
}
