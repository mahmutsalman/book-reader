/**
 * OpenRouter AI Service
 * Cloud-based AI service using OpenRouter's API with access to 30+ free models.
 * Provides enhanced content generation for language learning.
 */

import type { AIServiceInterface } from './ai-service.interface';
import type { PreStudyWordEntry, ExampleSentence } from '../../shared/types/pre-study-notes.types';
import type { GrammarAnalysis, PartOfSpeech, WordPOS, GrammarExample } from '../../shared/types/grammar.types';
import type {
  MeaningAnalysis,
  MeaningAnalysisType
} from '../../shared/types/meaning-analysis.types';
import type { SimplerAnalysis } from '../../shared/types/simpler-analysis.types';
import { settingsRepository } from '../../database/repositories';

/**
 * Fallback model chain ordered by priority.
 * When rate limited, system tries the next model in sequence.
 * ULTRA-CONSERVATIVE LIST - ONLY Gemma 3 family (100% verified working).
 *
 * All Gemma 3 models are verified working as of January 2026.
 * Source: https://openrouter.ai/google/gemma-3-27b-it:free
 *
 * Note: Many other models advertised as "free" on OpenRouter don't actually exist
 * or have been removed. Only Gemma 3 models are guaranteed to work without 404 errors.
 */
const FALLBACK_MODELS = [
  // FAST & SMART - Gemma 3 family (100% CONFIRMED WORKING ✓✓✓)
  'google/gemma-3-27b-it:free',              // 27B - Best: Fast, 140+ languages
  'google/gemma-3-12b-it:free',              // 12B - Super fast, multimodal
  'google/gemma-3-4b-it:free',               // 4B - Ultra fast, lightweight
] as const;

/** Cooldown duration in milliseconds (60 seconds) */
const RATE_LIMIT_COOLDOWN_MS = 60000;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

export class OpenRouterService implements AIServiceInterface {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private apiKey: string;
  public model: string;
  private timeout: number;

  /**
   * Static map tracking rate-limited models.
   * Key: model name, Value: timestamp when cooldown expires
   */
  private static modelCooldowns: Map<string, number> = new Map();

