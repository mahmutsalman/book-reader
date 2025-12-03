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

  async getWordDefinition(word: string, context: string): Promise<string> {
    const prompt = `Define the word "${word}" as it is used in the following context. Provide a clear, concise definition suitable for a language learner (2-3 sentences max).

Context: "${context}"

Definition:`;

    return this.chat(prompt);
  }

  async getIPAPronunciation(word: string): Promise<string> {
    const prompt = `Provide the IPA (International Phonetic Alphabet) pronunciation for the English word "${word}". Return ONLY the IPA notation enclosed in slashes, like /example/. Do not include any other text or explanation.`;

    const response = await this.chat(prompt);
    // Extract IPA from response (between slashes)
    const match = response.match(/\/([^/]+)\//);
    return match ? match[1] : response.replace(/[/]/g, '').trim();
  }

  async simplifySentence(sentence: string): Promise<string> {
    const prompt = `Rewrite this sentence using simpler words for a language learner.

Rules:
- Replace difficult words with easier synonyms (e.g., "passion" → "strong love", "peculiar" → "strange", "departed" → "left")
- Keep the SAME sentence structure as much as possible
- Do NOT remove any concepts or meanings - every idea in the original must appear in the simplified version
- Do NOT add new ideas or change the meaning
- Keep names and places unchanged

Original: "${sentence}"

Simplified:`;

    return this.chat(prompt);
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
  async getPhraseMeaning(phrase: string, context: string): Promise<string> {
    const prompt = `Explain the meaning of the phrase "${phrase}" as it is used in the following context. Focus on:
- Idiomatic meaning (if it's an idiom or phrasal verb)
- How the words work together as a unit
- A clear, simple explanation for a language learner (2-3 sentences)

Context: "${context}"

Meaning:`;

    return this.chat(prompt);
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
