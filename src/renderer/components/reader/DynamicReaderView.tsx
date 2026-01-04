import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../../context/BookContext';
import { useDeferredWords } from '../../context/DeferredWordContext';
import { useSettings } from '../../context/SettingsContext';
import { useFocusMode } from '../../context/FocusModeContext';
import { useTextReflow } from '../../hooks/useTextReflow';
import { ZOOM_LEVELS, REFLOW_SETTINGS } from '../../../shared/constants';
import type { Book, BookData, ReadingProgress, MangaPage } from '../../../shared/types';
import type { CachedWordData } from '../../../shared/types/deferred-word.types';
import type { PreStudyProgress } from '../../../shared/types/pre-study-notes.types';
import type { GrammarAnalysis } from '../../../shared/types/grammar.types';
import type { OCREngine } from '../../../shared/types/settings.types';
import { calculateMiddleIndex, isWithinAdjacency } from '../../../shared/types/deferred-word.types';
import { generateSimplerCacheKey } from '../../../shared/types/simpler-analysis.types';
import { cleanWord, createWordBoundaryRegex } from '../../../shared/utils/text-utils';
import WordPanel from '../word-panel/WordPanel';
import PreStudyNotesButton from './PreStudyNotesButton';
import { FocusModeButton } from './FocusModeButton';
import FocusModeHeader from './FocusModeHeader';
import { FloatingProgressPanel } from './FloatingProgressPanel';
import { ThemeContextMenu } from './ThemeContextMenu';
import { ClearSelectionsMenu } from './ClearSelectionsMenu';
import { RemoveWordMenu } from './RemoveWordMenu';
import { OCREngineSelector } from '../OCREngineSelector';
import { OCRInstallPrompt } from './OCRInstallPrompt';
import InlineEditablePageNumber from './InlineEditablePageNumber';
import { MangaImageView } from './MangaImageView';
import { readerThemes } from '../../config/readerThemes';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha, getContrastColor } from '../../utils/colorUtils';
import simplerCache from '../../services/deferredSimplerContext';

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
  const { updateProgress, clearReadingSession } = useBooks();
  const { queueWord, isWordReady, getWordData, getWordStatus, fetchingCount, pendingCount, removeWord } = useDeferredWords();
  const { settings, updateSetting } = useSettings();
  const { isFocusMode, setIsFocusMode } = useFocusMode();
  const theme = useReaderTheme();
  const accentTextColor = getContrastColor(theme.accent);
  const hoverFill = theme.wordHover || addAlpha(theme.panel, 0.5);
  const readerScrollbarStyles = {
    '--reader-scrollbar-track': theme.panel,
    '--reader-scrollbar-thumb': theme.panelBorder,
    '--reader-scrollbar-thumb-hover': theme.accent,
  } as React.CSSProperties;
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine if system is in dark mode
  const isDarkMode = useMemo(() => {
    if (settings.theme === 'dark') return true;
    if (settings.theme === 'light') return false;
    // 'system' - check OS preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [settings.theme]);

  const [zoom, setZoom] = useState(initialProgress?.zoom_level || ZOOM_LEVELS.DEFAULT);
  const [ocrSelectionMode, setOcrSelectionMode] = useState(false);
  const [showOcrInstallPrompt, setShowOcrInstallPrompt] = useState(false);
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

  // Grammar analysis cache - stores background analysis results
  const [grammarCache, setGrammarCache] = useState<Map<string, GrammarAnalysis>>(new Map());

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Grammar perspective mode state - loaded from settings
  const isGrammarMode = settings.is_grammar_mode;
  const isMeaningMode = settings.is_meaning_mode;
  const isSimplerMode = settings.is_simpler_mode;

  // Track words that have been looked up before (across all pages in this book)
  // Used to show gray dots for known words that haven't been fetched for current page
  const [knownWords, setKnownWords] = useState<Set<string>>(new Set());

  // Manga translation status tracking
  const [mangaRegionStatus, setMangaRegionStatus] = useState<Map<number, 'loading' | 'ready'>>(new Map());
  const [hasMangaSelections, setHasMangaSelections] = useState(false);
  const clearMangaSelectionsRef = useRef<(() => void) | null>(null);

  // Pre-study notes state
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [notesProgress, setNotesProgress] = useState<PreStudyProgress | null>(null);
  const [, setSimplerCacheVersion] = useState(0);

  // Theme context menu state
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [themeMenuPosition, setThemeMenuPosition] = useState({ x: 0, y: 0 });

  // Clear selections context menu state
  const [showClearMenu, setShowClearMenu] = useState(false);
  const [clearMenuPosition, setClearMenuPosition] = useState({ x: 0, y: 0 });

  // Individual word/phrase removal menu state
  const [showRemoveWordMenu, setShowRemoveWordMenu] = useState(false);
  const [removeWordMenuPosition, setRemoveWordMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);

  // OCR Engine selection context menu state
  const [showOCREngineMenu, setShowOCREngineMenu] = useState(false);
  const [ocrEngineMenuPosition, setOCREngineMenuPosition] = useState({ x: 0, y: 0 });
  const [currentOCREngine, setCurrentOCREngine] = useState<OCREngine>('paddleocr'); // Default to PaddleOCR (recommended)
  const ocrEngineMenuRef = useRef<HTMLDivElement>(null);

  // Focus Mode state - isFocusMode now from context
  const [showFocusNavigation, setShowFocusNavigation] = useState(false);
  const [showFocusExit, setShowFocusExit] = useState(false);

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
  const simplerPrefetchInFlightRef = useRef<Set<string>>(new Set());

  // Use the text reflow hook
  const {
    state: reflowState,
    goToNextPage,
    goToPrevPage,
    goToPageIndex,
    goToOriginalPage,
    reflowPages,
  } = useTextReflow({
    bookData,
    containerRef,
    zoom,
    initialCharacterOffset: initialProgress?.character_offset || 0,
    initialProgressPercentage: initialProgress?.progress_percentage,
  });

  const handleExitReading = useCallback(() => {
    clearReadingSession();
    navigate('/library');
  }, [clearReadingSession, navigate]);

  const handleViewChange = useCallback((viewIndex: number) => {
    goToPageIndex(viewIndex - 1);
  }, [goToPageIndex]);

  const handleMangaTranslationStatusChange = useCallback((regionIndex: number, status: 'loading' | 'ready') => {
    setMangaRegionStatus(prev => {
      const newMap = new Map(prev);
      newMap.set(regionIndex, status);
      return newMap;
    });
  }, []);

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

  useEffect(() => {
    if (bookData.type !== 'manga' && ocrSelectionMode) {
      setOcrSelectionMode(false);
    }
  }, [bookData.type, ocrSelectionMode]);

  // Set CSS custom properties for theme colors (for use in CSS animations and global styles)
  useEffect(() => {
    const root = document.documentElement;

    // Helper function to convert hex to RGB
    const hexToRgb = (hex: string): string => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return '0, 0, 0';
      return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    };

    // Set CSS variables for current theme
    root.style.setProperty('--theme-accent', theme.accent);
    root.style.setProperty('--theme-accent-rgb', hexToRgb(theme.accent));
    root.style.setProperty('--theme-accent-contrast', accentTextColor);
    root.style.setProperty('--theme-panel', theme.panel);
    root.style.setProperty('--theme-panel-rgb', hexToRgb(theme.panel));
    root.style.setProperty('--theme-text', theme.text);
    root.style.setProperty('--theme-text-secondary', theme.textSecondary);
    root.style.setProperty('--theme-background', theme.background);
    root.style.setProperty('--theme-border', theme.border);
    root.style.setProperty('--theme-panel-border', theme.panelBorder);
    root.style.setProperty('--theme-word-hover-bg', theme.wordHover);
    root.style.setProperty('--theme-word-hover-underline', theme.accent);
  }, [theme]);

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

  // Close OCR Engine menu on click outside or Escape key
  useEffect(() => {
    if (!showOCREngineMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ocrEngineMenuRef.current && !ocrEngineMenuRef.current.contains(event.target as Node)) {
        setShowOCREngineMenu(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowOCREngineMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showOCREngineMenu]);

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

  const prefetchSimplerAnalysis = useCallback(async (word: string, sentence: string) => {
    if (!isSimplerMode || !reflowState.currentText) return;
    if (!word || !sentence) return;

    if (simplerCache.get(book.id, word, sentence)) {
      return;
    }

    const key = generateSimplerCacheKey(book.id, word, sentence);
    if (simplerPrefetchInFlightRef.current.has(key)) {
      return;
    }

    simplerPrefetchInFlightRef.current.add(key);
    try {
      const response = await window.electronAPI?.ai.getSimplerAnalysis(
        word,
        sentence,
        reflowState.currentText,
        book.language
      );

      if (response?.success && response.analysis) {
        simplerCache.set(book.id, word, sentence, response.analysis);
        setSimplerCacheVersion(prev => prev + 1);
      }
    } finally {
      simplerPrefetchInFlightRef.current.delete(key);
    }
  }, [isSimplerMode, reflowState.currentText, book.id, book.language, setSimplerCacheVersion]);

  // Prefetch simpler analysis when ready data exists so red dots imply Simpler availability
  useEffect(() => {
    if (!isSimplerMode || !reflowState.currentText) return;

    wordSentences.forEach((sentence, index) => {
      const word = wordIndexMapRef.current.get(index);
      if (!word || !sentence) return;
      if (isWordReady(word, sentence, book.id)) {
        void prefetchSimplerAnalysis(word, sentence);
      }
    });

    phraseRanges.forEach((range, phrase) => {
      if (range.status !== 'ready') return;
      const phraseSentence = extractSentenceFromCurrentView(phrase);
      if (!phraseSentence) return;
      void prefetchSimplerAnalysis(phrase, phraseSentence);
    });
  }, [
    isSimplerMode,
    reflowState.currentText,
    wordSentences,
    phraseRanges,
    isWordReady,
    book.id,
    extractSentenceFromCurrentView,
    prefetchSimplerAnalysis
  ]);

  // Build phrase from selected indices
  const buildPhraseFromIndices = useCallback((indices: number[]): string => {
    const sorted = [...indices].sort((a, b) => a - b);
    const words = sorted.map(idx => wordIndexMapRef.current.get(idx) || '');
    return words.filter(Boolean).join(' ');
  }, []);

  // Find which phrase (if any) contains the given word index
  const findPhraseByWordIndex = useCallback((wordIndex: number): string | null => {
    for (const [phraseString, range] of phraseRanges) {
      if (range.indices.includes(wordIndex)) {
        return phraseString;
      }
    }
    return null;
  }, [phraseRanges]);

  // Trigger background grammar analysis (like vocabulary mode)
  const analyzeGrammarInBackground = useCallback(async (phrase: string, sentence: string) => {
    console.log('[GRAMMAR DEBUG] Starting background analysis for:', phrase);

    try {
      // Call AI grammar analysis API
      const result = await window.electronAPI?.ai.getGrammarAnalysis(
        phrase,
        sentence,
        book.language
      );

      if (result?.success) {
        console.log('[GRAMMAR DEBUG] Analysis successful, caching result for:', phrase);

        // Cache the grammar analysis result
        setGrammarCache(prev => {
          const newCache = new Map(prev);
          newCache.set(phrase, {
            partsOfSpeech: result.partsOfSpeech || [],
            structure: result.structure || { type: 'Unknown', description: '' },
            ruleExplanation: result.ruleExplanation || '',
            contextAnalysis: result.contextAnalysis || '',
            pattern: result.pattern || '',
            examples: result.examples || [],
            commonMistakes: result.commonMistakes || [],
            practiceTask: result.practiceTask || { instruction: '', template: '' },
          });
          return newCache;
        });

        // Update phrase range status to 'ready' (yellow dot → red dot)
        setPhraseRanges(prev => {
          const newMap = new Map(prev);
          const range = newMap.get(phrase);
          if (range && range.status === 'loading') {
            newMap.set(phrase, { ...range, status: 'ready' });
            console.log('[GRAMMAR DEBUG] Updated phrase status to ready:', phrase);
          }
          return newMap;
        });
      } else {
        console.error('[GRAMMAR DEBUG] Analysis failed:', result?.error);
      }
    } catch (error) {
      console.error('[GRAMMAR DEBUG] Error analyzing grammar:', error);
    }
  }, [book.language]);

  // Finalize phrase selection and trigger AI lookup
  const finalizePhrase = useCallback(() => {
    if (selectedIndices.length <= 1) {
      // Single word or empty - clear selection
      setSelectedIndices([]);
      return;
    }

    const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
    const wordOnlyIndices = sortedIndices.filter(index => {
      const word = wordIndexMapRef.current.get(index);
      return word && word.trim().length > 0;
    });

    if (wordOnlyIndices.length <= 1) {
      setSelectedIndices([]);
      return;
    }

    const phrase = buildPhraseFromIndices(wordOnlyIndices);
    const middleIndex = calculateMiddleIndex(wordOnlyIndices);
    const fullSentence = extractSentenceFromCurrentView(phrase);

    // Grammar mode: create phrase range with loading state, don't open panel yet
    if (isGrammarMode) {
      // Create phrase range with 'loading' status (yellow dot should appear)
      setPhraseRanges(prev => {
        const newMap = new Map(prev);
        newMap.set(phrase, {
          indices: wordOnlyIndices,
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

      // Trigger background grammar analysis (yellow dot → red dot when complete)
      analyzeGrammarInBackground(phrase, fullSentence);

      // Note: Panel will open when user clicks on any word in the phrase (handled by handleWordClick)
    } else {
      // Vocabulary mode: existing background fetch logic
      const isPhraseReady = isWordReady(phrase, fullSentence, book.id);

      if (isPhraseReady) {
        // Phrase is ready - open panel with cached data
        setSelectedWord({
          word: phrase,
          sentence: fullSentence,
          pageNumber: reflowState.originalPage,
          isPhrase: true,
          wordIndices: wordOnlyIndices,
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
          indices: wordOnlyIndices,
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
    }

    // Clear selection
    setSelectedIndices([]);
  }, [
    selectedIndices,
    buildPhraseFromIndices,
    extractSentenceFromCurrentView,
    reflowState.originalPage,
    book.id,
    isGrammarMode,
    isWordReady,
    getWordData,
    queueWord,
    analyzeGrammarInBackground
  ]);

  // Handle context menu for theme selection
  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const containerWidth = rect.width;

    // Detect word clicks
    const target = event.target as HTMLElement;
    const isWordElement = target.classList.contains('word-clickable') ||
                          target.closest('.word-clickable') !== null;

    if (isWordElement) {
      event.preventDefault();

      // Get the clicked word element
      const wordElement = target.classList.contains('word-clickable')
        ? target
        : target.closest('.word-clickable');

      if (wordElement) {
        const wordIndexStr = wordElement.getAttribute('data-word-index');
        const wordIndex = wordIndexStr ? parseInt(wordIndexStr, 10) : -1;

        if (wordIndex >= 0) {
          // Check if this word has a selection (phrase, loading, or ready)
          const phraseString = findPhraseByWordIndex(wordIndex);
          const isLoading = loadingPositions.has(wordIndex);
          const word = wordIndexMapRef.current.get(wordIndex);
          const sentence = wordSentences.get(wordIndex)
            || wordSentenceMapRef.current.get(wordIndex)
            || (word ? extractSentenceFromCurrentView(word) : '');
          const isReady = word && sentence ? isWordReady(word, sentence, book.id) : false;

          if (phraseString || isLoading || isReady) {
            // Show remove menu for this word
            setSelectedWordIndex(wordIndex);
            setRemoveWordMenuPosition({ x: event.clientX, y: event.clientY });
            setShowRemoveWordMenu(true);
            setShowThemeMenu(false);
            setShowClearMenu(false);
          }
        }
      }
      return;
    }

    // Empty space clicked - show appropriate menu
    event.preventDefault();

    if (clickX <= containerWidth * 0.4) {
      // LEFT 40% - Theme menu
      setThemeMenuPosition({ x: event.clientX, y: event.clientY });
      setShowThemeMenu(true);
      setShowClearMenu(false);
      setShowRemoveWordMenu(false);
    } else {
      // RIGHT 60% - Clear selections menu
      setClearMenuPosition({ x: event.clientX, y: event.clientY });
      setShowClearMenu(true);
      setShowThemeMenu(false);
      setShowRemoveWordMenu(false);
    }
  }, [findPhraseByWordIndex, loadingPositions, wordSentences, extractSentenceFromCurrentView, isWordReady, book.id]);

  // Handle theme selection
  const handleThemeSelect = useCallback(async (themeId: string) => {
    try {
      await updateSetting('reader_theme', themeId);
    } catch (error) {
      console.error('Failed to update reader theme:', error);
    }
  }, [updateSetting]);

  // Handle manga context menu
  const handleMangaContextMenu = useCallback((event: React.MouseEvent, clickedOnRegion: boolean) => {
    event.preventDefault();

    if (clickedOnRegion) {
      // TODO: Could show remove word menu for manga OCR regions in future
      // For now, just ignore clicks on regions
      return;
    }

    // Empty space clicked - show clear selections menu
    setClearMenuPosition({ x: event.clientX, y: event.clientY });
    setShowClearMenu(true);
    setShowThemeMenu(false);
    setShowRemoveWordMenu(false);
  }, []);

  // Handle clearing all selections for current page
  const handleClearSelections = useCallback(() => {
    console.log('[CLEAR] Clearing all selections for current page');

    // For manga mode, clear manga selections via ref
    if (bookData.type === 'manga' && clearMangaSelectionsRef.current) {
      clearMangaSelectionsRef.current();
    }

    // Core selection state (for text mode)
    setSelectedIndices([]);
    setPhraseRanges(new Map());

    // Remove from persisted page data
    const currentPage = reflowState.currentPageIndex;
    phraseRangesByPageRef.current.delete(currentPage);
    loadingDataByPageRef.current.delete(currentPage);

    // Loading state
    setLoadingPositions(new Set());
    loadingWordsMapRef.current.clear();
    wordSentenceMapRef.current.clear();

    // Panel state
    setIsPanelOpen(false);
    setPreloadedData(null);

    // Drag state cleanup
    setIsDragging(false);
    setDragStartIndex(null);
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
      dragTimeoutRef.current = null;
    }

    // Word mapping cleanup
    wordIndexMapRef.current.clear();

    console.log('[CLEAR] Selections cleared successfully');
  }, [bookData.type, reflowState.currentPageIndex]);

  // Remove a specific word/phrase selection
  const handleRemoveWordSelection = useCallback((wordIndex: number) => {
    console.log('[REMOVE WORD] Removing selection for word index:', wordIndex);

    // Check if this word is part of a phrase
    const phraseString = findPhraseByWordIndex(wordIndex);
    const sentenceForIndex = wordSentences.get(wordIndex) || wordSentenceMapRef.current.get(wordIndex);
    const phraseRange = phraseString ? phraseRangesRef.current.get(phraseString) : null;

    if (phraseString) {
      const phraseSentence = sentenceForIndex || extractSentenceFromCurrentView(phraseString);
      if (phraseSentence) {
        removeWord(phraseString, phraseSentence, book.id);
      }

      // Remove phrase from phraseRanges
      setPhraseRanges(prev => {
        const newMap = new Map(prev);
        const phraseRange = newMap.get(phraseString);

        // Also clear loading positions for this phrase's indices
        if (phraseRange) {
          setLoadingPositions(prevLoading => {
            const newSet = new Set(prevLoading);
            phraseRange.indices.forEach(idx => newSet.delete(idx));
            return newSet;
          });

          // Clear from loading maps
          phraseRange.indices.forEach(idx => {
            loadingWordsMapRef.current.delete(idx);
            wordSentenceMapRef.current.delete(idx);
          });
        }

        newMap.delete(phraseString);
        return newMap;
      });

      // Update persisted page data
      const currentPage = reflowState.currentPageIndex;
      const persistedRanges = phraseRangesByPageRef.current.get(currentPage);
      if (persistedRanges) {
        persistedRanges.delete(phraseString);
        if (persistedRanges.size === 0) {
          phraseRangesByPageRef.current.delete(currentPage);
        }
      }

      console.log('[REMOVE WORD] Removed phrase:', phraseString);
      if (phraseRange) {
        setKnownWords(prev => {
          let hasChanges = false;
          const newSet = new Set(prev);
          phraseRange.indices.forEach(idx => {
            const phraseWord = wordIndexMapRef.current.get(idx);
            if (phraseWord && newSet.delete(phraseWord)) {
              hasChanges = true;
            }
          });
          return hasChanges ? newSet : prev;
        });
      }
    } else {
      const word = wordIndexMapRef.current.get(wordIndex);
      const sentence = sentenceForIndex || (word ? extractSentenceFromCurrentView(word) : '');
      if (word && sentence) {
        removeWord(word, sentence, book.id);
      }

      // Remove single word from loading positions
      setLoadingPositions(prev => {
        const newSet = new Set(prev);
        newSet.delete(wordIndex);
        return newSet;
      });

      loadingWordsMapRef.current.delete(wordIndex);
      wordSentenceMapRef.current.delete(wordIndex);

      console.log('[REMOVE WORD] Removed single word at index:', wordIndex);
      if (word) {
        setKnownWords(prev => {
          if (!prev.has(word)) {
            return prev;
          }
          const newSet = new Set(prev);
          newSet.delete(word);
          return newSet;
        });
      }
    }

    // Close panel if it's showing this word/phrase
    if (isPanelOpen) {
      const word = wordIndexMapRef.current.get(wordIndex);
      if (word && selectedWord?.word === word) {
        setIsPanelOpen(false);
        setPreloadedData(null);
      }
    }
  }, [findPhraseByWordIndex, wordSentences, extractSentenceFromCurrentView, removeWord, book.id, reflowState.currentPageIndex, isPanelOpen, selectedWord]);

  // Check if current page has any selections
  const hasSelectionsOnPage = useCallback((): boolean => {
    // For text mode, check text selections
    if (bookData.type !== 'manga') {
      return selectedIndices.length > 0 ||
             phraseRanges.size > 0 ||
             loadingPositions.size > 0;
    }
    // For manga mode, check manga selections
    return hasMangaSelections;
  }, [bookData.type, selectedIndices, phraseRanges, loadingPositions, hasMangaSelections]);

  // Handle word click with deferred lookup behavior and phrase selection
  const handleWordClick = useCallback((
    word: string,
    wordIndex: number,
    event?: React.MouseEvent,
    sentenceOverride?: string
  ) => {
    const cleanedWord = cleanWord(word);

    // Store word in map for phrase construction
    if (wordIndex >= 0) {
      wordIndexMapRef.current.set(wordIndex, cleanedWord);
    }

    // Handle Shift+click for phrase selection
    if (event?.shiftKey) {
      // PREVENT browser's native text selection when Shift is held
      event.preventDefault();

      setSelectedIndices(prev => {
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
      // Accept phrase if:
      // - Word is part of the phrase range AND
      // - Status is 'ready' (vocabulary mode with cached data) OR
      // - Status is 'loading' AND grammar mode is active (immediate panel opening)
      const acceptPhrase = range.indices.includes(wordIndex) && (
        range.status === 'ready' ||
        (isGrammarMode && range.status === 'loading')
      );

      if (acceptPhrase) {
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
        return;
      }
    }

    // Normal click - clear any phrase selection first
    if (selectedIndices.length > 0) {
      setSelectedIndices([]);
    }

    const fullSentence = sentenceOverride || extractSentenceFromCurrentView(word);

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
  }, [
    extractSentenceFromCurrentView,
    reflowState.originalPage,
    book.id,
    book.language,
    isWordReady,
    getWordData,
    getWordStatus,
    queueWord,
    selectedIndices,
    phraseRanges,
    isGrammarMode
  ]);

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        if (bookData.type === 'manga') {
          e.preventDefault();
          setOcrSelectionMode(prev => !prev);
        }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goToNextPage();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key === 'Escape') {
        if (ocrSelectionMode) {
          setOcrSelectionMode(false);
        } else if (isPanelOpen) {
          setIsPanelOpen(false);
        } else if (isFocusMode) {
          setIsFocusMode(false);
        }
        setSelectedIndices([]);
        setIsShiftHeld(false);
        updateSetting('is_grammar_mode', false); // Also exit grammar mode on Escape
        updateSetting('is_meaning_mode', false); // Also exit meaning mode on Escape
        updateSetting('is_simpler_mode', false); // Also exit simpler mode on Escape
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
  }, [bookData.type, goToNextPage, goToPrevPage, selectedIndices, finalizePhrase, extractSentenceFromCurrentView, reflowState.originalPage, book.id, isWordReady, getWordData, getWordStatus, queueWord, isPanelOpen, isFocusMode, ocrSelectionMode]);

  // Global mouseup listener for drag selection cleanup
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        const mockEvent = {
          preventDefault: () => {
            // Mock preventDefault for cleanup
          }
        } as React.MouseEvent;
        handleWordMouseUp(mockEvent);
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

  // Update phrase status to 'ready' after grammar analysis completes
  // This makes the yellow dot turn red when the grammar panel closes
  useEffect(() => {
    if (!isPanelOpen && selectedWord && isGrammarMode) {
      setPhraseRanges(prev => {
        const newMap = new Map(prev);
        let hasChanges = false;

        for (const [phrase, range] of newMap.entries()) {
          if (phrase === selectedWord.word && range.status === 'loading') {
            newMap.set(phrase, { ...range, status: 'ready' });
            hasChanges = true;
          }
        }

        return hasChanges ? newMap : prev;
      });
    }
  }, [isPanelOpen, selectedWord, isGrammarMode]);

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
  const extractNextViewsText = useCallback((viewCount = 10): string => {
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
  const getPhraseInfoForIndex = useCallback((index: number): {
    isInPhrase: boolean;
    isMiddle: boolean;
    status: 'loading' | 'ready' | null;
    phrase: string | null;
  } => {
    for (const [, range] of phraseRanges) {
      if (range.indices.includes(index)) {
        const isMiddle = index === range.middleIndex;
        return {
          isInPhrase: true,
          isMiddle,
          status: range.status,
          phrase: range.phrase,
        };
      }
    }
    return { isInPhrase: false, isMiddle: false, status: null, phrase: null };
  }, [phraseRanges]);

  // Render text with clickable words and ready indicators
  const renderText = (text: string) => {
    if (!text) {
      return <span className="italic" style={{ color: theme.textSecondary }}>Empty page</span>;
    }

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
          if (isSimplerMode) {
            const phraseSentence = phraseInfo.phrase
              ? extractSentenceFromCurrentView(phraseInfo.phrase)
              : '';
            const simplerReady = phraseInfo.phrase && phraseSentence
              ? simplerCache.get(book.id, phraseInfo.phrase, phraseSentence)
              : null;
            showRedDot = Boolean(simplerReady);
            showYellowDot = !simplerReady && phraseInfo.status !== null;
          } else {
            showRedDot = phraseInfo.status === 'ready';
            showYellowDot = phraseInfo.status === 'loading';
          }
        }
      } else {
        // Single word behavior - three-dot system
        if (isSimplerMode) {
          const simplerReady = wordSentence
            ? simplerCache.get(book.id, cleanedWord, wordSentence)
            : null;
          if (simplerReady) {
            showRedDot = true;
          } else if (wordIsReady || isLoading) {
            showYellowDot = true;
          } else if (isKnownWord) {
            showGrayDot = true;
          }
        } else {
          if (wordIsReady) {
            showRedDot = true;
          } else if (isLoading) {
            showYellowDot = true;
          } else if (isKnownWord) {
            showGrayDot = true; // Word was looked up before, but not for this sentence context
          }
        }
      }

      // Word - make it clickable with optional ready/loading/known indicator
      return (
        <span
          key={index}
          data-word-index={index}
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

  // Calculate font size - scale up in Focus Mode to fill available space
  const calculateFocusModeFont = useCallback(() => {
    if (!isFocusMode || !containerRef.current) {
      return REFLOW_SETTINGS.BASE_FONT_SIZE * zoom;
    }

    // In focus mode, scale font size to utilize extra screen space
    // while maintaining the same word count
    const baseFontSize = REFLOW_SETTINGS.BASE_FONT_SIZE * zoom;

    // Estimate scale factor based on available vertical space
    // Normal mode has top bar (~50px) + bottom bar (~80px) = ~130px overhead
    // Focus mode has minimal padding (~40px total)
    // This gives us ~90px more vertical space to work with

    // Scale font proportionally (approximately 1.3-1.5x larger)
    const scaleFactor = 1.35;

    return baseFontSize * scaleFactor;
  }, [isFocusMode, zoom]);

  const fontSize = calculateFocusModeFont();
  const progressPercent = reflowState.totalPages > 0
    ? ((reflowState.currentPageIndex + 1) / reflowState.totalPages) * 100
    : 0;

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: theme.background, color: theme.text }}>
      {/* Top bar - Hidden in Focus Mode */}
      {!isFocusMode && (
      <div
        className="border-b px-4 py-2 flex items-center justify-between"
        style={{ backgroundColor: theme.panel, borderBottomColor: theme.panelBorder }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={handleExitReading}
            className="transition-colors"
            style={{ color: theme.textSecondary }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = theme.text;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = theme.textSecondary;
            }}
          >
            ← Back
          </button>
          <div className="text-sm max-w-md truncate" style={{ color: theme.text }}>
            {book.title}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Chapter selector */}
          {chapters.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowChapterMenu(!showChapterMenu)}
                className="text-sm flex items-center gap-1 px-2 py-1 rounded transition-colors"
                style={{ color: theme.textSecondary }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.color = theme.text;
                  event.currentTarget.style.backgroundColor = hoverFill;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.color = theme.textSecondary;
                  event.currentTarget.style.backgroundColor = 'transparent';
                }}
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
                  <div
                    className="absolute right-0 top-full mt-1 border rounded-lg shadow-lg z-20 max-h-80 overflow-auto min-w-64"
                    style={{ backgroundColor: theme.panel, borderColor: theme.panelBorder }}
                  >
                    {chapters.map((chapter, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          goToOriginalPage(chapter.startPage);
                          setShowChapterMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm transition-colors"
                        style={{
                          backgroundColor: reflowState.chapterName === chapter.name
                            ? addAlpha(theme.accent, 0.15)
                            : 'transparent',
                          color: reflowState.chapterName === chapter.name ? theme.accent : theme.text,
                        }}
                        onMouseEnter={(event) => {
                          if (reflowState.chapterName !== chapter.name) {
                            event.currentTarget.style.backgroundColor = hoverFill;
                          }
                        }}
                        onMouseLeave={(event) => {
                          if (reflowState.chapterName !== chapter.name) {
                            event.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <div className="truncate">{chapter.name}</div>
                        <div className="text-xs" style={{ color: theme.textSecondary }}>
                          Page {chapter.startPage}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Original page indicator */}
          <span className="text-xs" style={{ color: theme.textSecondary }}>
            Book page: {reflowState.originalPage}
          </span>

          {/* Grammar mode toggle button */}
          <button
            onClick={() => {
              const newValue = !isGrammarMode;
              updateSetting('is_grammar_mode', newValue);
              // Grammar mode is mutually exclusive with meaning mode
              if (newValue) {
                updateSetting('is_meaning_mode', false);
                updateSetting('is_simpler_mode', false);
              }
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
            style={{
              backgroundColor: isGrammarMode ? theme.accent : theme.panelBorder,
              color: isGrammarMode ? accentTextColor : theme.textSecondary,
              boxShadow: isGrammarMode ? `0 8px 16px ${addAlpha(theme.accent, 0.25)}` : 'none',
              border: isGrammarMode ? `1px solid ${addAlpha(theme.accent, 0.6)}` : `1px solid ${theme.border}`,
            }}
            onMouseEnter={(event) => {
              if (!isGrammarMode) {
                event.currentTarget.style.backgroundColor = hoverFill;
              }
            }}
            onMouseLeave={(event) => {
              if (!isGrammarMode) {
                event.currentTarget.style.backgroundColor = theme.panelBorder;
              }
            }}
            title={isGrammarMode ? 'Grammar Mode ON - Click to disable' : 'Enable Grammar Mode'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
            </svg>
          </button>

          {/* Meaning mode toggle button */}
          <button
            onClick={() => {
              const newValue = !isMeaningMode;
              updateSetting('is_meaning_mode', newValue);
              // Meaning mode is mutually exclusive with grammar mode
              if (newValue) {
                updateSetting('is_grammar_mode', false);
                updateSetting('is_simpler_mode', false);
              }
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
            style={{
              backgroundColor: isMeaningMode ? theme.accent : theme.panelBorder,
              color: isMeaningMode ? accentTextColor : theme.textSecondary,
              boxShadow: isMeaningMode ? `0 8px 16px ${addAlpha(theme.accent, 0.25)}` : 'none',
              border: isMeaningMode ? `1px solid ${addAlpha(theme.accent, 0.6)}` : `1px solid ${theme.border}`,
            }}
            onMouseEnter={(event) => {
              if (!isMeaningMode) {
                event.currentTarget.style.backgroundColor = hoverFill;
              }
            }}
            onMouseLeave={(event) => {
              if (!isMeaningMode) {
                event.currentTarget.style.backgroundColor = theme.panelBorder;
              }
            }}
            title={isMeaningMode ? 'Meaning Mode ON - Click to disable' : 'Enable Meaning Mode'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
              <path d="M12 2.25a.75.75 0 01.75.75v18a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75z" />
            </svg>
          </button>

          {/* Simpler mode toggle button */}
          <button
            onClick={() => {
              const newValue = !isSimplerMode;
              updateSetting('is_simpler_mode', newValue);
              // Simpler mode is mutually exclusive with grammar and meaning modes
              if (newValue) {
                updateSetting('is_grammar_mode', false);
                updateSetting('is_meaning_mode', false);
              }
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
            style={{
              backgroundColor: isSimplerMode ? theme.accent : theme.panelBorder,
              color: isSimplerMode ? accentTextColor : theme.textSecondary,
              boxShadow: isSimplerMode ? `0 8px 16px ${addAlpha(theme.accent, 0.25)}` : 'none',
              border: isSimplerMode ? `1px solid ${addAlpha(theme.accent, 0.6)}` : `1px solid ${theme.border}`,
            }}
            onMouseEnter={(event) => {
              if (!isSimplerMode) {
                event.currentTarget.style.backgroundColor = hoverFill;
              }
            }}
            onMouseLeave={(event) => {
              if (!isSimplerMode) {
                event.currentTarget.style.backgroundColor = theme.panelBorder;
              }
            }}
            title={isSimplerMode ? 'Simpler Mode ON - Click to disable' : 'Enable Simpler Mode'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
            </svg>
          </button>

          {bookData.type === 'manga' && (
            <button
              onClick={async () => {
                // Check if OCR is installed before activating selection mode
                try {
                  const res = await fetch('http://127.0.0.1:8766/api/ocr/engines');
                  const data = await res.json();
                  const paddleOcr = data.engines?.find((e: { engine: string; installed: boolean }) => e.engine === 'paddleocr');

                  if (paddleOcr?.installed) {
                    // OCR is installed, toggle selection mode
                    setOcrSelectionMode(prev => !prev);
                  } else {
                    // OCR not installed, show installation prompt
                    setShowOcrInstallPrompt(true);
                  }
                } catch (err) {
                  console.error('Failed to check OCR installation status:', err);
                  // Fallback: show installation prompt
                  setShowOcrInstallPrompt(true);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setOCREngineMenuPosition({ x: e.clientX, y: e.clientY });
                setShowOCREngineMenu(true);
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
              style={{
                backgroundColor: ocrSelectionMode ? theme.accent : theme.panelBorder,
                color: ocrSelectionMode ? accentTextColor : theme.textSecondary,
                boxShadow: ocrSelectionMode ? `0 8px 16px ${addAlpha(theme.accent, 0.25)}` : 'none',
                border: ocrSelectionMode ? `1px solid ${addAlpha(theme.accent, 0.6)}` : `1px solid ${theme.border}`,
              }}
              onMouseEnter={(event) => {
                if (!ocrSelectionMode) {
                  event.currentTarget.style.backgroundColor = hoverFill;
                }
              }}
              onMouseLeave={(event) => {
                if (!ocrSelectionMode) {
                  event.currentTarget.style.backgroundColor = theme.panelBorder;
                }
              }}
              title={ocrSelectionMode ? 'Exit OCR Selection Mode (Ctrl+O)\nRight-click to change OCR engine' : 'OCR Selection Mode (Ctrl+O)\nRight-click to change OCR engine'}
              aria-pressed={ocrSelectionMode}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
              </svg>
            </button>
          )}

          {/* Queue indicator - always reserve space to prevent layout shift */}
          <span
            className="text-xs flex items-center gap-1 px-2 py-1 rounded min-w-[90px]"
            style={{
              color: (fetchingCount + pendingCount) > 0 ? theme.accent : 'transparent',
              backgroundColor: (fetchingCount + pendingCount) > 0 ? addAlpha(theme.accent, 0.15) : 'transparent',
              visibility: (fetchingCount + pendingCount) > 0 ? 'visible' : 'hidden',
            }}
          >
            <span className="relative inline-flex">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: theme.accent }}
              />
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

          {/* Focus Mode button */}
          <FocusModeButton
            onClick={() => setIsFocusMode(!isFocusMode)}
            isFocusMode={isFocusMode}
          />

          {/* Zoom control */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: theme.textSecondary }}>
              Zoom:
            </span>
            <input
              type="range"
              min={ZOOM_LEVELS.MIN}
              max={ZOOM_LEVELS.MAX}
              step={ZOOM_LEVELS.STEP}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-24 h-2 rounded-lg appearance-none cursor-pointer"
              style={{ backgroundColor: theme.panelBorder, accentColor: theme.accent }}
            />
            <span className="text-xs w-10" style={{ color: theme.textSecondary }}>
              {zoom.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>
      )}

      {/* Focus Mode Header - Simplified toggles */}
      {isFocusMode && (
        <FocusModeHeader
          isGrammarMode={isGrammarMode}
          isMeaningMode={isMeaningMode}
          isSimplerMode={isSimplerMode}
          onToggleGrammar={() => {
            const newValue = !isGrammarMode;
            updateSetting('is_grammar_mode', newValue);
            if (newValue) {
              updateSetting('is_meaning_mode', false);
              updateSetting('is_simpler_mode', false);
            }
          }}
          onToggleMeaning={() => {
            const newValue = !isMeaningMode;
            updateSetting('is_meaning_mode', newValue);
            if (newValue) {
              updateSetting('is_grammar_mode', false);
              updateSetting('is_simpler_mode', false);
            }
          }}
          onToggleSimpler={() => {
            const newValue = !isSimplerMode;
            updateSetting('is_simpler_mode', newValue);
            if (newValue) {
              updateSetting('is_grammar_mode', false);
              updateSetting('is_meaning_mode', false);
            }
          }}
        />
      )}

      {/* Reading area - horizontal scroll on outer, vertical scroll inside text box */}
      <div
        className={`flex-1 overflow-x-auto overflow-y-hidden ${isFocusMode ? 'p-0' : 'p-8'} relative`}
      >
        <div
          ref={containerRef}
          className={`h-full ${isFocusMode ? 'w-full' : 'mx-auto w-[768px] min-w-[768px]'} ${isFocusMode ? '' : 'rounded-xl shadow-sm'} p-8 reader-text reader-scrollbar overflow-y-auto transition-all duration-300`}
          onContextMenu={handleContextMenu}
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: REFLOW_SETTINGS.LINE_HEIGHT,
            backgroundColor: (isDarkMode
              ? readerThemes[settings.reader_theme]?.dark?.background
              : readerThemes[settings.reader_theme]?.light?.background)
              || readerThemes.darkComfort.dark.background,
            color: (isDarkMode
              ? readerThemes[settings.reader_theme]?.dark?.text
              : readerThemes[settings.reader_theme]?.light?.text)
              || readerThemes.darkComfort.dark.text,
            boxShadow: isFocusMode ? 'none' : `0 1px 3px ${(isDarkMode
              ? readerThemes[settings.reader_theme]?.dark?.shadow
              : readerThemes[settings.reader_theme]?.light?.shadow)
              || readerThemes.darkComfort.dark.shadow}`,
            ...readerScrollbarStyles,
          }}
        >
          {/* Conditional rendering: manga vs text */}
          {bookData.type === 'manga' ? (
            <MangaImageView
              page={bookData.pages[reflowState.currentPageIndex] as MangaPage}
              zoom={zoom}
              bookId={book.id}
              bookLanguage={book.language}
              ocrSelectionMode={ocrSelectionMode}
              ocrEngine={currentOCREngine}
              onOcrSelectionModeChange={setOcrSelectionMode}
              onZoomChange={setZoom}
              onWordClick={(word, sentence, regionIndex, event) => {
                // Reuse existing word click handler with OCR sentence context.
                handleWordClick(word, regionIndex, event, sentence);
              }}
              onPhraseSelect={(phrase, sentence) => {
                // Handle phrase selection for manga (preserve spaces; queue as phrase).
                const phraseReady = isWordReady(phrase, sentence, book.id);
                console.log('[Manga][PhraseSelect]', {
                  phrase,
                  sentence,
                  phraseReady,
                  bookId: book.id,
                  language: book.language,
                });

                if (!phraseReady) {
                  queueWord(phrase, sentence, book.id, book.language);
                }
              }}
              onPhraseClick={(phrase, sentence, indices) => {
                const phraseReady = isWordReady(phrase, sentence, book.id);
                console.log('[Manga][PhraseClick]', { phrase, sentence, indices, phraseReady, bookId: book.id });

                if (!phraseReady) {
                  queueWord(phrase, sentence, book.id, book.language);
                  return;
                }

                setSelectedWord({
                  word: phrase,
                  sentence,
                  pageNumber: reflowState.originalPage,
                  isPhrase: true,
                  wordIndices: indices,
                });
                setPreloadedData(getWordData(phrase, sentence, book.id));
                setIsPanelOpen(true);
              }}
              knownWords={knownWords}
              isWordReady={isWordReady}
              onTranslationStatusChange={handleMangaTranslationStatusChange}
              onSelectionsChange={setHasMangaSelections}
              clearSelectionsRef={clearMangaSelectionsRef}
              onContextMenu={handleMangaContextMenu}
            />
          ) : (
            renderText(reflowState.currentText)
          )}
        </div>

        {/* Focus Mode - Invisible hover zones on edges */}
        {isFocusMode && (
          <>
            {/* Left edge hover zone */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 w-24 h-48 pointer-events-auto"
              onMouseEnter={() => setShowFocusNavigation(true)}
              onMouseLeave={() => setShowFocusNavigation(false)}
            />
            {/* Right edge hover zone */}
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 w-24 h-48 pointer-events-auto"
              onMouseEnter={() => setShowFocusNavigation(true)}
              onMouseLeave={() => setShowFocusNavigation(false)}
            />
          </>
        )}

        {/* Focus Mode Navigation Arrows - Shown on hover */}
        {isFocusMode && showFocusNavigation && (
          <>
            <button
              onClick={goToPrevPage}
              disabled={reflowState.currentPageIndex <= 0}
              onMouseEnter={() => setShowFocusNavigation(true)}
              onMouseLeave={() => setShowFocusNavigation(false)}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm"
              aria-label="Previous page"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <button
              onClick={goToNextPage}
              disabled={reflowState.currentPageIndex >= reflowState.totalPages - 1}
              onMouseEnter={() => setShowFocusNavigation(true)}
              onMouseLeave={() => setShowFocusNavigation(false)}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm"
              aria-label="Next page"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </>
        )}

        {/* Focus Mode - Invisible hover zone for exit button */}
        {isFocusMode && (
          <div
            className="absolute top-0 right-0 w-24 h-24 pointer-events-auto"
            onMouseEnter={() => setShowFocusExit(true)}
            onMouseLeave={() => setShowFocusExit(false)}
          />
        )}

        {/* Focus Mode Exit Button - Top-right corner */}
        {isFocusMode && showFocusExit && (
          <button
            onClick={() => setIsFocusMode(false)}
            onMouseEnter={() => setShowFocusExit(true)}
            onMouseLeave={() => setShowFocusExit(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-all duration-200 backdrop-blur-sm group"
            aria-label="Exit Focus Mode (ESC)"
            title="Exit Focus Mode (ESC)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
      </div>

      {/* Bottom navigation - Hidden in Focus Mode */}
      {!isFocusMode && (
      <div
        className="border-t px-4 py-3"
        style={{ backgroundColor: theme.panel, borderTopColor: theme.panelBorder }}
      >
        {/* Progress bar */}
        <div className="max-w-3xl mx-auto mb-3">
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: theme.border }}
          >
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${progressPercent}%`, backgroundColor: theme.accent }}
            />
          </div>
          <div className="text-xs text-center mt-1" style={{ color: theme.textSecondary }}>
            View {reflowState.currentPageIndex + 1} of {reflowState.totalPages} • {Math.round(progressPercent)}% complete
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={goToPrevPage}
            disabled={reflowState.currentPageIndex <= 0}
            className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'transparent',
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
            }}
          >
            ← Previous
          </button>

          <div className="flex items-center gap-2 text-sm" style={{ color: theme.textSecondary }}>
            <span>View</span>
            <InlineEditablePageNumber
              currentPage={reflowState.currentPageIndex + 1}
              totalPages={reflowState.totalPages}
              onPageChange={handleViewChange}
              theme={theme}
            />
          </div>

          <button
            onClick={goToNextPage}
            disabled={reflowState.currentPageIndex >= reflowState.totalPages - 1}
            className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'transparent',
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
            }}
          >
            Next →
          </button>
        </div>
      </div>
      )}

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
          bookType={book.type}
          onNavigateToPage={goToOriginalPage}
          preloadedData={preloadedData}
          preloadedGrammarData={selectedWord ? grammarCache.get(selectedWord.word) : undefined}
          isGrammarMode={isGrammarMode}
          isMeaningMode={isMeaningMode}
          isSimplerMode={isSimplerMode}
          pageContent={reflowState.currentText}
          pageIndex={reflowState.currentPageIndex}
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

      {/* OCR Engine Context Menu */}
      {showOCREngineMenu && (
        <div
          ref={ocrEngineMenuRef}
          style={{
            position: 'fixed',
            top: ocrEngineMenuPosition.y,
            left: ocrEngineMenuPosition.x,
            zIndex: 10000,
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            border: '1px solid #e5e7eb',
          }}
        >
          <OCREngineSelector
            value={currentOCREngine}
            onChange={(engine) => {
              setCurrentOCREngine(engine);
              setShowOCREngineMenu(false);
              // TODO: Persist to settings and notify backend
              console.log('Selected OCR engine:', engine);
            }}
            compact={true}
          />
        </div>
      )}

      {/* Clear Selections Context Menu */}
      {showClearMenu && (
        <ClearSelectionsMenu
          x={clearMenuPosition.x}
          y={clearMenuPosition.y}
          onClearSelections={handleClearSelections}
          onClose={() => setShowClearMenu(false)}
          hasSelections={hasSelectionsOnPage()}
        />
      )}

      {/* Remove Individual Word/Phrase Menu */}
      {showRemoveWordMenu && selectedWordIndex !== null && (
        <RemoveWordMenu
          x={removeWordMenuPosition.x}
          y={removeWordMenuPosition.y}
          onRemove={() => {
            handleRemoveWordSelection(selectedWordIndex);
            setShowRemoveWordMenu(false);
            setSelectedWordIndex(null);
          }}
          onClose={() => {
            setShowRemoveWordMenu(false);
            setSelectedWordIndex(null);
          }}
        />
      )}

      {/* OCR Installation Prompt */}
      {showOcrInstallPrompt && (
        <OCRInstallPrompt
          onClose={() => setShowOcrInstallPrompt(false)}
          onInstallComplete={() => {
            // After successful installation, close prompt and activate OCR mode
            setShowOcrInstallPrompt(false);
            setOcrSelectionMode(true);
          }}
        />
      )}
    </div>
  );
};

export default DynamicReaderView;
