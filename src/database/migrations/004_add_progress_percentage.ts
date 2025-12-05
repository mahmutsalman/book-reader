import type Database from 'better-sqlite3';

export const migration004 = {
  version: 4,
  name: 'add_progress_percentage',
  up: (db: Database.Database) => {
    // Add progress_percentage column to reading_progress table
    // This enables stable position restoration regardless of pagination changes
    db.exec(`
      ALTER TABLE reading_progress
      ADD COLUMN progress_percentage REAL DEFAULT 0
    `);
  },
};
