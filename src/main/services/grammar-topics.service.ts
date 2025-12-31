import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { LanguageGrammarTopics, GrammarLevel } from '../../shared/types/pre-study-notes.types';

/**
 * Service to load and manage grammar topics from markdown files
 * Topics are organized by language and CEFR level (A1, A2, B1, B2)
 */
export class GrammarTopicsService {
  private static instance: GrammarTopicsService;
  private topicsCache: Map<string, LanguageGrammarTopics> = new Map();
  private grammarTopicsPath: string;

  private constructor() {
    // Get the path to grammar topics folder
    // In development, it's in localResources, in production it's in resources
    const isDev = !app.isPackaged;
    if (isDev) {
      this.grammarTopicsPath = path.join(
        app.getAppPath(),
        'localResources',
        'languageGrammerTopics'
      );
    } else {
      this.grammarTopicsPath = path.join(
        process.resourcesPath,
        'languageGrammerTopics'
      );
    }
  }

  static getInstance(): GrammarTopicsService {
    if (!GrammarTopicsService.instance) {
      GrammarTopicsService.instance = new GrammarTopicsService();
    }
    return GrammarTopicsService.instance;
  }

  /**
   * Get grammar topics for a specific language
   */
  async getTopicsForLanguage(language: string): Promise<LanguageGrammarTopics | null> {
    // Check cache first
    if (this.topicsCache.has(language)) {
      return this.topicsCache.get(language)!;
    }

    // Map language codes to file names
    const languageFileMap: Record<string, string> = {
      'en': 'englishTopics.md',
      'de': 'germanTopics.md',
      'ru': 'russianTopics.md',
    };

    const fileName = languageFileMap[language];
    if (!fileName) {
      console.log(`[GrammarTopics] No grammar topics file for language: ${language}`);
      return null;
    }

    const filePath = path.join(this.grammarTopicsPath, fileName);

    try {
      if (!fs.existsSync(filePath)) {
        console.log(`[GrammarTopics] File not found: ${filePath}`);
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const topics = this.parseTopicsFile(content, language);

      // Cache the result
      this.topicsCache.set(language, topics);

      return topics;
    } catch (error) {
      console.error(`[GrammarTopics] Error loading topics for ${language}:`, error);
      return null;
    }
  }

  /**
   * Parse a grammar topics markdown file
   * Format: Level headers (A1, A2, B1, B2) followed by topic lines
   */
  private parseTopicsFile(content: string, language: string): LanguageGrammarTopics {
    const topics: LanguageGrammarTopics = {
      language,
      levels: {
        A1: [],
        A2: [],
        B1: [],
        B2: [],
      },
    };

    const lines = content.split('\n');
    let currentLevel: GrammarLevel | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) continue;

      // Check for level headers
      // Supports formats like: "A1 (Beginner)", "A1 (Anfänger)", "А1 (Начальный)"
      const levelMatch = trimmedLine.match(/^(A1|A2|B1|B2|А1|А2|В1|В2)\s*\(/i);
      if (levelMatch) {
        // Map Cyrillic to Latin for Russian files
        const levelMap: Record<string, GrammarLevel> = {
          'A1': 'A1', 'А1': 'A1',
          'A2': 'A2', 'А2': 'A2',
          'B1': 'B1', 'В1': 'B1',
          'B2': 'B2', 'В2': 'B2',
        };
        currentLevel = levelMap[levelMatch[1].toUpperCase()] || null;
        continue;
      }

      // If we have a current level and the line is a topic
      if (currentLevel && trimmedLine && !trimmedLine.startsWith('#')) {
        // Skip category headers like "Verbs & Tenses", "Nouns & Articles"
        if (trimmedLine.includes('&') || trimmedLine.endsWith(':')) continue;

        // Add the topic to the current level
        topics.levels[currentLevel].push(trimmedLine);
      }
    }

    return topics;
  }

  /**
   * Get all topics for a language as a flat string (for AI prompts)
   */
  async getTopicsAsString(language: string): Promise<string> {
    const topics = await this.getTopicsForLanguage(language);
    if (!topics) return '';

    const lines: string[] = [];

    for (const level of ['A1', 'A2', 'B1', 'B2'] as GrammarLevel[]) {
      const levelTopics = topics.levels[level];
      if (levelTopics.length > 0) {
        lines.push(`${level}:`);
        levelTopics.forEach(topic => lines.push(`  - ${topic}`));
      }
    }

    return lines.join('\n');
  }

  /**
   * Get topics organized for AI prompt (compact format)
   */
  async getTopicsForPrompt(language: string): Promise<{
    a1: string;
    a2: string;
    b1: string;
    b2: string;
  }> {
    const topics = await this.getTopicsForLanguage(language);

    if (!topics) {
      return { a1: '', a2: '', b1: '', b2: '' };
    }

    return {
      a1: topics.levels.A1.join(', '),
      a2: topics.levels.A2.join(', '),
      b1: topics.levels.B1.join(', '),
      b2: topics.levels.B2.join(', '),
    };
  }

  /**
   * Clear the cache (useful for development/testing)
   */
  clearCache(): void {
    this.topicsCache.clear();
  }
}
