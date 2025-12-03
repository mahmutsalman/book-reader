import { getDatabase } from '../index';
import type { VocabularyEntry, CreateVocabularyEntry, VocabularyFilters, StoredWordOccurrence } from '../../shared/types';

export class VocabularyRepository {
  private get db() {
    return getDatabase();
  }

  async add(entry: CreateVocabularyEntry): Promise<VocabularyEntry> {
    // Check if word already exists for this book
    const existing = this.db.prepare(`
      SELECT * FROM vocabulary_entries
      WHERE word = ? AND (book_id = ? OR book_id IS NULL)
    `).get(entry.word.toLowerCase(), entry.book_id || null) as VocabularyEntry | undefined;

    if (existing) {
      // Update lookup count
      this.db.prepare(`
        UPDATE vocabulary_entries
        SET lookup_count = lookup_count + 1
        WHERE id = ?
      `).run(existing.id);
      return { ...existing, lookup_count: existing.lookup_count + 1 };
    }

    // Insert new entry
    const result = this.db.prepare(`
      INSERT INTO vocabulary_entries (word, book_id, meaning, ipa_pronunciation, simplified_sentence, original_sentence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.word.toLowerCase(),
      entry.book_id || null,
      entry.meaning || null,
      entry.ipa_pronunciation || null,
      entry.simplified_sentence || null,
      entry.original_sentence || null
    );

    return this.db.prepare(`
      SELECT * FROM vocabulary_entries WHERE id = ?
    `).get(result.lastInsertRowid) as VocabularyEntry;
  }

  async getAll(filters?: VocabularyFilters): Promise<VocabularyEntry[]> {
    let query = 'SELECT * FROM vocabulary_entries WHERE 1=1';
    const params: (string | number)[] = [];

    if (filters?.bookId) {
      query += ' AND book_id = ?';
      params.push(filters.bookId);
    }

    if (filters?.search) {
      query += ' AND word LIKE ?';
      params.push(`%${filters.search}%`);
    }

    const sortBy = filters?.sortBy || 'created_at';
    const sortOrder = filters?.sortOrder || 'desc';
    query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    return this.db.prepare(query).all(...params) as VocabularyEntry[];
  }

  async update(id: number, data: Partial<VocabularyEntry>): Promise<void> {
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.meaning !== undefined) {
      updates.push('meaning = ?');
      values.push(data.meaning);
    }
    if (data.ipa_pronunciation !== undefined) {
      updates.push('ipa_pronunciation = ?');
      values.push(data.ipa_pronunciation);
    }
    if (data.familiarity_score !== undefined) {
      updates.push('familiarity_score = ?');
      values.push(data.familiarity_score);
    }
    if (data.last_reviewed_at !== undefined) {
      updates.push('last_reviewed_at = ?');
      values.push(data.last_reviewed_at);
    }

    if (updates.length > 0) {
      values.push(id);
      this.db.prepare(`
        UPDATE vocabulary_entries
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...values);
    }
  }

  async delete(id: number): Promise<void> {
    this.db.prepare('DELETE FROM vocabulary_entries WHERE id = ?').run(id);
  }

  async getOccurrences(vocabularyId: number): Promise<StoredWordOccurrence[]> {
    return this.db.prepare(`
      SELECT * FROM word_occurrences WHERE vocabulary_id = ?
    `).all(vocabularyId) as StoredWordOccurrence[];
  }

  async addOccurrence(
    vocabularyId: number,
    bookId: number,
    pageNumber: number,
    sentence: string
  ): Promise<void> {
    this.db.prepare(`
      INSERT INTO word_occurrences (vocabulary_id, book_id, page_number, sentence)
      VALUES (?, ?, ?, ?)
    `).run(vocabularyId, bookId, pageNumber, sentence);
  }
}

export const vocabularyRepository = new VocabularyRepository();
