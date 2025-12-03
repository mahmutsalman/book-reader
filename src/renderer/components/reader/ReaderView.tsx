import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../../context/BookContext';
import { ZOOM_LEVELS } from '../../../shared/constants';
import type { Book, BookData, ReadingProgress } from '../../../shared/types';
import WordPanel from '../word-panel/WordPanel';

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

const ReaderView: React.FC<ReaderViewProps> = ({ book, bookData, initialProgress }) => {
  const navigate = useNavigate();
  const { updateProgress } = useBooks();
  const [currentPage, setCurrentPage] = useState(initialProgress?.current_page || 1);
  const [zoom, setZoom] = useState(initialProgress?.zoom_level || ZOOM_LEVELS.DEFAULT);
  const [selectedWord, setSelectedWord] = useState<SelectedWord | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Get current page data
  const pageData = bookData.pages[currentPage - 1];

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
      word: word.replace(/[^\w'-]/g, ''), // Clean punctuation
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
    if (!text) return <span className="text-gray-400 italic">Empty page</span>;

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
    <div className="h-full flex flex-col bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/library')}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
          <div className="text-sm text-gray-600 max-w-md truncate">
            {book.title}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Chapter indicator */}
          {pageData?.chapter && (
            <span className="text-sm text-gray-500 max-w-xs truncate">
              {pageData.chapter}
            </span>
          )}

          {/* Zoom control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Zoom:</span>
            <input
              type="range"
              min={ZOOM_LEVELS.MIN}
              max={ZOOM_LEVELS.MAX}
              step={ZOOM_LEVELS.STEP}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-gray-600 w-10">
              {zoom.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>

      {/* Reading area */}
      <div className="flex-1 overflow-auto p-8">
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
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-center gap-4">
        <button
          onClick={goPrev}
          disabled={currentPage <= 1}
          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={bookData.total_pages}
            value={currentPage}
            onChange={(e) => goToPage(parseInt(e.target.value, 10) || 1)}
            className="w-16 px-2 py-1 text-center border border-gray-300 rounded"
          />
          <span className="text-gray-500">of {bookData.total_pages}</span>
        </div>

        <button
          onClick={goNext}
          disabled={currentPage >= bookData.total_pages}
          className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>

      {/* Word Panel */}
      <WordPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        selectedWord={selectedWord}
        bookId={book.id}
      />
    </div>
  );
};

export default ReaderView;
