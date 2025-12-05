import type Database from 'better-sqlite3';

export const migration003 = {
  version: 3,
  name: 'add_word_type',
  up: (db: Database.Database) => {
    // Add word_type column to vocabulary_entries table
    // Default 'word' for existing entries
    db.exec(`
      ALTER TABLE vocabulary_entries
      ADD COLUMN word_type TEXT NOT NULL DEFAULT 'word'
    `);

    // Create index for filtering by word_type
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vocabulary_word_type
      ON vocabulary_entries(word_type)
    `);

    // Composite index for efficient book + type filtering
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vocabulary_book_type
      ON vocabulary_entries(book_id, word_type)
    `);
  },
};
