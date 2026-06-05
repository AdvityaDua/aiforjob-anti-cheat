import { useState, useRef, useEffect, useCallback } from 'react';
import { useIntegrityEngine } from '../hooks/useIntegrityEngine';
import { useFaceVerification } from '../hooks/useFaceVerification';
import { useMultiPersonDetection } from '../hooks/useMultiPersonDetection';
import { useGazeTracking } from '../hooks/useGazeTracking';
import { useBrowserFocus } from '../hooks/useBrowserFocus';
import { useAudioMonitor } from '../hooks/useAudioMonitor';
import { useViolationScreenshot } from '../hooks/useViolationScreenshot';
import { ProctorDashboard } from './ProctorDashboard';

interface MockInterviewProps {
  mediaStream: MediaStream;
  referenceDescriptor: Float32Array;
  goldenBaselineMFCC: number[] | null;
  onEndInterview: () => void;
}

const MOCK_QUESTIONS = [
  "Welcome to your technical interview! Let's start with a warm-up. Can you tell me about yourself and your background?",
  "Great! Now, can you explain the difference between a stack and a queue? When would you use each?",
  "Can you describe a challenging project you've worked on recently? What was your role and what problems did you solve?",
  "Let's talk about system design. How would you design a URL shortening service like bit.ly?",
  "What is the time complexity of searching in a balanced binary search tree vs a hash table?",
  "Can you explain what REST APIs are? What are the main HTTP methods and when do you use each?",
  "Tell me about a time you had to debug a particularly tricky issue. How did you approach it?",
  "If you had to choose between writing clean code that's slower vs fast code that's harder to read, what would you choose and why?",
  "Do you have any questions for us about the role or the company?",
  "Thank you for your time! We'll be in touch with the results. Is there anything else you'd like to add?",
];

