/**
 * EPUB Import Service for BookReader.
 * Handles EPUB file parsing and conversion to BookData JSON format.
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import EPub from 'epub';
import { bookRepository } from '../../database/repositories';
import type { Book, BookData, BookPage, BookLanguage } from '../../shared/types';

class EpubImportService {
  /**
   * Convert HTML content to plain text while preserving paragraphs.
   */
  private htmlToPlainText(html: string): string {
    // Remove script/style tags entirely
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Convert block elements to newlines
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');

    // Remove all HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode common HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&apos;/g, "'");
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)));

    // Clean up excessive whitespace
    text = text.replace(/[ \t]+/g, ' ');  // Multiple spaces/tabs to single space
    text = text.replace(/\n{3,}/g, '\n\n');  // Max 2 newlines
    text = text.replace(/^\s+/gm, '');  // Remove leading whitespace from lines

    return text.trim();
  }

  /**
   * Extract chapters from EPUB and convert to BookPage array.
   */
  private async extractChapters(epub: EPub): Promise<BookPage[]> {
    const pages: BookPage[] = [];
    const chapters = epub.flow;

    if (!chapters || chapters.length === 0) {
      throw new Error('No chapters found in EPUB file');
    }

    console.log(`[EpubImportService] Found ${chapters.length} chapters`);

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];

      // Get chapter content (returns HTML)
      const html = await new Promise<string>((resolve, _reject) => {
        epub.getChapter(chapter.id, (error, text) => {
          if (error) {
            console.warn(`[EpubImportService] Error getting chapter ${i + 1}:`, error);
            resolve(''); // Return empty string on error
          } else {
            resolve(text || '');
          }
        });
      });

      // Convert HTML to plain text
      const plainText = this.htmlToPlainText(html);

      // Skip empty chapters
      if (!plainText || plainText.trim().length === 0) {
        console.log(`[EpubImportService] Skipping empty chapter ${i + 1}`);
        continue;
      }

      // Build chapter name
      const chapterName = chapter.title?.trim() || `Chapter ${i + 1}`;

      // Calculate word count
      const words = plainText.split(/\s+/).filter(w => w.length > 0);

      // Create BookPage
      pages.push({
        page: pages.length + 1, // Use continuous page numbers (not chapter index)
        chapter: chapterName,
        text: plainText,
        char_count: plainText.length,
        word_count: words.length,
      });

      // Yield event loop periodically for large books
      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    if (pages.length === 0) {
      throw new Error('No readable content found in EPUB file');
    }

    return pages;
  }

  /**
   * Parse EPUB file and convert to BookData format.
   */
  private async parseEpubFile(epubPath: string): Promise<BookData> {
    return new Promise((resolve, reject) => {
      const epub = new EPub(epubPath);

      epub.on('error', (error) => {
        reject(new Error(`EPUB parsing failed: ${error.message || error}`));
      });

      epub.on('end', async () => {
        try {
          console.log('[EpubImportService] EPUB parsing complete');

          // Extract metadata
          const title = epub.metadata?.title || path.basename(epubPath, '.epub');

          console.log(`[EpubImportService] Title: ${title}`);

          // Extract chapters
          const pages = await this.extractChapters(epub);

          // Calculate totals
          const totalWords = pages.reduce((sum, p) => sum + p.word_count, 0);
          const totalChars = pages.reduce((sum, p) => sum + p.char_count, 0);
          const chapterNames = [...new Set(pages.map(p => p.chapter))]; // Unique chapter names

          console.log(`[EpubImportService] Extracted ${pages.length} pages, ${totalWords} words`);

          resolve({
            title,
            source_file: epubPath,
            total_pages: pages.length,
            pages,
            chapters: chapterNames,
            total_words: totalWords,
            total_chars: totalChars,
          });
        } catch (error) {
          reject(error);
        }
      });

      // Start parsing
      try {
        epub.parse();
      } catch (error) {
        reject(new Error(`Failed to parse EPUB file: ${error instanceof Error ? error.message : error}`));
      }
    });
  }

  /**
   * Import an EPUB file by parsing content and converting to BookData.
   */
  async importEpub(epubPath: string, language: BookLanguage = 'en'): Promise<Book> {
    // Validate file exists
    if (!fs.existsSync(epubPath)) {
      throw new Error(`File not found: ${epubPath}`);
    }

    console.log(`[EpubImportService] Reading EPUB file: ${epubPath}`);

    // Parse EPUB to BookData
    const bookData = await this.parseEpubFile(epubPath);
    console.log(`[EpubImportService] Detected ${bookData.pages.length} pages in ${bookData.chapters?.length || 0} chapters`);

    // Create JSON file in userData/books directory
    const booksDir = path.join(app.getPath('userData'), 'books');
    if (!fs.existsSync(booksDir)) {
      fs.mkdirSync(booksDir, { recursive: true });
    }

    const jsonFileName = `${path.basename(epubPath, '.epub')}_${Date.now()}.json`;
    const jsonPath = path.join(booksDir, jsonFileName);

    // Write BookData to JSON file
    fs.writeFileSync(jsonPath, JSON.stringify(bookData, null, 2), 'utf-8');
    console.log(`[EpubImportService] Created JSON at: ${jsonPath}`);

    // Import using repository
    const book = await bookRepository.import(jsonPath, language);
    console.log(`[EpubImportService] Imported book: ${book.title} (ID: ${book.id})`);

    return book;
  }
}

export const epubImportService = new EpubImportService();
