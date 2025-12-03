import { getDatabase } from '../index';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import type { AppSettings } from '../../shared/types';

export class SettingsRepository {
  private get db() {
    return getDatabase();
  }

  async get<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
    const row = this.db.prepare(`
      SELECT value FROM settings WHERE key = ?
    `).get(key) as { value: string } | undefined;

    if (!row) {
      return DEFAULT_SETTINGS[key];
    }

    // Parse value based on expected type
    const defaultValue = DEFAULT_SETTINGS[key];
    if (typeof defaultValue === 'number') {
      return parseFloat(row.value) as AppSettings[K];
    }
    if (typeof defaultValue === 'boolean') {
      return (row.value === 'true') as AppSettings[K];
    }
    return row.value as AppSettings[K];
  }

  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    const stringValue = String(value);
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `).run(key, stringValue, stringValue);
  }

  async getAll(): Promise<AppSettings> {
    const rows = this.db.prepare(`
      SELECT key, value FROM settings
    `).all() as { key: string; value: string }[];

    const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      const key = row.key as keyof AppSettings;
      const defaultValue = DEFAULT_SETTINGS[key];

      if (defaultValue !== undefined) {
        if (typeof defaultValue === 'number') {
          settings[key] = parseFloat(row.value);
        } else if (typeof defaultValue === 'boolean') {
          settings[key] = row.value === 'true';
        } else {
          settings[key] = row.value;
        }
      }
    }

    return settings as AppSettings;
  }
}

export const settingsRepository = new SettingsRepository();