export function MockInterview({
  mediaStream,
  referenceDescriptor,
  goldenBaselineMFCC,
  onEndInterview,
}: MockInterviewProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [messages, setMessages] = useState<
    { sender: 'ai' | 'user'; text: string }[]
  >([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  // Track when the display video is ready so hooks can use it
  const [liveVideo, setLiveVideo] = useState<HTMLVideoElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const displayVideoRef = useRef<HTMLVideoElement>(null);

  // Once the display video element mounts, attach the stream and expose it to hooks
  useEffect(() => {
    const el = displayVideoRef.current;
    if (el && mediaStream) {
      el.srcObject = mediaStream;
      // Wait for the video to start playing before exposing to hooks
      const onPlaying = () => {
        setLiveVideo(el);
      };
      // Check if already playing
      if (el.readyState >= 2) {
        setLiveVideo(el);
      } else {
        el.addEventListener('loadeddata', onPlaying, { once: true });
      }
      return () => {
        el.removeEventListener('loadeddata', onPlaying);
      };
    }
  }, [mediaStream]);

  // ====== Anti-cheat hooks ======
  const {
    events,
    violations,
    integrityScore,
    addEvent,
  } = useIntegrityEngine();

  const { screenshots, captureScreenshot } = useViolationScreenshot();

  // Violation screenshot helper — uses the LIVE video element
  const handleViolation = useCallback(
    (type: string) => {
      captureScreenshot(liveVideo, type);
    },
    [captureScreenshot, liveVideo]
  );

  const {
    verificationStatus,
    mismatchCount,
    noFaceCount: _noFaceCount,
    distance,
  } = useFaceVerification({
    videoElement: liveVideo,
    referenceDescriptor,
    onEvent: addEvent,
    onViolation: handleViolation,
    enabled: isActive,
    intervalMs: 5000,
  });

  const {
    personCount,
    isWarning: isPersonWarning,
    isViolation: isPersonViolation,
    isModelLoaded: isPersonModelLoaded,
  } = useMultiPersonDetection({
    videoElement: liveVideo,
    onEvent: addEvent,
    onViolation: handleViolation,
    enabled: isActive,
    intervalMs: 1000,
  });

  const {
    gazeDirection,
    awayDuration,
    isWarning: isGazeWarning,
    isViolation: isGazeViolation,
    isModelLoaded: isGazeModelLoaded,
  } = useGazeTracking({
    videoElement: liveVideo,
    onEvent: addEvent,
    onViolation: handleViolation,
    enabled: isActive,
  });

  const {
    isTabFocused,
    isFullscreen,
    tabSwitchCount,
    fullscreenExitCount,
    requestFullscreen,
  } = useBrowserFocus({
    onEvent: addEvent,
    enabled: isActive,
  });

  const {
    currentVolume,
    isMuted,
    spikeCount,
    isMonitoring: isAudioMonitoring,
    startMonitoring: startAudioMonitoring,
  } = useAudioMonitor({
    onEvent: addEvent,
    enabled: isActive,
    goldenBaselineMFCC,
  });

  // Start audio monitoring on mount
  useEffect(() => {
    startAudioMonitoring();
  }, [startAudioMonitoring]);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedTime((t) => t + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Add initial AI message
  useEffect(() => {
    setMessages([{ sender: 'ai', text: MOCK_QUESTIONS[0] }]);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNextQuestion = useCallback(() => {
    const nextQ = currentQuestion + 1;
    if (nextQ >= MOCK_QUESTIONS.length) {
      // End interview
      setIsActive(false);
      setShowSummary(true);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        sender: 'user',
        text: "(Candidate's response recorded via audio)",
      },
      { sender: 'ai', text: MOCK_QUESTIONS[nextQ] },
    ]);
    setCurrentQuestion(nextQ);
  }, [currentQuestion]);

  const handleEndInterview = useCallback(() => {
    setIsActive(false);
    setShowSummary(true);
    if (timerRef.current) clearInterval(timerRef.current);
    // Exit fullscreen when interview ends
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Webcam border color based on status
  const getWebcamClass = () => {
    if (isPersonViolation || verificationStatus === 'mismatch') return 'violation';
    if (isPersonWarning || isGazeWarning || verificationStatus === 'no_face') return 'warning';
    if (verificationStatus === 'verified') return 'active';
    return '';
  };

  if (showSummary) {
    return (
      <div className="enrollment-container">
        <div className="enrollment-card summary-card" style={{ maxWidth: 640 }}>
          <h2>📊 Interview Complete</h2>
          <p>Here's the integrity report for this session.</p>

          <div
            className="summary-score"
            style={{ color: integrityScore >= 70 ? 'var(--accent-green)' : integrityScore >= 40 ? 'var(--accent-amber)' : 'var(--accent-red)' }}
          >
            {integrityScore}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
            Integrity Score
          </div>

          <div className="summary-stats">
            <div className="summary-stat">
              <div className="value">{formatTimer(elapsedTime)}</div>
              <div className="label">Duration</div>
            </div>
            <div className="summary-stat">
              <div className="value" style={{ color: violations.length > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {violations.length}
              </div>
              <div className="label">Violations</div>
            </div>
            <div className="summary-stat">
              <div className="value">{tabSwitchCount}</div>
              <div className="label">Tab Switches</div>
            </div>
            <div className="summary-stat">
              <div className="value">{mismatchCount}</div>
              <div className="label">ID Mismatches</div>
            </div>
            <div className="summary-stat">
              <div className="value">{spikeCount}</div>
              <div className="label">Audio Spikes</div>
            </div>
            <div className="summary-stat">
              <div className="value">{screenshots.length}</div>
              <div className="label">Screenshots</div>
            </div>
          </div>

          {/* Violation timeline */}
          {violations.length > 0 && (
            <div style={{ textAlign: 'left', marginTop: 16 }}>
              <div className="card-title">Violation Timeline</div>
              <div className="event-log" style={{ maxHeight: 200 }}>
                {violations.map((v) => (
                  <div key={v.id} className="event-item violation">
                    <span className="event-time">{formatTime(v.timestamp)}</span>
                    <div className="event-content">
                      <div className="event-type">{v.type.replace(/_/g, ' ')}</div>
                      {v.details && <div className="event-details">{v.details}</div>}
                    </div>
                    <span className="event-penalty">{v.penalty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Violation screenshots */}
          {screenshots.length > 0 && (
            <div style={{ textAlign: 'left', marginTop: 16 }}>
              <div className="card-title">Violation Screenshots</div>
              <div className="screenshot-grid">
                {screenshots.map((ss) => (
                  <div key={ss.id} className="screenshot-thumb">
                    <img src={ss.dataUrl} alt={ss.type} />
                    <div className="screenshot-label">
                      {ss.type.replace(/_/g, ' ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={onEndInterview}>
              🔄 New Interview
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div className="interview-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="interview-timer">⏱️ {formatTimer(elapsedTime)}</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Question {currentQuestion + 1}/{MOCK_QUESTIONS.length}
          </span>
        </div>
        <div className="interview-controls">
          <button
            className="btn btn-outline btn-sm"
            onClick={requestFullscreen}
            title="Enter fullscreen"
          >
            📺 Fullscreen
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={handleEndInterview}
          >
            ⬛ End Interview
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="proctor-layout">
        {/* Sidebar — dashboard */}
        <ProctorDashboard
          integrityScore={integrityScore}
          events={events}
          violations={violations}
          verificationStatus={verificationStatus}
          mismatchCount={mismatchCount}
          distance={distance}
          personCount={personCount}
          isPersonWarning={isPersonWarning}
          isPersonViolation={isPersonViolation}
          isPersonModelLoaded={isPersonModelLoaded}
          gazeDirection={gazeDirection}
          awayDuration={awayDuration}
          isGazeWarning={isGazeWarning}
          isGazeViolation={isGazeViolation}
          isGazeModelLoaded={isGazeModelLoaded}
          isTabFocused={isTabFocused}
          isFullscreen={isFullscreen}
          tabSwitchCount={tabSwitchCount}
          fullscreenExitCount={fullscreenExitCount}
          currentVolume={currentVolume}
          isMuted={isMuted}
          spikeCount={spikeCount}
          isAudioMonitoring={isAudioMonitoring}
          screenshots={screenshots}
        />

        {/* Main — webcam + chat */}
        <div className="proctor-main">
          {/* Webcam */}
          <div className="card" style={{ padding: 16 }}>
            <div className="card-title">Live Webcam</div>
            <div
              className={`webcam-preview ${getWebcamClass()}`}
              style={{ width: '100%', maxWidth: 480, height: 'auto', aspectRatio: '4/3' }}
            >
              <video
                ref={displayVideoRef}
                autoPlay
                playsInline
                muted
              />
              <div className="webcam-overlay">
                {verificationStatus === 'verified' && (
                  <span className="webcam-badge green">✓ Verified</span>
                )}
                {verificationStatus === 'mismatch' && (
                  <span className="webcam-badge red">✗ Mismatch</span>
                )}
                {verificationStatus === 'no_face' && (
                  <span className="webcam-badge amber">No Face</span>
                )}
                {personCount > 1 && (
                  <span className="webcam-badge red">
                    {personCount} People
                  </span>
                )}
                {gazeDirection !== 'center' && gazeDirection !== 'unknown' && (
                  <span className="webcam-badge amber">
                    Looking {gazeDirection}
                  </span>
                )}
                {!isTabFocused && (
                  <span className="webcam-badge red">Tab Unfocused</span>
                )}
              </div>
            </div>
          </div>

          {/* Chat / Questions */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="card-title">Interview Chat</div>
            <div className="chat-area">
              {messages.map((msg, i) => (
                <div key={i} className={`chat-message ${msg.sender}`}>
                  <div className="sender">
                    {msg.sender === 'ai' ? '🤖 Interviewer' : '👤 You'}
                  </div>
                  {msg.text}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              gap: 8,
            }}>
              <button
                className="btn btn-primary"
                onClick={handleNextQuestion}
                style={{ flex: 1 }}
              >
                {currentQuestion >= MOCK_QUESTIONS.length - 1
                  ? '✅ Finish Interview'
                  : '➡️ Next Question'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
