import React from 'react';
import type { Book } from '../../../shared/types';

interface BookFilterProps {
  books: Book[];
  selectedBookId: number | null;
  onBookChange: (bookId: number | null) => void;
}

const BookFilter: React.FC<BookFilterProps> = ({ books, selectedBookId, onBookChange }) => {
  return (
    <select
      value={selectedBookId ?? ''}
      onChange={(e) => onBookChange(e.target.value ? Number(e.target.value) : null)}
      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                 bg-white dark:bg-gray-700 text-gray-900 dark:text-cream-100
                 focus:outline-none focus:ring-2 focus:ring-primary-500
                 text-sm"
    >
      <option value="">All Books</option>
      {books.map(book => (
        <option key={book.id} value={book.id}>
          {book.title}
        </option>
      ))}
    </select>
  );
};

export default BookFilter;
