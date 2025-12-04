import type Database from 'better-sqlite3';

export const migration002 = {
  version: 2,
  name: 'add_book_language',
  up: (db: Database.Database) => {
    // Add language column to books table with default 'en' for existing books
    db.exec(`
      ALTER TABLE books ADD COLUMN language TEXT NOT NULL DEFAULT 'en'
    `);
  },
};
