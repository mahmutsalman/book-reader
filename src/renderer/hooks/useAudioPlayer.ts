/**
 * Audio player hook for playing base64-encoded audio.
 */
import { useState, useRef, useCallback } from 'react';

interface UseAudioPlayerReturn {
  playAudio: (base64: string) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  return {
    playAudio,
    stop,
    isPlaying,
    isLoading,
    setIsLoading,
    error,
  };
}
