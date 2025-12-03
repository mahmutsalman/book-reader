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
  private timeout: number;

  constructor(baseUrl = 'http://localhost:1234', timeout = 30000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
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
    const prompt = `Rewrite this sentence in simpler English for a language learner. Keep the same meaning but use easier words and shorter sentences:

Original: "${sentence}"

Simplified:`;

    return this.chat(prompt);
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
