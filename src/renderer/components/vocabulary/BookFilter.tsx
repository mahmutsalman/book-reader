import React from 'react';
import type { Book } from '../../../shared/types';
import { useReaderTheme } from '../../hooks/useReaderTheme';

interface BookFilterProps {
  books: Book[];
  selectedBookId: number | null;
  onBookChange: (bookId: number | null) => void;
}

const BookFilter: React.FC<BookFilterProps> = ({ books, selectedBookId, onBookChange }) => {
  const theme = useReaderTheme();

  return (
    <select
      value={selectedBookId ?? ''}
      onChange={(e) => onBookChange(e.target.value ? Number(e.target.value) : null)}
      className="px-3 py-2 border rounded-lg focus:outline-none text-sm max-w-[180px] truncate"
      style={{
        backgroundColor: theme.panel,
        color: theme.text,
        borderColor: theme.border,
      }}
      onFocus={(event) => {
        event.currentTarget.style.boxShadow = `0 0 0 2px ${theme.accent}40`;
      }}
      onBlur={(event) => {
        event.currentTarget.style.boxShadow = 'none';
      }}
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
