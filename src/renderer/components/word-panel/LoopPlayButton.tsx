/**
 * Loop play button component for continuous audio playback.
 * Plays audio in a loop until clicked again to stop.
 */
import React, { useCallback, useState, useEffect } from 'react';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useAudioCache, AudioType } from '../../hooks/useAudioCache';

interface LoopPlayButtonProps {
  text: string;
  language: string;
  /** Type of audio for cache key differentiation */
  audioType?: AudioType;
  /** Pre-fetched audio (from preloading) for instant playback */
  cachedAudio?: string;
  className?: string;
  size?: 'sm' | 'md';
  title?: string;
}

const LoopPlayButton: React.FC<LoopPlayButtonProps> = ({
  text,
  language,
  audioType = AudioType.WORD,
  cachedAudio,
  className = '',
  size = 'md',
  title = 'Play in loop',
}) => {
  const { playLooping, stopLooping, isLooping } = useAudioPlayer();
  const { getAudio, setAudio } = useAudioCache();
  const [serverError, setServerError] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Stop looping when text changes (word selection changed)
  useEffect(() => {
    return () => {
      stopLooping();
    };
  }, [text, stopLooping]);

  const handleClick = useCallback(async () => {
    // If currently looping, stop it
    if (isLooping) {
      stopLooping();
      return;
    }

    if (isLoadingAudio) return;

    setIsLoadingAudio(true);
    setServerError(false);

    try {
      // 1. Check if we have pre-fetched audio (from preloading)
      if (cachedAudio) {
        await playLooping(cachedAudio);
        return;
      }

      // 2. Check cache (memory → IndexedDB)
      const cached = await getAudio(text, language, audioType);
      if (cached) {
        console.log('[LoopPlay] Cache hit');
        await playLooping(cached);
        return;
      }

      // 3. Fetch from server
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      console.log('[LoopPlay] Cache miss, fetching from server:', { text: text.substring(0, 30), language });
      const response = await window.electronAPI.pronunciation.getTTS(text, language);

      if (!response.success || !response.audio_base64) {
        throw new Error(response.error || 'Failed to generate audio');
      }

      // 4. Store in cache for future use
      await setAudio(text, language, audioType, response.audio_base64);

      // 5. Play the audio in loop
      await playLooping(response.audio_base64);
    } catch (err) {
      console.error('[LoopPlay] Error:', err);
      setServerError(true);
    } finally {
      setIsLoadingAudio(false);
    }
  }, [text, language, audioType, cachedAudio, isLooping, isLoadingAudio, playLooping, stopLooping, getAudio, setAudio]);

  // Size classes
  const sizeClasses = size === 'sm'
    ? 'w-6 h-6 text-sm'
    : 'w-8 h-8 text-base';

  // Determine icon state
  const getIcon = () => {
    if (isLoadingAudio) {
      // Loading spinner
      return (
        <svg className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
      );
    }

    // Repeat/loop icon
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 1l4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <path d="M7 23l-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    );
  };

  // Error state - show disabled button
  if (serverError) {
    return (
      <button
        type="button"
        className={`${sizeClasses} flex items-center justify-center rounded-full text-gray-400 cursor-not-allowed ${className}`}
        title="Loop unavailable"
        disabled
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 opacity-50">
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          <line x1="4" y1="4" x2="20" y2="20" strokeWidth="2" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${sizeClasses} flex items-center justify-center rounded-full transition-all ${
        isLooping
          ? 'text-blue-500 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 animate-pulse'
          : 'text-gray-500 dark:text-cream-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      } ${className}`}
      title={isLooping ? 'Stop loop' : title}
      disabled={isLoadingAudio}
    >
      <span className="w-4 h-4">
        {getIcon()}
      </span>
    </button>
  );
};

export default LoopPlayButton;
