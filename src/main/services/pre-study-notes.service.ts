import { LMStudioService } from './lm-studio.service';
import { grammarTopicsService } from './grammar-topics.service';
import { pronunciationService } from './pronunciation.service';
import { settingsRepository } from '../../database/repositories';
import type {
  PreStudyNotesRequest,
  PreStudyNotesResult,
  PreStudyProgress,
  PreStudyWordEntry,
} from '../../shared/types/pre-study-notes.types';

// Unicode-aware word extraction regex
const WORD_REGEX = /[\p{L}\p{M}]+(?:[-'][\p{L}\p{M}]+)*/gu;

/**
 * Service for generating pre-study notes
 * Orchestrates word extraction, AI processing, and result compilation
 */
export class PreStudyNotesService {
  private lmService: LMStudioService | null = null;
  private isCancelled = false;

  /**
   * Cancel any ongoing generation
   */
  cancel(): void {
    this.isCancelled = true;
  }

  /**
   * Generate pre-study notes for a given text
   */
  async generateNotes(
    request: PreStudyNotesRequest,
    onProgress?: (progress: PreStudyProgress) => void
  ): Promise<PreStudyNotesResult> {
    this.isCancelled = false;

    // Phase 1: Extracting words
    onProgress?.({
      current: 0,
      total: 0,
      phase: 'extracting',
    });

    // Get LM Studio service
    const service = await this.getService();

    // Get sentence limit setting (0 = all sentences)
    const sentenceLimit = await settingsRepository.get('pre_study_sentence_limit');

    // DEBUG: Log the raw text content
    console.log('[PreStudy] === DEBUG START ===');
    console.log(`[PreStudy] Raw text content (first 500 chars):\n${request.textContent.substring(0, 500)}`);
    console.log(`[PreStudy] Total text length: ${request.textContent.length} chars`);
    console.log(`[PreStudy] Sentence limit setting: ${sentenceLimit}`);

    // Extract unique words and their sentences
    const { uniqueWords, wordToSentence, debugInfo } = this.extractWordsAndSentences(request.textContent, sentenceLimit);

    // DEBUG: Log extraction results
    console.log(`[PreStudy] Total sentences found: ${debugInfo.totalSentences}`);
    console.log(`[PreStudy] Sentences used: ${debugInfo.sentencesUsed}`);
    if (debugInfo.firstSentence) {
      console.log(`[PreStudy] First sentence: "${debugInfo.firstSentence.substring(0, 200)}..."`);
    }
    console.log('[PreStudy] === DEBUG END ===');

    console.log(`[PreStudy] Found ${uniqueWords.length} unique words to process`);

    // Get grammar topics for the language
    const grammarTopics = await grammarTopicsService.getTopicsForPrompt(request.language);

    // Phase 2: Processing words with parallel audio generation
    const entries: PreStudyWordEntry[] = [];
    const audioPromises: Promise<void>[] = [];
    const total = uniqueWords.length;

    for (let i = 0; i < uniqueWords.length; i++) {
      // Check for cancellation
      if (this.isCancelled) {
        console.log('[PreStudy] Generation cancelled');
        break;
      }

      const word = uniqueWords[i];
      const sentence = wordToSentence.get(word) || '';

      onProgress?.({
        current: i + 1,
        total,
        phase: 'processing',
        currentWord: word,
        estimatedTimeRemaining: (total - i - 1) * 2, // Rough estimate: 2 seconds per word
      });

      // Start audio fetch for previous entry in parallel (non-blocking)
      // This runs while AI is processing the current word
      if (i > 0 && entries[i - 1]) {
        audioPromises.push(this.fetchAudioForEntry(entries[i - 1], request.language));
      }

      try {
        const entry = await service.generatePreStudyEntry(
          word,
          sentence,
          request.language,
          grammarTopics
        );
        entries.push(entry);
      } catch (error) {
        console.error(`[PreStudy] Error processing word "${word}":`, error);
        // Add a basic entry with error message
        entries.push({
          word,
          cleanWord: word.toLowerCase(),
          ipa: '',
          syllables: '',
          definition: 'Error generating definition',
          contextSentence: sentence,
        });
      }
    }

    // Fetch audio for the last entry
    if (entries.length > 0) {
      audioPromises.push(this.fetchAudioForEntry(entries[entries.length - 1], request.language));
    }

    // Wait for all audio fetches to complete
    console.log(`[PreStudy] Waiting for ${audioPromises.length} audio fetches to complete...`);
    await Promise.allSettled(audioPromises);
    console.log('[PreStudy] All audio fetches completed');

    // Phase 3: Generating result
    onProgress?.({
      current: total,
      total,
      phase: 'generating',
    });

    const result: PreStudyNotesResult = {
      entries,
      bookTitle: request.bookTitle,
      language: request.language,
      viewRange: `Views ${request.startViewIndex + 1} - ${request.endViewIndex}`,
      generatedAt: new Date().toISOString(),
      totalWords: this.countTotalWords(request.textContent),
      uniqueWords: uniqueWords.length,
    };

    return result;
  }

  /**
   * Extract unique words and map them to their containing sentences
   * @param text - The text to extract words from
   * @param sentenceLimit - Maximum number of sentences to process (0 = all)
   */
  private extractWordsAndSentences(text: string, sentenceLimit: number = 0): {
    uniqueWords: string[];
    wordToSentence: Map<string, string>;
    debugInfo: {
      totalSentences: number;
      sentencesUsed: number;
      firstSentence: string | null;
    };
  } {
    // Split text into sentences
    const allSentences = this.splitIntoSentences(text);
    const totalSentences = allSentences.length;

    // Apply sentence limit if specified
    let sentences = allSentences;
    if (sentenceLimit > 0) {
      sentences = allSentences.slice(0, sentenceLimit);
      console.log(`[PreStudy] Limiting to first ${sentenceLimit} sentence(s)`);
    }

    // Track words and their first occurrence sentence
    const wordToSentence = new Map<string, string>();
    const seenWords = new Set<string>();
    const uniqueWords: string[] = [];

    for (const sentence of sentences) {
      const words = sentence.match(WORD_REGEX) || [];

      for (const word of words) {
        const cleanWord = word.toLowerCase();

        // Skip if already seen
        if (seenWords.has(cleanWord)) continue;

        seenWords.add(cleanWord);
        uniqueWords.push(word);
        wordToSentence.set(word, sentence.trim());
      }
    }

    return {
      uniqueWords,
      wordToSentence,
      debugInfo: {
        totalSentences,
        sentencesUsed: sentences.length,
        firstSentence: sentences[0] || null,
      },
    };
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence-ending punctuation, keeping the punctuation
    // Handle common abbreviations like Mr., Mrs., Dr., etc.
    const PLACEHOLDER = '<<ABBREV_DOT>>';
    const abbreviations = /(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|Inc|Ltd|Corp)\./gi;
    const tempText = text.replace(abbreviations, (match) => match.replace('.', PLACEHOLDER));

    // Split on sentence boundaries
    const sentences = tempText
      .split(/(?<=[.!?])\s+/)
      .map(s => s.replace(new RegExp(PLACEHOLDER, 'g'), '.').trim())
      .filter(s => s.length > 0);

    return sentences;
  }

  /**
   * Count total words in text
   */
  private countTotalWords(text: string): number {
    const matches = text.match(WORD_REGEX);
    return matches ? matches.length : 0;
  }

  /**
   * Get or create LM Studio service instance
   */
  private async getService(): Promise<LMStudioService> {
    const url = await settingsRepository.get('lm_studio_url');
    const model = await settingsRepository.get('lm_studio_model');

    if (!this.lmService || this.lmService.baseUrl !== url) {
      this.lmService = new LMStudioService(url, model);
    } else if (this.lmService.model !== model) {
      this.lmService.setModel(model);
    }

    return this.lmService;
  }

  /**
   * Fetch TTS audio for a word entry (word + sentence)
   * Runs in parallel with AI processing for efficiency
   */
  private async fetchAudioForEntry(entry: PreStudyWordEntry, language: string): Promise<void> {
    try {
      // Fetch word and sentence audio in parallel
      const [wordResult, sentenceResult] = await Promise.all([
        pronunciationService.getTTS(entry.word, language),
        entry.contextSentence
          ? pronunciationService.getTTS(entry.contextSentence, language)
          : Promise.resolve({ success: false } as { success: false }),
      ]);

      if (wordResult.success && wordResult.audio_base64) {
        entry.wordAudio = wordResult.audio_base64;
      }
      if (sentenceResult.success && 'audio_base64' in sentenceResult && sentenceResult.audio_base64) {
        entry.sentenceAudio = sentenceResult.audio_base64;
      }
    } catch (error) {
      console.error(`[PreStudy] Error fetching audio for "${entry.word}":`, error);
      // Audio is optional, so we just log and continue
    }
  }
}

// Export singleton instance
let preStudyService: PreStudyNotesService | null = null;

export function getPreStudyNotesService(): PreStudyNotesService {
  if (!preStudyService) {
    preStudyService = new PreStudyNotesService();
  }
  return preStudyService;
}
