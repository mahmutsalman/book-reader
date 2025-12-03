import { getDatabase } from '../index';
import type { ReadingProgress } from '../../shared/types';

export class ProgressRepository {
  private get db() {
    return getDatabase();
  }

  async get(bookId: number): Promise<ReadingProgress | null> {
    return this.db.prepare(`
      SELECT * FROM reading_progress WHERE book_id = ?
    `).get(bookId) as ReadingProgress | null;
  }

  async update(bookId: number, data: Partial<ReadingProgress>): Promise<void> {
    const existing = await this.get(bookId);

    if (!existing) {
      // Create new progress record
      this.db.prepare(`
        INSERT INTO reading_progress (book_id, current_page, character_offset, zoom_level)
        VALUES (?, ?, ?, ?)
      `).run(
        bookId,
        data.current_page || 1,
        data.character_offset || 0,
        data.zoom_level || 1.0
      );
      return;
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: (number | string)[] = [];

    if (data.current_page !== undefined) {
      updates.push('current_page = ?');
      values.push(data.current_page);
    }
    if (data.character_offset !== undefined) {
      updates.push('character_offset = ?');
      values.push(data.character_offset);
    }
    if (data.zoom_level !== undefined) {
      updates.push('zoom_level = ?');
      values.push(data.zoom_level);
    }

    if (updates.length > 0) {
      updates.push('last_read_at = CURRENT_TIMESTAMP');
      values.push(bookId);

      this.db.prepare(`
        UPDATE reading_progress
        SET ${updates.join(', ')}
        WHERE book_id = ?
      `).run(...values);
    }
  }
}

export const progressRepository = new ProgressRepository();
