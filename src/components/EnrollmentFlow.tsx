import { useRef, useState, useEffect, useCallback } from 'react';
import { useFaceEnrollment } from '../hooks/useFaceEnrollment';

interface EnrollmentFlowProps {
  mediaStream: MediaStream | null;
  onEnrollmentComplete: (referenceDescriptor: Float32Array) => void;
}

export function EnrollmentFlow({ mediaStream, onEnrollmentComplete }: EnrollmentFlowProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const {
    enrollmentState,
    enroll,
    getReferenceDescriptor,
    isEnrolled,
  } = useFaceEnrollment();

  // Attach the shared stream to our local video element
  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
      setCameraReady(true);
    }
  }, [mediaStream]);

  const handleEnroll = useCallback(async () => {
    if (!videoRef.current) return;
    await enroll(videoRef.current);
  }, [enroll]);

  const handleStartInterview = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.warn('Could not auto-enter fullscreen:', err);
    }
    const descriptor = getReferenceDescriptor();
    if (descriptor) {
      onEnrollmentComplete(descriptor);
    }
  }, [getReferenceDescriptor, onEnrollmentComplete]);

  const progressPercent =
    (enrollmentState.progress / 5) * 100;

  return (
    <div className="enrollment-container">
      <div className="enrollment-card">
        <h2>🛡️ Face Enrollment</h2>
        <p>
          Before starting the interview, we need to verify your identity.
          <br />
          Please look directly at the camera and ensure good lighting.
        </p>

        {!mediaStream ? (
          <div
            style={{
              padding: 20,
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--accent-red)',
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            Camera access denied. Please allow camera access and refresh.
          </div>
        ) : (
          <>
            <div
              className={`webcam-preview ${
                isEnrolled ? 'active' : ''
              }`}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
              />
              {isEnrolled && (
                <div className="webcam-overlay">
                  <span className="webcam-badge green">✓ Enrolled</span>
                </div>
              )}
              {enrollmentState.status === 'capturing' && (
                <div className="webcam-overlay">
                  <span className="webcam-badge blue">
                    📸 Capturing {enrollmentState.progress}/5
                  </span>
                </div>
              )}
            </div>

            {enrollmentState.status === 'capturing' && (
              <div className="progress-container">
                <div className="progress-label">
                  <span>Capturing faces...</span>
                  <span>{enrollmentState.progress}/5</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {enrollmentState.status === 'loading_models' && (
              <div className="loading-indicator" style={{ justifyContent: 'center', marginBottom: 16 }}>
                <div className="spinner" />
                <span>Loading face detection models...</span>
              </div>
            )}

            {enrollmentState.status === 'error' && (
              <div
                style={{
                  padding: 12,
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: 'var(--accent-red)',
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                {enrollmentState.error}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
          {!isEnrolled ? (
            <button
              className="btn btn-primary"
              onClick={handleEnroll}
              disabled={
                !cameraReady ||
                enrollmentState.status === 'capturing' ||
                enrollmentState.status === 'loading_models'
              }
            >
              {enrollmentState.status === 'capturing'
                ? `Capturing (${enrollmentState.progress}/5)...`
                : enrollmentState.status === 'loading_models'
                  ? 'Loading Models...'
                  : '📸 Start Enrollment'}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleStartInterview}
            >
              🚀 Start Interview
            </button>
          )}
        </div>

        {isEnrolled && (
          <p style={{ marginTop: 16, color: 'var(--accent-green)', fontSize: 13 }}>
            ✅ Face enrolled successfully! Click "Start Interview" to begin.
          </p>
        )}

        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong>How it works:</strong> We capture 5 images of your face to create
          a unique identity reference. During the interview, we continuously verify
          that the same person is present.
        </div>
      </div>
    </div>
  );
}
