/**
 * Audio player hook for playing base64-encoded audio.
 * Supports both single playback and loop mode.
 *
 * Loop audio is shared globally - only one loop can play at a time.
 * Starting a new loop automatically stops any existing loop.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

// Global shared state for loop audio - ensures only one loop plays at a time
let globalLoopAudio: HTMLAudioElement | null = null;
let globalLoopInstanceId: string | null = null;
const loopStateListeners = new Set<(instanceId: string | null) => void>();

// Stop any currently playing global loop
function stopGlobalLoop() {
  if (globalLoopAudio) {
    globalLoopAudio.pause();
    globalLoopAudio = null;
  }
  globalLoopInstanceId = null;
  // Notify all listeners that loop stopped
  loopStateListeners.forEach(listener => listener(null));
}

// Generate unique instance ID
let instanceCounter = 0;
function generateInstanceId(): string {
  return `audio-player-${++instanceCounter}`;
}

interface UseAudioPlayerReturn {
  playAudio: (base64: string) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  // Loop playback support (with optional playback rate for slow mode)
  playLooping: (base64: string, playbackRate?: number) => Promise<void>;
  stopLooping: () => void;
  isLooping: boolean;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const instanceIdRef = useRef<string>(generateInstanceId());

  const playAudio = useCallback(async (base64: string) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setError(null);

    try {
      // Create audio element from base64
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audioRef.current = audio;

      // Set up event handlers
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setError('Failed to play audio');
        setIsPlaying(false);
        audioRef.current = null;
      };

      // Play the audio
      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to play audio');
      setIsPlaying(false);
      audioRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  // Listen for global loop state changes to sync local isLooping state
  useEffect(() => {
    const listener = (activeInstanceId: string | null) => {
      // Update local state based on whether this instance owns the loop
      setIsLooping(activeInstanceId === instanceIdRef.current);
    };

    loopStateListeners.add(listener);

    return () => {
      loopStateListeners.delete(listener);
    };
  }, []);

  // Play audio in a continuous loop (global - only one loop at a time)
  // playbackRate: 1.0 = normal speed, 0.6 = 60% speed (slow mode)
  const playLooping = useCallback(async (base64: string, playbackRate = 1.0) => {
    const instanceId = instanceIdRef.current;

    // Stop regular playback if active
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }

    // Stop any existing global loop (from any instance)
    stopGlobalLoop();

    setError(null);

    try {
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audio.loop = true; // Enable native looping
      audio.preservesPitch = true; // Preserve pitch at different playback speeds
      audio.playbackRate = playbackRate; // Set playback speed (0.5-4.0 supported)
      globalLoopAudio = audio;
      globalLoopInstanceId = instanceId;

      audio.onplay = () => {
        // Notify all listeners that this instance owns the loop
        loopStateListeners.forEach(listener => listener(instanceId));
      };
      audio.onerror = () => {
        setError('Failed to play audio');
        stopGlobalLoop();
      };

      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to play audio');
      stopGlobalLoop();
    }
  }, []);

  // Stop loop playback (stops the global loop)
  const stopLooping = useCallback(() => {
    // Only stop if this instance owns the loop
    if (globalLoopInstanceId === instanceIdRef.current) {
      stopGlobalLoop();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const instanceId = instanceIdRef.current;

    return () => {
      // Stop regular audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Stop global loop if this instance owns it
      if (globalLoopInstanceId === instanceId) {
        stopGlobalLoop();
      }
    };
  }, []);

  return {
    playAudio,
    stop,
    isPlaying,
    isLoading,
    setIsLoading,
    error,
    // Loop playback
    playLooping,
    stopLooping,
    isLooping,
  };
}
