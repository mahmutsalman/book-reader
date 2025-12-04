import type Database from 'better-sqlite3';

export const migration001 = {
  version: 1,
  name: 'initial_schema',
  up: (db: Database.Database) => {
    // Books table
    db.exec(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        json_path TEXT NOT NULL UNIQUE,
        total_pages INTEGER NOT NULL,
        total_words INTEGER DEFAULT 0,
        total_chars INTEGER DEFAULT 0,
        cover_image TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Reading progress table
    db.exec(`
      CREATE TABLE IF NOT EXISTS reading_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL UNIQUE,
        current_page INTEGER DEFAULT 1,
        character_offset INTEGER DEFAULT 0,
        zoom_level REAL DEFAULT 1.0,
        last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      )
    `);

    // Vocabulary entries table
    db.exec(`
      CREATE TABLE IF NOT EXISTS vocabulary_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL,
        book_id INTEGER,
        meaning TEXT,
        ipa_pronunciation TEXT,
        simplified_sentence TEXT,
        original_sentence TEXT,
        lookup_count INTEGER DEFAULT 1,
        familiarity_score INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_reviewed_at DATETIME,
        next_review_at DATETIME,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL
      )
    `);

    // Word occurrences table
    db.exec(`
      CREATE TABLE IF NOT EXISTS word_occurrences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vocabulary_id INTEGER NOT NULL,
        book_id INTEGER NOT NULL,
        page_number INTEGER NOT NULL,
        sentence TEXT NOT NULL,
        char_offset INTEGER,
        FOREIGN KEY (vocabulary_id) REFERENCES vocabulary_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      )
    `);

    // Settings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tatoeba sentences table (optional feature)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tatoeba_sentences (
        id INTEGER PRIMARY KEY,
        language TEXT NOT NULL,
        sentence TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tatoeba translations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tatoeba_translations (
        sentence_id INTEGER NOT NULL,
        translation_id INTEGER NOT NULL,
        PRIMARY KEY (sentence_id, translation_id),
        FOREIGN KEY (sentence_id) REFERENCES tatoeba_sentences(id) ON DELETE CASCADE,
        FOREIGN KEY (translation_id) REFERENCES tatoeba_sentences(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vocabulary_word ON vocabulary_entries(word);
      CREATE INDEX IF NOT EXISTS idx_vocabulary_book ON vocabulary_entries(book_id);
      CREATE INDEX IF NOT EXISTS idx_occurrences_book_page ON word_occurrences(book_id, page_number);
      CREATE INDEX IF NOT EXISTS idx_tatoeba_language ON tatoeba_sentences(language);
    `);

    // Insert default settings
    const insertSetting = db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
    );

    insertSetting.run('lm_studio_url', 'http://localhost:1234');
    insertSetting.run('lm_studio_model', 'default');
    insertSetting.run('tatoeba_enabled', 'false');
    insertSetting.run('tatoeba_language', 'en');
    insertSetting.run('default_zoom', '1.0');
    insertSetting.run('theme', 'light');
    insertSetting.run('font_family', 'Georgia, serif');
    insertSetting.run('line_height', '1.8');
    insertSetting.run('page_margin', '40');
    // Pre-Study Notes settings
    insertSetting.run('pre_study_view_count', '10');
    insertSetting.run('pre_study_sentence_limit', '0');
  },
};