  constructor(apiKey: string, model = 'google/gemma-3-27b-it:free', timeout = 60000) {
    this.apiKey = apiKey;
    this.model = model;
    this.timeout = timeout;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Check if a model is currently rate-limited
   */
  private isModelRateLimited(model: string): boolean {
    const cooldownExpiry = OpenRouterService.modelCooldowns.get(model);
    if (!cooldownExpiry) return false;

    if (Date.now() >= cooldownExpiry) {
      // Cooldown expired, remove from map
      OpenRouterService.modelCooldowns.delete(model);
      return false;
    }
    return true;
  }

  /**
   * Mark a model as rate-limited
   */
  private markModelRateLimited(model: string): void {
    const expiryTime = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    OpenRouterService.modelCooldowns.set(model, expiryTime);
    console.warn(`[OpenRouter] Model ${model} rate-limited, cooldown until ${new Date(expiryTime).toISOString()}`);
  }

  /**
   * Get ordered list of models to try, starting from user's preferred model.
   * Skips models that are currently rate-limited.
   */
  private getAvailableModels(): string[] {
    // Find index of user's preferred model
    const preferredIndex = FALLBACK_MODELS.indexOf(this.model as typeof FALLBACK_MODELS[number]);

    // Build ordered list: user's model first, then rest in fallback order
    let orderedModels: string[];

    if (preferredIndex >= 0) {
      // User's model is in fallback list - start from there
      orderedModels = [
        ...FALLBACK_MODELS.slice(preferredIndex),
        ...FALLBACK_MODELS.slice(0, preferredIndex),
      ];
    } else {
      // User's model not in list (custom model) - try it first, then fallback chain
      orderedModels = [this.model, ...FALLBACK_MODELS];
    }

    // Filter out rate-limited models
    return orderedModels.filter(model => !this.isModelRateLimited(model));
  }

  /**
   * Static method to get the next available model for retry.
   * Used by frontend to show which model will be tried.
   */
  public static getNextAvailableModel(preferredModel: string): string | null {
    // Find index of preferred model
    const preferredIndex = FALLBACK_MODELS.indexOf(preferredModel as typeof FALLBACK_MODELS[number]);

    // Build ordered list: preferred model first, then rest in fallback order
    let orderedModels: string[];

    if (preferredIndex >= 0) {
      orderedModels = [
        ...FALLBACK_MODELS.slice(preferredIndex),
        ...FALLBACK_MODELS.slice(0, preferredIndex),
      ];
    } else {
      orderedModels = [preferredModel, ...FALLBACK_MODELS];
    }

    // Filter out rate-limited models
    const now = Date.now();
    const availableModels = orderedModels.filter(model => {
      const cooldownExpiry = OpenRouterService.modelCooldowns.get(model);
      if (!cooldownExpiry) return true;
      if (now >= cooldownExpiry) {
        OpenRouterService.modelCooldowns.delete(model);
        return true;
      }
      return false;
    });

    return availableModels[0] || null;
  }

  async testConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/yourusername/BookReader',
          'X-Title': 'BookReader Language Learning App',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Invalid API key' };
        }
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json() as { data: { id: string }[] };
      return {
        success: true,
        models: data.data?.map(m => m.id) || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async getWordDefinition(word: string, context: string, language = 'en'): Promise<{
    shortDefinition: string;
    definition: string;
    wordTranslation?: string;
    wordType?: string;
    germanArticle?: string;
  }> {
    if (language === 'en') {
      const prompt = `Define the word "${word}" as it is used in the following context. Also identify its part of speech.

Context: "${context}"

Format your response EXACTLY like this:
SHORT: [1-3 word concise meaning]
DEFINITION: [2-3 sentence definition suitable for a language learner]
TYPE: [part of speech: noun, verb, adjective, adverb, preposition, conjunction, interjection, pronoun, article, phrasal verb, idiom, or collocation]`;

      const response = await this.chat(prompt);
      const shortMatch = response.match(/SHORT:\s*(.+?)(?=DEFINITION:|TYPE:|$)/is);
      const defMatch = response.match(/DEFINITION:\s*(.+?)(?=TYPE:|$)/is);
      const typeMatch = response.match(/TYPE:\s*([^\n]+)/i);

      const shortDefinition = shortMatch ? shortMatch[1].trim() : '';
      let definition = defMatch ? defMatch[1].trim() : response;
      if (!defMatch) {
        definition = definition.replace(/^(SHORT|TYPE):\s*[^\n]+\n?/gim, '').trim();
        definition = definition.replace(/^DEFINITION:\s*/i, '').trim();
      }
      const wordType = typeMatch ? this.normalizeWordType(typeMatch[1].trim()) : undefined;

      return { shortDefinition, definition, wordType };
    }

    if (language === 'de') {
      const prompt = `For the German word "${word}" in this context, provide:
1. A SHORT definition (1-3 words in English showing core meaning)
2. A full definition in English explaining what this word means (2-3 sentences, write the definition in ENGLISH)
3. The English translation of the word (single word or short phrase)
4. The part of speech (noun, verb, adjective, adverb, preposition, conjunction, interjection, pronoun, article, phrasal verb, idiom, or collocation)
5. If it's a noun, provide the definite article (der, die, or das)

Context: "${context}"

Format your response EXACTLY like this:
SHORT: [1-3 word concise meaning in English]
DEFINITION: [definition in English]
ENGLISH: [English translation of the word]
TYPE: [part of speech]
ARTICLE: [der/die/das - ONLY if it's a noun, otherwise leave empty or omit]`;

      const response = await this.chat(prompt);
      const shortMatch = response.match(/SHORT:\s*(.+?)(?=DEFINITION:|ENGLISH:|TYPE:|ARTICLE:|$)/is);
      const defMatch = response.match(/DEFINITION:\s*(.+?)(?=ENGLISH:|TYPE:|ARTICLE:|$)/is);
      const engMatch = response.match(/ENGLISH:\s*(.+?)(?=TYPE:|ARTICLE:|$)/is);
      const typeMatch = response.match(/TYPE:\s*([^\n]+)/i);
      const articleMatch = response.match(/ARTICLE:\s*([^\n]+)/i);

      const shortDefinition = shortMatch ? shortMatch[1].trim() : '';
      let definition = defMatch ? defMatch[1].trim() : response;
      if (!defMatch) {
        definition = definition.replace(/^(SHORT|DEFINITION|ENGLISH|TYPE|ARTICLE):\s*[^\n]*\n?/gim, '').trim();
      }
      const wordTranslation = engMatch ? engMatch[1].trim() : undefined;
      const wordType = typeMatch ? this.normalizeWordType(typeMatch[1].trim()) : undefined;
      const germanArticle = articleMatch ? this.normalizeGermanArticle(articleMatch[1].trim()) : undefined;

      return { shortDefinition, definition, wordTranslation, wordType, germanArticle };
    }

    // Other non-English languages
    const languageName = this.getLanguageName(language);
    const prompt = `For the ${languageName} word "${word}" in this context, provide:
1. A SHORT definition (1-3 words in English showing core meaning)
2. A full definition in English explaining what this word means (2-3 sentences, write the definition in ENGLISH)
3. The English translation of the word (single word or short phrase)
4. The part of speech (noun, verb, adjective, adverb, preposition, conjunction, interjection, pronoun, article, phrasal verb, idiom, or collocation)

Context: "${context}"

Format your response EXACTLY like this:
SHORT: [1-3 word concise meaning in English]
DEFINITION: [definition in English]
ENGLISH: [English translation of the word]
TYPE: [part of speech]`;

    const response = await this.chat(prompt);
    const shortMatch = response.match(/SHORT:\s*(.+?)(?=DEFINITION:|ENGLISH:|TYPE:|$)/is);
    const defMatch = response.match(/DEFINITION:\s*(.+?)(?=ENGLISH:|TYPE:|$)/is);
    const engMatch = response.match(/ENGLISH:\s*(.+?)(?=TYPE:|$)/is);
    const typeMatch = response.match(/TYPE:\s*([^\n]+)/i);

    const shortDefinition = shortMatch ? shortMatch[1].trim() : '';
    let definition = defMatch ? defMatch[1].trim() : response;
    if (!defMatch) {
      definition = definition.replace(/^(SHORT|DEFINITION|ENGLISH|TYPE):\s*[^\n]*\n?/gim, '').trim();
    }
    const wordTranslation = engMatch ? engMatch[1].trim() : undefined;
    const wordType = typeMatch ? this.normalizeWordType(typeMatch[1].trim()) : undefined;

    return { shortDefinition, definition, wordTranslation, wordType };
  }

  async getIPAPronunciation(word: string, language = 'en'): Promise<{ ipa: string; syllables: string }> {
    const languageName = this.getLanguageName(language);
    const syllableNote = ['ru', 'ja', 'zh', 'ko'].includes(language)
      ? `Use · as separator. Use the native script (do NOT romanize).`
      : `Use · as separator.`;

    const prompt = `For the ${languageName} word "${word}", provide:
1. IPA pronunciation in slashes (e.g., /ˈeksæmpəl/)
2. Syllable breakdown with dots (e.g., ex·am·ple). ${syllableNote}

Format your response EXACTLY like this:
IPA: /pronunciation/
SYLLABLES: syl·la·bles

Do not include any other text.`;

    const response = await this.chat(prompt);
    const ipaMatch = response.match(/\/([^/]+)\//);
    const ipa = ipaMatch ? ipaMatch[1] : '';
    const syllablesMatch = response.match(/SYLLABLES:\s*([^\n]+)/i);
    let syllables = syllablesMatch ? syllablesMatch[1].trim() : '';

    if (!syllables) {
      const dotMatch = response.match(/(\S+[·.]\S+)/);
      syllables = dotMatch ? dotMatch[1].replace(/\./g, '·') : '';
    }

    return { ipa, syllables };
  }

  async getBatchIPAPronunciation(words: string[], language = 'en'): Promise<{ word: string; ipa: string; syllables: string }[]> {
    const validWords = words.filter(w => w.trim() && /\p{L}/u.test(w));

    if (validWords.length === 0) {
      return words.map(word => ({ word, ipa: '', syllables: '' }));
    }

    const languageName = this.getLanguageName(language);
    const syllableNote = ['ru', 'ja', 'zh', 'ko'].includes(language)
      ? `Use · as separator. Use the native script (do NOT romanize).`
      : `Use · as separator.`;

    const wordsListText = validWords.map((w, i) => `${i + 1}. ${w}`).join('\n');

    const prompt = `For each ${languageName} word below, provide its IPA pronunciation and syllable breakdown.

Words:
${wordsListText}

Rules:
- IPA in slashes (e.g., /ˈeksæmpəl/)
- Syllables with middle dots (e.g., ex·am·ple). ${syllableNote}

Format your response EXACTLY like this, one per line:
1. /ipa/ syl·la·bles
2. /ipa/ syl·la·bles
...

Do not include any other text.`;

    const response = await this.chat(prompt);
    const results: { word: string; ipa: string; syllables: string }[] = [];
    const lines = response.split('\n').filter(l => l.trim());

    for (let i = 0; i < validWords.length; i++) {
      const word = validWords[i];
      const linePattern = new RegExp(`^${i + 1}[.)]?\\s*`);
      const line = lines.find(l => linePattern.test(l.trim()));

      if (line) {
        const ipaMatch = line.match(/\/([^/]+)\//);
        const ipa = ipaMatch ? ipaMatch[1] : '';
        let syllables = '';
        const afterIpa = line.substring(line.lastIndexOf('/') + 1).trim();
        const cleanedSyllables = afterIpa.replace(/^\d+[.)]\s*/, '').trim();
        if (cleanedSyllables && cleanedSyllables !== ipa) {
          syllables = cleanedSyllables.replace(/\./g, '·');
        }
        results.push({ word, ipa, syllables });
      } else {
        results.push({ word, ipa: '', syllables: '' });
      }
    }

    return words.map(originalWord => {
      const found = results.find(r => r.word === originalWord);
      return found || { word: originalWord, ipa: '', syllables: '' };
    });
  }

  async simplifySentence(sentence: string, language = 'en'): Promise<{
    simplified: string;
    simplifiedTranslation?: string;
    sentenceTranslation?: string;
  }> {
    if (language === 'en') {
      const prompt = `Rewrite this sentence using simpler words for a language learner.

Rules:
- Replace difficult words with easier synonyms (e.g., "passion" → "strong love", "peculiar" → "strange", "departed" → "left")
- Keep the SAME sentence structure as much as possible
- Do NOT remove any concepts or meanings - every idea in the original must appear in the simplified version
- Do NOT add new ideas or change the meaning
- Keep names and places unchanged

Original: "${sentence}"

IMPORTANT: Output ONLY the SIMPLIFIED line. No preamble or explanation.

Format your response EXACTLY like this:
SIMPLIFIED: [simplified sentence only]`;

      const response = await this.chat(prompt);
      const simplified = this.extractEnglishSimplifiedSentence(response);
      return { simplified };
    }

    const languageName = this.getLanguageName(language);
    const prompt = `For this ${languageName} sentence, provide THREE things:

1. SIMPLIFIED: A simplified version using easier ${languageName} words
   - This MUST be in ${languageName}, NOT in English
   - Replace difficult ${languageName} words with simpler ${languageName} synonyms
   - Example for German: "Er war sehr erschöpft" → "Er war sehr müde"
   - Example for Russian: "Он был чрезвычайно утомлён" → "Он был очень уставший"

2. ORIGINAL_ENGLISH: English translation of the original sentence

3. SIMPLIFIED_ENGLISH: English translation of the simplified sentence

IMPORTANT: The SIMPLIFIED line must contain ${languageName} text only, NOT English.

Rules for simplification:
- Replace difficult words with easier ${languageName} synonyms
- Keep the SAME sentence structure as much as possible
- Do NOT remove any concepts or meanings
- Keep names and places unchanged

Original: "${sentence}"

Format your response EXACTLY like this:
SIMPLIFIED: [simplified ${languageName} sentence - NOT English]
ORIGINAL_ENGLISH: [English translation of original]
SIMPLIFIED_ENGLISH: [English translation of simplified]`;

    const response = await this.chat(prompt);
    const simpMatch = response.match(/SIMPLIFIED:\s*(.+?)(?=ORIGINAL_ENGLISH:|$)/is);
    const origEngMatch = response.match(/ORIGINAL_ENGLISH:\s*(.+?)(?=SIMPLIFIED_ENGLISH:|$)/is);
    const simpEngMatch = response.match(/SIMPLIFIED_ENGLISH:\s*(.+?)$/is);

    let simplified = simpMatch ? simpMatch[1].trim() : response;
    const sentenceTranslation = origEngMatch ? origEngMatch[1].trim() : undefined;
    const simplifiedTranslation = simpEngMatch ? simpEngMatch[1].trim() : undefined;

    // Validate that SIMPLIFIED is actually in the target language, not English
    if (language !== 'en' && simpMatch && this.isLikelyEnglish(simplified)) {
      console.warn(`[OpenRouter] SIMPLIFIED appears to be English for ${language} book, extracting non-English text`);
      const extracted = this.extractNonEnglishSentence(response, language);
      if (extracted && extracted !== simplified && !this.isLikelyEnglish(extracted)) {
        simplified = extracted;
      }
    }

    // If parsing failed completely, try to extract non-English sentence
    if (!simpMatch) {
      simplified = this.extractNonEnglishSentence(response, language);
    }

    return { simplified, sentenceTranslation, simplifiedTranslation };
  }

  private extractEnglishSimplifiedSentence(response: string): string {
    const simpMatch = response.match(/SIMPLIFIED:\s*([^\n\r]+)/i);
    let cleaned = simpMatch ? simpMatch[1].trim() : response.trim();

    cleaned = cleaned
      .replace(/^(?:the\s+)?simplified\s+(?:answer|version|sentence)\s*(?:would be|is)?[:-]\s*/i, '')
      .replace(/^here(?:'s| is)\s+the\s+(?:simplified|rewritten)\s+(?:version|sentence)[:-]\s*/i, '')
      .replace(/^simplified[:-]\s*/i, '')
      .trim();

    const quotedMatch = cleaned.match(/"([\s\S]+?)"/);
    if (quotedMatch && quotedMatch[1]) {
      cleaned = quotedMatch[1].trim();
    }

    const lines = cleaned.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length > 1) {
      const stopIndex = lines.findIndex((line, index) => index > 0 && this.isSimplificationExplanationLine(line));
      const keptLines = stopIndex === -1 ? lines : lines.slice(0, stopIndex);
      cleaned = keptLines.join(' ');
    } else {
      cleaned = lines[0] || cleaned;
    }

    const inlineExplanation = cleaned.match(/^([\s\S]+?[.!?])\s+(?:i|we)\s+(?:replaced|changed|simplified|kept|used|made|did)\b/i);
    if (inlineExplanation && inlineExplanation[1]) {
      cleaned = inlineExplanation[1].trim();
    }

    return this.cleanMarkdownFormatting(cleaned);
  }

  private isSimplificationExplanationLine(line: string): boolean {
    return /^(?:i|we)\s+(?:replaced|changed|simplified|kept|used|made|did|preserved|maintained)\b/i.test(line)
      || /^the sentence structure\b/i.test(line)
      || /^no concepts?\s+or\s+meanings?\b/i.test(line)
      || /^this (?:keeps|retains|preserves|maintains)\b/i.test(line)
      || /^(?:explanation|note|reason)[:-]/i.test(line);
  }

  async getWordEquivalent(
    originalWord: string,
    originalSentence: string,
    simplifiedSentence: string
  ): Promise<{ equivalent: string; needsRegeneration: boolean }> {
    const prompt = `Example:
Original: "The man departed hastily"
Simplified: "The man left quickly"
Word: "departed"
Answer: left

Example:
Original: "She had great fortune"
Simplified: "She had good luck"
Word: "fortune"
Answer: luck

Now your turn:
Original: "${originalSentence}"
Simplified: "${simplifiedSentence}"
Word: "${originalWord}"
Answer:`;

    const response = await this.chatShort(prompt);
    const cleaned = response
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/\.+$/, '')
      .replace(/^answer:\s*/i, '')
      .replace(/^["'`]|["'`]$/g, '')
      .trim();

    if (cleaned.toUpperCase().startsWith('NONE') || cleaned === '') {
      return { equivalent: '', needsRegeneration: false };
    }

    const simplifiedLower = simplifiedSentence.toLowerCase();
    const cleanedLower = cleaned.toLowerCase();

    if (!simplifiedLower.includes(cleanedLower)) {
      return { equivalent: cleaned, needsRegeneration: true };
    }

    return { equivalent: cleaned, needsRegeneration: false };
  }

  async resimplifyWithWord(
    originalSentence: string,
    originalWord: string,
    equivalentWord: string,
    language = 'en'
  ): Promise<string> {
    const languageName = this.getLanguageName(language);
    const outputInstruction = language === 'en'
      ? 'Output ONLY the simplified sentence, nothing else.'
      : `Output ONLY the simplified ${languageName} sentence, nothing else. Do NOT translate to English.`;

    const prompt = `Rewrite this ${languageName} sentence using simpler words.

CRITICAL RULES:
1. You MUST use the word "${equivalentWord}" as the replacement for "${originalWord}"
2. Replace difficult words with easier ${languageName} synonyms
3. Keep the sentence in ${languageName} (do NOT translate to English)
4. Keep the SAME sentence structure as much as possible
5. Keep names and places unchanged

${outputInstruction}

Original: "${originalSentence}"

Simplified ${languageName} sentence:`;

    const response = await this.chat(prompt);

    if (language !== 'en') {
      return this.extractNonEnglishSentence(response, language);
    }

    return response;
  }

  async getPhraseMeaning(phrase: string, context: string, language = 'en'): Promise<{
    shortMeaning: string;
    meaning: string;
    phraseTranslation?: string;
    isPhrasalVerb: boolean;
    phrasalVerbInfo?: {
      baseVerb: string;
      particle: string;
    };
  }> {
    const isEnglish = language === 'en';
    const languageName = isEnglish ? 'English' : this.getLanguageName(language);

    const prompt = `For the ${languageName} phrase "${phrase}" in this context, analyze and provide:

1. A SHORT explanation (1-3 words or very brief phrase showing what it means in this context)
2. A clear detailed explanation of what this phrase means (focus on idiomatic usage if applicable)
${!isEnglish ? '3. The English translation of the phrase' : ''}
${isEnglish ? '3' : '4'}. Is this a PHRASAL VERB? A phrasal verb is a verb combined with a preposition or adverb that creates a meaning different from the original verb (e.g., "give up" = surrender, "look forward to" = anticipate, "break down" = stop working)
${isEnglish ? '4' : '5'}. If it IS a phrasal verb, identify the base verb and particle(s)

Context: "${context}"

Format your response EXACTLY like this:
SHORT: [1-3 word brief meaning]
MEANING: [detailed explanation of the phrase meaning]${!isEnglish ? '\nENGLISH: [English translation]' : ''}
IS_PHRASAL_VERB: [yes/no]
BASE_VERB: [base verb if phrasal verb, otherwise leave empty]
PARTICLE: [particle(s) if phrasal verb, otherwise leave empty]`;

    const response = await this.chat(prompt);
    const shortMatch = response.match(/SHORT:\s*(.+?)(?=MEANING:|ENGLISH:|IS_PHRASAL_VERB:|$)/is);
    const meaningMatch = response.match(/MEANING:\s*(.+?)(?=ENGLISH:|IS_PHRASAL_VERB:|$)/is);
    const engMatch = response.match(/ENGLISH:\s*(.+?)(?=IS_PHRASAL_VERB:|$)/is);
    const isPhrasalMatch = response.match(/IS_PHRASAL_VERB:\s*(\w+)/i);
    const baseVerbMatch = response.match(/BASE_VERB:\s*([^\n]+)/i);
    const particleMatch = response.match(/PARTICLE:\s*([^\n]+)/i);

    const shortMeaning = shortMatch ? shortMatch[1].trim() : '';
    let meaning = meaningMatch ? meaningMatch[1].trim() : response.trim();
    const phraseTranslation = engMatch ? engMatch[1].trim() : undefined;

    if (!meaning && response.trim()) {
      meaning = response.trim();
    }

    // Determine if it's a phrasal verb
    const isPhrasalVerb = isPhrasalMatch
      ? isPhrasalMatch[1].toLowerCase() === 'yes'
      : false;

    // Extract phrasal verb info if applicable
    const phrasalVerbInfo = isPhrasalVerb ? {
      baseVerb: baseVerbMatch?.[1]?.trim() || '',
      particle: particleMatch?.[1]?.trim() || '',
    } : undefined;

    return { shortMeaning, meaning, phraseTranslation, isPhrasalVerb, phrasalVerbInfo };
  }

  async generatePreStudyEntry(
    word: string,
    sentence: string,
    language: string,
    grammarTopicsByLevel: { a1: string; a2: string; b1: string; b2: string },
    enhanced = true
  ): Promise<PreStudyWordEntry> {
    const languageName = this.getLanguageName(language);
    const isEnglish = language === 'en';
    const isGerman = language === 'de';
    const isRussian = language === 'ru';

    // Use grammarTopicsByLevel for context (kept for API compatibility)
    void grammarTopicsByLevel;

    if (enhanced && !isEnglish) {
      // Enhanced prompt for non-English languages (German, Russian, etc.)
      return this.generateEnhancedPreStudyEntry(word, sentence, language, languageName, isGerman, isRussian);
    }

    // Standard prompt (same as LM Studio for English or when not enhanced)
    const prompt = `Analyze this ${languageName} word for a language learner.

Word: "${word}"
Sentence: "${sentence}"

Provide:
1. IPA pronunciation (in slashes like /example/)
2. Syllable breakdown with dots (like ex·am·ple)
3. Part of speech (noun, verb, adjective, adverb, preposition, conjunction, pronoun, article)
4. Brief definition (1-2 sentences explaining meaning in this context)${!isEnglish ? '\n5. English translation of the word' : ''}${isGerman ? '\n6. German article if noun (der/die/das)' : ''}

Format your response EXACTLY like this:
IPA: /pronunciation/
SYLLABLES: syl·la·bles
TYPE: part of speech${!isEnglish ? '\nENGLISH: translation' : ''}${isGerman ? '\nARTICLE: der/die/das' : ''}
DEFINITION: brief definition`;

    const response = await this.chat(prompt);
    return this.parseStandardPreStudyResponse(response, word, sentence, language, isEnglish, isGerman);
  }

  /**
   * Generate enhanced pre-study entry with example sentences and grammar explanations
   */
  private async generateEnhancedPreStudyEntry(
    word: string,
    sentence: string,
    language: string,
    languageName: string,
    isGerman: boolean,
    isRussian: boolean
  ): Promise<PreStudyWordEntry> {
    const prompt = `You are an expert ${languageName} language tutor helping a COMPLETE BEGINNER who is fluent in English.

Analyze the ${languageName} word "${word}" in this context:
"${sentence}"

Provide a comprehensive learning entry. You MUST respond with valid JSON only (no markdown, no extra text).

{
  "ipa": "/phonetic pronunciation/",
  "syllables": "syl·la·bles (use · as separator)",
  "wordType": "noun|verb|adjective|adverb|etc",
  "definition": "Clear English explanation of meaning in this context (2-3 sentences)",
  "wordTranslation": "English translation (single word or short phrase)"${isGerman ? `,
  "germanArticle": "der|die|das (only if noun, otherwise null)"` : ''}${isRussian ? `,
  "nativeScript": "word with stress mark if applicable"` : ''},
  "exampleSentences": [
    {
      "sentence": "Simple ${languageName} sentence using the word",
      "translation": "English translation",
      "grammarPoint": "Grammar concept demonstrated (e.g., 'nominative case', 'present tense')"
    },
    {
      "sentence": "Another ${languageName} sentence with different grammar context",
      "translation": "English translation",
      "grammarPoint": "Different grammar point"
    },
    {
      "sentence": "Third example showing another usage",
      "translation": "English translation",
      "grammarPoint": "Another grammar point"
    }
  ],
  "grammarExplanation": "Detailed explanation of the grammar concepts a beginner needs to understand this word and the example sentences. Explain cases, conjugations, word order, etc. as relevant.",
  "relatedGrammarTopics": ["Topic 1", "Topic 2", "Topic 3"]
}

IMPORTANT:
- Keep example sentences VERY simple (A1-A2 level)
- Focus on grammar points relevant to beginners
- Explain grammar clearly for someone who knows NO ${languageName}
- Respond with ONLY the JSON object, no other text`;

    const response = await this.chat(prompt, 1500);

    try {
      // Try to parse as JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Map parsed JSON to PreStudyWordEntry
        const exampleSentences: ExampleSentence[] = (parsed.exampleSentences || []).map((ex: { sentence?: string; translation?: string; grammarPoint?: string }) => ({
          sentence: ex.sentence || '',
          translation: ex.translation || '',
          grammarPoint: ex.grammarPoint || '',
        }));

        return {
          word,
          cleanWord: word.toLowerCase(),
          ipa: parsed.ipa?.replace(/^\/|\/$/g, '') || '',
          syllables: (parsed.syllables || '').replace(/\./g, '·'),
          definition: parsed.definition || 'Definition not available',
          wordType: parsed.wordType ? this.normalizeWordType(parsed.wordType) : undefined,
          wordTranslation: parsed.wordTranslation || undefined,
          germanArticle: isGerman && parsed.germanArticle ? this.normalizeGermanArticle(parsed.germanArticle) : undefined,
          contextSentence: sentence,
          exampleSentences: exampleSentences.length > 0 ? exampleSentences : undefined,
          grammarExplanation: parsed.grammarExplanation || undefined,
          relatedGrammarTopics: parsed.relatedGrammarTopics || undefined,
        };
      }
    } catch (e) {
      console.error('[OpenRouter] Failed to parse JSON response, falling back to text parsing:', e);
    }

    // Fallback to standard parsing if JSON parsing fails
    return this.parseStandardPreStudyResponse(response, word, sentence, language, false, isGerman);
  }

  /**
   * Parse standard (non-JSON) pre-study response
   */
  private parseStandardPreStudyResponse(
    response: string,
    word: string,
    sentence: string,
    language: string,
    isEnglish: boolean,
    isGerman: boolean
  ): PreStudyWordEntry {
    const ipaMatch = response.match(/IPA:\s*\/([^/]+)\//i);
    const syllablesMatch = response.match(/SYLLABLES:\s*([^\n]+)/i);
    const typeMatch = response.match(/TYPE:\s*([^\n]+)/i);
    const engMatch = response.match(/ENGLISH:\s*([^\n]+)/i);
    const articleMatch = response.match(/ARTICLE:\s*([^\n]+)/i);
    const defMatch = response.match(/DEFINITION:\s*(.+?)$/is);

    const ipa = ipaMatch ? ipaMatch[1].trim() : '';
    const syllables = syllablesMatch ? syllablesMatch[1].trim().replace(/\./g, '·') : '';
    const wordType = typeMatch ? this.normalizeWordType(typeMatch[1].trim()) : undefined;
    const wordTranslation = !isEnglish && engMatch ? engMatch[1].trim() : undefined;
    const germanArticle = isGerman && articleMatch ? this.normalizeGermanArticle(articleMatch[1].trim()) : undefined;
    const definition = defMatch ? defMatch[1].trim() : 'Definition not available';

    return {
      word,
      cleanWord: word.toLowerCase(),
      ipa,
      syllables,
      definition,
      wordType,
      wordTranslation,
      germanArticle,
      contextSentence: sentence,
    };
  }

  async getGrammarAnalysis(text: string, sentence: string, language = 'en'): Promise<GrammarAnalysis> {
    const languageName = this.getLanguageName(language);
    const isEnglish = language === 'en';

    const prompt = `You are a ${languageName} grammar tutor for a B2-level learner who wants to master advanced grammar through reading.

Analyze this ${languageName} sentence:
"${sentence}"

Focus on: "${text}"

Provide a comprehensive grammar analysis. You MUST respond with valid JSON only (no markdown, no extra text).

{
  "partsOfSpeech": [
    {"word": "each word", "pos": "noun|verb|adjective|adverb|preposition|conjunction|pronoun|article|interjection|particle|other"}
  ],
  "structure": {
    "type": "Name the grammatical concept (e.g., passive voice, subjunctive mood, conditional clause, relative clause, participle phrase)",
    "description": "Brief description of what this structure is"
  },
  "ruleExplanation": "Detailed explanation of the grammar rule. Describe how and when this structure is used. Be thorough but use clear language. Include any important variations or exceptions.",
  "contextAnalysis": "Explain why the author chose this structure here. What effect does it create? What nuance does it add to the meaning?",
  "pattern": "Give a formula or template the learner can reuse, e.g., '[Subject] + [have/has] + [past participle]' or 'If + [past perfect], + [would have] + [past participle]'",
  "examples": [
    {"sentence": "Simple example using this pattern"${!isEnglish ? ', "translation": "English translation"' : ''}, "complexity": "simple"},
    {"sentence": "Medium complexity example"${!isEnglish ? ', "translation": "English translation"' : ''}, "complexity": "medium"},
    {"sentence": "More complex/literary example"${!isEnglish ? ', "translation": "English translation"' : ''}, "complexity": "complex"}
  ],
  "commonMistakes": [
    "First common mistake learners make with this structure",
    "Second common mistake",
    "Third common mistake"
  ],
  "practiceTask": {
    "instruction": "Clear instruction for the practice task, e.g., 'Complete this sentence using the same pattern' or 'Transform this active sentence to passive'",
    "template": "The sentence template with a blank or transformation task"
  }
}

IMPORTANT:
- Analyze ALL words in the sentence for partsOfSpeech, not just the focus word
- Be specific about the grammar structure identified
- Make the rule explanation detailed enough for self-study
- Examples should progress from simple to complex
- The practice task should reinforce the specific grammar point`;

    const response = await this.chat(prompt, 2000);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate and map partsOfSpeech
        const partsOfSpeech: WordPOS[] = (parsed.partsOfSpeech || []).map((item: { word?: string; pos?: string }) => ({
          word: item.word || '',
          pos: this.normalizePartOfSpeech(item.pos || 'other'),
        }));

        // Map examples with proper typing
        const examples: GrammarExample[] = (parsed.examples || []).map((ex: { sentence?: string; translation?: string; complexity?: string }) => ({
          sentence: ex.sentence || '',
          translation: ex.translation,
          complexity: this.normalizeComplexity(ex.complexity),
        }));

        // Build the result
        const result: GrammarAnalysis = {
          partsOfSpeech,
          structure: {
            type: parsed.structure?.type || 'Grammar Structure',
            description: parsed.structure?.description || 'Analysis not available',
          },
          ruleExplanation: parsed.ruleExplanation || 'Rule explanation not available',
          contextAnalysis: parsed.contextAnalysis || 'Context analysis not available',
          pattern: parsed.pattern || 'Pattern not available',
          examples,
          commonMistakes: Array.isArray(parsed.commonMistakes) ? parsed.commonMistakes : [],
          practiceTask: {
            instruction: parsed.practiceTask?.instruction || 'Complete the following:',
            template: parsed.practiceTask?.template || '___',
          },
        };

        return result;
      }
    } catch (e) {
      console.error('[OpenRouter] Failed to parse grammar analysis JSON:', e);
    }

    // Fallback if JSON parsing fails
    return this.getDefaultGrammarAnalysis(text, sentence);
  }

  /**
   * Normalize part of speech string to valid PartOfSpeech type
   */
  private normalizePartOfSpeech(pos: string): PartOfSpeech {
    const normalized = pos.toLowerCase().trim();
    const validPOS: PartOfSpeech[] = [
      'noun', 'verb', 'adjective', 'adverb', 'preposition',
      'conjunction', 'pronoun', 'article', 'interjection', 'particle', 'other'
    ];

    if (validPOS.includes(normalized as PartOfSpeech)) {
      return normalized as PartOfSpeech;
    }

    // Map common variations
    const posMap: Record<string, PartOfSpeech> = {
      'n': 'noun', 'n.': 'noun',
      'v': 'verb', 'v.': 'verb',
      'adj': 'adjective', 'adj.': 'adjective',
      'adv': 'adverb', 'adv.': 'adverb',
      'prep': 'preposition', 'prep.': 'preposition',
      'conj': 'conjunction', 'conj.': 'conjunction',
      'pron': 'pronoun', 'pron.': 'pronoun',
      'art': 'article', 'art.': 'article',
      'interj': 'interjection', 'interj.': 'interjection',
      'part': 'particle', 'part.': 'particle',
      'determiner': 'article',
      'auxiliary': 'verb',
      'modal': 'verb',
    };

    return posMap[normalized] || 'other';
  }

  /**
   * Normalize complexity string to valid complexity type
   */
  private normalizeComplexity(complexity?: string): 'simple' | 'medium' | 'complex' {
    const normalized = (complexity || 'medium').toLowerCase().trim();
    if (normalized === 'simple' || normalized === 'easy' || normalized === 'basic') return 'simple';
    if (normalized === 'complex' || normalized === 'advanced' || normalized === 'hard') return 'complex';
    return 'medium';
  }

  /**
   * Provide a default grammar analysis when AI parsing fails
   */
  private getDefaultGrammarAnalysis(text: string, sentence: string): GrammarAnalysis {
    return {
      partsOfSpeech: sentence.split(/\s+/).map(word => ({
        word,
        pos: 'other' as PartOfSpeech,
      })),
      structure: {
        type: 'Sentence Analysis',
        description: `Analysis of "${text}" in context`,
      },
      ruleExplanation: 'Grammar analysis could not be completed. Please try again.',
      contextAnalysis: 'Context analysis not available.',
      pattern: 'Pattern not available.',
      examples: [],
      commonMistakes: [],
      practiceTask: {
        instruction: 'Try using this word in your own sentence.',
        template: `Write a sentence using "${text}".`,
      },
    };
  }

  async getContextualMeaning(
    pageContent: string,
    analysisType: MeaningAnalysisType,
    language = 'en',
    timeout = 15000, // 15 second timeout
    focusWord?: string,      // Optional: The selected word/phrase for micro analysis
    focusSentence?: string   // Optional: The sentence containing the focus word
  ): Promise<MeaningAnalysis> {
    const languageName = this.getLanguageName(language);
    const isEnglish = language === 'en';

    // Build prompt based on analysis type
    const prompts: Record<MeaningAnalysisType, string> = {
      narrative: `You are analyzing ${languageName} literature for a B2-level reader.

Analyze this passage for narrative context:
"""
${pageContent}
"""
${focusWord ? `
SPECIAL FOCUS: Analyze the word/phrase "${focusWord}"
(Context sentence: "${focusSentence}")

In addition to the page-level analysis, provide word-specific insights.
` : ''}
Provide narrative analysis in valid JSON only (no markdown, no extra text).

{
  "plotContext": "What is happening in the story? Summarize events and their significance. 2-3 sentences.",
  "characterDynamics": "What are the character relationships and motivations? What do we learn about them? 2-3 sentences.",
  "narrativeFunction": "Why does this passage exist? What role does it play in the overall story? 1-2 sentences."${focusWord ? `,
  "wordSpecific": {
    "wordInPlot": "How does '${focusWord}' specifically impact the plot? What does it reveal or foreshadow? 2-3 sentences.",
    "characterInsight": "What does this word tell us about characters? Motivations, traits, relationships? 2-3 sentences.",
    "thematicRole": "How does '${focusWord}' connect to broader themes or symbols in the narrative? 1-2 sentences."
  }` : ''}
}

IMPORTANT:
- Be specific to this passage, not generic
- Focus on what a reader needs to understand the story
- Keep explanations clear and concise${focusWord ? '\n- For word-specific fields, focus ONLY on the selected word/phrase' : ''}`,

      literary: `You are a literary analyst helping a B2-level reader appreciate ${languageName} literature.

Analyze this passage for literary techniques:
"""
${pageContent}
"""
${focusWord ? `
SPECIAL FOCUS: Analyze the word/phrase "${focusWord}"
(Context sentence: "${focusSentence}")

In addition to the page-level analysis, provide word-specific insights.
` : ''}
Provide literary analysis in valid JSON only (no markdown, no extra text).

{
  "wordChoice": "What specific word choices stand out? How do they create meaning or emotion? 2-3 sentences with examples.",
  "tone": "What is the emotional tone or atmosphere? How is it created? 1-2 sentences.",
  "literaryDevices": [
    "Device 1: Brief explanation with example from text",
    "Device 2: Brief explanation with example from text",
    "Device 3: Brief explanation with example from text"
  ]${focusWord ? `,
  "wordSpecific": {
    "rhetoricalEffect": "Why was '${focusWord}' chosen instead of alternatives? What rhetorical purpose does it serve? 2-3 sentences.",
    "emotionalImpact": "What emotional weight or connotations does '${focusWord}' carry in this context? 1-2 sentences.",
    "stylisticPurpose": "How does '${focusWord}' contribute to the author's unique style or voice? 1-2 sentences."
  }` : ''}
}

Literary devices can include: metaphor, simile, personification, imagery, symbolism, alliteration, repetition, irony, foreshadowing, etc.

IMPORTANT:
- Only mention devices actually present in THIS passage
- Include specific examples from the text
- Explain the effect of each device${focusWord ? '\n- For word-specific fields, focus ONLY on the selected word/phrase' : ''}`,

      semantic: `You are a language expert helping a B2-level reader understand ${languageName} nuances.

Analyze this passage for semantic depth:
"""
${pageContent}
"""
${focusWord ? `
SPECIAL FOCUS: Analyze the word/phrase "${focusWord}"
(Context sentence: "${focusSentence}")

In addition to the page-level analysis, provide word-specific insights.
` : ''}
Provide semantic analysis in valid JSON only (no markdown, no extra text).

{
  "multipleMeanings": [
    "Primary interpretation: [explain]",
    "Alternative interpretation: [explain]",
    "Subtle implication: [explain]"
  ],
  "nuances": "What subtle meanings or connotations exist? What might a native speaker notice that a learner might miss? 2-3 sentences.",
  "culturalContext": "Are there cultural, historical, or idiomatic references? What background knowledge helps understand this passage? 2-3 sentences."${focusWord ? `,
  "wordSpecific": {
    "contextualMeaning": "What does '${focusWord}' specifically mean in THIS context? How does context shape its interpretation? 2-3 sentences.",
    "ambiguityAnalysis": "Are there multiple possible interpretations of '${focusWord}' here? What nuances or double meanings exist? 2-3 sentences.",
    "culturalSignificance": "Does '${focusWord}' carry cultural, idiomatic, or symbolic weight in this context? 1-2 sentences."
  }` : ''}
}

IMPORTANT:
- Focus on what's NOT obvious to a language learner
- Explain idioms, cultural references, and subtle implications
- If no cultural context is relevant, say so briefly${focusWord ? '\n- For word-specific fields, focus ONLY on the selected word/phrase' : ''}`,

      simplified: `You are a language teacher explaining ${languageName} text to a B2-level learner.

Break down this passage for a language learner:
"""
${pageContent}
"""
${focusWord ? `
SPECIAL FOCUS: Analyze the word/phrase "${focusWord}"
(Context sentence: "${focusSentence}")

In addition to the page-level analysis, provide word-specific insights.
` : ''}
Provide simplified explanation in valid JSON only (no markdown, no extra text).

{
  "mainIdea": "What is the core message of this passage in simple terms? 1-2 sentences.",
  "breakdown": "Explain the passage sentence by sentence or section by section. Use simpler ${languageName === 'en' ? 'English' : languageName + ' (with English translation if needed)'}. Be thorough but clear.",
  "keyVocabulary": [
    "word1: definition and usage",
    "word2: definition and usage",
    "word3: definition and usage",
    "word4: definition and usage",
    "word5: definition and usage"
  ]${focusWord ? `,
  "wordSpecific": {
    "simpleDefinition": "What does '${focusWord}' mean in simple terms for a B2 learner? 1-2 sentences.",
    "usageExample": "How is '${focusWord}' used in this specific sentence compared to how it's typically used? 1-2 sentences.",
    "learnerTip": "What's a helpful tip or memory trick for remembering or using '${focusWord}'? 1 sentence."
  }` : ''}
}

IMPORTANT:
- Choose 3-5 most important words for learners
- Explain words in context of this passage
- Make breakdown detailed enough to be useful but not overwhelming${focusWord ? '\n- For word-specific fields, focus ONLY on the selected word/phrase' : ''}`
    };

    const prompt = prompts[analysisType];

    // Get max_tokens from settings (default: 1000)
    const maxTokens = await settingsRepository.get('contextualMeaningMaxTokens');
    const response = await this.chat(prompt, maxTokens);

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Debug logging
      console.log('[OpenRouter] Parsed response for', analysisType, '- has wordSpecific:', !!parsed.wordSpecific);
      if (parsed.wordSpecific) {
        console.log('[OpenRouter] wordSpecific keys:', Object.keys(parsed.wordSpecific));
      }

      // Build result based on analysis type
      const result: MeaningAnalysis = {};

      if (analysisType === 'narrative') {
        result.narrative = {
          plotContext: parsed.plotContext || 'Analysis not available',
          characterDynamics: parsed.characterDynamics || 'Analysis not available',
          narrativeFunction: parsed.narrativeFunction || 'Analysis not available',
          // Include word-specific analysis if present
          ...(parsed.wordSpecific && {
            wordSpecific: {
              wordInPlot: parsed.wordSpecific.wordInPlot || '',
              characterInsight: parsed.wordSpecific.characterInsight || '',
              thematicRole: parsed.wordSpecific.thematicRole || '',
            }
          })
        };
      } else if (analysisType === 'literary') {
        result.literary = {
          wordChoice: parsed.wordChoice || 'Analysis not available',
          tone: parsed.tone || 'Analysis not available',
          literaryDevices: Array.isArray(parsed.literaryDevices)
            ? parsed.literaryDevices
            : ['Analysis not available'],
          // Include word-specific analysis if present
          ...(parsed.wordSpecific && {
            wordSpecific: {
              rhetoricalEffect: parsed.wordSpecific.rhetoricalEffect || '',
              emotionalImpact: parsed.wordSpecific.emotionalImpact || '',
              stylisticPurpose: parsed.wordSpecific.stylisticPurpose || '',
            }
          })
        };
      } else if (analysisType === 'semantic') {
        result.semantic = {
          multipleMeanings: Array.isArray(parsed.multipleMeanings)
            ? parsed.multipleMeanings
            : ['Analysis not available'],
          nuances: parsed.nuances || 'Analysis not available',
          culturalContext: parsed.culturalContext || 'No specific cultural context identified',
          // Include word-specific analysis if present
          ...(parsed.wordSpecific && {
            wordSpecific: {
              contextualMeaning: parsed.wordSpecific.contextualMeaning || '',
              ambiguityAnalysis: parsed.wordSpecific.ambiguityAnalysis || '',
              culturalSignificance: parsed.wordSpecific.culturalSignificance || '',
            }
          })
        };
      } else if (analysisType === 'simplified') {
        result.simplified = {
          mainIdea: parsed.mainIdea || 'Analysis not available',
          breakdown: parsed.breakdown || 'Analysis not available',
          keyVocabulary: Array.isArray(parsed.keyVocabulary)
            ? parsed.keyVocabulary
            : ['Analysis not available'],
          // Include word-specific analysis if present
          ...(parsed.wordSpecific && {
            wordSpecific: {
              simpleDefinition: parsed.wordSpecific.simpleDefinition || '',
              usageExample: parsed.wordSpecific.usageExample || '',
              learnerTip: parsed.wordSpecific.learnerTip || '',
            }
          })
        };
      }

      return result;
    } catch (error) {
      console.error('[OpenRouter] Failed to parse meaning analysis:', error);
      // Return partial result with error indication
      return this.getDefaultMeaningAnalysis(analysisType);
    }
  }

  async getSimplerAnalysis(
    word: string,
    sentence: string,
    viewContent: string,
    language = 'en'
  ): Promise<SimplerAnalysis> {
    const languageInstruction = language === 'en'
      ? ''
      : `The text is in ${language}. Provide all responses in English.`;
    const isPhrase = word.trim().includes(' ');
    const viewSnippet = viewContent.length > 5000 ? viewContent.slice(0, 5000) : viewContent;
    const simplerInstruction = isPhrase
      ? '1. SIMPLER VERSION: Provide simpler alternatives for the key words in the phrase. Return 4-8 lines in the format "original -> simpler".'
      : `1. SIMPLER VERSION: A simpler alternative for "${word}" (1-5 words maximum)`;

    const prompt = `You are an expert language teacher helping students understand complex text.

${languageInstruction}

TARGET WORD/PHRASE: "${word}"
SENTENCE CONTEXT: "${sentence}"
FULL VIEW: "${viewSnippet}"

Please provide:

${simplerInstruction}
2. ROLE IN CONTEXT: Explain the role/function of "${word}" in this sentence (2-3 sentences)
3. PARAPHRASES: Provide 2-3 alternative ways to express "${word}" in this context
4. SIMPLIFIED VIEW: Rewrite the ENTIRE FULL VIEW using simpler language while keeping the same meaning

Format your response as JSON:
{
  "simplerVersion": "...",
  "roleInContext": "...",
  "paraphrases": ["...", "...", "..."],
  "simplifiedView": "...",
  "complexityReduction": "..." (optional, e.g., "B2 -> A2")
}

If you provide multiple lines, separate them with "\\n".`;

    const response = await this.chat(prompt, 2000);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        simplerVersion: parsed.simplerVersion || word,
        roleInContext: parsed.roleInContext || 'Role explanation not available.',
        paraphrases: Array.isArray(parsed.paraphrases) ? parsed.paraphrases : [],
        simplifiedView: parsed.simplifiedView || viewSnippet,
        complexityReduction: parsed.complexityReduction,
      };
    } catch (error) {
      console.error('[OpenRouter] Failed to parse simpler analysis JSON:', error);
      return {
        simplerVersion: word,
        roleInContext: 'Role explanation not available.',
        paraphrases: [],
        simplifiedView: viewSnippet,
      };
    }
  }

  /**
   * Provide default meaning analysis when parsing fails
   */
  private getDefaultMeaningAnalysis(analysisType: MeaningAnalysisType): MeaningAnalysis {
    const errorMsg = 'Unable to generate analysis. Please try again.';

    const result: MeaningAnalysis = {};

    if (analysisType === 'narrative') {
      result.narrative = {
        plotContext: errorMsg,
        characterDynamics: errorMsg,
        narrativeFunction: errorMsg,
      };
    } else if (analysisType === 'literary') {
      result.literary = {
        wordChoice: errorMsg,
        tone: errorMsg,
        literaryDevices: [errorMsg],
      };
    } else if (analysisType === 'semantic') {
      result.semantic = {
        multipleMeanings: [errorMsg],
        nuances: errorMsg,
        culturalContext: errorMsg,
      };
    } else if (analysisType === 'simplified') {
      result.simplified = {
        mainIdea: errorMsg,
        breakdown: errorMsg,
        keyVocabulary: [errorMsg],
      };
    }

    return result;
  }

  // ===== Private helper methods =====

  private getLanguageName(code: string): string {
    const names: Record<string, string> = {
      en: 'English',
      de: 'German',
      ru: 'Russian',
      fr: 'French',
      es: 'Spanish',
      it: 'Italian',
      pt: 'Portuguese',
      ja: 'Japanese',
      zh: 'Chinese',
      ko: 'Korean',
    };
    return names[code] || 'the source';
  }

  private normalizeWordType(type: string): string {
    const cleaned = type.toLowerCase()
      .replace(/[.,;:!?]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    const typeMap: Record<string, string> = {
      'n': 'noun', 'n.': 'noun',
      'v': 'verb', 'v.': 'verb',
      'adj': 'adjective', 'adj.': 'adjective',
      'adv': 'adverb', 'adv.': 'adverb',
      'prep': 'preposition', 'prep.': 'preposition',
      'conj': 'conjunction', 'conj.': 'conjunction',
      'interj': 'interjection', 'interj.': 'interjection',
      'pron': 'pronoun', 'pron.': 'pronoun',
      'art': 'article', 'art.': 'article',
      'phr': 'phrasal verb', 'phr. v': 'phrasal verb', 'phr. v.': 'phrasal verb', 'pv': 'phrasal verb',
    };

    return typeMap[cleaned] || cleaned;
  }

  private normalizeGermanArticle(article: string): string | undefined {
    const cleaned = article.toLowerCase()
      .replace(/[.,;:!?]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (['der', 'die', 'das'].includes(cleaned)) {
      return cleaned;
    }

    if (cleaned.startsWith('der ') || cleaned === 'der') return 'der';
    if (cleaned.startsWith('die ') || cleaned === 'die') return 'die';
    if (cleaned.startsWith('das ') || cleaned === 'das') return 'das';

    return undefined;
  }

  private extractNonEnglishSentence(response: string, language: string): string {
    const lines = response.split('\n').map(l => l.trim()).filter(l => l);

    if (lines.length === 1) {
      return lines[0];
    }

    const scriptPatterns: Record<string, RegExp> = {
      ru: /[\u0400-\u04FF]/,
      zh: /[\u4E00-\u9FFF]/,
      ja: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/,
      ko: /[\uAC00-\uD7AF]/,
      ar: /[\u0600-\u06FF]/,
      fa: /[\u0600-\u06FF]/,
    };

    const scriptPattern = scriptPatterns[language];
    if (scriptPattern) {
      for (const line of lines) {
        if (scriptPattern.test(line)) {
          return line;
        }
      }
    }

    const latinNonEnglishPattern = /[äöüßéèêëàâçñíóúý]/i;
    const englishStartPattern = /^(the|here|this|that|note|simplified|translation|answer|result|output)/i;

    for (const line of lines) {
      if (latinNonEnglishPattern.test(line) && !englishStartPattern.test(line)) {
        return line;
      }
    }

    for (const line of lines) {
      if (!englishStartPattern.test(line) && line.length > 10) {
        return line;
      }
    }

    return lines[0] || response;
  }

  /**
   * Detect if text is likely English based on common English words.
   * Used to validate that non-English simplified sentences aren't accidentally English.
   */
  private isLikelyEnglish(text: string): boolean {
    const words = text.toLowerCase().split(/\s+/);
    const englishWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
      'with', 'from', 'into', 'onto', 'upon', 'about', 'against', 'between',
      'this', 'that', 'these', 'those', 'their', 'them', 'they', 'he', 'she', 'it',
      'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
      'took', 'went', 'came', 'made', 'said', 'got', 'put', 'let', 'get',
      'morning', 'next', 'parents', 'children', 'kids', 'deep', 'woods', 'forest'
    ]);

    let englishCount = 0;
    for (const word of words) {
      if (englishWords.has(word)) {
        englishCount++;
      }
    }

    // If more than 30% of words are common English words, likely English
    return words.length > 0 && (englishCount / words.length) > 0.3;
  }

  private cleanAIResponse(response: string, extractType: 'full' | 'short' = 'full'): string {
    let cleaned = response;

    // Remove thinking tags
    if (cleaned.includes('<think>')) {
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
      cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');
    }

    cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
    cleaned = cleaned.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
    cleaned = cleaned.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');

    if (extractType === 'short') {
      cleaned = this.extractShortAnswer(cleaned);
    } else {
      cleaned = this.removeReasoningNoise(cleaned);
    }

    return cleaned.trim();
  }

  private extractShortAnswer(response: string): string {
    const lines = response.split('\n').map(l => l.trim()).filter(l => l);

    if (lines.length === 1 && response.split(/\s+/).length <= 5) {
      return this.cleanMarkdownFormatting(response.trim());
    }

    const answerPatterns = [
      /(?:^|\n)\s*(?:answer|result|equivalent|translation):\s*\**([^*\n]+)\**/i,
      /(?:^|\n)\s*(?:so the answer is|the answer is|therefore)[:,]?\s*\**([^*\n]+)\**/i,
      /(?:^|\n)\s*\*\*([^*]+)\*\*\s*$/m,
    ];

    for (const pattern of answerPatterns) {
      const match = response.match(pattern);
      if (match && match[1]) {
        return this.cleanMarkdownFormatting(match[1].trim());
      }
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (this.isReasoningLine(line)) continue;
      if (line.split(/\s+/).length > 8) continue;
      if (/^(but|so|wait|let|this|in this|because|since|however|therefore|thus)/i.test(line)) continue;
      return this.cleanMarkdownFormatting(line);
    }

    for (const line of lines) {
      if (!this.isReasoningLine(line) && line.split(/\s+/).length <= 8) {
        return this.cleanMarkdownFormatting(line);
      }
    }

    return this.cleanMarkdownFormatting(lines[0] || response);
  }

  private isReasoningLine(line: string): boolean {
    const reasoningPatterns = [
      /^(but wait|wait —|hmm|let me|let's|okay|ok,)/i,
      /^(so the instruction|the instruction|in the example|the example)/i,
      /^(this is a trick|this means|this shows|looking at)/i,
      /^(we need to|we should|we can|i need to|i should)/i,
      /^(notice that|note that|remember that|observe that)/i,
      /^(first,|second,|third,|finally,|next,)/i,
      /^(→|—|>|\*\*?wait)/i,
      /^["'].*["'].*→/,
      /(because|since|therefore|thus|hence).*[.!?]$/i,
      /\?$/,
    ];

    return reasoningPatterns.some(p => p.test(line.trim()));
  }

  private removeReasoningNoise(response: string): string {
    const lines = response.split('\n');
    const cleanedLines: string[] = [];
    let inReasoningBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (cleanedLines.length === 0 && !trimmed) continue;

      if (/^(but wait|wait —|hmm|let me think|let's see|okay so)/i.test(trimmed)) {
        inReasoningBlock = true;
        continue;
      }

      if (inReasoningBlock && /^(DEFINITION:|SIMPLIFIED:|MEANING:|IPA:|SYLLABLES:|ENGLISH:|ORIGINAL_ENGLISH:|SIMPLIFIED_ENGLISH:)/i.test(trimmed)) {
        inReasoningBlock = false;
      }

      if (inReasoningBlock || this.isReasoningLine(trimmed)) continue;
      if (/^>\s/.test(trimmed)) continue;

      cleanedLines.push(line);
    }

    return cleanedLines.join('\n').trim();
  }

  private cleanMarkdownFormatting(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^["'`]|["'`]$/g, '')
      .trim();
  }

  private async chat(content: string, maxTokens = 500): Promise<string> {
    const rawContent = await this.rawChat(content, maxTokens);
    return this.cleanAIResponse(rawContent, 'full');
  }

  private async chatShort(content: string): Promise<string> {
    const rawContent = await this.rawChat(content, 100);
    return this.cleanAIResponse(rawContent, 'short');
  }

  private async rawChat(content: string, maxTokens = 500): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const availableModels = this.getAvailableModels();

    if (availableModels.length === 0) {
      // All models are rate-limited
      const cooldownValues = Array.from(OpenRouterService.modelCooldowns.values());
      const earliestCooldown = cooldownValues.length > 0 ? Math.min(...cooldownValues) : Date.now();
      const waitSeconds = Math.ceil((earliestCooldown - Date.now()) / 1000);
      throw new Error(
        `All OpenRouter models are rate-limited. Please wait ${Math.max(waitSeconds, 1)} seconds before trying again.`
      );
    }

    let lastError: Error | null = null;

    for (const modelToTry of availableModels) {
      try {
        const result = await this.executeChat(content, maxTokens, modelToTry);

        // Log which model was used (only if different from preferred)
        if (modelToTry !== this.model) {
          console.log(`[OpenRouter] Used fallback model: ${modelToTry} (preferred: ${this.model})`);
        }

        return result;
      } catch (error) {
        if (error instanceof Error && (error.message.includes('rate limit') || error.message.includes('429'))) {
          this.markModelRateLimited(modelToTry);
          lastError = error;
          // Continue to next model
          continue;
        }
        // Non-rate-limit error, throw immediately
        throw error;
      }
    }

    // All models failed
    throw lastError || new Error('All OpenRouter models failed');
  }

  /**
   * Execute a single chat request with a specific model.
   * Throws on rate limit (429) or other errors.
   */
  private async executeChat(content: string, maxTokens: number, model: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/yourusername/BookReader',
          'X-Title': 'BookReader Language Learning App',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'user', content } as ChatMessage,
          ],
          temperature: 0.7,
          max_tokens: maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 401) {
          throw new Error('Invalid OpenRouter API key');
        }
        if (response.status === 429) {
          throw new Error(`OpenRouter rate limit exceeded for model ${model}`);
        }
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json() as ChatResponse;
      return data.choices[0]?.message?.content?.trim() || '';
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
