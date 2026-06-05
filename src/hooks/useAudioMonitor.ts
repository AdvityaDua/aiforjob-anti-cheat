import { useState, useCallback, useRef, useEffect } from 'react';
import Meyda from 'meyda';
import type { ViolationEventType } from './useIntegrityEngine';

interface AudioMonitorOptions {
  onEvent: (type: ViolationEventType, details?: string) => void;
  enabled: boolean;
  goldenBaselineMFCC?: number[] | null;
}

const MATCH_THRESHOLD = 25.0; // Distance threshold for voice mismatch

export function useAudioMonitor({ onEvent, enabled, goldenBaselineMFCC }: AudioMonitorOptions) {
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
  const recognitionRef = useRef<any>(null);
  const meydaAnalyzerRef = useRef<any>(null);
  const lastVoiceMismatchRef = useRef(0);

  const startMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Initialize Meyda for DTW Voiceprint verification
      if (typeof Meyda !== 'undefined') {
        const meydaAnalyzer = Meyda.createMeydaAnalyzer({
          audioContext: audioContext,
          source: source,
          bufferSize: 512,
          featureExtractors: ['mfcc'],
          callback: (features: any) => {
            if (!features || !features.mfcc) return;

            // Isolate active speech frames to avoid processing silence
            const volume = features.mfcc.reduce((a: number, b: number) => Math.abs(a) + Math.abs(b), 0);
            const isSpeaking = volume > 40;

            if (isSpeaking && goldenBaselineMFCC) {
              // Euclidean Distance calculation between frames
              let distance = 0;
              for (let i = 0; i < Math.min(features.mfcc.length, goldenBaselineMFCC.length); i++) {
                distance += Math.pow(features.mfcc[i] - goldenBaselineMFCC[i], 2);
              }
              distance = Math.sqrt(distance);

              // If distance is too high, a different throat/mouth structure is speaking
              if (distance > MATCH_THRESHOLD) {
                const now = Date.now();
                // Throttle to avoid spamming the event log
                if (now - lastVoiceMismatchRef.current > 4000) {
                  onEvent('voice_mismatch', `Unrecognized voice detected! Distance score: ${distance.toFixed(1)}`);
                  lastVoiceMismatchRef.current = now;
                }
              }
            }
          },
        });
        meydaAnalyzer.start();
        meydaAnalyzerRef.current = meydaAnalyzer;
      }

      // Initialize Speech Recognition for live transcription
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              const transcript = event.results[i][0].transcript.trim();
              if (transcript.length > 0) {
                onEvent('speech_detected', `Transcript: "${transcript}"`);
              }
            }
          }
        };

        recognition.onend = () => {
          // Restart recognition if it stops (it auto-stops after silence)
          if (analyserRef.current) {
            try {
              recognition.start();
            } catch (e) {
              // Ignore already started errors
            }
          }
        };

        try {
          recognition.start();
          recognitionRef.current = recognition;
        } catch (err) {
          console.warn('[AudioMonitor] Speech recognition failed to start:', err);
        }
      } else {
        console.warn('[AudioMonitor] Web Speech API not supported in this browser.');
      }

      setIsMonitoring(true);
    } catch (err) {
      console.error('[AudioMonitor] Microphone access denied:', err);
    }
  }, [goldenBaselineMFCC, onEvent]);

  const stopMonitoring = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (meydaAnalyzerRef.current) {
      meydaAnalyzerRef.current.stop();
      meydaAnalyzerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // Prevent restart loop
      recognitionRef.current.stop();
      recognitionRef.current = null;
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
