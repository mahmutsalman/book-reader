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

export class LMStudioService {
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
  }> {
    if (language === 'en') {
      // English: just get the definition
      const prompt = `Define the word "${word}" as it is used in the following context. Provide a clear, concise definition suitable for a language learner (2-3 sentences max).

Context: "${context}"

Definition:`;
      const definition = await this.chat(prompt);
      return { definition };
    }

    // Non-English: get English definition + English translation of the word
    const languageName = this.getLanguageName(language);
    const prompt = `For the ${languageName} word "${word}" in this context, provide:
1. A definition in English explaining what this word means (2-3 sentences, write the definition in ENGLISH)
2. The English translation of the word (single word or short phrase)

Context: "${context}"

Format your response EXACTLY like this:
DEFINITION: [definition in English]
ENGLISH: [English translation of the word]`;

    const response = await this.chat(prompt);

    // Parse the response
    const defMatch = response.match(/DEFINITION:\s*(.+?)(?=ENGLISH:|$)/is);
    const engMatch = response.match(/ENGLISH:\s*(.+?)$/is);

    const definition = defMatch ? defMatch[1].trim() : response;
    const wordTranslation = engMatch ? engMatch[1].trim() : undefined;

    return { definition, wordTranslation };
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
    const prompt = `For this ${languageName} sentence, provide:
1. A simplified version in ${languageName} using easier words (keep it in ${languageName}, do NOT translate to English)
2. English translation of the original sentence
3. English translation of the simplified sentence

Rules for simplification:
- Replace difficult words with easier ${languageName} synonyms
- Keep the SAME sentence structure as much as possible
- Do NOT remove any concepts or meanings
- Keep names and places unchanged

Original: "${sentence}"

Format your response EXACTLY like this:
SIMPLIFIED: [simplified version in ${languageName}]
ORIGINAL_ENGLISH: [English translation of original]
SIMPLIFIED_ENGLISH: [English translation of simplified]`;

    const response = await this.chat(prompt);

    // Parse the response
    const simpMatch = response.match(/SIMPLIFIED:\s*(.+?)(?=ORIGINAL_ENGLISH:|$)/is);
    const origEngMatch = response.match(/ORIGINAL_ENGLISH:\s*(.+?)(?=SIMPLIFIED_ENGLISH:|$)/is);
    const simpEngMatch = response.match(/SIMPLIFIED_ENGLISH:\s*(.+?)$/is);

    const simplified = simpMatch ? simpMatch[1].trim() : response;
    const sentenceTranslation = origEngMatch ? origEngMatch[1].trim() : undefined;
    const simplifiedTranslation = simpEngMatch ? simpEngMatch[1].trim() : undefined;

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
    const languageInstruction = language === 'en'
      ? ''
      : `\n- Keep the output in ${languageName} (do NOT translate to English)`;

    const prompt = `Rewrite this ${languageName} sentence using simpler words for a language learner.

IMPORTANT: You MUST use the word "${equivalentWord}" as the replacement for "${originalWord}".

Rules:
- Replace difficult words with easier ${languageName} synonyms
- Keep the SAME sentence structure as much as possible
- Do NOT remove any concepts or meanings
- The word "${equivalentWord}" MUST appear in your simplified version as the replacement for "${originalWord}"
- Keep names and places unchanged${languageInstruction}

Original: "${originalSentence}"

Simplified:`;

    return this.chat(prompt);
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
    if (language === 'en') {
      const prompt = `Explain the meaning of the phrase "${phrase}" as it is used in the following context. Focus on:
- Idiomatic meaning (if it's an idiom or phrasal verb)
- How the words work together as a unit
- A clear, simple explanation for a language learner (2-3 sentences)

Context: "${context}"

Meaning:`;
      const meaning = await this.chat(prompt);
      return { meaning };
    }

    // Non-English: explain in English + provide English translation of phrase
    const languageName = this.getLanguageName(language);
    const prompt = `For the ${languageName} phrase "${phrase}" in this context, provide:
1. An explanation in English of what this phrase means (write the explanation in ENGLISH)
2. The English translation of the phrase (how you would say it in English)

Focus on idiomatic meaning if applicable.

Context: "${context}"

Format your response EXACTLY like this:
MEANING: [explanation in English]
ENGLISH: [English translation of the phrase]`;

    const response = await this.chat(prompt);

    // Parse the response
    const meaningMatch = response.match(/MEANING:\s*(.+?)(?=ENGLISH:|$)/is);
    const engMatch = response.match(/ENGLISH:\s*(.+?)$/is);

    const meaning = meaningMatch ? meaningMatch[1].trim() : response;
    const phraseTranslation = engMatch ? engMatch[1].trim() : undefined;

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
}
