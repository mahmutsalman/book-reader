import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBooks } from '../context/BookContext';
import ReaderView from '../components/reader/ReaderView';

const ReaderPage: React.FC = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { currentBook, currentBookData, currentProgress, loading, error, loadBook } = useBooks();
  const [initialLoad, setInitialLoad] = useState(true);

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
          <div className="text-gray-500">Loading book...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <div className="text-red-600 mb-4">{error}</div>
          <button onClick={() => navigate('/library')} className="btn-primary">
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
          <div className="text-gray-500 mb-4">Book not found</div>
          <button onClick={() => navigate('/library')} className="btn-primary">
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <ReaderView
      book={currentBook}
      bookData={currentBookData}
      initialProgress={currentProgress}
    />
  );
};

export default ReaderPage;
