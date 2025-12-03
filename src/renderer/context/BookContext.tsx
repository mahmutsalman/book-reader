import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Book, BookData, ReadingProgress } from '../../shared/types';

interface BookContextType {
  books: Book[];
  currentBook: Book | null;
  currentBookData: BookData | null;
  currentProgress: ReadingProgress | null;
  loading: boolean;
  error: string | null;
  loadBooks: () => Promise<void>;
  loadBook: (bookId: number) => Promise<void>;
  importBook: (filePath: string) => Promise<Book>;
  deleteBook: (bookId: number) => Promise<void>;
  updateProgress: (data: Partial<ReadingProgress>) => Promise<void>;
}

const BookContext = createContext<BookContextType | null>(null);

export const useBooks = () => {
  const context = useContext(BookContext);
  if (!context) {
    throw new Error('useBooks must be used within BookProvider');
  }
  return context;
};

interface BookProviderProps {
  children: React.ReactNode;
}

export const BookProvider: React.FC<BookProviderProps> = ({ children }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [currentBookData, setCurrentBookData] = useState<BookData | null>(null);
  const [currentProgress, setCurrentProgress] = useState<ReadingProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (window.electronAPI) {
        const loadedBooks = await window.electronAPI.book.getAll();
        setBooks(loadedBooks);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load books');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBook = useCallback(async (bookId: number) => {
    setLoading(true);
    setError(null);
    try {
      if (window.electronAPI) {
        const book = await window.electronAPI.book.getById(bookId);
        if (!book) {
          throw new Error('Book not found');
        }
        setCurrentBook(book);

        const bookData = await window.electronAPI.book.getData(bookId);
        setCurrentBookData(bookData);

        const progress = await window.electronAPI.progress.get(bookId);
        setCurrentProgress(progress);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load book');
    } finally {
      setLoading(false);
    }
  }, []);

  const importBook = useCallback(async (filePath: string): Promise<Book> => {
    setLoading(true);
    setError(null);
    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }
      const book = await window.electronAPI.book.import(filePath);
      setBooks(prev => [...prev, book]);
      return book;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import book';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteBook = useCallback(async (bookId: number) => {
    setLoading(true);
    setError(null);
    try {
      if (window.electronAPI) {
        await window.electronAPI.book.delete(bookId);
        setBooks(prev => prev.filter(b => b.id !== bookId));
        if (currentBook?.id === bookId) {
          setCurrentBook(null);
          setCurrentBookData(null);
          setCurrentProgress(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete book');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentBook]);

  const updateProgress = useCallback(async (data: Partial<ReadingProgress>) => {
    if (!currentBook) return;
    try {
      if (window.electronAPI) {
        await window.electronAPI.progress.update(currentBook.id, data);
        setCurrentProgress(prev => prev ? { ...prev, ...data } : null);
      }
    } catch (err) {
      console.error('Failed to update progress:', err);
    }
  }, [currentBook]);

  return (
    <BookContext.Provider
      value={{
        books,
        currentBook,
        currentBookData,
        currentProgress,
        loading,
        error,
        loadBooks,
        loadBook,
        importBook,
        deleteBook,
        updateProgress,
      }}
    >
      {children}
    </BookContext.Provider>
  );
};
