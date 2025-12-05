import type { AIServiceInterface } from './ai-service.interface';
import type { PreStudyWordEntry } from '../../shared/types/pre-study-notes.types';
import type { GrammarAnalysis, PartOfSpeech, WordPOS, GrammarExample } from '../../shared/types/grammar.types';

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

export class LMStudioService implements AIServiceInterface {
  public readonly baseUrl: string;
  public model: string;
  private timeout: number;

  constructor(baseUrl = 'http://localhost:1234', model = 'default', timeout = 30000) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.timeout = timeout;
  }

  setModel(model: string): void {
    this.model = model;
  }

  async getWordDefinition(word: string, context: string, language = 'en'): Promise<{
    definition: string;
    wordTranslation?: string;
    wordType?: string;
    germanArticle?: string;
  }> {
    if (language === 'en') {
      // English: get definition and word type
      const prompt = `Define the word "${word}" as it is used in the following context. Also identify its part of speech.

Context: "${context}"

Format your response EXACTLY like this:
DEFINITION: [2-3 sentence definition suitable for a language learner]
TYPE: [part of speech: noun, verb, adjective, adverb, preposition, conjunction, interjection, pronoun, article, phrasal verb, idiom, or collocation]`;

      const response = await this.chat(prompt);

      // Parse the response - handle both orders (DEFINITION first or TYPE first)
      const defMatch = response.match(/DEFINITION:\s*(.+?)(?=TYPE:|$)/is);
      const typeMatch = response.match(/TYPE:\s*([^\n]+)/i);

      // Extract definition, with fallback that removes TYPE: line
      let definition = defMatch ? defMatch[1].trim() : response;
      if (!defMatch) {
        // Remove TYPE: line from fallback to avoid showing "TYPE: adjective" as definition
        definition = definition.replace(/^TYPE:\s*[^\n]+\n?/im, '').trim();
        // Also remove DEFINITION: prefix if it exists but wasn't captured
        definition = definition.replace(/^DEFINITION:\s*/i, '').trim();
      }
      const wordType = typeMatch ? this.normalizeWordType(typeMatch[1].trim()) : undefined;

      return { definition, wordType };
    }

    // German: get definition + translation + type + article (for nouns)
    if (language === 'de') {
      const prompt = `For the German word "${word}" in this context, provide:
1. A definition in English explaining what this word means (2-3 sentences, write the definition in ENGLISH)
2. The English translation of the word (single word or short phrase)
3. The part of speech (noun, verb, adjective, adverb, preposition, conjunction, interjection, pronoun, article, phrasal verb, idiom, or collocation)
4. If it's a noun, provide the definite article (der, die, or das)

Context: "${context}"

Format your response EXACTLY like this:
DEFINITION: [definition in English]
ENGLISH: [English translation of the word]
TYPE: [part of speech]
ARTICLE: [der/die/das - ONLY if it's a noun, otherwise leave empty or omit]`;

      const response = await this.chat(prompt);

      // Parse the response
      const defMatch = response.match(/DEFINITION:\s*(.+?)(?=ENGLISH:|TYPE:|ARTICLE:|$)/is);
      const engMatch = response.match(/ENGLISH:\s*(.+?)(?=TYPE:|ARTICLE:|$)/is);
      const typeMatch = response.match(/TYPE:\s*([^\n]+)/i);
      const articleMatch = response.match(/ARTICLE:\s*([^\n]+)/i);

      // Extract definition, with fallback that removes other labels
      let definition = defMatch ? defMatch[1].trim() : response;
      if (!defMatch) {
        // Remove labeled lines from fallback
        definition = definition
          .replace(/^(DEFINITION|ENGLISH|TYPE|ARTICLE):\s*[^\n]*\n?/gim, '')
          .trim();
      }
      const wordTranslation = engMatch ? engMatch[1].trim() : undefined;
      const wordType = typeMatch ? this.normalizeWordType(typeMatch[1].trim()) : undefined;
      const germanArticle = articleMatch ? this.normalizeGermanArticle(articleMatch[1].trim()) : undefined;

      return { definition, wordTranslation, wordType, germanArticle };
    }

    // Other non-English languages: get English definition + English translation of the word + word type
    const languageName = this.getLanguageName(language);
    const prompt = `For the ${languageName} word "${word}" in this context, provide:
1. A definition in English explaining what this word means (2-3 sentences, write the definition in ENGLISH)
2. The English translation of the word (single word or short phrase)
3. The part of speech (noun, verb, adjective, adverb, preposition, conjunction, interjection, pronoun, article, phrasal verb, idiom, or collocation)

Context: "${context}"

Format your response EXACTLY like this:
DEFINITION: [definition in English]
ENGLISH: [English translation of the word]
TYPE: [part of speech]`;

    const response = await this.chat(prompt);

    // Parse the response
    const defMatch = response.match(/DEFINITION:\s*(.+?)(?=ENGLISH:|TYPE:|$)/is);
    const engMatch = response.match(/ENGLISH:\s*(.+?)(?=TYPE:|$)/is);
    const typeMatch = response.match(/TYPE:\s*([^\n]+)/i);

    // Extract definition, with fallback that removes other labels
    let definition = defMatch ? defMatch[1].trim() : response;
    if (!defMatch) {
      // Remove labeled lines from fallback
      definition = definition
        .replace(/^(DEFINITION|ENGLISH|TYPE):\s*[^\n]*\n?/gim, '')
        .trim();
    }
    const wordTranslation = engMatch ? engMatch[1].trim() : undefined;
    const wordType = typeMatch ? this.normalizeWordType(typeMatch[1].trim()) : undefined;

    return { definition, wordTranslation, wordType };
  }

  /**
   * Normalize German article to a consistent format.
   * Handles variations like "Der", "DER", "der." -> "der"
   */
  private normalizeGermanArticle(article: string): string | undefined {
    const cleaned = article.toLowerCase()
      .replace(/[.,;:!?]+$/, '')  // Remove trailing punctuation
      .replace(/\s+/g, ' ')       // Normalize whitespace
      .trim();

    // Only return valid German articles
    if (['der', 'die', 'das'].includes(cleaned)) {
      return cleaned;
    }

    // Handle edge cases where AI might add extra text
    if (cleaned.startsWith('der ') || cleaned === 'der') return 'der';
    if (cleaned.startsWith('die ') || cleaned === 'die') return 'die';
    if (cleaned.startsWith('das ') || cleaned === 'das') return 'das';

    // Return undefined if not a valid article (e.g., "none", "n/a", empty)
    return undefined;
  }

  /**
   * Normalize word type to a consistent format.
   * Handles variations like "Noun", "NOUN", "noun." -> "noun"
   */
  private normalizeWordType(type: string): string {
    // Clean and lowercase
    const cleaned = type.toLowerCase()
      .replace(/[.,;:!?]+$/, '')  // Remove trailing punctuation
      .replace(/\s+/g, ' ')       // Normalize whitespace
      .trim();

    // Map common variations to standard types
    const typeMap: Record<string, string> = {
      'n': 'noun',
      'n.': 'noun',
      'v': 'verb',
      'v.': 'verb',
      'adj': 'adjective',
      'adj.': 'adjective',
      'adv': 'adverb',
      'adv.': 'adverb',
      'prep': 'preposition',
      'prep.': 'preposition',
      'conj': 'conjunction',
      'conj.': 'conjunction',
      'interj': 'interjection',
      'interj.': 'interjection',
      'pron': 'pronoun',
      'pron.': 'pronoun',
      'art': 'article',
      'art.': 'article',
      'phr': 'phrasal verb',
      'phr. v': 'phrasal verb',
      'phr. v.': 'phrasal verb',
      'pv': 'phrasal verb',
    };

    return typeMap[cleaned] || cleaned;
  }

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

  async getIPAPronunciation(word: string, language = 'en'): Promise<{ ipa: string; syllables: string }> {
    const languageName = this.getLanguageName(language);

    // For non-Latin scripts, use native script for syllables
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

    // Extract IPA from response (between slashes)
    const ipaMatch = response.match(/\/([^/]+)\//);
    const ipa = ipaMatch ? ipaMatch[1] : '';

    // Extract syllables from response (after SYLLABLES:)
    const syllablesMatch = response.match(/SYLLABLES:\s*([^\n]+)/i);
    let syllables = syllablesMatch ? syllablesMatch[1].trim() : '';

    // If no syllables found, try to extract any word with dots or middle dots
    if (!syllables) {
      // Match any characters with dots (including Cyrillic, CJK, etc.)
      const dotMatch = response.match(/(\S+[·.]\S+)/);
      syllables = dotMatch ? dotMatch[1].replace(/\./g, '·') : '';
    }

    return { ipa, syllables };
  }

  /**
   * Get IPA pronunciation and syllables for multiple words at once.
   * More efficient than calling getIPAPronunciation for each word individually.
   */
  async getBatchIPAPronunciation(words: string[], language = 'en'): Promise<{ word: string; ipa: string; syllables: string }[]> {
    // Filter out empty/whitespace-only words and punctuation-only tokens
    const validWords = words.filter(w => w.trim() && /\p{L}/u.test(w));

    if (validWords.length === 0) {
      return words.map(word => ({ word, ipa: '', syllables: '' }));
    }

    const languageName = this.getLanguageName(language);

    // For non-Latin scripts, use native script for syllables
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

    // Parse the response - each line should be: "N. /ipa/ syllables"
    const results: { word: string; ipa: string; syllables: string }[] = [];
    const lines = response.split('\n').filter(l => l.trim());

    for (let i = 0; i < validWords.length; i++) {
      const word = validWords[i];
      // Try to find a matching line
      const linePattern = new RegExp(`^${i + 1}[.)]?\\s*`);
      const line = lines.find(l => linePattern.test(l.trim()));

      if (line) {
        // Extract IPA (between slashes)
        const ipaMatch = line.match(/\/([^/]+)\//);
        const ipa = ipaMatch ? ipaMatch[1] : '';

        // Extract syllables (after the /ipa/, remaining text)
        let syllables = '';
        const afterIpa = line.substring(line.lastIndexOf('/') + 1).trim();
        // Clean up any number prefix if present
        const cleanedSyllables = afterIpa.replace(/^\d+[.)]\s*/, '').trim();
        if (cleanedSyllables && cleanedSyllables !== ipa) {
          syllables = cleanedSyllables.replace(/\./g, '·');
        }

        results.push({ word, ipa, syllables });
      } else {
        // Line not found, return empty
        results.push({ word, ipa: '', syllables: '' });
      }
    }

    // Build final results array preserving original word order
    // (including whitespace/punctuation which were filtered out)
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
      // English: just simplify
      const prompt = `Rewrite this sentence using simpler words for a language learner.

Rules:
- Replace difficult words with easier synonyms (e.g., "passion" → "strong love", "peculiar" → "strange", "departed" → "left")
- Keep the SAME sentence structure as much as possible
- Do NOT remove any concepts or meanings - every idea in the original must appear in the simplified version
- Do NOT add new ideas or change the meaning
- Keep names and places unchanged

Original: "${sentence}"

Simplified:`;

      const simplified = await this.chat(prompt);
      return { simplified };
    }

    // Non-English: simplify in source language AND provide English translations
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

    // Parse the response
    const simpMatch = response.match(/SIMPLIFIED:\s*(.+?)(?=ORIGINAL_ENGLISH:|$)/is);
    const origEngMatch = response.match(/ORIGINAL_ENGLISH:\s*(.+?)(?=SIMPLIFIED_ENGLISH:|$)/is);
    const simpEngMatch = response.match(/SIMPLIFIED_ENGLISH:\s*(.+?)$/is);

    let simplified = simpMatch ? simpMatch[1].trim() : response;
    const sentenceTranslation = origEngMatch ? origEngMatch[1].trim() : undefined;
    const simplifiedTranslation = simpEngMatch ? simpEngMatch[1].trim() : undefined;

    // Validate that SIMPLIFIED is actually in the target language, not English
    if (language !== 'en' && simpMatch && this.isLikelyEnglish(simplified)) {
      console.warn(`[LM Studio] SIMPLIFIED appears to be English for ${language} book, extracting non-English text`);
      const extracted = this.extractNonEnglishSentence(response, language);
      if (extracted && extracted !== simplified && !this.isLikelyEnglish(extracted)) {
        simplified = extracted;
      }
    }

    // If parsing failed completely, try to extract the non-English sentence
    if (!simpMatch) {
      simplified = this.extractNonEnglishSentence(response, language);
    }

    return { simplified, sentenceTranslation, simplifiedTranslation };
  }

  async resimplifyWithWord(
    originalSentence: string,
    originalWord: string,
    equivalentWord: string,
    language = 'en'
  ): Promise<string> {
    const languageName = this.getLanguageName(language);

    // For non-English, explicitly specify to keep in source language
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

    // Extra cleaning for non-English: remove any English explanatory text
    if (language !== 'en') {
      return this.extractNonEnglishSentence(response, language);
    }

    return response;
  }

  /**
   * Extract the non-English sentence from potentially mixed response.
   * Helps when AI adds English explanations before/after the actual sentence.
   */
  private extractNonEnglishSentence(response: string, language: string): string {
    const lines = response.split('\n').map(l => l.trim()).filter(l => l);

    // If only one line, return it
    if (lines.length === 1) {
      return lines[0];
    }

    // For languages with non-Latin scripts, find line with those characters
    const scriptPatterns: Record<string, RegExp> = {
      ru: /[\u0400-\u04FF]/,  // Cyrillic
      zh: /[\u4E00-\u9FFF]/,  // Chinese
      ja: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/,  // Japanese
      ko: /[\uAC00-\uD7AF]/,  // Korean
      ar: /[\u0600-\u06FF]/,  // Arabic
      fa: /[\u0600-\u06FF]/,  // Persian (uses Arabic script)
    };

    const scriptPattern = scriptPatterns[language];
    if (scriptPattern) {
      for (const line of lines) {
        if (scriptPattern.test(line)) {
          return line;
        }
      }
    }

    // For Latin-script languages (de, fr, es, etc.), look for:
    // 1. Lines with special characters (ö, ü, ä, é, ñ, etc.)
    // 2. Lines that don't start with English words like "The", "Here", "This"
    const latinNonEnglishPattern = /[äöüßéèêëàâçñíóúý]/i;
    const englishStartPattern = /^(the|here|this|that|note|simplified|translation|answer|result|output)/i;

    for (const line of lines) {
      // Prefer lines with non-English Latin characters
      if (latinNonEnglishPattern.test(line) && !englishStartPattern.test(line)) {
        return line;
      }
    }

    // Fallback: return line that doesn't look like English explanation
    for (const line of lines) {
      if (!englishStartPattern.test(line) && line.length > 10) {
        return line;
      }
    }

    // Ultimate fallback: return first line
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

Example:
Original: "Sie war sehr schön"
Simplified: "Sie war sehr schön"
Word: "schön"
Answer: schön

Now your turn:
Original: "${originalSentence}"
Simplified: "${simplifiedSentence}"
Word: "${originalWord}"
Answer:`;

    // Use chatShort for single-word answers - applies aggressive cleaning
    const response = await this.chatShort(prompt);

    console.log('[DEBUG main] AI response for word equivalent (after cleaning):', JSON.stringify(response));

    // Additional cleanup for edge cases
    const cleaned = response
      .replace(/^["'`]|["'`]$/g, '')  // Remove surrounding quotes
      .replace(/\.+$/, '')             // Remove trailing periods
      .replace(/^answer:\s*/i, '')     // Remove "Answer:" prefix
      .replace(/^["'`]|["'`]$/g, '')  // Remove quotes again
      .trim();

    // Check for NONE variations
    if (cleaned.toUpperCase().startsWith('NONE') || cleaned === '') {
      console.log('[DEBUG main] Returning empty (was NONE or empty)');
      return { equivalent: '', needsRegeneration: false };
    }

    // Validate that the equivalent actually exists in the simplified sentence
    const simplifiedLower = simplifiedSentence.toLowerCase();
    const cleanedLower = cleaned.toLowerCase();

    if (!simplifiedLower.includes(cleanedLower)) {
      console.log('[DEBUG main] Equivalent not found in simplified sentence, needs regeneration');
      console.log('[DEBUG main] Looking for:', cleanedLower);
      console.log('[DEBUG main] In sentence:', simplifiedLower);
      return { equivalent: cleaned, needsRegeneration: true };
    }

    console.log('[DEBUG main] Returning:', cleaned);
    return { equivalent: cleaned, needsRegeneration: false };
  }

  /**
   * Get the meaning of a phrase (phrasal verb, collocation, idiom) in context
   */
  async getPhraseMeaning(phrase: string, context: string, language = 'en'): Promise<{
    meaning: string;
    phraseTranslation?: string;
  }> {
    const isEnglish = language === 'en';
    const languageName = isEnglish ? 'English' : this.getLanguageName(language);

    // Use structured format for all languages to ensure consistent parsing
    const prompt = `For the ${languageName} phrase "${phrase}" in this context, provide:
1. A clear explanation of what this phrase means (focus on idiomatic usage if applicable)
${!isEnglish ? '2. The English translation of the phrase' : ''}

Context: "${context}"

Format your response EXACTLY like this:
MEANING: [explanation of the phrase meaning]${!isEnglish ? '\nENGLISH: [English translation]' : ''}`;

    const response = await this.chat(prompt);

    // Parse the response - look for MEANING: label first
    const meaningMatch = response.match(/MEANING:\s*(.+?)(?=ENGLISH:|$)/is);
    const engMatch = response.match(/ENGLISH:\s*(.+?)$/is);

    // Fallback: if no MEANING: label, use full response (trimmed)
    let meaning = meaningMatch ? meaningMatch[1].trim() : response.trim();
    const phraseTranslation = engMatch ? engMatch[1].trim() : undefined;

    // If still empty after parsing, log warning for debugging
    if (!meaning) {
      console.warn('[PHRASE] Empty meaning returned for phrase:', phrase);
      console.warn('[PHRASE] Raw response was:', response.substring(0, 200));
      // Last resort: use the raw response if it has content
      if (response.trim()) {
        meaning = response.trim();
      }
    }

    return { meaning, phraseTranslation };
  }

  /**
   * Smart AI response cleaning system.
   * Handles thinking tags, reasoning noise, and extracts clean answers.
   */
  private cleanAIResponse(response: string, extractType: 'full' | 'short' = 'full'): string {
    let cleaned = response;

    // Step 1: Remove <think>...</think> tags (DeepSeek R1 style)
    if (cleaned.includes('<think>')) {
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
      cleaned = cleaned.replace(/<think>[\s\S]*/gi, ''); // Incomplete tags
    }

    // Step 2: Remove other common thinking/reasoning tags
    cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
    cleaned = cleaned.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
    cleaned = cleaned.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');

    // Step 3: For short answers (single word/phrase), apply aggressive cleaning
    if (extractType === 'short') {
      cleaned = this.extractShortAnswer(cleaned);
    } else {
      // For full responses, just clean up reasoning noise
      cleaned = this.removeReasoningNoise(cleaned);
    }

    return cleaned.trim();
  }

  /**
   * Extract a short answer (word or phrase) from potentially verbose AI response.
   * Used for word equivalents, translations, etc.
   */
  private extractShortAnswer(response: string): string {
    const lines = response.split('\n').map(l => l.trim()).filter(l => l);

    // If response is already short (single line, few words), return as-is
    if (lines.length === 1 && response.split(/\s+/).length <= 5) {
      return this.cleanMarkdownFormatting(response.trim());
    }

    // Look for explicit answer patterns
    const answerPatterns = [
      /(?:^|\n)\s*(?:answer|result|equivalent|translation):\s*\**([^*\n]+)\**/i,
      /(?:^|\n)\s*(?:so the answer is|the answer is|therefore)[:,]?\s*\**([^*\n]+)\**/i,
      /(?:^|\n)\s*\*\*([^*]+)\*\*\s*$/m,  // Last bold text
    ];

    for (const pattern of answerPatterns) {
      const match = response.match(pattern);
      if (match && match[1]) {
        return this.cleanMarkdownFormatting(match[1].trim());
      }
    }

    // If no pattern found, try to find the last meaningful short line
    // (often the AI puts the final answer at the end after reasoning)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];

      // Skip lines that look like reasoning
      if (this.isReasoningLine(line)) continue;

      // Skip lines that are too long (likely explanation)
      if (line.split(/\s+/).length > 8) continue;

      // Skip lines starting with common reasoning markers
      if (/^(but|so|wait|let|this|in this|because|since|however|therefore|thus)/i.test(line)) continue;

      // This looks like a valid short answer
      return this.cleanMarkdownFormatting(line);
    }

    // Fallback: return first non-reasoning line
    for (const line of lines) {
      if (!this.isReasoningLine(line) && line.split(/\s+/).length <= 8) {
        return this.cleanMarkdownFormatting(line);
      }
    }

    // Ultimate fallback: return cleaned first line
    return this.cleanMarkdownFormatting(lines[0] || response);
  }

  /**
   * Check if a line appears to be reasoning/thinking rather than answer
   */
  private isReasoningLine(line: string): boolean {
    const reasoningPatterns = [
      /^(but wait|wait —|hmm|let me|let's|okay|ok,)/i,
      /^(so the instruction|the instruction|in the example|the example)/i,
      /^(this is a trick|this means|this shows|looking at)/i,
      /^(we need to|we should|we can|i need to|i should)/i,
      /^(notice that|note that|remember that|observe that)/i,
      /^(first,|second,|third,|finally,|next,)/i,
      /^(→|—|>|\*\*?wait)/i,
      /^["'].*["'].*→/,  // Quoted text with arrow (example from prompt)
      /(because|since|therefore|thus|hence).*[.!?]$/i,
      /\?$/,  // Questions are usually reasoning
    ];

    return reasoningPatterns.some(p => p.test(line.trim()));
  }

  /**
   * Remove reasoning noise from full responses while keeping the actual content.
   */
  private removeReasoningNoise(response: string): string {
    const lines = response.split('\n');
    const cleanedLines: string[] = [];
    let inReasoningBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines at the start
      if (cleanedLines.length === 0 && !trimmed) continue;

      // Detect start of reasoning block
      if (/^(but wait|wait —|hmm|let me think|let's see|okay so)/i.test(trimmed)) {
        inReasoningBlock = true;
        continue;
      }

      // Detect end of reasoning block (actual content markers)
      if (inReasoningBlock && /^(DEFINITION:|SIMPLIFIED:|MEANING:|IPA:|SYLLABLES:|ENGLISH:|ORIGINAL_ENGLISH:|SIMPLIFIED_ENGLISH:)/i.test(trimmed)) {
        inReasoningBlock = false;
      }

      // Skip reasoning lines
      if (inReasoningBlock || this.isReasoningLine(trimmed)) continue;

      // Skip lines that look like quoted prompts
      if (/^>\s/.test(trimmed)) continue;

      cleanedLines.push(line);
    }

    return cleanedLines.join('\n').trim();
  }

  /**
   * Clean markdown formatting from a string (bold, italic, backticks)
   */
  private cleanMarkdownFormatting(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold**
      .replace(/\*([^*]+)\*/g, '$1')       // *italic*
      .replace(/`([^`]+)`/g, '$1')         // `code`
      .replace(/^["'`]|["'`]$/g, '')       // Surrounding quotes
      .trim();
  }

  /**
   * Core chat method - returns raw cleaned response.
   * Use chatShort() for single word/phrase answers.
   */
  private async chat(content: string): Promise<string> {
    const rawContent = await this.rawChat(content);
    return this.cleanAIResponse(rawContent, 'full');
  }

  /**
   * Chat method optimized for short answers (single word/phrase).
   * Applies aggressive cleaning to extract just the answer.
   */
  private async chatShort(content: string): Promise<string> {
    const rawContent = await this.rawChat(content);
    return this.cleanAIResponse(rawContent, 'short');
  }

  /**
   * Raw chat method - no cleaning applied.
   */
  private async rawChat(content: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'user', content } as ChatMessage,
          ],
          temperature: 0.7,
          max_tokens: 500,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LM Studio API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as ChatResponse;
      return data.choices[0]?.message?.content?.trim() || '';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async testConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
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

  /**
   * Generate a pre-study entry for a word with IPA, syllables, definition, and grammar analysis.
   * Used by the pre-study notes feature.
   */
  async generatePreStudyEntry(
    word: string,
    sentence: string,
    language: string,
    grammarTopicsByLevel: { a1: string; a2: string; b1: string; b2: string },
    enhanced?: boolean  // Ignored for local AI - always uses simple mode
  ): Promise<PreStudyWordEntry> {
    // Local AI always uses simple mode (enhanced is ignored)
    void enhanced;
    const languageName = this.getLanguageName(language);
    const isEnglish = language === 'en';

    // Note: grammarTopicsByLevel parameter kept for API compatibility but not used currently
    void grammarTopicsByLevel;

    const prompt = `Analyze this ${languageName} word for a language learner.

Word: "${word}"
Sentence: "${sentence}"

Provide:
1. IPA pronunciation (in slashes like /example/)
2. Syllable breakdown with dots (like ex·am·ple)
3. Part of speech (noun, verb, adjective, adverb, preposition, conjunction, pronoun, article)
4. Brief definition (1-2 sentences explaining meaning in this context)${!isEnglish ? '\n5. English translation of the word' : ''}${language === 'de' ? '\n6. German article if noun (der/die/das)' : ''}

Format your response EXACTLY like this:
IPA: /pronunciation/
SYLLABLES: syl·la·bles
TYPE: part of speech${!isEnglish ? '\nENGLISH: translation' : ''}${language === 'de' ? '\nARTICLE: der/die/das' : ''}
DEFINITION: brief definition`;

    const response = await this.chat(prompt);

    // Parse the response
    const ipaMatch = response.match(/IPA:\s*\/([^/]+)\//i);
    const syllablesMatch = response.match(/SYLLABLES:\s*([^\n]+)/i);
    const typeMatch = response.match(/TYPE:\s*([^\n]+)/i);
    const engMatch = response.match(/ENGLISH:\s*([^\n]+)/i);
    const articleMatch = response.match(/ARTICLE:\s*([^\n]+)/i);
    const defMatch = response.match(/DEFINITION:\s*(.+?)$/is);

    // Extract values with fallbacks
    const ipa = ipaMatch ? ipaMatch[1].trim() : '';
    const syllables = syllablesMatch ? syllablesMatch[1].trim().replace(/\./g, '·') : '';
    const wordType = typeMatch ? this.normalizeWordType(typeMatch[1].trim()) : undefined;
    const wordTranslation = engMatch ? engMatch[1].trim() : undefined;
    const germanArticle = articleMatch ? this.normalizeGermanArticle(articleMatch[1].trim()) : undefined;
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

    const response = await this.chat(prompt);

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
      console.error('[LM Studio] Failed to parse grammar analysis JSON:', e);
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
}
