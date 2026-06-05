import { useState, useCallback, useEffect, useRef } from 'react';
import { EnrollmentFlow } from './components/EnrollmentFlow';
import { MockInterview } from './components/MockInterview';
import './index.css';

type AppPhase = 'enrollment' | 'interview';

function App() {
  const [phase, setPhase] = useState<AppPhase>('enrollment');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [referenceDescriptor, setReferenceDescriptor] = useState<Float32Array | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start camera once at the app level so the stream persists across phases
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });
        streamRef.current = stream;
        setMediaStream(stream);
      } catch (err) {
        console.error('[App] Camera access denied:', err);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleEnrollmentComplete = useCallback(
    (descriptor: Float32Array) => {
      setReferenceDescriptor(descriptor);
      setPhase('interview');
    },
    []
  );

  const handleEndInterview = useCallback(() => {
    setPhase('enrollment');
    setReferenceDescriptor(null);
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🛡️ AIForJob Anti-Cheat System</h1>
        <span className="header-badge">Test Mode</span>
      </header>

      <main className="main-content">
        {phase === 'enrollment' && (
          <EnrollmentFlow
            mediaStream={mediaStream}
            onEnrollmentComplete={handleEnrollmentComplete}
          />
        )}

        {phase === 'interview' && mediaStream && referenceDescriptor && (
          <MockInterview
            mediaStream={mediaStream}
            referenceDescriptor={referenceDescriptor}
            onEndInterview={handleEndInterview}
          />
        )}
      </main>
    </div>
  );
}

export default App;
