import type { PreStudyNotesResult, PreStudyWordEntry } from '../../shared/types/pre-study-notes.types';

/**
 * Service for generating HTML content for pre-study notes
 */
export class PreStudyHtmlService {
  /**
   * Generate complete HTML document for pre-study notes
   * @param result - The pre-study notes result data
   * @param slowPlaybackSpeed - Speed for slow audio playback (0.25 to 2.0)
   * @param theme - App theme setting ('light', 'dark', or 'system')
   */
  generateHtml(result: PreStudyNotesResult, slowPlaybackSpeed: number = 0.6, theme: string = 'light'): string {
    const languageNames: Record<string, string> = {
      en: 'English',
      de: 'German',
      ru: 'Russian',
      fr: 'French',
      es: 'Spanish',
    };

    const languageName = languageNames[result.language] || result.language;

    // Determine body class and theme script based on theme setting
    const bodyClass = theme === 'dark' ? 'class="dark"' : '';
    const systemThemeScript = theme === 'system' ? `
      // Apply dark mode if system prefers it
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark');
        document.querySelector('.theme-btn').textContent = '☀️ Theme';
      }
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pre-Study Notes - ${this.escapeHtml(result.bookTitle)}</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body ${bodyClass}>
  <header class="header">
    <h1>Pre-Study Notes</h1>
    <div class="book-info">
      <span class="book-title">${this.escapeHtml(result.bookTitle)}</span>
      <span class="separator">•</span>
      <span class="language">${languageName}</span>
      <span class="separator">•</span>
      <span class="view-range">${result.viewRange}</span>
    </div>
    <div class="stats">
      <span>${result.uniqueWords} unique words</span>
      <span class="separator">•</span>
      <span>${result.totalWords} total words</span>
      <span class="separator">•</span>
      <span>Generated: ${new Date(result.generatedAt).toLocaleString()}</span>
    </div>
    <div class="controls">
      <button onclick="window.print()" class="print-btn">🖨️ Print</button>
      <button onclick="toggleTheme()" class="theme-btn">${theme === 'dark' ? '☀️ Theme' : '🌙 Theme'}</button>
    </div>
  </header>

  <main class="cards-container">
    ${result.entries.map(entry => this.generateWordCard(entry, result.language, slowPlaybackSpeed)).join('\n')}
  </main>

  <script>
    ${systemThemeScript}

    function toggleTheme() {
      document.body.classList.toggle('dark');
      const btn = document.querySelector('.theme-btn');
      btn.textContent = document.body.classList.contains('dark') ? '☀️ Theme' : '🌙 Theme';
    }

    // Audio playback management
    let currentAudio = null;
    let currentButton = null;

    function playAudio(button, base64Audio, playbackRate = 1.0) {
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
        if (currentButton) {
          currentButton.classList.remove('playing');
        }
      }

      // If clicking the same button, just stop
      if (currentButton === button) {
        currentButton = null;
        return;
      }

      // Play new audio
      if (base64Audio) {
        currentAudio = new Audio('data:audio/mp3;base64,' + base64Audio);
        currentAudio.preservesPitch = true;
        currentAudio.playbackRate = playbackRate;
        currentButton = button;
        button.classList.add('playing');

        currentAudio.onended = () => {
          button.classList.remove('playing');
          currentAudio = null;
          currentButton = null;
        };

        currentAudio.onerror = () => {
          button.classList.remove('playing');
          currentAudio = null;
          currentButton = null;
        };

        currentAudio.play().catch(() => {
          button.classList.remove('playing');
          currentAudio = null;
          currentButton = null;
        });
      }
    }
  </script>
</body>
</html>`;
  }

