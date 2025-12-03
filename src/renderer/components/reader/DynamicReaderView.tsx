import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../../context/BookContext';
import { useDeferredWords } from '../../context/DeferredWordContext';
import { useTextReflow } from '../../hooks/useTextReflow';
import { ZOOM_LEVELS, REFLOW_SETTINGS } from '../../../shared/constants';
import type { Book, BookData, ReadingProgress } from '../../../shared/types';
import type { CachedWordData } from '../../../shared/types/deferred-word.types';
import { calculateMiddleIndex, isWithinAdjacency } from '../../../shared/types/deferred-word.types';
import WordPanel from '../word-panel/WordPanel';

const MAX_PHRASE_WORDS = 10;

interface DynamicReaderViewProps {
  book: Book;
  bookData: BookData;
  initialProgress: ReadingProgress | null;
}

interface SelectedWord {
  word: string;
  sentence: string;
  pageNumber: number;
  isPhrase?: boolean;
  wordIndices?: number[];
}

interface PhraseRange {
  indices: number[];
  middleIndex: number;
  phrase: string;
  status: 'loading' | 'ready';
}

interface Chapter {
  name: string;
  startPage: number;
}

const DynamicReaderView: React.FC<DynamicReaderViewProps> = ({ book, bookData, initialProgress }) => {
  const navigate = useNavigate();
  const { updateProgress } = useBooks();
  const { queueWord, isWordReady, getWordData, getWordStatus, fetchingCount, pendingCount } = useDeferredWords();
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(initialProgress?.zoom_level || ZOOM_LEVELS.DEFAULT);
  const [selectedWord, setSelectedWord] = useState<SelectedWord | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showChapterMenu, setShowChapterMenu] = useState(false);
  const [preloadedData, setPreloadedData] = useState<CachedWordData | null>(null);

  // Track pulsing words for animation
  const [pulsingWords, setPulsingWords] = useState<Set<string>>(new Set());

  // Track loading word positions (specific indices that are currently fetching)
  const [loadingPositions, setLoadingPositions] = useState<Set<number>>(new Set());

  // Map to track which word each loading position corresponds to
  const loadingWordsMapRef = useRef<Map<number, string>>(new Map());

  // Phrase selection state
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [isShiftHeld, setIsShiftHeld] = useState(false);
  const [phraseRanges, setPhraseRanges] = useState<Map<string, PhraseRange>>(new Map());

  // Track words that have been looked up before (across all pages in this book)
  // Used to show gray dots for known words that haven't been fetched for current page
  const [knownWords, setKnownWords] = useState<Set<string>>(new Set());

  // Map word indices to their actual words for phrase construction
  const wordIndexMapRef = useRef<Map<number, string>>(new Map());

  // Use the text reflow hook
  const {
    state: reflowState,
    goToNextPage,
    goToPrevPage,
    goToOriginalPage,
    reflowPages,
  } = useTextReflow({
    bookData,
    containerRef,
    zoom,
    initialCharacterOffset: initialProgress?.character_offset || 0,
  });

  // Extract unique chapters with their starting pages
  const chapters = useMemo(() => {
    const chapterMap = new Map<string, number>();
    bookData.pages.forEach(page => {
      if (page.chapter && !chapterMap.has(page.chapter)) {
        chapterMap.set(page.chapter, page.page);
      }
    });
    return Array.from(chapterMap.entries()).map(([name, startPage]) => ({
      name,
      startPage,
    }));
  }, [bookData.pages]);

  // Debounced reflow when zoom changes
  useEffect(() => {
    const timer = setTimeout(() => {
      reflowPages();
    }, REFLOW_SETTINGS.DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [zoom, reflowPages]);

  // Save progress when position or zoom changes
  useEffect(() => {
    const saveProgress = async () => {
      await updateProgress({
        current_page: reflowState.originalPage,
        character_offset: reflowState.characterOffset,
        zoom_level: zoom,
      });
    };
    saveProgress();
  }, [reflowState.characterOffset, reflowState.originalPage, zoom, updateProgress]);

  // Extract sentence from current view text ONLY (not across pages)
  // This ensures we get the sentence from the actual displayed text
  const extractSentenceFromCurrentView = useCallback((word: string): string => {
    const text = reflowState.currentText;
    if (!text) return '';

    // Find the word in current view text
    const cleanWord = word.replace(/[^\w'-]/g, '');
    const wordRegex = new RegExp(`\\b${cleanWord}\\b`, 'i');
    const wordMatch = text.match(wordRegex);

    if (!wordMatch || wordMatch.index === undefined) {
      // Fallback: return a portion of current view text
      return text.substring(0, 200);
    }

    const wordPosition = wordMatch.index;

    // Find sentence start: look backwards for . ! ? or start of text
    let sentenceStart = 0;
    for (let i = wordPosition - 1; i >= 0; i--) {
      const char = text[i];
      if (char === '.' || char === '!' || char === '?') {
        // Check it's not an abbreviation (e.g., "Mr.", "Dr.")
        const beforePunctuation = text.substring(Math.max(0, i - 3), i);
        if (!/^(Mr|Mrs|Ms|Dr|Jr|Sr|St)$/i.test(beforePunctuation.trim())) {
          sentenceStart = i + 1;
          break;
        }
      }
    }

    // Find sentence end: look forwards for . ! ? or end of text
    let sentenceEnd = text.length;
    for (let i = wordPosition; i < text.length; i++) {
      const char = text[i];
      if (char === '.' || char === '!' || char === '?') {
        // Check it's not an abbreviation
        const beforePunctuation = text.substring(Math.max(0, i - 3), i);
        if (!/^(Mr|Mrs|Ms|Dr|Jr|Sr|St)$/i.test(beforePunctuation.trim())) {
          sentenceEnd = i + 1;
          break;
        }
      }
    }

    // Extract and clean the sentence
    let sentence = text.substring(sentenceStart, sentenceEnd).trim();

    // Limit length if too long
    if (sentence.length > 500) {
      const halfLength = 250;
      const startPos = Math.max(0, wordPosition - sentenceStart - halfLength);
      const endPos = Math.min(sentence.length, wordPosition - sentenceStart + halfLength);
      sentence = '...' + sentence.substring(startPos, endPos).trim() + '...';
    }

    return sentence || text.substring(0, 200);
  }, [reflowState.currentText]);

  // Build phrase from selected indices
  const buildPhraseFromIndices = useCallback((indices: number[]): string => {
    const sorted = [...indices].sort((a, b) => a - b);
    const words = sorted.map(idx => wordIndexMapRef.current.get(idx) || '');
    console.log('[PHRASE DEBUG] buildPhraseFromIndices:', { indices: sorted, words, mapSize: wordIndexMapRef.current.size });
    return words.filter(Boolean).join(' ');
  }, []);

  // Finalize phrase selection and trigger AI lookup
  const finalizePhrase = useCallback(() => {
    console.log('[PHRASE DEBUG] finalizePhrase called with selectedIndices:', selectedIndices);

    if (selectedIndices.length <= 1) {
      // Single word or empty - clear selection
      console.log('[PHRASE DEBUG] Single word or empty, clearing selection');
      setSelectedIndices([]);
      return;
    }

    const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
    const phrase = buildPhraseFromIndices(sortedIndices);
    const middleIndex = calculateMiddleIndex(sortedIndices);
    const fullSentence = extractSentenceFromCurrentView(phrase);

    console.log('[PHRASE DEBUG] finalizePhrase:', { sortedIndices, phrase, middleIndex, fullSentence });

    // Check if phrase is already cached
    const isPhraseReady = isWordReady(phrase, book.id, reflowState.originalPage);

    if (isPhraseReady) {
      // Phrase is ready - open panel with cached data
      setSelectedWord({
        word: phrase,
        sentence: fullSentence,
        pageNumber: reflowState.originalPage,
        isPhrase: true,
        wordIndices: sortedIndices,
      });
      setPreloadedData(getWordData(phrase, book.id, reflowState.originalPage));
      setIsPanelOpen(true);
    } else {
      // Queue phrase for background fetch
      queueWord(phrase, fullSentence, reflowState.originalPage, book.id);

      // Add to phrase ranges for dot display
      setPhraseRanges(prev => {
        const newMap = new Map(prev);
        newMap.set(phrase, {
          indices: sortedIndices,
          middleIndex,
          phrase,
          status: 'loading',
        });
        return newMap;
      });

      // Add pulse animation
      setPulsingWords(prev => new Set(prev).add(phrase));
      setTimeout(() => {
        setPulsingWords(prev => {
          const newSet = new Set(prev);
          newSet.delete(phrase);
          return newSet;
        });
      }, 400);
    }

    // Clear selection
    setSelectedIndices([]);
  }, [selectedIndices, buildPhraseFromIndices, extractSentenceFromCurrentView, reflowState.originalPage, book.id, isWordReady, getWordData, queueWord]);

  // Handle word click with deferred lookup behavior and phrase selection
  const handleWordClick = useCallback((word: string, wordIndex: number, event: React.MouseEvent) => {
    const cleanWord = word.replace(/[^\w'-]/g, '').toLowerCase();

    console.log('[PHRASE DEBUG] handleWordClick:', { word: cleanWord, wordIndex, shiftKey: event.shiftKey, currentSelectedIndices: selectedIndices });

    // Store word in map for phrase construction
    wordIndexMapRef.current.set(wordIndex, cleanWord);

    // Handle Shift+click for phrase selection
    if (event.shiftKey) {
      // PREVENT browser's native text selection when Shift is held
      event.preventDefault();

      setSelectedIndices(prev => {
        console.log('[PHRASE DEBUG] Shift+click - updating selectedIndices from:', prev);
        // Check if this word is within valid adjacency
        if (prev.length > 0 && !isWithinAdjacency(wordIndex, prev)) {
          // Too far - start new selection from this word
          return [wordIndex];
        }

        // Check if already selected - remove it
        if (prev.includes(wordIndex)) {
          return prev.filter(idx => idx !== wordIndex);
        }

        // Check max phrase length
        if (prev.length >= MAX_PHRASE_WORDS) {
          // Max reached - ignore
          return prev;
        }

        // Add to selection
        return [...prev, wordIndex];
      });
      return;
    }

    // Check if clicked word is part of a cached phrase (before treating as single word)
    for (const [phrase, range] of phraseRanges) {
      if (range.indices.includes(wordIndex) && range.status === 'ready') {
        const phraseSentence = extractSentenceFromCurrentView(phrase);
        setSelectedWord({
          word: phrase,
          sentence: phraseSentence,
          pageNumber: reflowState.originalPage,
          isPhrase: true,
          wordIndices: range.indices,
        });
        setPreloadedData(getWordData(phrase, book.id, reflowState.originalPage));
        setIsPanelOpen(true);
        console.log('[PHRASE DEBUG] Opened cached phrase panel:', phrase);
        return;
      }
    }

    // Normal click - clear any phrase selection first
    if (selectedIndices.length > 0) {
      setSelectedIndices([]);
    }

    const fullSentence = extractSentenceFromCurrentView(word);

    // Check if word is ready (has cached data for this page)
    if (isWordReady(cleanWord, book.id, reflowState.originalPage)) {
      // Word is ready - open panel with cached data
      setSelectedWord({
        word: cleanWord,
        sentence: fullSentence,
        pageNumber: reflowState.originalPage,
      });
      setPreloadedData(getWordData(cleanWord, book.id, reflowState.originalPage));
      setIsPanelOpen(true);
      // Remove from loading positions if it was there
      setLoadingPositions(prev => {
        const newSet = new Set(prev);
        newSet.delete(wordIndex);
        return newSet;
      });
    } else {
      // Queue word for background fetch
      const status = getWordStatus(cleanWord, book.id, reflowState.originalPage);

      // Only queue if not already pending or fetching
      if (!status || status === 'error') {
        queueWord(cleanWord, fullSentence, reflowState.originalPage, book.id);

        // Add to known words (for gray dot on other pages)
        setKnownWords(prev => new Set(prev).add(cleanWord));

        // Add this position to loading positions (for yellow dot)
        setLoadingPositions(prev => new Set(prev).add(wordIndex));
        loadingWordsMapRef.current.set(wordIndex, cleanWord);

        // Add pulse animation
        setPulsingWords(prev => new Set(prev).add(cleanWord));
        setTimeout(() => {
          setPulsingWords(prev => {
            const newSet = new Set(prev);
            newSet.delete(cleanWord);
            return newSet;
          });
        }, 400);
      }
    }
  }, [extractSentenceFromCurrentView, reflowState.originalPage, book.id, isWordReady, getWordData, getWordStatus, queueWord, selectedIndices, phraseRanges]);

  // Keyboard navigation and Shift key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftHeld(true);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goToNextPage();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key === 'Escape') {
        setIsPanelOpen(false);
        setSelectedIndices([]);
        setIsShiftHeld(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftHeld(false);
        // Finalize phrase selection when Shift is released
        if (selectedIndices.length > 1) {
          finalizePhrase();
        } else if (selectedIndices.length === 1) {
          // Single word with shift - treat as normal word click
          const wordIndex = selectedIndices[0];
          const word = wordIndexMapRef.current.get(wordIndex);
          if (word) {
            const fullSentence = extractSentenceFromCurrentView(word);

            if (isWordReady(word, book.id, reflowState.originalPage)) {
              setSelectedWord({
                word,
                sentence: fullSentence,
                pageNumber: reflowState.originalPage,
              });
              setPreloadedData(getWordData(word, book.id, reflowState.originalPage));
              setIsPanelOpen(true);
            } else {
              const status = getWordStatus(word, book.id, reflowState.originalPage);
              if (!status || status === 'error') {
                queueWord(word, fullSentence, reflowState.originalPage, book.id);
                setLoadingPositions(prev => new Set(prev).add(wordIndex));
                loadingWordsMapRef.current.set(wordIndex, word);
              }
            }
          }
          setSelectedIndices([]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [goToNextPage, goToPrevPage, selectedIndices, finalizePhrase, extractSentenceFromCurrentView, reflowState.originalPage, book.id, isWordReady, getWordData, getWordStatus, queueWord]);

  // Clear loading positions when words become ready
  useEffect(() => {
    if (loadingPositions.size === 0) return;

    const positionsToRemove: number[] = [];
    loadingPositions.forEach(pos => {
      const word = loadingWordsMapRef.current.get(pos);
      if (word && isWordReady(word, book.id, reflowState.originalPage)) {
        positionsToRemove.push(pos);
      }
    });

    if (positionsToRemove.length > 0) {
      setLoadingPositions(prev => {
        const newSet = new Set(prev);
        positionsToRemove.forEach(pos => {
          newSet.delete(pos);
          loadingWordsMapRef.current.delete(pos);
        });
        return newSet;
      });
    }
  }, [loadingPositions, isWordReady, book.id, reflowState.originalPage]);

  // Clear loading positions and phrase selection when page changes
  useEffect(() => {
    setLoadingPositions(new Set());
    loadingWordsMapRef.current.clear();
    setSelectedIndices([]);
    wordIndexMapRef.current.clear();
    setPhraseRanges(new Map());
  }, [reflowState.currentPageIndex]);

  // Update phrase ranges when phrases become ready
  useEffect(() => {
    if (phraseRanges.size === 0) return;

    const updatedRanges = new Map(phraseRanges);
    let hasChanges = false;

    phraseRanges.forEach((range, phrase) => {
      if (range.status === 'loading' && isWordReady(phrase, book.id, reflowState.originalPage)) {
        updatedRanges.set(phrase, { ...range, status: 'ready' });
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setPhraseRanges(updatedRanges);
    }
  }, [phraseRanges, isWordReady, book.id, reflowState.originalPage]);

  // Auto-queue known words after 5 seconds on a page
  // This turns gray dots into yellow dots and fetches AI translations for the new context
  // The 5-second delay gives the user time to navigate away before wasting AI calls
  useEffect(() => {
    if (knownWords.size === 0) return;

    // Set a 5-second timer before auto-queuing
    const timer = setTimeout(() => {
      // Parse current page text for known words
      const parts = reflowState.currentText.split(/(\s+)/);
      const wordsToQueue: Array<{ word: string; index: number }> = [];

      parts.forEach((part, index) => {
        // Skip whitespace
        if (/^\s+$/.test(part)) return;

        const cleanWord = part.replace(/[^\w'-]/g, '').toLowerCase();
        if (!cleanWord) return;

        // Check if this is a known word that needs fetching for current page
        if (knownWords.has(cleanWord)) {
          // Check if not already ready or loading for this page
          if (!isWordReady(cleanWord, book.id, reflowState.originalPage)) {
            const status = getWordStatus(cleanWord, book.id, reflowState.originalPage);
            if (!status || status === 'error') {
              wordsToQueue.push({ word: cleanWord, index });
            }
          }
        }
      });

      // Queue words for background fetch (limit to avoid overload)
      wordsToQueue.slice(0, 5).forEach(({ word, index }) => {
        const sentence = extractSentenceFromCurrentView(word);
        queueWord(word, sentence, reflowState.originalPage, book.id);
        setLoadingPositions(prev => new Set(prev).add(index));
        loadingWordsMapRef.current.set(index, word);
      });
    }, 5000); // 5 second delay

    return () => clearTimeout(timer);
  }, [reflowState.originalPage, reflowState.currentText, knownWords, book.id, isWordReady, getWordStatus, queueWord, extractSentenceFromCurrentView]);

  // Helper to check if an index is part of any phrase range
  const getPhraseInfoForIndex = useCallback((index: number): { isInPhrase: boolean; isMiddle: boolean; status: 'loading' | 'ready' | null } => {
    for (const [, range] of phraseRanges) {
      if (range.indices.includes(index)) {
        return {
          isInPhrase: true,
          isMiddle: index === range.middleIndex,
          status: range.status,
        };
      }
    }
    return { isInPhrase: false, isMiddle: false, status: null };
  }, [phraseRanges]);

  // Render text with clickable words and ready indicators
  const renderText = (text: string) => {
    if (!text) return <span className="text-gray-400 dark:text-gray-500 italic">Empty page</span>;

    // Split by words while preserving whitespace and newlines
    const parts = text.split(/(\s+)/);
    return parts.map((part, index) => {
      // Preserve whitespace and newlines
      if (/^\s+$/.test(part)) {
        // Convert double newlines to paragraph breaks
        if (part.includes('\n\n')) {
          return <span key={index} className="block h-4" />;
        }
        return <span key={index}>{part}</span>;
      }

      // Store word in map for phrase construction
      const cleanWord = part.replace(/[^\w'-]/g, '').toLowerCase();
      wordIndexMapRef.current.set(index, cleanWord);

      // Check if this word has ready data (for single words, page-specific)
      const wordIsReady = isWordReady(cleanWord, book.id, reflowState.originalPage);
      const isPulsing = pulsingWords.has(cleanWord);
      const isLoading = loadingPositions.has(index);
      const isKnownWord = knownWords.has(cleanWord);

      // Check phrase-related states
      const isCurrentlySelected = selectedIndices.includes(index);
      const phraseInfo = getPhraseInfoForIndex(index);

      // Determine CSS classes
      const classes = [
        'word-clickable',
        wordIsReady && !phraseInfo.isInPhrase ? 'word-ready' : '',
        isPulsing ? 'word-queued-pulse' : '',
        isShiftHeld ? 'word-shift-mode' : '',
        isCurrentlySelected ? 'word-phrase-selected word-phrase-selecting' : '',
        phraseInfo.isInPhrase ? 'word-phrase-selected' : '',
      ].filter(Boolean).join(' ');

      // Determine which dot to show:
      // Three-dot system: Gray (known but not fetched) → Yellow (fetching) → Red (ready)
      // - For phrases: only show dot on middle word
      // - For single words: show dot on the word itself
      let showRedDot = false;
      let showYellowDot = false;
      let showGrayDot = false;

      if (phraseInfo.isInPhrase) {
        // Part of a phrase - only middle word gets the dot
        if (phraseInfo.isMiddle) {
          showRedDot = phraseInfo.status === 'ready';
          showYellowDot = phraseInfo.status === 'loading';
        }
      } else {
        // Single word behavior - three-dot system
        if (wordIsReady) {
          showRedDot = true;
        } else if (isLoading) {
          showYellowDot = true;
        } else if (isKnownWord) {
          showGrayDot = true; // Word was looked up before, but not for this page
        }
      }

      // Word - make it clickable with optional ready/loading/known indicator
      return (
        <span
          key={index}
          onClick={(e) => handleWordClick(part, index, e)}
          className={classes}
        >
          {part}
          {showRedDot && <span className="word-ready-dot" />}
          {showYellowDot && <span className="word-loading-dot" />}
          {showGrayDot && <span className="word-gray-dot" />}
        </span>
      );
    });
  };

  const fontSize = REFLOW_SETTINGS.BASE_FONT_SIZE * zoom;
  const progressPercent = reflowState.totalPages > 0
    ? ((reflowState.currentPageIndex + 1) / reflowState.totalPages) * 100
    : 0;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Top bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/library')}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            ← Back
          </button>
          <div className="text-sm text-gray-600 dark:text-gray-300 max-w-md truncate">
            {book.title}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Chapter selector */}
          {chapters.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowChapterMenu(!showChapterMenu)}
                className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <span className="max-w-xs truncate">
                  {reflowState.chapterName || 'Select Chapter'}
                </span>
                <span className="text-xs">▼</span>
              </button>

              {showChapterMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowChapterMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-80 overflow-auto min-w-64">
                    {chapters.map((chapter, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          goToOriginalPage(chapter.startPage);
                          setShowChapterMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          reflowState.chapterName === chapter.name ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="truncate">{chapter.name}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">Page {chapter.startPage}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Original page indicator */}
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Book page: {reflowState.originalPage}
          </span>

          {/* Queue indicator - show when words are pending or fetching */}
          {(fetchingCount + pendingCount) > 0 && (
            <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1 px-2 py-1 bg-yellow-50 dark:bg-yellow-900/30 rounded">
              <span className="relative inline-flex">
                <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
              </span>
              {fetchingCount + pendingCount} in queue
            </span>
          )}

          {/* Zoom control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Zoom:</span>
            <input
              type="range"
              min={ZOOM_LEVELS.MIN}
              max={ZOOM_LEVELS.MAX}
              step={ZOOM_LEVELS.STEP}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-24 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400 w-10">
              {zoom.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>

      {/* Reading area */}
      <div className="flex-1 overflow-hidden p-8">
        <div
          ref={containerRef}
          className="h-full max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-sm dark:shadow-gray-900/50 p-8 reader-text overflow-hidden text-gray-900 dark:text-gray-100"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: REFLOW_SETTINGS.LINE_HEIGHT,
          }}
        >
          {renderText(reflowState.currentText)}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
        {/* Progress bar */}
        <div className="max-w-3xl mx-auto mb-3">
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center mt-1">
            View {reflowState.currentPageIndex + 1} of {reflowState.totalPages} • {Math.round(progressPercent)}% complete
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={goToPrevPage}
            disabled={reflowState.currentPageIndex <= 0}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>

          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span>View</span>
            <span className="font-medium">{reflowState.currentPageIndex + 1}</span>
            <span>of</span>
            <span>{reflowState.totalPages}</span>
          </div>

          <button
            onClick={goToNextPage}
            disabled={reflowState.currentPageIndex >= reflowState.totalPages - 1}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Word Panel */}
      <WordPanel
        isOpen={isPanelOpen}
        onClose={() => {
          setIsPanelOpen(false);
          setPreloadedData(null);
        }}
        selectedWord={selectedWord}
        bookId={book.id}
        onNavigateToPage={goToOriginalPage}
        preloadedData={preloadedData}
      />
    </div>
  );
};

export default DynamicReaderView;
