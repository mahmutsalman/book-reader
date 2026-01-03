/**
 * Slow loop play button component for continuous audio playback at configurable speed.
 * Plays audio in a loop at reduced speed until clicked again to stop.
 * Helps users hear pronunciation more clearly for learning.
 */
import React, { useCallback, useState, useEffect } from 'react';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useAudioCache, AudioType } from '../../hooks/useAudioCache';
import { useSettings } from '../../context/SettingsContext';
import { useReaderTheme } from '../../hooks/useReaderTheme';

interface SlowLoopPlayButtonProps {
  text: string;
  language: string;
  /** Type of audio for cache key differentiation */
  audioType?: AudioType;
  /** Pre-fetched audio (from preloading) for instant playback */
  cachedAudio?: string;
  /** Whether repeat mode is enabled (loop continuously) */
  isRepeatMode?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  title?: string;
}

const SlowLoopPlayButton: React.FC<SlowLoopPlayButtonProps> = ({
  text,
  language,
  audioType = AudioType.WORD,
  cachedAudio,
  isRepeatMode = false,
  className = '',
  size = 'md',
  title,
}) => {
  const { settings } = useSettings();
  const slowPlaybackSpeed = settings.slow_playback_speed;
  const defaultTitle = `Play slow (${slowPlaybackSpeed}x)`;
  const { playAudio, stop, isPlaying, playLooping, stopLooping, isLooping } = useAudioPlayer();
  const { getAudio, setAudio } = useAudioCache();
  const theme = useReaderTheme();
  const [serverError, setServerError] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Stop looping when text changes (word selection changed)
  useEffect(() => {
    return () => {
      stopLooping();
    };
  }, [text, stopLooping]);

  const handleClick = useCallback(async () => {
    // If currently playing or looping, stop it
    if (isLooping || isPlaying) {
      if (isLooping) {
        stopLooping();
      } else {
        stop();
      }
      return;
    }

    if (isLoadingAudio) return;

    setIsLoadingAudio(true);
    setServerError(false);

    try {
      // 1. Check if we have pre-fetched audio (from preloading)
      if (cachedAudio) {
        if (isRepeatMode) {
          await playLooping(cachedAudio, slowPlaybackSpeed);
        } else {
          // Create a temporary audio element to play once at slow speed
          const audio = new Audio(`data:audio/mp3;base64,${cachedAudio}`);
          audio.playbackRate = slowPlaybackSpeed;
          audio.preservesPitch = true;
          await audio.play();
        }
        return;
      }

      // 2. Check cache (memory → IndexedDB)
      const cached = await getAudio(text, language, audioType);
      if (cached) {
        console.log('[SlowLoop] Cache hit');
        if (isRepeatMode) {
          await playLooping(cached, slowPlaybackSpeed);
        } else {
          const audio = new Audio(`data:audio/mp3;base64,${cached}`);
          audio.playbackRate = slowPlaybackSpeed;
          audio.preservesPitch = true;
          await audio.play();
        }
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

      // 5. Play the audio in slow mode (loop or once)
      if (isRepeatMode) {
        await playLooping(response.audio_base64, slowPlaybackSpeed);
      } else {
        const audio = new Audio(`data:audio/mp3;base64,${response.audio_base64}`);
        audio.playbackRate = slowPlaybackSpeed;
        audio.preservesPitch = true;
        await audio.play();
      }
    } catch (err) {
      console.error('[SlowLoop] Error:', err);
      setServerError(true);
    } finally {
      setIsLoadingAudio(false);
    }
  }, [text, language, audioType, cachedAudio, isRepeatMode, isLooping, isPlaying, isLoadingAudio, playAudio, playLooping, stop, stopLooping, getAudio, setAudio, slowPlaybackSpeed]);

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
        className={`${sizeClasses} flex items-center justify-center rounded-full cursor-not-allowed ${className}`}
        style={{ color: theme.textSecondary }}
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

  const isActive = isLooping || isPlaying;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${sizeClasses} flex items-center justify-center rounded-full transition-all ${
        isActive ? 'animate-pulse' : ''
      } ${className}`}
      style={
        isActive
          ? {
              color: theme.accent,
              backgroundColor: theme.panel
            }
          : {
              color: theme.textSecondary
            }
      }
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = theme.accent;
          e.currentTarget.style.backgroundColor = 'rgba(128, 128, 128, 0.1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = theme.textSecondary;
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
      title={isActive ? 'Stop' : (title || defaultTitle)}
      disabled={isLoadingAudio}
    >
      <span className="w-4 h-4">
        {getIcon()}
      </span>
    </button>
  );
};

export default SlowLoopPlayButton;
