import type Database from 'better-sqlite3';

export const migration006 = {
  version: 6,
  name: 'add_side_panel_font_family',
  up: (db: Database.Database) => {
    const insertSetting = db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
    );

    insertSetting.run('side_panel_font_family', 'system-ui, sans-serif');
  },
};
