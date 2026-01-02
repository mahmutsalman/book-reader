import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReaderThemeColors } from '../../hooks/useReaderTheme';

interface InlineEditablePageNumberProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  theme: ReaderThemeColors;
  disabled?: boolean;
  label?: string;
}

const INVALID_NUMBER_MESSAGE = 'Please enter a valid number';

const InlineEditablePageNumber: React.FC<InlineEditablePageNumberProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  theme,
  disabled = false,
  label = 'of',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(currentPage));
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hintId = useId();
  const errorId = useId();

  const resetState = useCallback(() => {
    setIsEditing(false);
    setError(null);
    setInputValue(String(currentPage));
  }, [currentPage]);

  const startEditing = useCallback(() => {
    if (disabled) return;
    setIsEditing(true);
    setError(null);
    setInputValue(String(currentPage));
  }, [currentPage, disabled]);

  const submitValue = useCallback(() => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue) {
      setError(INVALID_NUMBER_MESSAGE);
      return;
    }

    const parsedValue = Number(trimmedValue);
    if (!Number.isFinite(parsedValue) || !Number.isInteger(parsedValue)) {
      setError(INVALID_NUMBER_MESSAGE);
      return;
    }

    if (parsedValue < 1 || parsedValue > totalPages) {
      setError(`Page must be between 1 and ${totalPages}`);
      return;
    }

    setError(null);
    setIsEditing(false);
    onPageChange(parsedValue);
  }, [inputValue, onPageChange, totalPages]);

  useEffect(() => {
    if (!isEditing) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      resetState();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isEditing, resetState]);

  useEffect(() => {
    if (!isEditing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isEditing]);

  useEffect(() => {
    if (isEditing) return;
    setInputValue(String(currentPage));
  }, [currentPage, isEditing]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      startEditing();
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitValue();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      resetState();
    }
  };

  return (
    <div className="flex flex-col items-center" ref={containerRef}>
      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleInputKeyDown}
            aria-label="Edit page number"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : hintId}
            className="w-16 px-2 py-1 text-center border rounded"
            style={{
              backgroundColor: theme.panel,
              color: theme.text,
              borderColor: error ? '#ef4444' : theme.accent,
            }}
          />
          <span style={{ color: theme.textSecondary }}>
            {label} {totalPages}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span
            role="button"
            tabIndex={disabled ? -1 : 0}
            onDoubleClick={startEditing}
            onKeyDown={handleKeyDown}
            title={disabled ? undefined : 'Double-click to edit page number'}
            aria-label={`Current page ${currentPage}. Double-click or press Enter to edit.`}
            aria-disabled={disabled || undefined}
            className={`font-medium ${disabled ? 'cursor-default' : 'cursor-pointer hover:underline hover:decoration-dotted'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
            style={{ color: theme.text, outlineColor: theme.accent }}
          >
            {currentPage}
          </span>
          <span style={{ color: theme.textSecondary }}>
            {label} {totalPages}
          </span>
        </div>
      )}

      {isEditing && !error && (
        <div id={hintId} className="text-xs mt-1" style={{ color: theme.textSecondary }}>
          Press Enter to go, Esc to cancel
        </div>
      )}

      {isEditing && error && (
        <div id={errorId} role="alert" className="text-xs mt-1" style={{ color: '#ef4444' }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default InlineEditablePageNumber;
