import type Database from 'better-sqlite3';
import { migration001 } from './001_initial_schema';
import { migration002 } from './002_add_book_language';
import { migration003 } from './003_add_word_type';
import { migration004 } from './004_add_progress_percentage';
import { migration005 } from './005_add_short_definition';
import { migration006 } from './006_add_side_panel_font_family';

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
];

export function runMigrations(db: Database.Database): void {
  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get current version
  const currentVersion = db.prepare(
    'SELECT MAX(version) as version FROM migrations'
  ).get() as { version: number | null };

  const appliedVersion = currentVersion?.version || 0;
  console.log(`Current database version: ${appliedVersion}`);

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > appliedVersion) {
      console.log(`Running migration ${migration.version}: ${migration.name}`);

      db.transaction(() => {
        migration.up(db);
        db.prepare(
          'INSERT INTO migrations (version, name) VALUES (?, ?)'
        ).run(migration.version, migration.name);
      })();

      console.log(`Migration ${migration.version} completed`);
    }
  }
}
