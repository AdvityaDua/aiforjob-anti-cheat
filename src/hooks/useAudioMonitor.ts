import { useState, useCallback, useRef, useEffect } from 'react';
import type { ViolationEventType } from './useIntegrityEngine';

interface AudioMonitorOptions {
  onEvent: (type: ViolationEventType, details?: string) => void;
  enabled: boolean;
}

export function useAudioMonitor({ onEvent, enabled }: AudioMonitorOptions) {
  const [currentVolume, setCurrentVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [spikeCount, setSpikeCount] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastSpikeRef = useRef(0);
  const volumeHistoryRef = useRef<number[]>([]);

  const startMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsMonitoring(true);
    } catch (err) {
      console.error('[AudioMonitor] Microphone access denied:', err);
    }
  }, []);

  const stopMonitoring = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsMonitoring(false);
  }, []);

  useEffect(() => {
    if (!enabled || !isMonitoring || !analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastCheck = 0;

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);

      // Compute RMS volume (0-1)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = dataArray[i] / 255;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setCurrentVolume(rms);

      const now = Date.now();
      if (now - lastCheck > 500) {
        lastCheck = now;

        // Track volume history for baseline
        volumeHistoryRef.current.push(rms);
        if (volumeHistoryRef.current.length > 20) {
          volumeHistoryRef.current.shift();
        }

        // Mute detection
        const wasMuted = isMuted;
        const nowMuted = rms < 0.01;
        if (nowMuted && !wasMuted) {
          setIsMuted(true);
          onEvent('mic_muted', 'Microphone appears to be muted');
        } else if (!nowMuted && wasMuted) {
          setIsMuted(false);
        }

        // Volume spike detection (potential second speaker)
        const avgVolume =
          volumeHistoryRef.current.reduce((a, b) => a + b, 0) /
          volumeHistoryRef.current.length;
        if (
          rms > 0.15 &&
          rms > avgVolume * 2.5 &&
          now - lastSpikeRef.current > 5000
        ) {
          lastSpikeRef.current = now;
          setSpikeCount((c) => c + 1);
          onEvent(
            'volume_spike',
            `Volume spike detected (${(rms * 100).toFixed(0)}% vs avg ${(avgVolume * 100).toFixed(0)}%)`
          );
        }
      }

      // Check if mic is disconnected
      if (streamRef.current) {
        const audioTrack = streamRef.current.getAudioTracks()[0];
        if (audioTrack && audioTrack.readyState === 'ended') {
          onEvent('mic_disconnected', 'Microphone disconnected');
          stopMonitoring();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [enabled, isMonitoring, isMuted, onEvent, stopMonitoring]);

  return {
    currentVolume,
    isMuted,
    spikeCount,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
  };
}
