/**
 * Pronunciation button component with animated speaker icon.
 * Supports audio caching for instant playback.
 */
import React, { useCallback, useState } from 'react';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useAudioCache, AudioType } from '../../hooks/useAudioCache';

interface PronunciationButtonProps {
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

const PronunciationButton: React.FC<PronunciationButtonProps> = ({
  text,
  language,
  audioType = AudioType.WORD,
  cachedAudio,
  className = '',
  size = 'md',
  title = 'Play pronunciation',
}) => {
  const { playAudio, stop, isPlaying, isLoading, setIsLoading, error } = useAudioPlayer();
  const { getAudio, setAudio } = useAudioCache();
  const [serverError, setServerError] = useState(false);

  const handleClick = useCallback(async () => {
    if (isPlaying) {
      stop();
      return;
    }

    if (isLoading) return;

    setIsLoading(true);
    setServerError(false);

    try {
      // 1. Check if we have pre-fetched audio (from preloading)
      if (cachedAudio) {
        await playAudio(cachedAudio);
        return;
      }

      // 2. Check cache (memory → IndexedDB)
      const cached = await getAudio(text, language, audioType);
      if (cached) {
        console.log('[Pronunciation] Cache hit');
        await playAudio(cached);
        return;
      }

      // 3. Fetch from server
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      console.log('[Pronunciation] Cache miss, fetching from server:', { text: text.substring(0, 30), language });
      const response = await window.electronAPI.pronunciation.getTTS(text, language);

      if (!response.success || !response.audio_base64) {
        throw new Error(response.error || 'Failed to generate audio');
      }

      // 4. Store in cache for future use
      await setAudio(text, language, audioType, response.audio_base64);

      // 5. Play the audio
      await playAudio(response.audio_base64);
    } catch (err) {
      console.error('[Pronunciation] Error:', err);
      setServerError(true);
    } finally {
      setIsLoading(false);
    }
  }, [text, language, audioType, cachedAudio, isPlaying, isLoading, playAudio, stop, setIsLoading, getAudio, setAudio]);

  // Size classes
  const sizeClasses = size === 'sm'
    ? 'w-6 h-6 text-sm'
    : 'w-8 h-8 text-base';

  // Determine icon state
  const getIcon = () => {
    if (isLoading) {
      // Loading spinner
      return (
        <svg className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
      );
    }

    if (isPlaying) {
      // Animated sound waves (playing state)
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="animate-pulse">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
      );
    }

    // Default speaker icon
    return (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
      </svg>
    );
  };

  // Error state - show disabled button
  if (serverError) {
    return (
      <button
        type="button"
        className={`${sizeClasses} flex items-center justify-center rounded-full text-gray-400 cursor-not-allowed ${className}`}
        title="Pronunciation unavailable"
        disabled
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 opacity-50">
          <path d="M3 9v6h4l5 5V4L7 9H3z"/>
          <path d="M16.5 12l4-4m0 8l-4-4" stroke="currentColor" strokeWidth="2" fill="none"/>
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${sizeClasses} flex items-center justify-center rounded-full transition-all ${
        isPlaying
          ? 'text-blue-500 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30'
          : 'text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      } ${className}`}
      title={isPlaying ? 'Stop' : title}
      disabled={isLoading}
    >
      <span className="w-5 h-5">
        {getIcon()}
      </span>
    </button>
  );
};

export default PronunciationButton;
