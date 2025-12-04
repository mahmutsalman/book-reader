/**
 * PDF Import Service for BookReader.
 * Handles PDF text extraction and conversion to BookData JSON format.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pythonManager } from './python-manager.service';
import { bookRepository } from '../../database/repositories';
import type { Book, BookData, BookPage, BookLanguage } from '../../shared/types';

const PDF_EXTRACT_TIMEOUT = 300000; // 5 minutes for large PDFs

// Types for PDF extraction API response
interface PdfPageResult {
  page_num: number;
  text: string;
  extraction_method: string;
  confidence: number | null;
}

interface PdfMetadata {
  title: string;
  author: string | null;
  page_count: number;
}

interface PdfExtractResponse {
  success: boolean;
  pdf_type: string;
  pages: PdfPageResult[];
  metadata: PdfMetadata | null;
  error: string | null;
}

interface PdfStatusResponse {
  available: boolean;
  pdf_available: boolean;
  ocr_available: boolean;
  tesseract_path: string | null;
  error: string | null;
}

class PdfImportService {
  /**
   * Check if PDF extraction is available.
   */
  async checkStatus(): Promise<PdfStatusResponse> {
    if (!pythonManager.ready) {
      return {
        available: false,
        pdf_available: false,
        ocr_available: false,
        tesseract_path: null,
        error: 'Python server is not ready',
      };
    }

    try {
      const response = await fetch(`${pythonManager.baseUrl}/api/pdf/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          available: false,
          pdf_available: false,
          ocr_available: false,
          tesseract_path: null,
          error: `Server error: ${response.status}`,
        };
      }

      return (await response.json()) as PdfStatusResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PdfImportService] Status check error:', message);
      return {
        available: false,
        pdf_available: false,
        ocr_available: false,
        tesseract_path: null,
        error: message,
      };
    }
  }

  /**
   * Extract text from a PDF file using the Python server.
   */
  async extractPdf(pdfPath: string, language: string, useOcr = true): Promise<PdfExtractResponse> {
    if (!pythonManager.ready) {
      return {
        success: false,
        pdf_type: '',
        pages: [],
        metadata: null,
        error: 'Python server is not ready',
      };
    }

    try {
      console.log(`[PdfImportService] Extracting PDF: ${pdfPath}`);
      const response = await fetch(`${pythonManager.baseUrl}/api/pdf/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdf_path: pdfPath,
          language,
          use_ocr: useOcr,
        }),
        signal: AbortSignal.timeout(PDF_EXTRACT_TIMEOUT),
      });

      if (!response.ok) {
        return {
          success: false,
          pdf_type: '',
          pages: [],
          metadata: null,
          error: `Server error: ${response.status}`,
        };
      }

      return (await response.json()) as PdfExtractResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PdfImportService] Extract error:', message);
      return {
        success: false,
        pdf_type: '',
        pages: [],
        metadata: null,
        error: message,
      };
    }
  }

  /**
   * Convert extracted PDF pages to BookData format.
   */
  private convertToBookData(
    extractResult: PdfExtractResponse,
    pdfPath: string
  ): BookData {
    const title = extractResult.metadata?.title || path.basename(pdfPath, '.pdf');
    const chapterName = title; // Use title as the single chapter name

    const pages: BookPage[] = extractResult.pages.map((page) => {
      const text = page.text || '';
      return {
        page: page.page_num,
        chapter: chapterName,
        text: text,
        char_count: text.length,
        word_count: text.split(/\s+/).filter((w) => w.length > 0).length,
      };
    });

    const totalWords = pages.reduce((sum, p) => sum + p.word_count, 0);
    const totalChars = pages.reduce((sum, p) => sum + p.char_count, 0);

    return {
      title,
      source_file: pdfPath,
      total_pages: pages.length,
      pages,
      chapters: [chapterName],
      total_words: totalWords,
      total_chars: totalChars,
    };
  }

  /**
   * Import a PDF file by extracting text and converting to BookData.
   * Creates a JSON file in a temp directory and imports it.
   */
  async importPdf(pdfPath: string, language: BookLanguage = 'en', useOcr = true): Promise<Book> {
    // Extract text from PDF
    const extractResult = await this.extractPdf(pdfPath, language, useOcr);

    if (!extractResult.success) {
      throw new Error(extractResult.error || 'PDF extraction failed');
    }

    if (extractResult.pages.length === 0) {
      throw new Error('No text could be extracted from the PDF');
    }

    // Convert to BookData format
    const bookData = this.convertToBookData(extractResult, pdfPath);

    // Create temp JSON file
    const tempDir = path.join(os.tmpdir(), 'bookreader-pdf-imports');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const jsonFileName = `${path.basename(pdfPath, '.pdf')}_${Date.now()}.json`;
    const jsonPath = path.join(tempDir, jsonFileName);

    // Write BookData to JSON file
    fs.writeFileSync(jsonPath, JSON.stringify(bookData, null, 2), 'utf-8');
    console.log(`[PdfImportService] Created JSON at: ${jsonPath}`);

    // Import using existing repository
    const book = await bookRepository.import(jsonPath, language);
    console.log(`[PdfImportService] Imported book: ${book.title} (ID: ${book.id})`);

    return book;
  }
}

// Export singleton instance
export const pdfImportService = new PdfImportService();
