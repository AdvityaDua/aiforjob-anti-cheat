import { useState, useCallback, useEffect, useRef } from 'react';
import type { ViolationEventType } from './useIntegrityEngine';

interface BrowserFocusOptions {
  onEvent: (type: ViolationEventType, details?: string) => void;
  enabled: boolean;
}

export function useBrowserFocus({ onEvent, enabled }: BrowserFocusOptions) {
  const [isTabFocused, setIsTabFocused] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [fullscreenExitCount, setFullscreenExitCount] = useState(0);
  const wasFullscreenRef = useRef(false);

  const requestFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.warn('[BrowserFocus] Fullscreen request denied:', err);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('[BrowserFocus] Exit fullscreen failed:', err);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleBlur = () => {
      setIsTabFocused(false);
      setTabSwitchCount((c) => c + 1);
      onEvent('tab_switch', 'Candidate switched tabs or minimized window');
    };

    const handleFocus = () => {
      setIsTabFocused(true);
    };

    const handleFullscreenChange = () => {
      const currentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(currentlyFullscreen);

      if (wasFullscreenRef.current && !currentlyFullscreen) {
        setFullscreenExitCount((c) => c + 1);
        onEvent('fullscreen_exit', 'Candidate exited fullscreen mode');
      }
      wasFullscreenRef.current = currentlyFullscreen;
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Check initial state
    setIsFullscreen(!!document.fullscreenElement);
    wasFullscreenRef.current = !!document.fullscreenElement;
    setIsTabFocused(document.hasFocus());

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [enabled, onEvent]);

  return {
    isTabFocused,
    isFullscreen,
    tabSwitchCount,
    fullscreenExitCount,
    requestFullscreen,
    exitFullscreen,
  };
}
