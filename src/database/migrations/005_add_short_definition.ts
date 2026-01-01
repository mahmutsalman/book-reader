import type Database from 'better-sqlite3';

export const migration005 = {
  version: 5,
  name: 'add_short_definition',
  up: (db: Database.Database) => {
    // Add short_definition column to vocabulary_entries table
    // Nullable to support existing entries
    db.exec(`
      ALTER TABLE vocabulary_entries
      ADD COLUMN short_definition TEXT
    `);
  },
};
