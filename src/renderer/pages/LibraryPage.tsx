import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../context/BookContext';
import type { Book } from '../../shared/types';

const LibraryPage: React.FC = () => {
  const { books, loading, error, loadBooks, importBook, deleteBook } = useBooks();
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const handleImportBook = async () => {
    if (!window.electronAPI) {
      alert('Electron API not available');
      return;
    }

    try {
      setImporting(true);
      const filePath = await window.electronAPI.dialog.openFile({
        filters: [{ name: 'JSON Books', extensions: ['json'] }],
      });

      if (filePath) {
        await importBook(filePath);
      }
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import book');
    } finally {
      setImporting(false);
    }
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
      <div
        className="h-full flex items-center justify-center"
        style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div className="text-gray-500" style={{ color: '#6b7280' }}>Loading books...</div>
      </div>
    );
  }

  return (
    <div className="p-6" style={{ padding: '24px' }}>
      <div
        className="flex items-center justify-between mb-6"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}
      >
        <h2 className="text-2xl font-bold text-gray-800" style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937' }}>Your Library</h2>
        <button
          onClick={handleImportBook}
          disabled={importing}
          className="btn-primary flex items-center gap-2"
          style={{
            padding: '8px 16px',
            backgroundColor: '#0284c7',
            color: 'white',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 500,
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
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {books.length === 0 ? (
        <div className="text-center py-12" style={{ textAlign: 'center', paddingTop: '48px', paddingBottom: '48px' }}>
          <div className="text-6xl mb-4" style={{ fontSize: '60px', marginBottom: '16px' }}>📖</div>
          <h3 className="text-xl font-medium text-gray-700 mb-2" style={{ fontSize: '20px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
            No books yet
          </h3>
          <p className="text-gray-500 mb-4" style={{ color: '#6b7280', marginBottom: '16px' }}>
            Import a JSON book to start reading
          </p>
          <button
            onClick={handleImportBook}
            className="btn-primary"
            style={{
              padding: '8px 16px',
              backgroundColor: '#0284c7',
              color: 'white',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Import Your First Book
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {books.map((book) => (
            <div
              key={book.id}
              onClick={() => handleOpenBook(book)}
              className="card cursor-pointer hover:shadow-md transition-shadow group"
            >
              <div className="aspect-[3/4] bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg mb-4 flex items-center justify-center">
                <span className="text-5xl">📕</span>
              </div>
              <h3 className="font-medium text-gray-800 line-clamp-2 mb-2">
                {book.title}
              </h3>
              <p className="text-sm text-gray-500">
                {book.total_pages} pages
              </p>
              <button
                onClick={(e) => handleDeleteBook(e, book.id)}
                className="mt-3 text-sm text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LibraryPage;
