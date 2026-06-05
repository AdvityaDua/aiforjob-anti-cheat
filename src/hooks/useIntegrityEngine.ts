import { useState, useCallback, useRef } from 'react';

export type ViolationEventType =
  | 'tab_switch'
  | 'fullscreen_exit'
  | 'multiple_people_detected'
  | 'identity_mismatch'
  | 'face_missing'
  | 'looking_away'
  | 'volume_spike'
  | 'mic_muted'
  | 'mic_disconnected'
  | 'identity_verified'
  | 'gaze_warning'
  | 'info';

export interface IntegrityEvent {
  id: string;
  timestamp: number;
  type: ViolationEventType;
  details?: string;
  penalty: number;
}

const PENALTY_MAP: Partial<Record<ViolationEventType, number>> = {
  tab_switch: -5,
  fullscreen_exit: -5,
  multiple_people_detected: -25,
  identity_mismatch: -50,
  face_missing: -10,
  looking_away: -5,
  volume_spike: -2,
};

let eventIdCounter = 0;

export function useIntegrityEngine() {
  const [events, setEvents] = useState<IntegrityEvent[]>([]);
  const [integrityScore, setIntegrityScore] = useState(100);
  const scoreRef = useRef(100);

  const addEvent = useCallback(
    (type: ViolationEventType, details?: string) => {
      const penalty = PENALTY_MAP[type] ?? 0;
      const newScore = Math.max(0, Math.min(100, scoreRef.current + penalty));
      scoreRef.current = newScore;

      const event: IntegrityEvent = {
        id: `evt-${++eventIdCounter}`,
        timestamp: Date.now(),
        type,
        details,
        penalty,
      };

      setEvents((prev) => [event, ...prev]);
      setIntegrityScore(newScore);

      return event;
    },
    []
  );

  const resetEngine = useCallback(() => {
    setEvents([]);
    setIntegrityScore(100);
    scoreRef.current = 100;
  }, []);

  const violations = events.filter((e) => e.penalty < 0);

  return {
    events,
    violations,
    integrityScore,
    addEvent,
    resetEngine,
  };
}
