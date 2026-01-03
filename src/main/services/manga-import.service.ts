/**
 * Manga Import Service for BookReader.
 * Handles CBZ/CBR file extraction, OCR processing, and conversion to MangaBookData format.
 *
 * Required packages (install with: npm install yauzl node-unrar-js xml2js uuid @types/yauzl @types/uuid):
 * - yauzl: CBZ (ZIP) extraction
 * - node-unrar-js: CBR (RAR) extraction
 * - xml2js: ComicInfo.xml parsing
 * - uuid: Unique manga ID generation
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { promisify } from 'util';
import yauzl from 'yauzl';
import { createExtractorFromFile } from 'node-unrar-js/esm';
import { parseString as parseXml } from 'xml2js';
import { v4 as uuidv4 } from 'uuid';
import { bookRepository } from '../../database/repositories';
import { pythonManager } from './python-manager.service';
import type { Book, BookData, BookLanguage, MangaPage, OCRTextRegion } from '../../shared/types';

const parseXmlPromise = promisify(parseXml);

interface ComicInfo {
  Title?: string;
  Series?: string;
  Number?: string;
  PageCount?: string;
  Summary?: string;
}

class MangaImportService {
  constructor() {
    // Python manager is already a singleton, imported above
  }

  /**
   * Parse ComicInfo.xml to extract metadata.
   */
  private async parseComicInfo(xmlContent: string): Promise<ComicInfo> {
    try {
      const result = await parseXmlPromise(xmlContent);
      const comicInfo = result?.ComicInfo || {};

      return {
        Title: comicInfo.Title?.[0],
        Series: comicInfo.Series?.[0],
        Number: comicInfo.Number?.[0],
        PageCount: comicInfo.PageCount?.[0],
        Summary: comicInfo.Summary?.[0],
      };
    } catch (error) {
      console.warn('[MangaImportService] Failed to parse ComicInfo.xml:', error);
      return {};
    }
  }

  /**
   * Extract title from ComicInfo metadata or filename.
   */
  private extractTitle(comicInfo: ComicInfo, filename: string): string {
    if (comicInfo.Title) {
      return comicInfo.Title;
    }

    if (comicInfo.Series && comicInfo.Number) {
      return `${comicInfo.Series} #${comicInfo.Number}`;
    }

    // Fallback: clean up filename
    const baseName = path.basename(filename, path.extname(filename));
    return baseName
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract CBZ (ZIP) archive.
   */
  private async extractCBZ(cbzPath: string, outputDir: string): Promise<{ images: string[]; comicInfo?: ComicInfo }> {
    return new Promise((resolve, reject) => {
      const images: string[] = [];
      let comicInfoXml: string | null = null;

      yauzl.open(cbzPath, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) {
          return reject(new Error(`Failed to open CBZ file: ${err?.message || 'Unknown error'}`));
        }

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          const fileName = entry.fileName;

          // Extract ComicInfo.xml
          if (fileName.toLowerCase() === 'comicinfo.xml') {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                console.warn('[MangaImportService] Failed to read ComicInfo.xml:', err);
                zipfile.readEntry();
                return;
              }

              const chunks: Buffer[] = [];
              readStream.on('data', (chunk) => chunks.push(chunk));
              readStream.on('end', () => {
                comicInfoXml = Buffer.concat(chunks).toString('utf-8');
                zipfile.readEntry();
              });
            });
            return;
          }

          // Extract image files
          const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
          const ext = path.extname(fileName).toLowerCase();

          if (imageExtensions.includes(ext) && !fileName.includes('__MACOSX')) {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                console.warn(`[MangaImportService] Failed to extract ${fileName}:`, err);
                zipfile.readEntry();
                return;
              }

              const outputPath = path.join(outputDir, path.basename(fileName));
              const writeStream = fs.createWriteStream(outputPath);

              readStream.pipe(writeStream);
              writeStream.on('finish', () => {
                images.push(outputPath);
                zipfile.readEntry();
              });
              writeStream.on('error', (err) => {
                console.error(`[MangaImportService] Failed to write ${fileName}:`, err);
                zipfile.readEntry();
              });
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', async () => {
          // Sort images naturally (page_001.jpg, page_002.jpg, etc.)
          images.sort((a, b) => {
            const aName = path.basename(a);
            const bName = path.basename(b);
            return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
          });

          let comicInfo: ComicInfo | undefined;
          if (comicInfoXml) {
            comicInfo = await this.parseComicInfo(comicInfoXml);
          }

          resolve({ images, comicInfo });
        });

        zipfile.on('error', (err) => {
          reject(new Error(`CBZ extraction failed: ${err.message}`));
        });
      });
    });
  }

  /**
   * Extract CBR (RAR) archive.
   */
  private async extractCBR(cbrPath: string, outputDir: string): Promise<{ images: string[]; comicInfo?: ComicInfo }> {
    const images: string[] = [];
    let comicInfoXml: string | null = null;

    try {
      const extractor = await createExtractorFromFile({ filepath: cbrPath, targetPath: outputDir });
      const extracted = extractor.extract();
      const files = [...extracted.files];

      for (const file of files) {
        const fileName = file.fileHeader.name;

        // Extract ComicInfo.xml
        if (fileName.toLowerCase() === 'comicinfo.xml') {
          comicInfoXml = file.extraction?.toString('utf-8') || null;
          continue;
        }

        // Extract image files
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
        const ext = path.extname(fileName).toLowerCase();

        if (imageExtensions.includes(ext) && file.extraction) {
          const outputPath = path.join(outputDir, path.basename(fileName));
          fs.writeFileSync(outputPath, file.extraction);
          images.push(outputPath);
        }
      }

      // Sort images naturally
      images.sort((a, b) => {
        const aName = path.basename(a);
        const bName = path.basename(b);
        return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
      });

      let comicInfo: ComicInfo | undefined;
      if (comicInfoXml) {
        comicInfo = await this.parseComicInfo(comicInfoXml);
      }

      return { images, comicInfo };
    } catch (error) {
      throw new Error(`CBR extraction failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Perform OCR on a single manga page image.
   */
  private async performOCR(imagePath: string, language: BookLanguage, ocrEngine = 'paddleocr'): Promise<OCRTextRegion[]> {
    try {
      console.log(`[MangaImportService] Performing OCR on: ${path.basename(imagePath)} (engine=${ocrEngine})`);

      // Check if Python server is ready
      if (!pythonManager.ready) {
        console.warn('[MangaImportService] Python server not ready, skipping OCR');
        return [];
      }

      // Call Python backend OCR endpoint
      const response = await fetch(`${pythonManager.baseUrl}/api/manga/extract-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_path: imagePath,
          language: language,
          ocr_engine: ocrEngine,
        }),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`OCR request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { success: boolean; regions?: OCRTextRegion[]; error?: string };

      if (!data.success) {
        throw new Error(data.error || 'OCR failed');
      }

      return data.regions || [];
    } catch (error) {
      console.error(`[MangaImportService] OCR failed for ${path.basename(imagePath)}:`, error);
      return []; // Return empty array on failure, allow partial import
    }
  }

  /**
   * Perform OCR on a specific region of a manga page image.
   */
  async ocrPartialRegion(
    imagePath: string,
    region: { x: number; y: number; width: number; height: number },
    language: BookLanguage = 'en',
    ocrEngine = 'paddleocr'
  ): Promise<{
    regions: OCRTextRegion[];
    metadata?: any;
  }> {
    try {
      if (!pythonManager.ready) {
        console.warn('[MangaImportService] Python server not ready, skipping partial OCR');
        throw new Error('Python server not ready');
      }

      const absolutePath = path.isAbsolute(imagePath)
        ? imagePath
        : path.join(app.getPath('userData'), imagePath);

      const response = await fetch(`${pythonManager.baseUrl}/api/manga/extract-text-region`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_path: absolutePath,
          region: [region.x, region.y, region.width, region.height],
          language,
          ocr_engine: ocrEngine,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Partial OCR request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { success: boolean; regions?: OCRTextRegion[]; metadata?: any; error?: string };

      if (!data.success) {
        throw new Error(data.error || 'Partial OCR failed');
      }

      return {
        regions: data.regions || [],
        metadata: data.metadata,
      };
    } catch (error) {
      console.error('[MangaImportService] Partial OCR failed:', error);
      throw error;
    }
  }

  /**
   * Batch OCR processing with progress tracking.
   */
  private async batchOCR(
    imagePaths: string[],
    language: BookLanguage,
    ocrEngine: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, OCRTextRegion[]>> {
    const ocrResults = new Map<string, OCRTextRegion[]>();
    const batchSize = 10; // Process 10 images at a time
    const total = imagePaths.length;

    console.log(`[MangaImportService] Starting OCR for ${total} pages (batch size: ${batchSize})`);

    for (let i = 0; i < imagePaths.length; i += batchSize) {
      const batch = imagePaths.slice(i, i + batchSize);

      // Process batch in parallel
      const batchPromises = batch.map(async (imagePath) => {
        const regions = await this.performOCR(imagePath, language, ocrEngine);
        ocrResults.set(imagePath, regions);
      });

      await Promise.all(batchPromises);

      // Report progress
      const current = Math.min(i + batchSize, total);
      console.log(`[MangaImportService] OCR progress: ${current}/${total}`);
      onProgress?.(current, total);

      // Yield event loop
      await new Promise(resolve => setImmediate(resolve));
    }

    console.log(`[MangaImportService] OCR completed for ${total} pages`);
    return ocrResults;
  }

  /**
   * Build MangaPage array from images and OCR results.
   */
  private buildMangaPages(
    imagePaths: string[],
    ocrResults: Map<string, OCRTextRegion[]>,
    mangaId: string
  ): MangaPage[] {
    const pages: MangaPage[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      const regions = ocrResults.get(imagePath) || [];

      // Concatenate OCR text for search/analysis
      const text = regions.map(r => r.text).join(' ');
      const words = text.split(/\s+/).filter(w => w.length > 0);

      // Relative path for portability
      const relativePath = path.join('manga', mangaId, 'images', path.basename(imagePath));

      pages.push({
        page: i + 1,
        chapter: `Page ${i + 1}`, // Simple page-based chapters for now
        text: text,
        char_count: text.length,
        word_count: words.length,
        image_path: relativePath,
        ocr_regions: regions,
        has_text: regions.length > 0,
      });
    }

    return pages;
  }

  /**
   * Import a manga file (CBZ or CBR).
   */
  async importManga(
    mangaPath: string,
    language: BookLanguage = 'en',
    ocrEngine = 'paddleocr',
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<Book> {
    // Validate file exists
    if (!fs.existsSync(mangaPath)) {
      throw new Error(`File not found: ${mangaPath}`);
    }

    const ext = path.extname(mangaPath).toLowerCase();
    if (ext !== '.cbz' && ext !== '.cbr') {
      throw new Error(`Unsupported file format: ${ext}. Only .cbz and .cbr are supported.`);
    }

    console.log(`[MangaImportService] Importing manga: ${mangaPath}`);

    // Generate unique manga ID
    const mangaId = uuidv4();

    // Create manga directory structure
    const mangaDir = path.join(app.getPath('userData'), 'manga', mangaId);
    const imagesDir = path.join(mangaDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });

    onProgress?.(0, 100, 'Extracting archive...');

    // Extract archive
    let images: string[];
    let comicInfo: ComicInfo | undefined;

    if (ext === '.cbz') {
      const result = await this.extractCBZ(mangaPath, imagesDir);
      images = result.images;
      comicInfo = result.comicInfo;
    } else {
      const result = await this.extractCBR(mangaPath, imagesDir);
      images = result.images;
      comicInfo = result.comicInfo;
    }

    if (images.length === 0) {
      throw new Error('No images found in archive');
    }

    console.log(`[MangaImportService] Extracted ${images.length} images`);

    // Extract title
    const title = this.extractTitle(comicInfo || {}, mangaPath);

    // No OCR during import - skip batch OCR
    onProgress?.(50, 100, 'Processing images...');

    const ocrResults = new Map<string, OCRTextRegion[]>(); // Empty - no OCR during import

    // Build MangaBookData
    const pages = this.buildMangaPages(images, ocrResults, mangaId);

    const totalWords = pages.reduce((sum, p) => sum + p.word_count, 0);
    const totalChars = pages.reduce((sum, p) => sum + p.char_count, 0);

    const bookData: BookData = {
      type: 'manga',
      title,
      source_file: mangaPath,
      total_pages: pages.length,
      pages,
      total_words: totalWords,
      total_chars: totalChars,
    };

    onProgress?.(90, 100, 'Saving manga data...');

    // Save MangaBookData to JSON
    const jsonPath = path.join(mangaDir, 'manga_data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(bookData, null, 2), 'utf-8');
    console.log(`[MangaImportService] Created JSON at: ${jsonPath}`);

    // Also save to books directory for compatibility
    const booksDir = path.join(app.getPath('userData'), 'books');
    if (!fs.existsSync(booksDir)) {
      fs.mkdirSync(booksDir, { recursive: true });
    }

    const jsonFileName = `${path.basename(mangaPath, ext)}_${Date.now()}.json`;
    const compatJsonPath = path.join(booksDir, jsonFileName);
    fs.writeFileSync(compatJsonPath, JSON.stringify(bookData, null, 2), 'utf-8');

    onProgress?.(95, 100, 'Importing to database...');

    // Import using repository
    const book = await bookRepository.import(compatJsonPath, language);
    console.log(`[MangaImportService] Imported manga: ${book.title} (ID: ${book.id})`);

    onProgress?.(100, 100, 'Complete!');

    return book;
  }

  /**
   * Import manga from a folder of images.
   * Uses folder name as book title.
   * No OCR processing during import - all OCR done on-demand during reading.
   */
  async importFolder(
    folderPath: string,
    language: BookLanguage = 'en',
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<Book> {
    // Validate folder exists
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Folder not found: ${folderPath}`);
    }

    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a folder: ${folderPath}`);
    }

    console.log(`[MangaImportService] Importing manga folder: ${folderPath}`);

    // Generate unique manga ID
    const mangaId = uuidv4();

    // Create manga directory structure
    const mangaDir = path.join(app.getPath('userData'), 'manga', mangaId);
    const imagesDir = path.join(mangaDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });

    onProgress?.(0, 100, 'Scanning folder...');

    // Read all image files from folder
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
    const allFiles = fs.readdirSync(folderPath);
    const imageFiles = allFiles.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    if (imageFiles.length === 0) {
      throw new Error('No image files found in folder');
    }

    // Sort images naturally (page_001.jpg, page_002.jpg, etc.)
    imageFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    console.log(`[MangaImportService] Found ${imageFiles.length} images`);

    // Copy images to manga directory
    onProgress?.(10, 100, `Copying images (0/${imageFiles.length})...`);

    const copiedImages: string[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const sourceFile = path.join(folderPath, imageFiles[i]);
      const destFile = path.join(imagesDir, imageFiles[i]);

      fs.copyFileSync(sourceFile, destFile);
      copiedImages.push(destFile);

      // Report progress
      if ((i + 1) % 10 === 0 || i === imageFiles.length - 1) {
        const progressPercent = 10 + Math.floor(((i + 1) / imageFiles.length) * 80);
        onProgress?.(progressPercent, 100, `Copying images (${i + 1}/${imageFiles.length})...`);
      }
    }

    // Extract title from folder name
    const folderName = path.basename(folderPath);
    const title = folderName
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Build MangaBookData with empty OCR results
    const ocrResults = new Map<string, OCRTextRegion[]>(); // No OCR during import
    const pages = this.buildMangaPages(copiedImages, ocrResults, mangaId);

    const bookData: BookData = {
      type: 'manga',
      title,
      source_file: folderPath,
      total_pages: pages.length,
      pages,
      total_words: 0, // Will be updated as OCR happens on-demand
      total_chars: 0,
    };

    onProgress?.(90, 100, 'Saving manga data...');

    // Save MangaBookData to JSON
    const jsonPath = path.join(mangaDir, 'manga_data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(bookData, null, 2), 'utf-8');
    console.log(`[MangaImportService] Created JSON at: ${jsonPath}`);

    // Also save to books directory for compatibility
    const booksDir = path.join(app.getPath('userData'), 'books');
    if (!fs.existsSync(booksDir)) {
      fs.mkdirSync(booksDir, { recursive: true });
    }

    const jsonFileName = `${folderName}_${Date.now()}.json`;
    const compatJsonPath = path.join(booksDir, jsonFileName);
    fs.writeFileSync(compatJsonPath, JSON.stringify(bookData, null, 2), 'utf-8');

    onProgress?.(95, 100, 'Importing to database...');

    // Import using repository
    const book = await bookRepository.import(compatJsonPath, language);
    console.log(`[MangaImportService] Imported folder manga: ${book.title} (ID: ${book.id})`);

    onProgress?.(100, 100, 'Complete!');

    return book;
  }

  /**
   * Import a single PNG image as a one-page manga for testing.
   */
  async importPng(
    pngPath: string,
    language: BookLanguage = 'en',
    ocrEngine = 'paddleocr'
  ): Promise<Book> {
    const mangaId = uuidv4();
    const filename = path.basename(pngPath, path.extname(pngPath));
    const title = `Test: ${filename}`;

    console.log(`[MangaImportService] Importing single PNG: ${pngPath}`);

    // Create manga directory structure
    const mangaDir = path.join(app.getPath('userData'), 'manga', mangaId);
    const imagesDir = path.join(mangaDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });

    // Copy PNG to images directory
    const imageName = 'page_001.png';
    const destPath = path.join(imagesDir, imageName);
    fs.copyFileSync(pngPath, destPath);

    console.log(`[MangaImportService] Copied PNG to: ${destPath}`);

    // Run OCR on the single image
    console.log(`[MangaImportService] Running OCR on PNG: ${destPath}`);
    const ocrRegions = await this.performOCR(destPath, language, ocrEngine);

    console.log(`[MangaImportService] ✅ OCR extracted ${ocrRegions.length} text regions`);

    if (ocrRegions.length === 0) {
      console.warn(`[MangaImportService] ⚠️ WARNING: No text regions extracted from PNG.`);
    }

    // Build relative image path
    const relativeImagePath = `manga/${mangaId}/images/${imageName}`;

    // Create single page
    const pages: MangaPage[] = [{
      page: 1,
      chapter: 'Test Page',
      text: ocrRegions.map(r => r.text).join(' '),
      char_count: ocrRegions.reduce((sum, r) => sum + r.text.length, 0),
      word_count: ocrRegions.length,
      image_path: relativeImagePath,
      ocr_regions: ocrRegions,
      has_text: ocrRegions.length > 0,
    }];

    // Build BookData
    const bookData: BookData = {
      type: 'manga',
      title,
      source_file: pngPath,
      total_pages: 1,
      pages,
      chapters: ['Test Page'],
      total_words: ocrRegions.length,
      total_chars: ocrRegions.reduce((sum, r) => sum + r.text.length, 0),
    };

    // Save manga data
    const mangaDataPath = path.join(mangaDir, 'manga_data.json');
    fs.writeFileSync(mangaDataPath, JSON.stringify(bookData, null, 2), 'utf-8');
    console.log(`[MangaImportService] Saved manga data to: ${mangaDataPath}`);

    // Save to books directory for compatibility
    const booksDir = path.join(app.getPath('userData'), 'books');
    if (!fs.existsSync(booksDir)) {
      fs.mkdirSync(booksDir, { recursive: true });
    }

    const jsonFileName = `${filename}_${Date.now()}.json`;
    const compatJsonPath = path.join(booksDir, jsonFileName);
    fs.writeFileSync(compatJsonPath, JSON.stringify(bookData, null, 2), 'utf-8');

    // Import using repository
    const book = await bookRepository.import(compatJsonPath, language);
    console.log(`[MangaImportService] Imported PNG test manga: ${book.title} (ID: ${book.id})`);

    return book;
  }
}

export const mangaImportService = new MangaImportService();
