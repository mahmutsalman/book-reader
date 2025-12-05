import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../context/BookContext';
import type { Book, BookLanguage } from '../../shared/types';
import { BOOK_LANGUAGES } from '../../shared/types';

// Get display name for a language code
const getLanguageName = (code: BookLanguage): string => {
  const lang = BOOK_LANGUAGES.find(l => l.code === code);
  return lang?.name || code.toUpperCase();
};

const LibraryPage: React.FC = () => {
  const { books, loading, error, loadBooks, importBook, deleteBook } = useBooks();
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [isPdfFile, setIsPdfFile] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<BookLanguage>('en');
  const [collapsedSections, setCollapsedSections] = useState<Set<BookLanguage>>(new Set());

  // Group books by language
  const booksByLanguage = useMemo(() => {
    const grouped = new Map<BookLanguage, Book[]>();
    books.forEach(book => {
      const existing = grouped.get(book.language) || [];
      grouped.set(book.language, [...existing, book]);
    });
    // Sort by language name for consistent ordering
    return Array.from(grouped.entries()).sort((a, b) =>
      getLanguageName(a[0]).localeCompare(getLanguageName(b[0]))
    );
  }, [books]);

  const toggleSection = (lang: BookLanguage) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(lang)) {
        next.delete(lang);
      } else {
        next.add(lang);
      }
      return next;
    });
  };

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
        filters: [
          { name: 'Books', extensions: ['json', 'pdf'] },
          { name: 'JSON Books', extensions: ['json'] },
          { name: 'PDF Documents', extensions: ['pdf'] },
        ],
      });

      if (filePath) {
        // Detect if PDF file
        const isPdf = filePath.toLowerCase().endsWith('.pdf');
        setIsPdfFile(isPdf);
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
      setImportProgress('');

      if (isPdfFile) {
        // PDF import
        setImportProgress('Extracting text from PDF...');
        await window.electronAPI.book.importPdf(pendingFilePath, selectedLanguage, true);
        // Reload books to show the new import
        await loadBooks();
        setImportProgress('');
      } else {
        // JSON import
        await importBook(pendingFilePath, selectedLanguage);
      }
      setPendingFilePath(null);
      setIsPdfFile(false);
    } catch (err) {
      console.error('Import failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to import book';
      alert(message);
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  };

  const handleCancelImport = () => {
    setPendingFilePath(null);
    setIsPdfFile(false);
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
        <div className="text-gray-500 dark:text-cream-300">Loading books...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-cream-100">Your Library</h2>
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
          <h3 className="text-xl font-medium text-gray-700 dark:text-cream-200 mb-2">
            No books yet
          </h3>
          <p className="text-gray-500 dark:text-cream-300 mb-4">
            Import a JSON or PDF book to start reading
          </p>
          <button onClick={handleImportBook} className="btn-primary">
            Import Your First Book
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {booksByLanguage.map(([language, languageBooks]) => {
            const isCollapsed = collapsedSections.has(language);
            return (
              <div key={language} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                {/* Language Section Header */}
                <button
                  onClick={() => toggleSection(language)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-gray-500 dark:text-cream-300 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>
                      ▶
                    </span>
                    <span className="font-medium text-gray-800 dark:text-cream-100">
                      {getLanguageName(language)}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-cream-200 rounded-full">
                      {languageBooks.length}
                    </span>
                  </div>
                </button>

                {/* Books Grid */}
                {!isCollapsed && (
                  <div className="p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {languageBooks.map((book) => (
                        <div
                          key={book.id}
                          onClick={() => handleOpenBook(book)}
                          className="bg-white dark:bg-gray-800 rounded-lg p-3 cursor-pointer hover:shadow-md dark:hover:shadow-gray-700/50 transition-all hover:scale-[1.02] group border border-gray-100 dark:border-gray-700 flex flex-col"
                        >
                          {/* Book Cover - shorter aspect ratio */}
                          <div className="aspect-[4/5] bg-gradient-to-br from-book-paper to-book-spine dark:from-book-cover dark:to-book-accent rounded-md mb-2 flex items-center justify-center relative overflow-hidden flex-shrink-0">
                            {/* Decorative spine line */}
                            <div className="absolute left-0 top-0 bottom-0 w-2 bg-book-spine/50 dark:bg-book-accent/50" />
                            {/* Book icon */}
                            <svg className="w-8 h-8 text-book-spine/70 dark:text-cream-300/70" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H6zm0 2h12v16H6V4zm2 2v2h8V6H8zm0 4v2h8v-2H8z"/>
                            </svg>
                          </div>
                          {/* Book Title - flex-grow pushes page count to bottom */}
                          <div className="flex-grow min-h-[2.5rem]">
                            <h3 className="text-sm font-medium text-gray-800 dark:text-cream-100 line-clamp-2">
                              {book.title}
                            </h3>
                          </div>
                          {/* Page Count - fixed at bottom */}
                          <p className="text-xs text-gray-500 dark:text-cream-300 mt-1">
                            {book.total_pages} pages
                          </p>
                          {/* Delete Button */}
                          <button
                            onClick={(e) => handleDeleteBook(e, book.id)}
                            className="mt-2 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Language Selection Dialog */}
      {pendingFilePath && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={!importing ? handleCancelImport : undefined}
          />
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
              Import {isPdfFile ? 'PDF' : 'Book'}
            </h3>
            {isPdfFile && (
              <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 p-3 rounded-lg mb-4 text-sm">
                <span className="font-medium">PDF Import:</span> Text will be extracted from the PDF.
                {' '}OCR will be used for scanned pages if available.
              </div>
            )}
            <p className="text-sm text-gray-600 dark:text-cream-200 mb-4">
              Select the language of the book:
            </p>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as BookLanguage)}
              disabled={importing}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white mb-4 disabled:opacity-50"
            >
              {BOOK_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-cream-300 mb-4">
              {selectedLanguage !== 'en' && (
                <>English translations will be shown for definitions and sentences.</>
              )}
              {selectedLanguage === 'en' && (
                <>Standard English word lookup will be used.</>
              )}
            </p>
            {importing && importProgress && (
              <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg mb-4">
                <div className="flex items-center gap-2">
                  <span className="animate-spin text-lg">⏳</span>
                  <span className="text-sm text-gray-600 dark:text-cream-200">{importProgress}</span>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelImport}
                disabled={importing}
                className="px-4 py-2 text-gray-600 dark:text-cream-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
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
