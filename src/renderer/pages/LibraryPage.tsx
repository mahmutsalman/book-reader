import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../context/BookContext';
import type { Book, BookLanguage } from '../../shared/types';
import { BOOK_LANGUAGES } from '../../shared/types';

const LibraryPage: React.FC = () => {
  const { books, loading, error, loadBooks, importBook, deleteBook } = useBooks();
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<BookLanguage>('en');

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const handleImportBook = async () => {
    if (!window.electronAPI) {
      alert('Electron API not available');
      return;
    }

    try {
      const filePath = await window.electronAPI.dialog.openFile({
        filters: [{ name: 'JSON Books', extensions: ['json'] }],
      });

      if (filePath) {
        // Show language selection dialog
        setPendingFilePath(filePath);
        setSelectedLanguage('en');
      }
    } catch (err) {
      console.error('File selection failed:', err);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingFilePath) return;

    try {
      setImporting(true);
      await importBook(pendingFilePath, selectedLanguage);
      setPendingFilePath(null);
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import book');
    } finally {
      setImporting(false);
    }
  };

  const handleCancelImport = () => {
    setPendingFilePath(null);
  };

  const handleOpenBook = (book: Book) => {
    navigate(`/reader/${book.id}`);
  };

  const handleDeleteBook = async (e: React.MouseEvent, bookId: number) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this book?')) {
      await deleteBook(bookId);
    }
  };

  if (loading && books.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading books...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Your Library</h2>
        <button
          onClick={handleImportBook}
          disabled={importing}
          className="btn-primary flex items-center gap-2"
        >
          {importing ? (
            <>
              <span className="animate-spin">⏳</span>
              Importing...
            </>
          ) : (
            <>
              <span>➕</span>
              Import Book
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {books.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📖</div>
          <h3 className="text-xl font-medium text-gray-700 dark:text-gray-300 mb-2">
            No books yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Import a JSON book to start reading
          </p>
          <button onClick={handleImportBook} className="btn-primary">
            Import Your First Book
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {books.map((book) => (
            <div
              key={book.id}
              onClick={() => handleOpenBook(book)}
              className="card cursor-pointer hover:shadow-md dark:hover:shadow-gray-700/50 transition-shadow group"
            >
              <div className="aspect-[3/4] bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-800 dark:to-primary-700 rounded-lg mb-4 flex items-center justify-center">
                <span className="text-5xl">📕</span>
              </div>
              <h3 className="font-medium text-gray-800 dark:text-white line-clamp-2 mb-2">
                {book.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-300">
                {book.total_pages} pages
              </p>
              <button
                onClick={(e) => handleDeleteBook(e, book.id)}
                className="mt-3 text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Language Selection Dialog */}
      {pendingFilePath && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={handleCancelImport}
          />
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              Import Book
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Select the language of the book:
            </p>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as BookLanguage)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white mb-4"
            >
              {BOOK_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {selectedLanguage !== 'en' && (
                <>English translations will be shown for definitions and sentences.</>
              )}
              {selectedLanguage === 'en' && (
                <>Standard English word lookup will be used.</>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelImport}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className="btn-primary"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LibraryPage;