  /**
   * Generate HTML for a single word card
   */
  private generateWordCard(entry: PreStudyWordEntry, language: string, slowPlaybackSpeed: number): string {
    const hasGrammar = entry.grammarTopics && entry.grammarTopics.length > 0;
    const isGerman = language === 'de';
    const isNonEnglish = language !== 'en';

    // Highlight the word in the context sentence
    const highlightedSentence = this.highlightWord(entry.contextSentence, entry.word);

    return `
    <article class="word-card">
      <div class="card-header">
        <h2 class="word">${this.escapeHtml(entry.word)}</h2>
        ${entry.wordType ? `<span class="word-type">${this.escapeHtml(entry.wordType)}</span>` : ''}
        ${isGerman && entry.germanArticle ? `<span class="article">${this.escapeHtml(entry.germanArticle)}</span>` : ''}
      </div>

      <div class="pronunciation">
        ${entry.ipa ? `<span class="ipa">/${this.escapeHtml(entry.ipa)}/</span>` : ''}
        ${entry.syllables ? `<span class="syllables">${this.escapeHtml(entry.syllables)}</span>` : ''}
      </div>

      ${isNonEnglish && entry.wordTranslation ? `
      <div class="translation">
        <span class="label">Translation:</span>
        <span class="value">${this.escapeHtml(entry.wordTranslation)}</span>
      </div>
      ` : ''}

      <div class="definition">
        ${this.escapeHtml(entry.definition)}
      </div>

      <div class="context">
        <span class="label">Context:</span>
        <blockquote>${highlightedSentence}</blockquote>
      </div>

      ${entry.wordAudio || entry.sentenceAudio ? `
      <div class="audio-controls">
        ${entry.wordAudio ? `<button class="audio-btn" onclick="playAudio(this, '${entry.wordAudio}')">🔊 Word</button>` : ''}
        ${entry.wordAudio ? `<button class="audio-btn slow-btn" onclick="playAudio(this, '${entry.wordAudio}', ${slowPlaybackSpeed})" title="Play word at ${slowPlaybackSpeed}x speed">🐢 Slow</button>` : ''}
        ${entry.sentenceAudio ? `<button class="audio-btn" onclick="playAudio(this, '${entry.sentenceAudio}')">🔊 Sentence</button>` : ''}
        ${entry.sentenceAudio ? `<button class="audio-btn slow-btn" onclick="playAudio(this, '${entry.sentenceAudio}', ${slowPlaybackSpeed})" title="Play sentence at ${slowPlaybackSpeed}x speed">🐢 Slow</button>` : ''}
      </div>
      ` : ''}

      ${hasGrammar && entry.grammarTopics && entry.grammarTopics[0] ? `
      <details class="grammar">
        <summary>
          <span class="grammar-badge">${this.escapeHtml(entry.grammarTopics[0].level)}</span>
          ${this.escapeHtml(entry.grammarTopics[0].name)}
        </summary>
        <p class="grammar-explanation">${this.escapeHtml(entry.grammarTopics[0].explanation)}</p>
      </details>
      ` : ''}
    </article>`;
  }

