import fs from 'fs';
import { getDatabase } from '../index';
import type { Book, BookData, BookLanguage } from '../../shared/types';
import { createWordBoundaryRegex } from '../../shared/utils/text-utils';

export class BookRepository {
  private get db() {
    return getDatabase();
  }

  async import(jsonPath: string, language: BookLanguage = 'en'): Promise<Book> {
    // Read and parse the JSON file
    const content = fs.readFileSync(jsonPath, 'utf-8');
    const bookData: BookData = JSON.parse(content);

    // Calculate totals if not present
    const totalWords = bookData.total_words ||
      bookData.pages.reduce((sum, p) => sum + p.word_count, 0);
    const totalChars = bookData.total_chars ||
      bookData.pages.reduce((sum, p) => sum + p.char_count, 0);

    // Insert book into database
    const result = this.db.prepare(`
      INSERT INTO books (title, json_path, total_pages, total_words, total_chars, language)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      bookData.title,
      jsonPath,
      bookData.total_pages,
      totalWords,
      totalChars,
      language
    );

    // Create initial reading progress
    this.db.prepare(`
      INSERT INTO reading_progress (book_id, current_page, zoom_level)
      VALUES (?, 1, 1.0)
    `).run(result.lastInsertRowid);

    return this.getById(Number(result.lastInsertRowid)) as Promise<Book>;
  }

  async getAll(): Promise<Book[]> {
    return this.db.prepare(`
      SELECT * FROM books ORDER BY updated_at DESC
    `).all() as Book[];
  }

  async getById(id: number): Promise<Book | null> {
    return this.db.prepare(`
      SELECT * FROM books WHERE id = ?
    `).get(id) as Book | null;
  }

  async getData(id: number): Promise<BookData | null> {
    const book = await this.getById(id);
    if (!book) return null;

    // Check if the JSON file exists before attempting to read
    if (!fs.existsSync(book.json_path)) {
      console.error(`Book content file not found: ${book.json_path}. The file may have been deleted.`);
      return null;
    }

    try {
      const content = fs.readFileSync(book.json_path, 'utf-8');
      return JSON.parse(content) as BookData;
    } catch (error) {
      console.error('Failed to read book data:', error);
      return null;
    }
  }

  async delete(id: number): Promise<void> {
    this.db.prepare('DELETE FROM books WHERE id = ?').run(id);
  }

  async getPage(bookId: number, pageNum: number): Promise<string> {
    const bookData = await this.getData(bookId);
    if (!bookData) return '';

    const page = bookData.pages.find(p => p.page === pageNum);
    return page?.text || '';
  }

  async searchWord(bookId: number, word: string): Promise<{ page: number; sentence: string }[]> {
    const bookData = await this.getData(bookId);
    if (!bookData) return [];

    const results: { page: number; sentence: string }[] = [];
    const wordLower = word.toLowerCase();
    const wordRegex = createWordBoundaryRegex(word, 'gi'); // Unicode-aware for Russian, etc.

    for (const page of bookData.pages) {
      if (!page.text) continue;

      // Check if word exists in page
      if (!wordRegex.test(page.text)) continue;

      // Split into sentences and find ones containing the word
      const sentences = page.text.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (sentence.toLowerCase().includes(wordLower)) {
          results.push({
            page: page.page,
            sentence: sentence.trim(),
          });
        }
      }
    }

    return results;
  }
}

export const bookRepository = new BookRepository();
