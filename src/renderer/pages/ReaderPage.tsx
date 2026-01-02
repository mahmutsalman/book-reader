import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBooks } from '../context/BookContext';
import DynamicReaderView from '../components/reader/DynamicReaderView';
import { useReaderTheme } from '../hooks/useReaderTheme';
import { getContrastColor } from '../utils/colorUtils';

const ReaderPage: React.FC = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { currentBook, currentBookData, currentProgress, loading, error, loadBook, clearReadingSession } = useBooks();
  const [initialLoad, setInitialLoad] = useState(true);
  const theme = useReaderTheme();
  const accentTextColor = getContrastColor(theme.accent);

  const handleBackToLibrary = () => {
    clearReadingSession();
    navigate('/library');
  };

  useEffect(() => {
    if (bookId) {
      loadBook(parseInt(bookId, 10)).then(() => {
        setInitialLoad(false);
      });
    }
  }, [bookId, loadBook]);

  if (loading && initialLoad) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📖</div>
          <div style={{ color: theme.textSecondary }}>Loading book...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <div className="mb-4" style={{ color: '#E85D4A' }}>
            {error}
          </div>
          <button
            onClick={handleBackToLibrary}
            className="px-4 py-2 rounded-lg font-medium transition-opacity"
            style={{ backgroundColor: theme.accent, color: accentTextColor }}
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  if (!currentBook || !currentBookData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📚</div>
          <div className="mb-4" style={{ color: theme.textSecondary }}>
            Book not found
          </div>
          <button
            onClick={handleBackToLibrary}
            className="px-4 py-2 rounded-lg font-medium transition-opacity"
            style={{ backgroundColor: theme.accent, color: accentTextColor }}
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <DynamicReaderView
      book={currentBook}
      bookData={currentBookData}
      initialProgress={currentProgress}
    />
  );
};

export default ReaderPage;
