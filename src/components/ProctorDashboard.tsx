import { useMemo } from 'react';
import type { IntegrityEvent, ViolationEventType } from '../hooks/useIntegrityEngine';
import type { VerificationStatus } from '../hooks/useFaceVerification';
import type { GazeDirection } from '../hooks/useGazeTracking';
import type { ViolationScreenshot } from '../hooks/useViolationScreenshot';

interface ProctorDashboardProps {
  // Score
  integrityScore: number;
  events: IntegrityEvent[];
  violations: IntegrityEvent[];

  // Face verification
  verificationStatus: VerificationStatus;
  mismatchCount: number;
  distance: number | null;

  // Person detection
  personCount: number;
  isPersonWarning: boolean;
  isPersonViolation: boolean;
  isPersonModelLoaded: boolean;

  // Gaze
  gazeDirection: GazeDirection;
  awayDuration: number;
  isGazeWarning: boolean;
  isGazeViolation: boolean;
  isGazeModelLoaded: boolean;

  // Browser
  isTabFocused: boolean;
  isFullscreen: boolean;
  tabSwitchCount: number;
  fullscreenExitCount: number;

  // Audio
  currentVolume: number;
  isMuted: boolean;
  spikeCount: number;
  isAudioMonitoring: boolean;

  // Screenshots
  screenshots: ViolationScreenshot[];
}

const EVENT_ICONS: Partial<Record<ViolationEventType, string>> = {
  tab_switch: '🔄',
  fullscreen_exit: '📺',
  multiple_people_detected: '👥',
  identity_mismatch: '🚨',
  identity_verified: '✅',
  face_missing: '👻',
  looking_away: '👀',
  gaze_warning: '⚠️',
  volume_spike: '🔊',
  mic_muted: '🔇',
  mic_disconnected: '🎤',
  info: 'ℹ️',
};

function getScoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function getEventClass(event: IntegrityEvent): string {
  if (event.penalty < -10) return 'violation';
  if (event.penalty < 0) return 'warning';
  return 'info';
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getVerificationDot(status: VerificationStatus): string {
  switch (status) {
    case 'verified': return 'green';
    case 'mismatch': return 'red';
    case 'no_face': return 'amber';
    default: return 'gray';
  }
}

function getVerificationLabel(status: VerificationStatus): string {
  switch (status) {
    case 'verified': return 'Verified';
    case 'mismatch': return 'MISMATCH';
    case 'no_face': return 'No Face';
    default: return 'Idle';
  }
}

function getGazeLabel(dir: GazeDirection): string {
  const labels: Record<GazeDirection, string> = {
    center: '🎯 Center',
    left: '← Left',
    right: '→ Right',
    up: '↑ Up',
    down: '↓ Down',
    unknown: '? Unknown',
  };
  return labels[dir];
}

export function ProctorDashboard(props: ProctorDashboardProps) {
  const {
    integrityScore,
    events,
    verificationStatus,
    mismatchCount,
    distance,
    personCount,
    isPersonWarning,
    isPersonViolation,
    isPersonModelLoaded,
    gazeDirection,
    awayDuration,
    isGazeWarning,
    isGazeViolation,
    isGazeModelLoaded,
    isTabFocused,
    isFullscreen,
    tabSwitchCount,
    fullscreenExitCount,
    currentVolume,
    isMuted,
    spikeCount,
    isAudioMonitoring,
    screenshots,
  } = props;

  const scoreColor = useMemo(() => getScoreColor(integrityScore), [integrityScore]);
  const circumference = 2 * Math.PI * 68; // radius = 68
  const strokeDashoffset = circumference - (integrityScore / 100) * circumference;

  const volumePercent = Math.min(currentVolume * 300, 100); // scale up for visibility
  const volumeColor =
    currentVolume > 0.15 ? 'var(--accent-red)' :
    currentVolume > 0.05 ? 'var(--accent-amber)' :
    'var(--accent-green)';

  return (
    <div className="proctor-sidebar">
      {/* Integrity Score */}
      <div className="card score-gauge">
        <div className="card-title">Integrity Score</div>
        <div className="score-circle">
          <svg viewBox="0 0 160 160">
            <circle className="track" cx="80" cy="80" r="68" />
            <circle
              className="progress"
              cx="80"
              cy="80"
              r="68"
              stroke={scoreColor}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className="score-value">
            <div className="number" style={{ color: scoreColor }}>
              {integrityScore}
            </div>
            <div className="label">/ 100</div>
          </div>
        </div>
      </div>

      {/* Status Indicators */}
      <div className="card">
        <div className="card-title">Live Status</div>
        <div className="status-grid">
          {/* Face Verification */}
          <div className="status-item">
            <div className={`status-dot ${getVerificationDot(verificationStatus)}`} />
            <div>
              <div className="status-label">Identity</div>
              <div className="status-value">{getVerificationLabel(verificationStatus)}</div>
            </div>
          </div>

          {/* Person Count */}
          <div className="status-item">
            <div className={`status-dot ${
              isPersonViolation ? 'red' : isPersonWarning ? 'amber' : isPersonModelLoaded ? 'green' : 'gray'
            }`} />
            <div>
              <div className="status-label">People</div>
              <div className="status-value">
                {isPersonModelLoaded ? `${personCount} Detected` : 'Loading...'}
              </div>
            </div>
          </div>

          {/* Gaze */}
          <div className="status-item">
            <div className={`status-dot ${
              isGazeViolation ? 'red' : isGazeWarning ? 'amber' : isGazeModelLoaded ? 'green' : 'gray'
            }`} />
            <div>
              <div className="status-label">Gaze</div>
              <div className="status-value">
                {isGazeModelLoaded ? getGazeLabel(gazeDirection) : 'Loading...'}
              </div>
            </div>
          </div>

          {/* Tab Focus */}
          <div className="status-item">
            <div className={`status-dot ${isTabFocused ? 'green' : 'red'}`} />
            <div>
              <div className="status-label">Tab Focus</div>
              <div className="status-value">
                {isTabFocused ? 'Focused' : 'Away'}
              </div>
            </div>
          </div>

          {/* Fullscreen */}
          <div className="status-item">
            <div className={`status-dot ${isFullscreen ? 'green' : 'amber'}`} />
            <div>
              <div className="status-label">Fullscreen</div>
              <div className="status-value">
                {isFullscreen ? 'Active' : 'Inactive'}
              </div>
            </div>
          </div>

          {/* Audio */}
          <div className="status-item">
            <div className={`status-dot ${
              !isAudioMonitoring ? 'gray' : isMuted ? 'amber' : 'green'
            }`} />
            <div>
              <div className="status-label">Audio</div>
              <div className="status-value">
                {!isAudioMonitoring ? 'Off' : isMuted ? 'Muted' : 'Active'}
              </div>
            </div>
          </div>
        </div>

        {/* Counters */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 12,
          flexWrap: 'wrap',
        }}>
          {mismatchCount > 0 && (
            <span className="webcam-badge red">🚨 {mismatchCount} mismatch</span>
          )}
          {tabSwitchCount > 0 && (
            <span className="webcam-badge amber">🔄 {tabSwitchCount} tab switch</span>
          )}
          {fullscreenExitCount > 0 && (
            <span className="webcam-badge amber">📺 {fullscreenExitCount} fs exit</span>
          )}
          {spikeCount > 0 && (
            <span className="webcam-badge amber">🔊 {spikeCount} spike</span>
          )}
        </div>

        {/* Volume Meter */}
        {isAudioMonitoring && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              Volume Level
            </div>
            <div className="volume-meter">
              <div
                className="volume-fill"
                style={{
                  width: `${volumePercent}%`,
                  background: volumeColor,
                }}
              />
            </div>
          </div>
        )}

        {/* Away Duration */}
        {awayDuration > 0 && (
          <div style={{
            marginTop: 12,
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: isGazeViolation
              ? 'rgba(239, 68, 68, 0.1)'
              : 'rgba(245, 158, 11, 0.1)',
            border: `1px solid ${
              isGazeViolation
                ? 'rgba(239, 68, 68, 0.2)'
                : 'rgba(245, 158, 11, 0.2)'
            }`,
            fontSize: 12,
            color: isGazeViolation ? 'var(--accent-red)' : 'var(--accent-amber)',
          }}>
            👀 Looking away: {awayDuration.toFixed(1)}s
            {isGazeViolation ? ' — VIOLATION' : isGazeWarning ? ' — Warning' : ''}
          </div>
        )}

        {/* Face distance */}
        {distance !== null && verificationStatus !== 'idle' && (
          <div style={{
            marginTop: 8,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}>
            Face distance: {distance.toFixed(3)} (threshold: 0.6)
          </div>
        )}
      </div>

      {/* Event Log */}
      <div className="card">
        <div className="card-title">Event Log ({events.length})</div>
        {events.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📋</div>
            <div>No events yet. Start the interview to begin monitoring.</div>
          </div>
        ) : (
          <div className="event-log">
            {events.slice(0, 50).map((event) => (
              <div
                key={event.id}
                className={`event-item ${getEventClass(event)}`}
              >
                <span className="event-icon">
                  {EVENT_ICONS[event.type] || '📌'}
                </span>
                <div className="event-content">
                  <div className="event-type">
                    {event.type.replace(/_/g, ' ')}
                  </div>
                  {event.details && (
                    <div className="event-details">{event.details}</div>
                  )}
                </div>
                <span className="event-time">{formatTime(event.timestamp)}</span>
                {event.penalty !== 0 && (
                  <span className="event-penalty">{event.penalty}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Screenshots */}
      {screenshots.length > 0 && (
        <div className="card">
          <div className="card-title">Violation Screenshots ({screenshots.length})</div>
          <div className="screenshot-grid">
            {screenshots.map((ss) => (
              <div key={ss.id} className="screenshot-thumb">
                <img src={ss.dataUrl} alt={ss.type} />
                <div className="screenshot-label">
                  {ss.type.replace(/_/g, ' ')} · {formatTime(ss.timestamp)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model Loading States */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!isPersonModelLoaded && (
          <div className="loading-indicator">
            <div className="spinner" />
            <span>Loading person detection model...</span>
          </div>
        )}
        {!isGazeModelLoaded && (
          <div className="loading-indicator">
            <div className="spinner" />
            <span>Loading gaze tracking model...</span>
          </div>
        )}
      </div>
    </div>
  );
}
