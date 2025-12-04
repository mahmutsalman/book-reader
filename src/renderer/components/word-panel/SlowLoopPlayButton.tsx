/**
 * Slow loop play button component for continuous audio playback at 0.6x speed.
 * Plays audio in a loop at reduced speed until clicked again to stop.
 * Helps users hear pronunciation more clearly for learning.
 */
import React, { useCallback, useState, useEffect } from 'react';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useAudioCache, AudioType } from '../../hooks/useAudioCache';

// Playback rate for slow mode (60% of normal speed)
const SLOW_PLAYBACK_RATE = 0.6;

interface SlowLoopPlayButtonProps {
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

const SlowLoopPlayButton: React.FC<SlowLoopPlayButtonProps> = ({
  text,
  language,
  audioType = AudioType.WORD,
  cachedAudio,
  className = '',
  size = 'md',
  title = 'Play slow (0.6x)',
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
        await playLooping(cachedAudio, SLOW_PLAYBACK_RATE);
        return;
      }

      // 2. Check cache (memory → IndexedDB)
      const cached = await getAudio(text, language, audioType);
      if (cached) {
        console.log('[SlowLoop] Cache hit');
        await playLooping(cached, SLOW_PLAYBACK_RATE);
        return;
      }

      // 3. Fetch from server
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      console.log('[SlowLoop] Cache miss, fetching from server:', { text: text.substring(0, 30), language });
      const response = await window.electronAPI.pronunciation.getTTS(text, language);

      if (!response.success || !response.audio_base64) {
        throw new Error(response.error || 'Failed to generate audio');
      }

      // 4. Store in cache for future use
      await setAudio(text, language, audioType, response.audio_base64);

      // 5. Play the audio in slow loop
      await playLooping(response.audio_base64, SLOW_PLAYBACK_RATE);
    } catch (err) {
      console.error('[SlowLoop] Error:', err);
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

    // Turtle icon (slow motion indicator)
    return (
      <svg viewBox="0 0 24 24" fill="currentColor">
        {/* Turtle shell */}
        <ellipse cx="12" cy="13" rx="7" ry="5" opacity="0.9" />
        {/* Shell pattern */}
        <path d="M12 8v10M8 10.5c0 2.5 1.5 5 4 5s4-2.5 4-5" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
        {/* Head */}
        <circle cx="18" cy="12" r="2" />
        {/* Legs */}
        <ellipse cx="7" cy="16" rx="1.5" ry="1" />
        <ellipse cx="17" cy="16" rx="1.5" ry="1" />
        <ellipse cx="8" cy="10" rx="1" ry="1.5" />
        <ellipse cx="16" cy="10" rx="1" ry="1.5" />
      </svg>
    );
  };

  // Error state - show disabled button
  if (serverError) {
    return (
      <button
        type="button"
        className={`${sizeClasses} flex items-center justify-center rounded-full text-gray-400 cursor-not-allowed ${className}`}
        title="Slow loop unavailable"
        disabled
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 opacity-50">
          <ellipse cx="12" cy="13" rx="7" ry="5" />
          <circle cx="18" cy="12" r="2" />
          <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="2" />
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
          ? 'text-orange-500 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 animate-pulse'
          : 'text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      } ${className}`}
      title={isLooping ? 'Stop slow loop' : title}
      disabled={isLoadingAudio}
    >
      <span className="w-4 h-4">
        {getIcon()}
      </span>
    </button>
  );
};

export default SlowLoopPlayButton;
