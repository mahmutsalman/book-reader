import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../context/BookContext';
import type { Book, BookLanguage } from '../../shared/types';
import { BOOK_LANGUAGES } from '../../shared/types';
import type { OCREngine } from '../../shared/types/settings.types';
import { useReaderTheme } from '../hooks/useReaderTheme';
import { adjustColor, getContrastColor } from '../utils/colorUtils';
import { OCREngineSelector } from '../components/OCREngineSelector';

// Get display name for a language code
const getLanguageName = (code: BookLanguage): string => {
  const lang = BOOK_LANGUAGES.find(l => l.code === code);
  return lang?.name || code.toUpperCase();
};

const LibraryPage: React.FC = () => {
  const { books, loading, error, loadBooks, importBook, deleteBook } = useBooks();
  const navigate = useNavigate();
  const theme = useReaderTheme();
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [isPdfFile, setIsPdfFile] = useState(false);
  const [isTxtFile, setIsTxtFile] = useState(false);
  const [isEpubFile, setIsEpubFile] = useState(false);
  const [isMangaFile, setIsMangaFile] = useState(false);
  const [isMangaFolder, setIsMangaFolder] = useState(false);
  const [isPngFile, setIsPngFile] = useState(false);
  const [showFormatDialog, setShowFormatDialog] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<BookLanguage>('en');
  const [selectedOCREngine, setSelectedOCREngine] = useState<OCREngine>('paddleocr'); // Default to PaddleOCR (recommended for comics)
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

  const handleImportBook = () => {
    // Show format selection dialog
    setShowFormatDialog(true);
  };

  const handleFormatSelect = async (format: 'pdf' | 'txt' | 'epub' | 'manga' | 'manga-folder' | 'png') => {
    setShowFormatDialog(false);

    if (!window.electronAPI) {
      alert('Electron API not available');
      return;
    }

    try {
      // Handle folder selection separately
      if (format === 'manga-folder') {
        const folderPath = await window.electronAPI.dialog.openDirectory();

        if (folderPath) {
          setIsMangaFolder(true);
          setIsPdfFile(false);
          setIsTxtFile(false);
          setIsEpubFile(false);
          setIsMangaFile(false);
          setIsPngFile(false);
          setPendingFilePath(folderPath);
          setSelectedLanguage('en');
        }
        return;
      }

      const filters = format === 'pdf'
        ? [{ name: 'PDF Documents', extensions: ['pdf'] }]
        : format === 'txt'
        ? [{ name: 'Text Files', extensions: ['txt'] }]
        : format === 'epub'
        ? [{ name: 'EPUB Documents', extensions: ['epub'] }]
        : format === 'manga'
        ? [{ name: 'Comic Archives', extensions: ['cbz', 'cbr'] }]
        : [{ name: 'PNG Images', extensions: ['png'] }];

      const filePath = await window.electronAPI.dialog.openFile({ filters });

      if (filePath) {
        const isPdf = format === 'pdf';
        const isTxt = format === 'txt';
        const isEpub = format === 'epub';
        const isManga = format === 'manga';
        const isPng = format === 'png';

        setIsPdfFile(isPdf);
        setIsTxtFile(isTxt);
        setIsEpubFile(isEpub);
        setIsMangaFile(isManga);
        setIsMangaFolder(false);
        setIsPngFile(isPng);
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
      } else if (isTxtFile) {
        // TXT import
        setImportProgress('Parsing text file...');
        await window.electronAPI.book.importTxt(pendingFilePath, selectedLanguage);
        // Reload books to show the new import
        await loadBooks();
        setImportProgress('');
      } else if (isEpubFile) {
        // EPUB import
        setImportProgress('Parsing EPUB file...');
        await window.electronAPI.book.importEpub(pendingFilePath, selectedLanguage);
        // Reload books to show the new import
        await loadBooks();
        setImportProgress('');
      } else if (isMangaFile) {
        // Manga/Comic import
        setImportProgress('Extracting comic pages...');
        await window.electronAPI.book.importManga(pendingFilePath, selectedLanguage, selectedOCREngine);
        // Reload books to show the new import
        await loadBooks();
        setImportProgress('');
      } else if (isMangaFolder) {
        // Manga Folder import
        setImportProgress('Copying images from folder...');
        await window.electronAPI.book.importMangaFolder(pendingFilePath, selectedLanguage);
        // Reload books to show the new import
        await loadBooks();
        setImportProgress('');
      } else if (isPngFile) {
        // Single PNG import for testing
        setImportProgress('Processing PNG with OCR...');
        await window.electronAPI.book.importPng(pendingFilePath, selectedLanguage, selectedOCREngine);
        // Reload books to show the new import
        await loadBooks();
        setImportProgress('');
      } else {
        // JSON import
        await importBook(pendingFilePath, selectedLanguage);
      }
      setPendingFilePath(null);
      setIsPdfFile(false);
      setIsTxtFile(false);
      setIsEpubFile(false);
      setIsMangaFile(false);
      setIsMangaFolder(false);
      setIsPngFile(false);
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
    setIsTxtFile(false);
    setIsEpubFile(false);
    setIsMangaFile(false);
    setIsMangaFolder(false);
    setIsPngFile(false);
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
        <div style={{ color: theme.textSecondary }}>Loading books...</div>
      </div>
    );
  }

  const accentTextColor = getContrastColor(theme.accent);
  const cardHoverColor = theme.wordHover || adjustColor(theme.panel, 4);

  return (
    <div className="p-6" style={{ color: theme.text }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: theme.accent }}>
          Your Library
        </h2>
        <button
          onClick={handleImportBook}
          disabled={importing}
          className="px-4 py-2 rounded-lg font-medium transition-opacity flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: theme.accent,
            color: accentTextColor,
          }}
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
          <h3 className="text-xl font-medium mb-2" style={{ color: theme.text }}>
            No books yet
          </h3>
          <p className="mb-4" style={{ color: theme.textSecondary }}>
            Import a JSON or PDF book to start reading
          </p>
          <button
            onClick={handleImportBook}
            className="px-4 py-2 rounded-lg font-medium transition-opacity"
            style={{
              backgroundColor: theme.accent,
              color: accentTextColor,
            }}
          >
            Import Your First Book
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {booksByLanguage.map(([language, languageBooks]) => {
            const isCollapsed = collapsedSections.has(language);
            return (
              <div
                key={language}
                className="border rounded-xl overflow-hidden"
                style={{ borderColor: theme.panelBorder }}
              >
                {/* Language Section Header */}
                <button
                  onClick={() => toggleSection(language)}
                  className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                  style={{
                    backgroundColor: theme.panel,
                    color: theme.text,
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.backgroundColor = cardHoverColor;
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.backgroundColor = theme.panel;
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                      style={{ color: theme.textSecondary }}
                    >
                      ▶
                    </span>
                    <span className="font-medium" style={{ color: theme.text }}>
                      {getLanguageName(language)}
                    </span>
                    <span
                      className="px-2 py-0.5 text-xs font-medium rounded-full"
                      style={{
                        backgroundColor: theme.panelBorder,
                        color: theme.textSecondary,
                      }}
                    >
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
                          className="rounded-lg p-3 cursor-pointer transition-all hover:scale-[1.02] group border flex flex-col"
                          style={{
                            backgroundColor: theme.panel,
                            borderColor: theme.panelBorder,
                            color: theme.text,
                          }}
                          onMouseEnter={(event) => {
                            event.currentTarget.style.backgroundColor = cardHoverColor;
                            event.currentTarget.style.boxShadow = `0 8px 16px ${theme.shadow}`;
                          }}
                          onMouseLeave={(event) => {
                            event.currentTarget.style.backgroundColor = theme.panel;
                            event.currentTarget.style.boxShadow = 'none';
                          }}
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
                            <h3 className="text-sm font-medium line-clamp-2" style={{ color: theme.text }}>
                              {book.title}
                            </h3>
                          </div>
                          {/* Page Count - fixed at bottom */}
                          <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                            {book.total_pages} pages
                          </p>
                          {/* Delete Button */}
                          <button
                            onClick={(e) => handleDeleteBook(e, book.id)}
                            className="mt-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: '#E85D4A' }}
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

      {/* Format Selection Dialog */}
      {showFormatDialog && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowFormatDialog(false)}
            style={{ backgroundColor: theme.shadow }}
          />
          <div
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-lg shadow-xl z-50 p-6 w-full max-w-md"
            style={{
              backgroundColor: theme.panel,
              color: theme.text,
              border: `1px solid ${theme.panelBorder}`,
            }}
          >
            <h2 className="text-2xl font-bold mb-2" style={{ color: theme.accent }}>
              Import Book
            </h2>
            <p className="mb-6" style={{ color: theme.textSecondary }}>
              Choose the format of your book:
            </p>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleFormatSelect('pdf')}
                className="w-full p-4 border-2 rounded-lg flex items-center gap-3 transition-colors"
                style={{
                  borderColor: theme.accent,
                  color: theme.text,
                  backgroundColor: theme.background,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = cardHoverColor;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = theme.background;
                }}
              >
                <span className="text-3xl">📄</span>
                <div className="text-left flex-1">
                  <div className="font-semibold" style={{ color: theme.text }}>
                    Import PDF Document
                  </div>
                  <div className="text-sm" style={{ color: theme.textSecondary }}>
                    With OCR support for scanned PDFs
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleFormatSelect('txt')}
                className="w-full p-4 border-2 rounded-lg flex items-center gap-3 transition-colors"
                style={{
                  borderColor: theme.accent,
                  color: theme.text,
                  backgroundColor: theme.background,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = cardHoverColor;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = theme.background;
                }}
              >
                <span className="text-3xl">📝</span>
                <div className="text-left flex-1">
                  <div className="font-semibold" style={{ color: theme.text }}>
                    Import Plain Text (TXT)
                  </div>
                  <div className="text-sm" style={{ color: theme.textSecondary }}>
                    For Project Gutenberg and text books
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleFormatSelect('epub')}
                className="w-full p-4 border-2 rounded-lg flex items-center gap-3 transition-colors"
                style={{
                  borderColor: theme.accent,
                  color: theme.text,
                  backgroundColor: theme.background,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = cardHoverColor;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = theme.background;
                }}
              >
                <span className="text-3xl">📚</span>
                <div className="text-left flex-1">
                  <div className="font-semibold" style={{ color: theme.text }}>
                    Import EPUB Document
                  </div>
                  <div className="text-sm" style={{ color: theme.textSecondary }}>
                    For digital books and ebooks
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleFormatSelect('manga')}
                className="w-full p-4 border-2 rounded-lg flex items-center gap-3 transition-colors"
                style={{
                  borderColor: theme.accent,
                  color: theme.text,
                  backgroundColor: theme.background,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = cardHoverColor;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = theme.background;
                }}
              >
                <span className="text-3xl">📖</span>
                <div className="text-left flex-1">
                  <div className="font-semibold" style={{ color: theme.text }}>
                    Import Comic/Manga (CBZ/CBR)
                  </div>
                  <div className="text-sm" style={{ color: theme.textSecondary }}>
                    Instant import - OCR on-demand during reading
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleFormatSelect('manga-folder')}
                className="w-full p-4 border-2 rounded-lg flex items-center gap-3 transition-colors"
                style={{
                  borderColor: theme.accent,
                  color: theme.text,
                  backgroundColor: theme.background,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = cardHoverColor;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = theme.background;
                }}
              >
                <span className="text-3xl">📁</span>
                <div className="text-left flex-1">
                  <div className="font-semibold" style={{ color: theme.text }}>
                    Import Comic/Manga (Folder)
                  </div>
                  <div className="text-sm" style={{ color: theme.textSecondary }}>
                    Import from folder of images - OCR on-demand during reading
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleFormatSelect('png')}
                className="w-full p-4 border-2 rounded-lg flex items-center gap-3 transition-colors"
                style={{
                  borderColor: theme.accent,
                  color: theme.text,
                  backgroundColor: theme.background,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = cardHoverColor;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = theme.background;
                }}
              >
                <span className="text-3xl">🖼️</span>
                <div className="text-left flex-1">
                  <div className="font-semibold" style={{ color: theme.text }}>
                    Test with Single PNG
                  </div>
                  <div className="text-sm" style={{ color: theme.textSecondary }}>
                    For quick testing of OCR and word lookup
                  </div>
                </div>
              </button>
            </div>

            <button
              onClick={() => setShowFormatDialog(false)}
              className="w-full px-4 py-2 transition-colors"
              style={{ color: theme.textSecondary }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Language Selection Dialog */}
      {pendingFilePath && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={!importing ? handleCancelImport : undefined}
            style={{ backgroundColor: theme.shadow }}
          />
          <div
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-lg shadow-xl z-50 p-6 w-96"
            style={{
              backgroundColor: theme.panel,
              color: theme.text,
              border: `1px solid ${theme.panelBorder}`,
            }}
          >
            <h3 className="text-lg font-semibold mb-4">
              Import {isPdfFile ? 'PDF' : isTxtFile ? 'Text File' : isEpubFile ? 'EPUB' : isMangaFile ? 'Comic/Manga' : isMangaFolder ? 'Comic/Manga Folder' : isPngFile ? 'PNG Test Image' : 'Book'}
            </h3>
            {isPdfFile && (
              <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 p-3 rounded-lg mb-4 text-sm">
                <span className="font-medium">PDF Import:</span> Text will be extracted from the PDF.
                {' '}OCR will be used for scanned pages if available.
              </div>
            )}
            {isTxtFile && (
              <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 p-3 rounded-lg mb-4 text-sm">
                <span className="font-medium">TXT Import:</span> Text will be parsed into chapters. The app will automatically detect chapter boundaries and create responsive pagination based on your zoom level.
              </div>
            )}
            {isEpubFile && (
              <div className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 p-3 rounded-lg mb-4 text-sm">
                <span className="font-medium">EPUB Import:</span> Chapters and metadata will be extracted from the EPUB file.
              </div>
            )}
            {isMangaFile && (
              <div className="bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 p-3 rounded-lg mb-4 text-sm">
                <span className="font-medium">Comic/Manga Import:</span> Pages will be extracted from the archive. Instant import - OCR will be performed on-demand during reading when you select text regions.
              </div>
            )}
            {isMangaFolder && (
              <div className="bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 p-3 rounded-lg mb-4 text-sm">
                <span className="font-medium">Folder Import:</span> Images will be copied from the folder. Instant import - OCR will be performed on-demand during reading when you select text regions.
              </div>
            )}
            {isPngFile && (
              <div className="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 p-3 rounded-lg mb-4 text-sm">
                <span className="font-medium">PNG Test Import:</span> This will process a single PNG image with OCR and create a one-page manga for testing. Perfect for quickly testing word lookup functionality.
              </div>
            )}
            <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
              Select the language of the book:
            </p>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as BookLanguage)}
              disabled={importing}
              className="w-full p-2 border rounded-lg mb-4 disabled:opacity-50"
              style={{
                backgroundColor: theme.panel,
                color: theme.text,
                borderColor: theme.border,
              }}
            >
              {BOOK_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <p className="text-xs mb-4" style={{ color: theme.textSecondary }}>
              {selectedLanguage !== 'en' && (
                <>English translations will be shown for definitions and sentences.</>
              )}
              {selectedLanguage === 'en' && (
                <>Standard English word lookup will be used.</>
              )}
            </p>

            {/* OCR Engine Selection (only for manga/comic imports) */}
            {(isMangaFile || isPngFile) && (
              <div className="mb-4">
                <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                  Select OCR Engine:
                </p>
                <div
                  className="overflow-y-auto pr-2"
                  style={{ maxHeight: '300px' }}
                >
                  <OCREngineSelector
                    value={selectedOCREngine}
                    onChange={setSelectedOCREngine}
                    showDescriptions={true}
                  />
                </div>
                <p className="text-xs mt-3" style={{ color: theme.textSecondary }}>
                  💡 <strong>Tesseract</strong> and <strong>PaddleOCR</strong> are installed by default.
                  Other engines (TrOCR, EasyOCR) can be downloaded from the UI when needed.
                </p>
              </div>
            )}

            {importing && importProgress && (
              <div
                className="p-3 rounded-lg mb-4"
                style={{ backgroundColor: theme.panelBorder }}
              >
                <div className="flex items-center gap-2">
                  <span className="animate-spin text-lg">⏳</span>
                  <span className="text-sm" style={{ color: theme.textSecondary }}>
                    {importProgress}
                  </span>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelImport}
                disabled={importing}
                className="px-4 py-2 rounded-lg disabled:opacity-50"
                style={{
                  backgroundColor: 'transparent',
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = cardHoverColor;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className="px-4 py-2 rounded-lg font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: theme.accent,
                  color: accentTextColor,
                }}
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
