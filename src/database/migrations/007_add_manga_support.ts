import type Database from 'better-sqlite3';

export const migration007 = {
  version: 7,
  name: 'add_manga_support',
  up: (db: Database.Database) => {
    // Add type column to books table with default 'text' for backward compatibility
    db.exec(`
      ALTER TABLE books ADD COLUMN type TEXT DEFAULT 'text' CHECK(type IN ('text', 'manga'));
    `);

    // Create index for filtering books by type
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_books_type ON books(type);
    `);

    console.log('Added manga support: type column and index created');
  },
};
