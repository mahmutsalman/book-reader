import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../../context/BookContext';
import { ZOOM_LEVELS } from '../../../shared/constants';
import { cleanWord } from '../../../shared/utils/text-utils';
import type { Book, BookData, ReadingProgress } from '../../../shared/types';
import WordPanel from '../word-panel/WordPanel';
import InlineEditablePageNumber from './InlineEditablePageNumber';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha } from '../../utils/colorUtils';

interface ReaderViewProps {
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

const ReaderView: React.FC<ReaderViewProps> = ({ book, bookData, initialProgress }) => {
  const navigate = useNavigate();
  const { updateProgress, clearReadingSession } = useBooks();
  const theme = useReaderTheme();
  const hoverFill = theme.wordHover || addAlpha(theme.panel, 0.5);
  const readerScrollbarStyles = {
    '--reader-scrollbar-track': theme.panel,
    '--reader-scrollbar-thumb': theme.panelBorder,
    '--reader-scrollbar-thumb-hover': theme.accent,
  } as React.CSSProperties;
  const [currentPage, setCurrentPage] = useState(initialProgress?.current_page || 1);
  const [zoom, setZoom] = useState(initialProgress?.zoom_level || ZOOM_LEVELS.DEFAULT);
  const [selectedWord, setSelectedWord] = useState<SelectedWord | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showChapterMenu, setShowChapterMenu] = useState(false);

  // Get current page data
  const pageData = bookData.pages[currentPage - 1];

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

  const handleExitReading = useCallback(() => {
    clearReadingSession();
    navigate('/library');
  }, [clearReadingSession, navigate]);

  // Save progress when page or zoom changes
  useEffect(() => {
    const saveProgress = async () => {
      await updateProgress({
        current_page: currentPage,
        zoom_level: zoom,
      });
    };
    saveProgress();
  }, [currentPage, zoom, updateProgress]);

  // Handle word click
  const handleWordClick = useCallback((word: string, fullText: string) => {
    // Extract sentence containing the word
    const sentences = fullText.split(/(?<=[.!?])\s+/);
    const sentence = sentences.find(s =>
      s.toLowerCase().includes(word.toLowerCase())
    ) || fullText.substring(0, 200);

    setSelectedWord({
      word: cleanWord(word), // Clean punctuation (Unicode-aware for Russian, etc.)
      sentence,
      pageNumber: currentPage,
    });
    setIsPanelOpen(true);
  }, [currentPage]);

  // Navigation
  const goToPage = (page: number) => {
    const newPage = Math.max(1, Math.min(page, bookData.total_pages));
    setCurrentPage(newPage);
  };

  const goNext = () => goToPage(currentPage + 1);
  const goPrev = () => goToPage(currentPage - 1);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        setIsPanelOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage]);

  // Render text with clickable words
  const renderText = (text: string) => {
    if (!text) {
      return <span className="italic" style={{ color: theme.textSecondary }}>Empty page</span>;
    }

    const words = text.split(/(\s+)/);
    return words.map((part, index) => {
      if (/^\s+$/.test(part)) {
        // Whitespace - preserve it
        return <span key={index}>{part}</span>;
      }
      // Word - make it clickable
      return (
        <span
          key={index}
          onClick={() => handleWordClick(part, text)}
          className="word-clickable"
        >
          {part}
        </span>
      );
    });
  };

  const fontSize = 18 * zoom;

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: theme.background, color: theme.text }}>
      {/* Top bar */}
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
                  {pageData?.chapter || 'Select Chapter'}
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
                          goToPage(chapter.startPage);
                          setShowChapterMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm transition-colors"
                        style={{
                          backgroundColor: pageData?.chapter === chapter.name
                            ? addAlpha(theme.accent, 0.15)
                            : 'transparent',
                          color: pageData?.chapter === chapter.name ? theme.accent : theme.text,
                        }}
                        onMouseEnter={(event) => {
                          if (pageData?.chapter !== chapter.name) {
                            event.currentTarget.style.backgroundColor = hoverFill;
                          }
                        }}
                        onMouseLeave={(event) => {
                          if (pageData?.chapter !== chapter.name) {
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

      {/* Reading area */}
      <div className="flex-1 overflow-auto p-8 reader-scrollbar" style={readerScrollbarStyles}>
        <div
          className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm p-8 reader-text"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: 1.8,
          }}
        >
          {renderText(pageData?.text || '')}
        </div>
      </div>

      {/* Bottom navigation */}
      <div
        className="border-t px-4 py-3"
        style={{ backgroundColor: theme.panel, borderTopColor: theme.panelBorder }}
      >
        {/* Progress bar */}
        <div className="max-w-3xl mx-auto mb-3">
          <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${(currentPage / bookData.total_pages) * 100}%`,
                backgroundColor: theme.accent,
              }}
            />
          </div>
          <div className="text-xs text-center mt-1" style={{ color: theme.textSecondary }}>
            {Math.round((currentPage / bookData.total_pages) * 100)}% complete
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={goPrev}
            disabled={currentPage <= 1}
            className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'transparent',
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
            }}
          >
            ← Previous
          </button>

          <div className="flex items-center gap-2">
            <span style={{ color: theme.textSecondary }}>View</span>
            <InlineEditablePageNumber
              currentPage={currentPage}
              totalPages={bookData.total_pages}
              onPageChange={goToPage}
              theme={theme}
            />
          </div>

          <button
            onClick={goNext}
            disabled={currentPage >= bookData.total_pages}
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

      {/* Word Panel */}
      <WordPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        selectedWord={selectedWord}
        bookId={book.id}
        bookType={book.type}
        onNavigateToPage={goToPage}
      />
    </div>
  );
};

export default ReaderView;