  /**
   * Highlight a word in a sentence
   */
  private highlightWord(sentence: string, word: string): string {
    const escaped = this.escapeHtml(sentence);
    const wordEscaped = this.escapeHtml(word);

    // Create regex to match the word (case-insensitive, word boundaries)
    const regex = new RegExp(`\\b(${this.escapeRegex(wordEscaped)})\\b`, 'gi');

    return escaped.replace(regex, '<mark>$1</mark>');
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Get CSS styles for the HTML document
   */
  private getStyles(): string {
    return `
    :root {
      --bg-primary: #f5f5f5;
      --bg-secondary: #ffffff;
      --text-primary: #333333;
      --text-secondary: #666666;
      --accent: #4a90d9;
      --accent-light: #e3f2fd;
      --border: #e0e0e0;
      --mark-bg: #fff3cd;
      --mark-text: #856404;
      --card-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    body.dark {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --text-primary: #e0e0e0;
      --text-secondary: #a0a0a0;
      --accent: #64b5f6;
      --accent-light: #1e3a5f;
      --border: #2d3748;
      --mark-bg: #4a3f00;
      --mark-text: #ffd700;
      --card-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 20px;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
      padding: 20px;
      background: var(--bg-secondary);
      border-radius: 12px;
      box-shadow: var(--card-shadow);
    }

    .header h1 {
      font-size: 1.8rem;
      margin-bottom: 10px;
      color: var(--accent);
    }

    .book-info {
      font-size: 1.1rem;
      margin-bottom: 8px;
    }

    .book-title {
      font-weight: 600;
    }

    .separator {
      margin: 0 8px;
      color: var(--text-secondary);
    }

    .stats {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-bottom: 15px;
    }

    .controls {
      display: flex;
      justify-content: center;
      gap: 10px;
    }

    .controls button {
      padding: 8px 16px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg-primary);
      color: var(--text-primary);
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.2s;
    }

    .controls button:hover {
      background: var(--accent-light);
      border-color: var(--accent);
    }

    .cards-container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .word-card {
      background: var(--bg-secondary);
      border-radius: 12px;
      padding: 20px;
      box-shadow: var(--card-shadow);
      border: 1px solid var(--border);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .word-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .card-header {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .word {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent);
      margin: 0;
    }

    .word-type {
      font-size: 0.8rem;
      padding: 2px 8px;
      background: var(--accent-light);
      color: var(--accent);
      border-radius: 12px;
      text-transform: lowercase;
    }

    .article {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-secondary);
      font-style: italic;
    }

    .pronunciation {
      font-family: 'Courier New', monospace;
      color: var(--text-secondary);
      margin-bottom: 12px;
      font-size: 0.95rem;
    }

    .ipa {
      margin-right: 12px;
    }

    .syllables {
      color: var(--text-secondary);
      opacity: 0.8;
    }

    .translation {
      margin-bottom: 10px;
      padding: 8px 12px;
      background: var(--accent-light);
      border-radius: 6px;
    }

    .translation .label {
      font-weight: 600;
      margin-right: 8px;
      color: var(--text-secondary);
    }

    .translation .value {
      color: var(--accent);
      font-weight: 500;
    }

    .definition {
      margin-bottom: 12px;
      color: var(--text-primary);
      line-height: 1.6;
    }

    .context {
      margin-bottom: 12px;
    }

    .context .label {
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-weight: 600;
      display: block;
      margin-bottom: 4px;
    }

    .context blockquote {
      margin: 0;
      padding: 10px 15px;
      background: var(--bg-primary);
      border-left: 3px solid var(--accent);
      border-radius: 0 6px 6px 0;
      font-style: italic;
      color: var(--text-secondary);
    }

    .audio-controls {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .audio-btn {
      padding: 6px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg-primary);
      color: var(--text-primary);
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
    }

    .audio-btn:hover {
      background: var(--accent-light);
      border-color: var(--accent);
    }

    .audio-btn.playing {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }

    .audio-btn.slow-btn {
      background: #fff3e0;
      border-color: #ff9800;
      color: #e65100;
    }

    body.dark .audio-btn.slow-btn {
      background: #3d2800;
      border-color: #ff9800;
      color: #ffb74d;
    }

    .audio-btn.slow-btn:hover {
      background: #ffe0b2;
      border-color: #f57c00;
    }

    body.dark .audio-btn.slow-btn:hover {
      background: #4d3200;
      border-color: #ffa726;
    }

    .audio-btn.slow-btn.playing {
      background: #ff9800;
      color: white;
      border-color: #ff9800;
    }

    .context mark {
      background: var(--mark-bg);
      color: var(--mark-text);
      padding: 1px 4px;
      border-radius: 3px;
      font-style: normal;
      font-weight: 600;
    }

    .grammar {
      margin-top: 12px;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }

    .grammar summary {
      cursor: pointer;
      font-weight: 500;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .grammar summary:hover {
      color: var(--accent);
    }

    .grammar-badge {
      font-size: 0.75rem;
      padding: 2px 6px;
      background: var(--accent);
      color: white;
      border-radius: 4px;
      font-weight: 700;
    }

    .grammar-explanation {
      margin-top: 10px;
      padding: 10px;
      background: var(--bg-primary);
      border-radius: 6px;
      font-size: 0.9rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* Print styles */
    @media print {
      body {
        background: white;
        padding: 0;
      }

      .header {
        box-shadow: none;
        border: 1px solid #ccc;
      }

      .controls {
        display: none;
      }

      .audio-controls {
        display: none;
      }

      .cards-container {
        display: block;
      }

      .word-card {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 15px;
        box-shadow: none;
        border: 1px solid #ccc;
      }

      .word-card:hover {
        transform: none;
        box-shadow: none;
      }

      .grammar {
        display: block;
      }

      .grammar summary {
        list-style: none;
      }

      .grammar summary::-webkit-details-marker {
        display: none;
      }
    }

    /* Responsive */
    @media (max-width: 600px) {
      .cards-container {
        grid-template-columns: 1fr;
      }

      .card-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 5px;
      }
    }
    `;
  }
}

// Export singleton
export const preStudyHtmlService = new PreStudyHtmlService();
