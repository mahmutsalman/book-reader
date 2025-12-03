import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../../context/BookContext';
import { useDeferredWords } from '../../context/DeferredWordContext';
import { useTextReflow } from '../../hooks/useTextReflow';
import { ZOOM_LEVELS, REFLOW_SETTINGS } from '../../../shared/constants';
import type { Book, BookData, ReadingProgress } from '../../../shared/types';
import type { CachedWordData } from '../../../shared/types/deferred-word.types';
import WordPanel from '../word-panel/WordPanel';

interface DynamicReaderViewProps {
  book: Book;
  bookData: BookData;
  initialProgress: ReadingProgress | null;
}

interface SelectedWord {
  word: string;
  sentence: string;
  pageNumber: number;
}

interface Chapter {
  name: string;
  startPage: number;
}

const DynamicReaderView: React.FC<DynamicReaderViewProps> = ({ book, bookData, initialProgress }) => {
  const navigate = useNavigate();
  const { updateProgress } = useBooks();
  const { queueWord, isWordReady, getWordData, getWordStatus } = useDeferredWords();
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

  // Smart sentence extraction - looks at surrounding pages for complete sentences
  const extractFullSentence = useCallback((word: string, currentPageNum: number): string => {
    // Get text from surrounding pages to handle sentences spanning page boundaries
    const prevPage = bookData.pages.find(p => p.page === currentPageNum - 1);
    const currentPage = bookData.pages.find(p => p.page === currentPageNum);
    const nextPage = bookData.pages.find(p => p.page === currentPageNum + 1);

    // Combine text from previous, current, and next pages
    const combinedText = [
      prevPage?.text || '',
      currentPage?.text || '',
      nextPage?.text || ''
    ].join(' ').replace(/\s+/g, ' ').trim();

    if (!combinedText) {
      return reflowState.currentText.substring(0, 200);
    }

    // Find the word in the combined text (case insensitive)
    const cleanWord = word.replace(/[^\w'-]/g, '');
    const wordRegex = new RegExp(`\\b${cleanWord}\\b`, 'i');
    const wordMatch = combinedText.match(wordRegex);

    if (!wordMatch || wordMatch.index === undefined) {
      // Fallback: return current view text
      return reflowState.currentText.substring(0, 200);
    }

    const wordPosition = wordMatch.index;

    // Find sentence start: look backwards for . ! ? or start of text
    let sentenceStart = 0;
    for (let i = wordPosition - 1; i >= 0; i--) {
      const char = combinedText[i];
      if (char === '.' || char === '!' || char === '?') {
        // Check it's not an abbreviation (e.g., "Mr.", "Dr.")
        const beforePunctuation = combinedText.substring(Math.max(0, i - 3), i);
        if (!/^(Mr|Mrs|Ms|Dr|Jr|Sr|St)$/i.test(beforePunctuation.trim())) {
          sentenceStart = i + 1;
          break;
        }
      }
    }

    // Find sentence end: look forwards for . ! ? or end of text
    let sentenceEnd = combinedText.length;
    for (let i = wordPosition; i < combinedText.length; i++) {
      const char = combinedText[i];
      if (char === '.' || char === '!' || char === '?') {
        // Check it's not an abbreviation
        const beforePunctuation = combinedText.substring(Math.max(0, i - 3), i);
        if (!/^(Mr|Mrs|Ms|Dr|Jr|Sr|St)$/i.test(beforePunctuation.trim())) {
          sentenceEnd = i + 1;
          break;
        }
      }
    }

    // Extract and clean the sentence
    let sentence = combinedText.substring(sentenceStart, sentenceEnd).trim();

    // Limit length if too long (some sentences can be very long)
    if (sentence.length > 500) {
      // Try to find a reasonable break point
      const halfLength = 250;
      const startPos = Math.max(0, wordPosition - sentenceStart - halfLength);
      const endPos = Math.min(sentence.length, wordPosition - sentenceStart + halfLength);
      sentence = '...' + sentence.substring(startPos, endPos).trim() + '...';
    }

    return sentence || reflowState.currentText.substring(0, 200);
  }, [bookData.pages, reflowState.currentText]);

  // Handle word click with deferred lookup behavior
  const handleWordClick = useCallback((word: string, wordIndex: number) => {
    const cleanWord = word.replace(/[^\w'-]/g, '').toLowerCase();
    const fullSentence = extractFullSentence(word, reflowState.originalPage);

    // Check if word is ready (has cached data)
    if (isWordReady(cleanWord, book.id)) {
      // Word is ready - open panel with cached data
      setSelectedWord({
        word: cleanWord,
        sentence: fullSentence,
        pageNumber: reflowState.originalPage,
      });
      setPreloadedData(getWordData(cleanWord, book.id));
      setIsPanelOpen(true);
      // Remove from loading positions if it was there
      setLoadingPositions(prev => {
        const newSet = new Set(prev);
        newSet.delete(wordIndex);
        return newSet;
      });
    } else {
      // Queue word for background fetch
      const status = getWordStatus(cleanWord, book.id);

      // Only queue if not already pending or fetching
      if (!status || status === 'error') {
        queueWord(cleanWord, fullSentence, reflowState.originalPage, book.id);

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
  }, [extractFullSentence, reflowState.originalPage, book.id, isWordReady, getWordData, getWordStatus, queueWord]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goToNextPage();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key === 'Escape') {
        setIsPanelOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextPage, goToPrevPage]);

  // Clear loading positions when words become ready
  useEffect(() => {
    if (loadingPositions.size === 0) return;

    const positionsToRemove: number[] = [];
    loadingPositions.forEach(pos => {
      const word = loadingWordsMapRef.current.get(pos);
      if (word && isWordReady(word, book.id)) {
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
  }, [loadingPositions, isWordReady, book.id]);

  // Clear loading positions when page changes
  useEffect(() => {
    setLoadingPositions(new Set());
    loadingWordsMapRef.current.clear();
  }, [reflowState.currentPageIndex]);

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

      // Check if this word has ready data
      const cleanWord = part.replace(/[^\w'-]/g, '').toLowerCase();
      const wordIsReady = isWordReady(cleanWord, book.id);
      const isPulsing = pulsingWords.has(cleanWord);
      const isLoading = loadingPositions.has(index);

      // Word - make it clickable with optional ready/loading indicator
      return (
        <span
          key={index}
          onClick={() => handleWordClick(part, index)}
          className={`word-clickable ${wordIsReady ? 'word-ready' : ''} ${isPulsing ? 'word-queued-pulse' : ''}`}
        >
          {part}
          {wordIsReady && <span className="word-ready-dot" />}
          {isLoading && !wordIsReady && <span className="word-loading-dot" />}
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
