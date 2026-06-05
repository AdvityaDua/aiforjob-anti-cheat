import { useRef, useState, useEffect, useCallback } from 'react';
import Meyda from 'meyda';
import { useFaceEnrollment } from '../hooks/useFaceEnrollment';

interface EnrollmentFlowProps {
  mediaStream: MediaStream | null;
  onEnrollmentComplete: (referenceDescriptor: Float32Array, goldenBaselineMFCC: number[]) => void;
}

export function EnrollmentFlow({ mediaStream, onEnrollmentComplete }: EnrollmentFlowProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);

  // Voice Enrollment State
  const [isVoiceEnrolled, setIsVoiceEnrolled] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'recording'>('idle');
  const [voiceProgress, setVoiceProgress] = useState(0);
  const goldenBaselineMFCCRef = useRef<number[] | null>(null);

  const {
    enrollmentState,
    enroll,
    getReferenceDescriptor,
    isEnrolled: isFaceEnrolled,
  } = useFaceEnrollment();

  // Attach the shared stream to our local video element
  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
      setCameraReady(true);
    }
  }, [mediaStream]);

  const handleFaceEnroll = useCallback(async () => {
    if (!videoRef.current) return;
    await enroll(videoRef.current);
  }, [enroll]);

  const handleVoiceEnroll = useCallback(() => {
    if (!mediaStream) return;
    
    setVoiceStatus('recording');
    setVoiceProgress(0);

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(mediaStream);
    
    let collectedMFCCs: number[][] = [];
    
    const analyzer = Meyda.createMeydaAnalyzer({
      audioContext: audioCtx,
      source: source,
      bufferSize: 512,
      featureExtractors: ["mfcc"],
      callback: (features: any) => {
        if (!features || !features.mfcc) return;
        
        const volume = features.mfcc.reduce((a: number, b: number) => Math.abs(a) + Math.abs(b), 0);
        if (volume > 40) {
          collectedMFCCs.push([...features.mfcc]);
        }
      }
    });
    
    analyzer.start();
    
    // Record for exactly 4 seconds
    const interval = setInterval(() => {
      setVoiceProgress((p) => p + 10);
    }, 400);

    setTimeout(() => {
      analyzer.stop();
      audioCtx.close();
      clearInterval(interval);
      
      if (collectedMFCCs.length > 5) {
        // Average the MFCC frames to create the Golden Baseline
        const mfccLength = collectedMFCCs[0].length;
        const avgMFCC = new Array(mfccLength).fill(0);
        
        for (let i = 0; i < collectedMFCCs.length; i++) {
          for (let j = 0; j < mfccLength; j++) {
            avgMFCC[j] += collectedMFCCs[i][j];
          }
        }
        for (let j = 0; j < mfccLength; j++) {
          avgMFCC[j] /= collectedMFCCs.length;
        }
        
        goldenBaselineMFCCRef.current = avgMFCC;
        setIsVoiceEnrolled(true);
      } else {
        alert("Voice not detected clearly. Please try again and speak louder.");
      }
      setVoiceStatus('idle');
    }, 4000);
  }, [mediaStream]);

  const handleStartInterview = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.warn('Could not auto-enter fullscreen:', err);
    }
    const descriptor = getReferenceDescriptor();
    if (descriptor && goldenBaselineMFCCRef.current) {
      onEnrollmentComplete(descriptor, goldenBaselineMFCCRef.current);
    }
  }, [getReferenceDescriptor, onEnrollmentComplete]);

  const progressPercent = (enrollmentState.progress / 5) * 100;

  return (
    <div className="enrollment-container">
      <div className="enrollment-card">
        <h2>🛡️ Identity Enrollment</h2>
        <p>
          Before starting the interview, we need to verify your face and voice.
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
            Camera and Microphone access denied. Please allow access and refresh.
          </div>
        ) : (
          <>
            <div
              className={`webcam-preview ${
                isFaceEnrolled && isVoiceEnrolled ? 'active' : ''
              }`}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
              />
              {isFaceEnrolled && isVoiceEnrolled && (
                <div className="webcam-overlay">
                  <span className="webcam-badge green">✓ Fully Enrolled</span>
                </div>
              )}
              {enrollmentState.status === 'capturing' && (
                <div className="webcam-overlay">
                  <span className="webcam-badge blue">
                    📸 Capturing Face {enrollmentState.progress}/5
                  </span>
                </div>
              )}
            </div>

            {/* Face Enrollment Progress */}
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

            {/* Voice Enrollment Progress */}
            {voiceStatus === 'recording' && (
              <div className="progress-container">
                <div className="progress-label">
                  <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>🎤 Please read: "I am ready to begin my interview."</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${voiceProgress}%`, background: 'var(--accent-blue)' }}
                  />
                </div>
              </div>
            )}

            {enrollmentState.status === 'loading_models' && (
              <div className="loading-indicator" style={{ justifyContent: 'center', marginBottom: 16 }}>
                <div className="spinner" />
                <span>Loading detection models...</span>
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
          {!isFaceEnrolled ? (
            <button
              className="btn btn-primary"
              onClick={handleFaceEnroll}
              disabled={
                !cameraReady ||
                enrollmentState.status === 'capturing' ||
                enrollmentState.status === 'loading_models'
              }
            >
              {enrollmentState.status === 'capturing'
                ? `Capturing Face (${enrollmentState.progress}/5)...`
                : enrollmentState.status === 'loading_models'
                  ? 'Loading Models...'
                  : '📸 1. Start Face Enrollment'}
            </button>
          ) : !isVoiceEnrolled ? (
            <button
              className="btn btn-primary"
              onClick={handleVoiceEnroll}
              disabled={voiceStatus === 'recording'}
            >
              {voiceStatus === 'recording'
                ? '🎙️ Recording Voice...'
                : '🎙️ 2. Start Voice Enrollment'}
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

        {isFaceEnrolled && isVoiceEnrolled && (
          <p style={{ marginTop: 16, color: 'var(--accent-green)', fontSize: 13, textAlign: 'center' }}>
            ✅ Face and Voice enrolled successfully! Click "Start Interview" to begin.
          </p>
        )}

        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong>How it works:</strong> We capture images of your face and a sample of your voice to create
          a unique identity reference. During the interview, we continuously verify
          that the same person is present.
        </div>
      </div>
    </div>
  );
}
