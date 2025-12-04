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

    // Non-English: get definition in source language + English translation
    const languageName = this.getLanguageName(language);
    const prompt = `For the ${languageName} word "${word}" in this context, provide:
1. A definition in ${languageName} (2-3 sentences, keep it in ${languageName}, do NOT translate to English)
2. The English translation of the word

Context: "${context}"

Format your response EXACTLY like this:
DEFINITION: [definition in ${languageName}]
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
    equivalentWord: string
  ): Promise<string> {
    const prompt = `Rewrite this sentence using simpler words for a language learner.

IMPORTANT: You MUST use the word "${equivalentWord}" as the replacement for "${originalWord}".

Rules:
- Replace difficult words with easier synonyms
- Keep the SAME sentence structure as much as possible
- Do NOT remove any concepts or meanings
- The word "${equivalentWord}" MUST appear in your simplified version as the replacement for "${originalWord}"
- Keep names and places unchanged

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

Now your turn:
Original: "${originalSentence}"
Simplified: "${simplifiedSentence}"
Word: "${originalWord}"
Answer:`;

    const response = await this.chat(prompt);

    console.log('[DEBUG main] AI raw response for word equivalent:', JSON.stringify(response));

    // Clean the response: remove quotes, trim, punctuation, and common prefixes
    const cleaned = response.trim()
      .replace(/^["'`]|["'`]$/g, '')  // Remove surrounding quotes/backticks
      .replace(/\.+$/, '')             // Remove trailing periods
      .replace(/^answer:\s*/i, '')     // Remove "Answer:" prefix (case-insensitive)
      .replace(/^equivalent:\s*/i, '') // Remove "Equivalent:" prefix
      .replace(/^the answer is:?\s*/i, '') // Remove "The answer is:" prefix
      .replace(/^["'`]|["'`]$/g, '')  // Remove quotes again after stripping prefix
      .trim();

    console.log('[DEBUG main] After cleaning:', JSON.stringify(cleaned));

    // Check for NONE variations
    if (cleaned.toUpperCase().startsWith('NONE') || cleaned === '') {
      console.log('[DEBUG main] Returning empty (was NONE or empty)');
      return { equivalent: '', needsRegeneration: false };
    }

    // Validate that the equivalent actually exists in the simplified sentence
    // This prevents AI hallucination where it returns words not in the sentence
    const simplifiedLower = simplifiedSentence.toLowerCase();
    const cleanedLower = cleaned.toLowerCase();

    if (!simplifiedLower.includes(cleanedLower)) {
      console.log('[DEBUG main] Equivalent not found in simplified sentence, needs regeneration');
      console.log('[DEBUG main] Looking for:', cleanedLower);
      console.log('[DEBUG main] In sentence:', simplifiedLower);
      // Return the equivalent word anyway - caller will use it to regenerate
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

    // Non-English: explain in source language + English translation
    const languageName = this.getLanguageName(language);
    const prompt = `For the ${languageName} phrase "${phrase}" in this context, provide:
1. An explanation in ${languageName} of what this phrase means (keep it in ${languageName}, do NOT translate to English)
2. The English translation of the phrase

Focus on idiomatic meaning if applicable.

Context: "${context}"

Format your response EXACTLY like this:
MEANING: [explanation in ${languageName}]
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
   * Strip thinking model content (e.g., DeepSeek R1 wraps reasoning in <think> tags)
   * This removes the thinking process and returns only the actual answer
   */
  private stripThinkingContent(response: string): string {
    // Check if response contains <think> tags (thinking model like DeepSeek R1)
    if (response.includes('<think>')) {
      console.log('[DEBUG main] Detected thinking model response, stripping <think> tags');

      // Remove everything between <think> and </think> tags (including the tags)
      let cleaned = response.replace(/<think>[\s\S]*?<\/think>/gi, '');

      // Also handle case where </think> might be missing (incomplete response)
      cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');

      // Trim and return
      cleaned = cleaned.trim();
      console.log('[DEBUG main] After stripping thinking:', JSON.stringify(cleaned));
      return cleaned;
    }

    return response;
  }

  private async chat(content: string): Promise<string> {
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
      const rawContent = data.choices[0]?.message?.content?.trim() || '';

      // Strip thinking content if present (for thinking models like DeepSeek R1)
      return this.stripThinkingContent(rawContent);
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
