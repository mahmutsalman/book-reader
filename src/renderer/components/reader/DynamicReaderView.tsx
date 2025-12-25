import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../../context/BookContext';
import { useDeferredWords } from '../../context/DeferredWordContext';
import { useSettings } from '../../context/SettingsContext';
import { useTextReflow } from '../../hooks/useTextReflow';
import { ZOOM_LEVELS, REFLOW_SETTINGS } from '../../../shared/constants';
import type { Book, BookData, ReadingProgress } from '../../../shared/types';
import type { CachedWordData } from '../../../shared/types/deferred-word.types';
import type { PreStudyProgress } from '../../../shared/types/pre-study-notes.types';
import { calculateMiddleIndex, isWithinAdjacency } from '../../../shared/types/deferred-word.types';
import { cleanWord, createWordBoundaryRegex } from '../../../shared/utils/text-utils';
import WordPanel from '../word-panel/WordPanel';
import PreStudyNotesButton from './PreStudyNotesButton';
import { FloatingProgressPanel } from './FloatingProgressPanel';
import { ThemeContextMenu } from './ThemeContextMenu';
import { readerThemes } from '../../config/readerThemes';

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
  const { settings, updateSetting } = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine if system is in dark mode
  const isDarkMode = useMemo(() => {
    if (settings.theme === 'dark') return true;
    if (settings.theme === 'light') return false;
    // 'system' - check OS preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [settings.theme]);

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

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Grammar perspective mode state
  const [isGrammarMode, setIsGrammarMode] = useState(false);

  // Track words that have been looked up before (across all pages in this book)
  // Used to show gray dots for known words that haven't been fetched for current page
  const [knownWords, setKnownWords] = useState<Set<string>>(new Set());

  // Pre-study notes state
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [notesProgress, setNotesProgress] = useState<PreStudyProgress | null>(null);

  // Theme context menu state
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [themeMenuPosition, setThemeMenuPosition] = useState({ x: 0, y: 0 });

  // Map word indices to their actual words for phrase construction
  const wordIndexMapRef = useRef<Map<number, string>>(new Map());

  // Map word indices to their sentences (for checking if ready later)
  const wordSentenceMapRef = useRef<Map<number, string>>(new Map());

  // Persist phrase ranges and loading positions per page for navigation preservation
  const phraseRangesByPageRef = useRef<Map<number, Map<string, PhraseRange>>>(new Map());
  const loadingDataByPageRef = useRef<Map<number, {
    positions: Set<number>;
    wordsMap: Map<number, string>;
    sentenceMap: Map<number, string>;
  }>>(new Map());
  const prevPageIndexRef = useRef<number>(-1);
  // Refs to access current state values in useEffect without adding them as dependencies
  const phraseRangesRef = useRef<Map<string, PhraseRange>>(new Map());
  const loadingPositionsRef = useRef<Set<number>>(new Set());

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
    initialProgressPercentage: initialProgress?.progress_percentage,
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

  // Keep refs in sync with state (for use in page change effect without causing loops)
  useEffect(() => {
    phraseRangesRef.current = phraseRanges;
  }, [phraseRanges]);

  useEffect(() => {
    loadingPositionsRef.current = loadingPositions;
  }, [loadingPositions]);

  // Save progress when position or zoom changes
  useEffect(() => {
    const saveProgress = async () => {
      // Calculate progress percentage for stable position restoration
      const progressPercentage = reflowState.totalCharacters > 0
        ? reflowState.characterOffset / reflowState.totalCharacters
        : 0;
      await updateProgress({
        current_page: reflowState.originalPage,
        character_offset: reflowState.characterOffset,
        progress_percentage: progressPercentage,
        zoom_level: zoom,
      });
    };
    saveProgress();
  }, [reflowState.characterOffset, reflowState.originalPage, reflowState.totalCharacters, zoom, updateProgress]);

  // Helper to normalize quotes in text for consistent matching
  // Comprehensive apostrophe normalization covering:
  // - ' ' (U+2018, U+2019) curly quotes
  // - ` ´ (U+0060, U+00B4) grave/acute accents
  // - ʼ ʻ (U+02BC, U+02BB) modifier letters
  // - ′ (U+2032) prime
  // - ‛ (U+201B) reversed quote
  const normalizeQuotes = useCallback((str: string): string => {
    return str.replace(/[''`´ʼʻ′‛]/g, "'");
  }, []);

  // Extract sentence from current view text ONLY (not across pages)
  // This ensures we get the sentence from the actual displayed text
  const extractSentenceFromCurrentView = useCallback((word: string): string => {
    const text = reflowState.currentText;
    if (!text) return '';

    // Normalize both text and word for consistent quote matching
    const normalizedText = normalizeQuotes(text);
    const normalizedWord = normalizeQuotes(word);

    // Check if this is a phrase (multiple words)
    const isPhrase = normalizedWord.trim().includes(' ');

    let wordPosition: number;

    if (isPhrase) {
      // For phrases, use simple case-insensitive substring search
      // This is more reliable than regex for multi-word phrases
      const lowerText = normalizedText.toLowerCase();
      const lowerPhrase = normalizedWord.toLowerCase().trim();
      wordPosition = lowerText.indexOf(lowerPhrase);

      if (wordPosition === -1) {
        // Try finding first word of phrase as fallback
        const firstWord = lowerPhrase.split(/\s+/)[0];
        wordPosition = lowerText.indexOf(firstWord);
      }
    } else {
      // For single words, use word boundary regex (Unicode-aware for Russian, etc.)
      const cleanedWord = cleanWord(normalizedWord);
      const wordRegex = createWordBoundaryRegex(cleanedWord, 'i');
      const wordMatch = normalizedText.match(wordRegex);
      wordPosition = wordMatch?.index ?? -1;

      // Fallback: simple case-insensitive search if regex fails
      // This handles edge cases with apostrophe character mismatches
      if (wordPosition === -1) {
        wordPosition = normalizedText.toLowerCase().indexOf(cleanedWord.toLowerCase());
      }
    }

    if (wordPosition === -1) {
      // Fallback: return a portion of current view text
      console.warn('[Context] Word/phrase not found in current view:', word);
      return text.substring(0, 200);
    }

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
  }, [reflowState.currentText, normalizeQuotes]);

  // Pre-compute sentences for each word position (memoized per view change)
  // This is used for efficient cache lookups without re-extracting sentences
  const wordSentences = useMemo(() => {
    const sentences = new Map<number, string>();
    if (!reflowState.currentText) return sentences;

    const parts = reflowState.currentText.split(/(\s+)/);
    parts.forEach((part, index) => {
      if (/^\s+$/.test(part)) return;
      const cleanedWord = cleanWord(part);
      if (!cleanedWord) return;
      const sentence = extractSentenceFromCurrentView(part);
      sentences.set(index, sentence);
    });

    return sentences;
  }, [reflowState.currentText, extractSentenceFromCurrentView]);

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

    // Check if phrase is already cached (using sentence for cache key)
    const isPhraseReady = isWordReady(phrase, fullSentence, book.id);

    if (isPhraseReady) {
      // Phrase is ready - open panel with cached data
      setSelectedWord({
        word: phrase,
        sentence: fullSentence,
        pageNumber: reflowState.originalPage,
        isPhrase: true,
        wordIndices: sortedIndices,
      });
      setPreloadedData(getWordData(phrase, fullSentence, book.id));
      setIsPanelOpen(true);
    } else {
      // Queue phrase for background fetch
      queueWord(phrase, fullSentence, book.id, book.language);

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

  // Handle context menu for theme selection
  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    // Only show theme menu if right-click is on the left 40% of the container
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const containerWidth = rect.width;

    if (clickX <= containerWidth * 0.4) {
      event.preventDefault();
      setThemeMenuPosition({ x: event.clientX, y: event.clientY });
      setShowThemeMenu(true);
    }
  }, []);

  // Handle theme selection
  const handleThemeSelect = useCallback(async (themeId: string) => {
    try {
      await updateSetting('reader_theme', themeId);
    } catch (error) {
      console.error('Failed to update reader theme:', error);
    }
  }, [updateSetting]);

  // Handle word click with deferred lookup behavior and phrase selection
  const handleWordClick = useCallback((word: string, wordIndex: number, event: React.MouseEvent) => {
    const cleanedWord = cleanWord(word);

    console.log('[PHRASE DEBUG] handleWordClick:', { word: cleanedWord, wordIndex, shiftKey: event.shiftKey, currentSelectedIndices: selectedIndices });

    // Store word in map for phrase construction
    wordIndexMapRef.current.set(wordIndex, cleanedWord);

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

        // Add to selection (unlimited - no max phrase length)
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
        setPreloadedData(getWordData(phrase, phraseSentence, book.id));
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

    // Check if word is ready (has cached data for this sentence context)
    if (isWordReady(cleanedWord, fullSentence, book.id)) {
      // Word is ready - open panel with cached data
      setSelectedWord({
        word: cleanedWord,
        sentence: fullSentence,
        pageNumber: reflowState.originalPage,
      });
      setPreloadedData(getWordData(cleanedWord, fullSentence, book.id));
      setIsPanelOpen(true);
      // Remove from loading positions if it was there
      setLoadingPositions(prev => {
        const newSet = new Set(prev);
        newSet.delete(wordIndex);
        return newSet;
      });
    } else {
      // Queue word for background fetch
      const status = getWordStatus(cleanedWord, fullSentence, book.id);

      // Only queue if not already pending or fetching
      if (!status || status === 'error') {
        queueWord(cleanedWord, fullSentence, book.id, book.language);

        // Add to known words (for gray dot on other pages)
        setKnownWords(prev => new Set(prev).add(cleanedWord));

        // Add this position to loading positions (for yellow dot)
        setLoadingPositions(prev => new Set(prev).add(wordIndex));
        loadingWordsMapRef.current.set(wordIndex, cleanedWord);
        wordSentenceMapRef.current.set(wordIndex, fullSentence);

        // Add pulse animation
        setPulsingWords(prev => new Set(prev).add(cleanedWord));
        setTimeout(() => {
          setPulsingWords(prev => {
            const newSet = new Set(prev);
            newSet.delete(cleanedWord);
            return newSet;
          });
        }, 400);
      }
    }
  }, [extractSentenceFromCurrentView, reflowState.originalPage, book.id, isWordReady, getWordData, getWordStatus, queueWord, selectedIndices, phraseRanges]);

  // === DRAG SELECTION HANDLERS ===
  // Implements Android gallery-style drag-to-select for phrase creation

  // Handler 1: Initiate drag on mouseDown
  const handleWordMouseDown = useCallback((wordIndex: number, event: React.MouseEvent) => {
    // Ignore if Shift held (preserve Shift+Click behavior)
    if (event.shiftKey) return;

    // Prevent default text selection immediately
    event.preventDefault();

    // Clear any existing timeout
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }

    // Set timeout for drag detection (150ms)
    dragTimeoutRef.current = setTimeout(() => {
      setIsDragging(true);
      setDragStartIndex(wordIndex);
      setSelectedIndices([wordIndex]);
    }, 150);
  }, []);

  // Handler 2: Extend selection range during drag
  const handleWordMouseEnter = useCallback((wordIndex: number, event: React.MouseEvent) => {
    if (!isDragging || dragStartIndex === null) return;

    event.preventDefault();

    // Build continuous range from start to current
    const start = Math.min(dragStartIndex, wordIndex);
    const end = Math.max(dragStartIndex, wordIndex);

    // Create array of all indices in range (unlimited selection)
    const range = Array.from({length: end - start + 1}, (_, i) => start + i);

    setSelectedIndices(range);
  }, [isDragging, dragStartIndex]);

  // Handler 3: Finalize selection on mouseUp
  const handleWordMouseUp = useCallback((event: React.MouseEvent) => {
    // Clear drag timeout
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
      dragTimeoutRef.current = null;
    }

    // If drag was active, finalize phrase
    if (isDragging && selectedIndices.length > 1) {
      finalizePhrase();
    } else {
      // Was a click, not a drag - clear selection
      setSelectedIndices([]);
    }

    // Reset drag state
    setIsDragging(false);
    setDragStartIndex(null);
  }, [isDragging, selectedIndices, finalizePhrase]);

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
        setIsGrammarMode(false); // Also exit grammar mode on Escape
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

            if (isWordReady(word, fullSentence, book.id)) {
              setSelectedWord({
                word,
                sentence: fullSentence,
                pageNumber: reflowState.originalPage,
              });
              setPreloadedData(getWordData(word, fullSentence, book.id));
              setIsPanelOpen(true);
            } else {
              const status = getWordStatus(word, fullSentence, book.id);
              if (!status || status === 'error') {
                queueWord(word, fullSentence, book.id, book.language);
                setLoadingPositions(prev => new Set(prev).add(wordIndex));
                loadingWordsMapRef.current.set(wordIndex, word);
                wordSentenceMapRef.current.set(wordIndex, fullSentence);
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

  // Global mouseup listener for drag selection cleanup
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleWordMouseUp({ preventDefault: () => {} } as React.MouseEvent);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, handleWordMouseUp]);

  // Cleanup drag timeout on unmount
  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };
  }, []);

  // Clear loading positions when words become ready
  useEffect(() => {
    if (loadingPositions.size === 0) return;

    const positionsToRemove: number[] = [];
    loadingPositions.forEach(pos => {
      const word = loadingWordsMapRef.current.get(pos);
      const sentence = wordSentenceMapRef.current.get(pos);
      if (word && sentence && isWordReady(word, sentence, book.id)) {
        positionsToRemove.push(pos);
      }
    });

    if (positionsToRemove.length > 0) {
      setLoadingPositions(prev => {
        const newSet = new Set(prev);
        positionsToRemove.forEach(pos => {
          newSet.delete(pos);
          loadingWordsMapRef.current.delete(pos);
          wordSentenceMapRef.current.delete(pos);
        });
        return newSet;
      });
    }
  }, [loadingPositions, isWordReady, book.id]);

  // Save and restore loading positions and phrase ranges when page changes
  useEffect(() => {
    const currentPageIndex = reflowState.currentPageIndex;
    const prevPageIndex = prevPageIndexRef.current;

    // Save current page's data before switching (only if prev page was valid and different)
    if (prevPageIndex >= 0 && prevPageIndex !== currentPageIndex) {
      // Save phrase ranges for the previous page (use ref to avoid dependency loop)
      if (phraseRangesRef.current.size > 0) {
        phraseRangesByPageRef.current.set(prevPageIndex, new Map(phraseRangesRef.current));
      }

      // Save loading data for the previous page
      if (loadingPositionsRef.current.size > 0) {
        loadingDataByPageRef.current.set(prevPageIndex, {
          positions: new Set(loadingPositionsRef.current),
          wordsMap: new Map(loadingWordsMapRef.current),
          sentenceMap: new Map(wordSentenceMapRef.current),
        });
      }
    }

    // Restore saved data for the new page (if any)
    const savedPhraseRanges = phraseRangesByPageRef.current.get(currentPageIndex);
    const savedLoadingData = loadingDataByPageRef.current.get(currentPageIndex);

    if (savedPhraseRanges) {
      setPhraseRanges(new Map(savedPhraseRanges));
    } else {
      setPhraseRanges(new Map());
    }

    if (savedLoadingData) {
      setLoadingPositions(new Set(savedLoadingData.positions));
      loadingWordsMapRef.current = new Map(savedLoadingData.wordsMap);
      wordSentenceMapRef.current = new Map(savedLoadingData.sentenceMap);
    } else {
      setLoadingPositions(new Set());
      loadingWordsMapRef.current.clear();
      wordSentenceMapRef.current.clear();
    }

    // Always clear selection and word index map on page change
    setSelectedIndices([]);
    wordIndexMapRef.current.clear();

    // Reset drag state on page change
    setIsDragging(false);
    setDragStartIndex(null);
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
      dragTimeoutRef.current = null;
    }

    // Update previous page ref
    prevPageIndexRef.current = currentPageIndex;
  }, [reflowState.currentPageIndex]);

  // Update phrase ranges when phrases become ready
  useEffect(() => {
    if (phraseRanges.size === 0) return;

    const updatedRanges = new Map(phraseRanges);
    let hasChanges = false;

    phraseRanges.forEach((range, phrase) => {
      if (range.status === 'loading') {
        // Get the sentence for this phrase (using the phrase itself to extract context)
        const phraseSentence = extractSentenceFromCurrentView(phrase);
        if (isWordReady(phrase, phraseSentence, book.id)) {
          updatedRanges.set(phrase, { ...range, status: 'ready' });
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      setPhraseRanges(updatedRanges);
    }
  }, [phraseRanges, isWordReady, book.id, extractSentenceFromCurrentView]);

  // Auto-queue known words after 5 seconds on a page
  // This turns gray dots into yellow dots and fetches AI translations for the new context
  // The 5-second delay gives the user time to navigate away before wasting AI calls
  useEffect(() => {
    if (knownWords.size === 0) return;

    // Set a 5-second timer before auto-queuing
    const timer = setTimeout(() => {
      // Parse current page text for known words
      const parts = reflowState.currentText.split(/(\s+)/);
      const wordsToQueue: Array<{ word: string; index: number; sentence: string }> = [];

      parts.forEach((part, index) => {
        // Skip whitespace
        if (/^\s+$/.test(part)) return;

        const cleanedWord = cleanWord(part);
        if (!cleanedWord) return;

        // Check if this is a known word that needs fetching for current sentence context
        if (knownWords.has(cleanedWord)) {
          const sentence = extractSentenceFromCurrentView(part);
          // Check if not already ready or loading for this sentence context
          if (!isWordReady(cleanedWord, sentence, book.id)) {
            const status = getWordStatus(cleanedWord, sentence, book.id);
            if (!status || status === 'error') {
              wordsToQueue.push({ word: cleanedWord, index, sentence });
            }
          }
        }
      });

      // Queue words for background fetch (limit to avoid overload)
      wordsToQueue.slice(0, 5).forEach(({ word, index, sentence }) => {
        queueWord(word, sentence, book.id, book.language);
        setLoadingPositions(prev => new Set(prev).add(index));
        loadingWordsMapRef.current.set(index, word);
        wordSentenceMapRef.current.set(index, sentence);
      });
    }, 5000); // 5 second delay

    return () => clearTimeout(timer);
  }, [reflowState.currentText, knownWords, book.id, isWordReady, getWordStatus, queueWord, extractSentenceFromCurrentView]);

  // Pre-study notes: Extract text from next N views
  const extractNextViewsText = useCallback((viewCount: number = 10): string => {
    const fullText = bookData.pages.map(p => p.text || '').join('\n\n');
    const currentText = reflowState.currentText?.trim();

    if (!currentText || !fullText) return '';

    // Use character offset as a hint for search area
    // The offset might be off due to trimming in pagination, but should be in the right ballpark
    const hintOffset = reflowState.characterOffset;

    // Search for current text starting from a bit before the hint offset
    // to account for any drift from trimming
    const searchStart = Math.max(0, hintOffset - 1000);
    let position = fullText.indexOf(currentText, searchStart);

    // Fallback: search from beginning if not found
    if (position === -1) {
      position = fullText.indexOf(currentText);
    }

    if (position === -1) {
      console.error('[PreStudy] Could not locate current view text in book');
      return '';
    }

    // Start extraction from the current view (include current view in pre-study)
    const startOffset = position;
    const avgCharsPerView = currentText.length || 2000;
    const charsToExtract = avgCharsPerView * viewCount;
    const endOffset = Math.min(startOffset + charsToExtract, fullText.length);

    return fullText.substring(startOffset, endOffset);
  }, [bookData.pages, reflowState.currentText, reflowState.characterOffset]);

  // Pre-study notes: Handle generate button click
  const handleGeneratePreStudyNotes = useCallback(async () => {
    // Don't start if already generating or if queue is busy
    if (isGeneratingNotes) {
      console.log('[PreStudy] Already generating, ignoring click');
      return;
    }

    if (fetchingCount + pendingCount > 0) {
      console.log('[PreStudy] Queue is busy, please wait');
      // Could show a toast here
      return;
    }

    setIsGeneratingNotes(true);
    setNotesProgress({ current: 0, total: 0, phase: 'extracting' });

    try {
      const viewCount = settings.pre_study_view_count;
      const textContent = extractNextViewsText(viewCount);

      if (!textContent || textContent.trim().length === 0) {
        console.log('[PreStudy] No text to process (might be at end of book)');
        setIsGeneratingNotes(false);
        setNotesProgress(null);
        return;
      }

      console.log(`[PreStudy] Starting generation with ${textContent.length} characters from ${viewCount} views`);

      await window.electronAPI.preStudy.generateNotes({
        bookId: book.id,
        bookTitle: book.title,
        language: book.language,
        textContent,
        startViewIndex: reflowState.currentPageIndex + 1,  // 1-based for display
        endViewIndex: Math.min(reflowState.currentPageIndex + viewCount, reflowState.totalPages),  // Current view + (viewCount-1) more
      });

      console.log('[PreStudy] Generation complete');
    } catch (error) {
      console.error('[PreStudy] Error generating notes:', error);
    } finally {
      setIsGeneratingNotes(false);
      setNotesProgress(null);
    }
  }, [isGeneratingNotes, fetchingCount, pendingCount, extractNextViewsText, book.id, book.title, book.language, reflowState.currentPageIndex, reflowState.totalPages, settings.pre_study_view_count]);

  // Pre-study notes: Listen for progress updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.preStudy.onProgress((progress) => {
      setNotesProgress(progress);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Pre-study notes: Cancel handler
  const handleCancelPreStudyNotes = useCallback(async () => {
    try {
      await window.electronAPI.preStudy.cancel();
      setIsGeneratingNotes(false);
      setNotesProgress(null);
    } catch (error) {
      console.error('[PreStudy] Error cancelling:', error);
    }
  }, []);

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
    if (!text) return <span className="text-gray-400 dark:text-cream-400 italic">Empty page</span>;

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

      // Store word in map for phrase construction (Unicode-aware for Russian, etc.)
      const cleanedWord = cleanWord(part);
      wordIndexMapRef.current.set(index, cleanedWord);

      // Get sentence for this word position from memoized map (sentence-based caching)
      const wordSentence = wordSentences.get(index) || '';

      // Check if this word has ready data (for single words, sentence-specific)
      const wordIsReady = wordSentence ? isWordReady(cleanedWord, wordSentence, book.id) : false;
      const isPulsing = pulsingWords.has(cleanedWord);
      const isLoading = loadingPositions.has(index);
      const isKnownWord = knownWords.has(cleanedWord);

      // Check phrase-related states
      const isCurrentlySelected = selectedIndices.includes(index);
      const phraseInfo = getPhraseInfoForIndex(index);

      // Determine CSS classes
      const classes = [
        'word-clickable',
        wordIsReady && !phraseInfo.isInPhrase ? 'word-ready' : '',
        isPulsing ? 'word-queued-pulse' : '',
        isShiftHeld ? 'word-shift-mode' : '',
        isDragging ? 'word-drag-mode' : '',
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
          showGrayDot = true; // Word was looked up before, but not for this sentence context
        }
      }

      // Word - make it clickable with optional ready/loading/known indicator
      return (
        <span
          key={index}
          onClick={(e) => handleWordClick(part, index, e)}
          onMouseDown={(e) => handleWordMouseDown(index, e)}
          onMouseEnter={(e) => handleWordMouseEnter(index, e)}
          onMouseUp={(e) => handleWordMouseUp(e)}
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
            className="text-gray-500 dark:text-cream-300 hover:text-gray-700 dark:hover:text-cream-100"
          >
            ← Back
          </button>
          <div className="text-sm text-gray-600 dark:text-cream-200 max-w-md truncate">
            {book.title}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Chapter selector */}
          {chapters.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowChapterMenu(!showChapterMenu)}
                className="text-sm text-gray-600 dark:text-cream-200 hover:text-gray-800 dark:hover:text-cream-100 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
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
                          reflowState.chapterName === chapter.name ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'text-gray-700 dark:text-cream-200'
                        }`}
                      >
                        <div className="truncate">{chapter.name}</div>
                        <div className="text-xs text-gray-400 dark:text-cream-400">Page {chapter.startPage}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Original page indicator */}
          <span className="text-xs text-gray-400 dark:text-cream-400">
            Book page: {reflowState.originalPage}
          </span>

          {/* Grammar mode toggle button */}
          <button
            onClick={() => setIsGrammarMode(prev => !prev)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
              isGrammarMode
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 ring-2 ring-indigo-400'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-cream-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'
            }`}
            title={isGrammarMode ? 'Grammar Mode ON - Click to disable' : 'Enable Grammar Mode'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
            </svg>
          </button>

          {/* Queue indicator - always reserve space to prevent layout shift */}
          <span className={`text-xs flex items-center gap-1 px-2 py-1 rounded min-w-[90px] ${
            (fetchingCount + pendingCount) > 0
              ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30'
              : 'invisible'
          }`}>
            <span className="relative inline-flex">
              <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            </span>
            {fetchingCount + pendingCount} in queue
          </span>

          {/* Pre-Study Notes button */}
          <PreStudyNotesButton
            onClick={handleGeneratePreStudyNotes}
            isGenerating={isGeneratingNotes}
            progress={notesProgress}
            disabled={fetchingCount + pendingCount > 0}
          />

          {/* Zoom control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-cream-300">Zoom:</span>
            <input
              type="range"
              min={ZOOM_LEVELS.MIN}
              max={ZOOM_LEVELS.MAX}
              step={ZOOM_LEVELS.STEP}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-24 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <span className="text-xs text-gray-600 dark:text-cream-300 w-10">
              {zoom.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>

      {/* Reading area - horizontal scroll on outer, vertical scroll inside text box */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-8">
        <div
          ref={containerRef}
          className="h-full mx-auto rounded-xl shadow-sm p-8 reader-text overflow-y-auto transition-colors duration-300"
          onContextMenu={handleContextMenu}
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: REFLOW_SETTINGS.LINE_HEIGHT,
            width: '768px',
            minWidth: '768px',
            backgroundColor: (isDarkMode
              ? readerThemes[settings.reader_theme]?.dark?.background
              : readerThemes[settings.reader_theme]?.light?.background)
              || readerThemes.darkComfort.dark.background,
            color: (isDarkMode
              ? readerThemes[settings.reader_theme]?.dark?.text
              : readerThemes[settings.reader_theme]?.light?.text)
              || readerThemes.darkComfort.dark.text,
            boxShadow: `0 1px 3px ${(isDarkMode
              ? readerThemes[settings.reader_theme]?.dark?.shadow
              : readerThemes[settings.reader_theme]?.light?.shadow)
              || readerThemes.darkComfort.dark.shadow}`,
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
          <div className="text-xs text-gray-400 dark:text-cream-400 text-center mt-1">
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

          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-cream-300">
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
        bookLanguage={book.language}
        onNavigateToPage={goToOriginalPage}
        preloadedData={preloadedData}
        isGrammarMode={isGrammarMode}
      />

      {/* Floating Progress Panel for Pre-Study Notes */}
      <FloatingProgressPanel
        progress={notesProgress}
        isVisible={isGeneratingNotes}
        onCancel={handleCancelPreStudyNotes}
      />

      {/* Theme Context Menu */}
      {showThemeMenu && (
        <ThemeContextMenu
          x={themeMenuPosition.x}
          y={themeMenuPosition.y}
          currentTheme={settings.reader_theme}
          onThemeSelect={handleThemeSelect}
          onClose={() => setShowThemeMenu(false)}
        />
      )}
    </div>
  );
};

export default DynamicReaderView;
