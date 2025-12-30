/**
 * TXT Import Service for BookReader.
 * Handles plain text file parsing (Project Gutenberg format) and conversion to BookData JSON format.
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { bookRepository } from '../../database/repositories';
import type { Book, BookData, BookPage, BookLanguage } from '../../shared/types';

// Internal chapter structure for parsing
interface Chapter {
  name: string;        // e.g., "CHAPTER 1. Loomings"
  text: string;        // Full chapter text
  startIndex: number;  // Position in original text
  endIndex: number;    // End position in original text
}

class TxtImportService {
  /**
   * Extract book title from Project Gutenberg header or fallback to filename.
   */
  private extractTitle(content: string, fallbackTitle: string): string {
    // Try to find title in Project Gutenberg header: "EBOOK {TITLE} ***"
    const ebookMatch = content.match(/EBOOK\s+(.+?)\s*\*\*\*/i);
    if (ebookMatch && ebookMatch[1].trim()) {
      return ebookMatch[1].trim();
    }

    // Try to find "Title:" field
    const titleMatch = content.match(/^Title:\s*(.+)$/m);
    if (titleMatch && titleMatch[1].trim()) {
      return titleMatch[1].trim();
    }

    // Fallback to filename without extension
    return fallbackTitle;
  }

  /**
   * Remove Project Gutenberg metadata headers and footers.
   */
  private removeMetadata(content: string): string {
    // Find START marker
    const startMarker = "*** START OF THE PROJECT GUTENBERG EBOOK";
    const startAltMarker = "*** START OF THIS PROJECT GUTENBERG EBOOK";

    let startIndex = content.indexOf(startMarker);
    if (startIndex === -1) {
      startIndex = content.indexOf(startAltMarker);
    }

    // Find END marker
    const endMarker = "*** END OF THE PROJECT GUTENBERG EBOOK";
    const endAltMarker = "*** END OF THIS PROJECT GUTENBERG EBOOK";

    let endIndex = content.indexOf(endMarker);
    if (endIndex === -1) {
      endIndex = content.indexOf(endAltMarker);
    }

    // Extract content between markers
    if (startIndex !== -1) {
      // Skip the START marker line and following content headers
      const afterStart = content.indexOf('\n', startIndex) + 1;
      const cleanStart = Math.max(afterStart, startIndex + startMarker.length);

      if (endIndex !== -1 && endIndex > cleanStart) {
        return content.substring(cleanStart, endIndex).trim();
      } else {
        return content.substring(cleanStart).trim();
      }
    }

    // No markers found - return entire content
    return content.trim();
  }

  /**
   * Extract chapters using multiple patterns.
   * Supports: CHAPTER X., Chapter X, PART X
   */
  private extractChapters(content: string): Chapter[] {
    const chapters: Chapter[] = [];

    // Define chapter patterns (order matters - more specific first)
    const patterns = [
      /^CHAPTER\s+([IVXLCDM\d]+)\.?\s*(.*)$/gm,  // CHAPTER X. or CHAPTER X
      /^Chapter\s+([IVXLCDM\d]+)\.?\s*(.*)$/gm,  // Chapter X (mixed case)
      /^PART\s+([IVXLCDM\d]+)\.?\s*(.*)$/gm,     // PART X
    ];

    // Find all chapter markers
    interface ChapterMarker {
      index: number;
      name: string;
      type: string;
    }

    const markers: ChapterMarker[] = [];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const number = match[1];
        const title = match[2]?.trim() || '';
        const type = match[0].startsWith('PART') ? 'PART' : 'CHAPTER';

        // Build chapter name
        let chapterName: string;
        if (type === 'PART') {
          chapterName = title ? `PART ${number}. ${title}` : `PART ${number}`;
        } else {
          chapterName = title ? `CHAPTER ${number}. ${title}` : `CHAPTER ${number}`;
        }

        markers.push({
          index: match.index,
          name: chapterName,
          type,
        });
      }
    }

    // Sort markers by position
    markers.sort((a, b) => a.index - b.index);

    // Remove duplicate markers at same position (from different patterns)
    const uniqueMarkers: ChapterMarker[] = [];
    for (let i = 0; i < markers.length; i++) {
      if (i === 0 || markers[i].index !== markers[i - 1].index) {
        uniqueMarkers.push(markers[i]);
      }
    }

    // Handle text before first chapter
    if (uniqueMarkers.length > 0 && uniqueMarkers[0].index > 0) {
      const prefaceText = content.substring(0, uniqueMarkers[0].index).trim();
      if (prefaceText.length > 100) { // Only create preface if substantial
        chapters.push({
          name: 'Introduction',
          text: prefaceText,
          startIndex: 0,
          endIndex: uniqueMarkers[0].index,
        });
      }
    }

    // Extract chapter texts
    for (let i = 0; i < uniqueMarkers.length; i++) {
      const marker = uniqueMarkers[i];
      const nextMarker = uniqueMarkers[i + 1];

      const startIndex = marker.index;
      const endIndex = nextMarker ? nextMarker.index : content.length;

      const chapterText = content.substring(startIndex, endIndex).trim();

      chapters.push({
        name: marker.name,
        text: chapterText,
        startIndex,
        endIndex,
      });
    }

    // If no chapters found, create a single chapter with all content
    if (chapters.length === 0) {
      chapters.push({
        name: 'Full Text',
        text: content.trim(),
        startIndex: 0,
        endIndex: content.length,
      });
    }

    return chapters;
  }

  /**
   * Build BookPage array from chapters.
   */
  private buildBookPages(chapters: Chapter[]): BookPage[] {
    return chapters.map((chapter, idx) => {
      const text = chapter.text;
      return {
        page: idx + 1,
        chapter: chapter.name,
        text,
        char_count: text.length,
        word_count: text.split(/\s+/).filter((w) => w.length > 0).length,
      };
    });
  }

  /**
   * Parse TXT file and convert to BookData format.
   */
  private parseTxtFile(content: string, filePath: string): BookData {
    // Normalize line endings (CRLF → LF)
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Extract title
    const fallbackTitle = path.basename(filePath, '.txt');
    const title = this.extractTitle(normalizedContent, fallbackTitle);

    // Remove Project Gutenberg metadata
    const cleanContent = this.removeMetadata(normalizedContent);

    // Extract chapters
    const chapters = this.extractChapters(cleanContent);

    // Build pages (one per chapter)
    const pages = this.buildBookPages(chapters);

    // Calculate totals
    const totalWords = pages.reduce((sum, p) => sum + p.word_count, 0);
    const totalChars = pages.reduce((sum, p) => sum + p.char_count, 0);

    // Get chapter names for chapters array
    const chapterNames = pages.map((p) => p.chapter);

    return {
      title,
      source_file: filePath,
      total_pages: pages.length,
      pages,
      chapters: chapterNames,
      total_words: totalWords,
      total_chars: totalChars,
    };
  }

  /**
   * Import a TXT file by parsing content and converting to BookData.
   * Creates a JSON file in userData directory and imports it.
   */
  async importTxt(txtPath: string, language: BookLanguage = 'en'): Promise<Book> {
    // Validate file exists
    if (!fs.existsSync(txtPath)) {
      throw new Error(`File not found: ${txtPath}`);
    }

    // Read file content
    console.log(`[TxtImportService] Reading TXT file: ${txtPath}`);
    const content = fs.readFileSync(txtPath, 'utf-8');

    if (!content || content.trim().length === 0) {
      throw new Error('TXT file is empty');
    }

    // Parse TXT to BookData
    console.log(`[TxtImportService] Parsing TXT content...`);
    const bookData = this.parseTxtFile(content, txtPath);

    console.log(`[TxtImportService] Detected ${bookData.pages.length} chapters`);

    // Create JSON file in permanent user data directory
    const booksDir = path.join(app.getPath('userData'), 'books');
    if (!fs.existsSync(booksDir)) {
      fs.mkdirSync(booksDir, { recursive: true });
    }

    const jsonFileName = `${path.basename(txtPath, '.txt')}_${Date.now()}.json`;
    const jsonPath = path.join(booksDir, jsonFileName);

    // Write BookData to JSON file
    fs.writeFileSync(jsonPath, JSON.stringify(bookData, null, 2), 'utf-8');
    console.log(`[TxtImportService] Created JSON at: ${jsonPath}`);

    // Import using existing repository
    const book = await bookRepository.import(jsonPath, language);
    console.log(`[TxtImportService] Imported book: ${book.title} (ID: ${book.id})`);

    return book;
  }
}

// Export singleton instance
export const txtImportService = new TxtImportService();
