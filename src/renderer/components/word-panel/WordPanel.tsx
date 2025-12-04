import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { CachedWordData } from '../../../shared/types/deferred-word.types';
import { getWordBoundaryPattern } from '../../../shared/utils/text-utils';
import type { BookLanguage } from '../../../shared/types';
import PronunciationButton from './PronunciationButton';
import LoopPlayButton from './LoopPlayButton';
import SlowLoopPlayButton from './SlowLoopPlayButton';
import { useAudioCache, AudioType } from '../../hooks/useAudioCache';

interface SelectedWord {
  word: string;
  sentence: string;
  pageNumber: number;
  isPhrase?: boolean;
  wordIndices?: number[];
}

interface WordPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWord: SelectedWord | null;
  bookId: number;
  bookLanguage?: BookLanguage;
  onNavigateToPage?: (page: number) => void;
  preloadedData?: CachedWordData | null;
}

interface WordData {
  definition?: string;
  ipa?: string;
  syllables?: string;
  simplifiedSentence?: string;
  wordEquivalent?: string;
  occurrences?: { page: number; sentence: string }[];
  tatoebaExamples?: { sentence: string; translation?: string }[];
  // Translation fields (for non-English books)
  wordTranslation?: string;
  sentenceTranslation?: string;
  simplifiedTranslation?: string;
  phraseTranslation?: string;
  // Word type/part of speech
  wordType?: string;
  // German article (der, die, das)
  germanArticle?: string;
  loading: boolean;
  error?: string;
}

// Helper to capitalize German nouns properly (e.g., "mädchen" -> "Mädchen")
const capitalizeGermanNoun = (word: string): string => {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
};

// Normalize text for TTS - collapse whitespace and remove newlines
// This prevents Edge TTS from interpreting newlines as pauses
const normalizeForTTS = (text: string): string => {
  return text
    .replace(/[\r\n]+/g, ' ')  // Replace newlines with space
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim();
};

const WordPanel: React.FC<WordPanelProps> = ({ isOpen, onClose, selectedWord, bookId, bookLanguage = 'en', onNavigateToPage, preloadedData }) => {
  const { settings } = useSettings();
  const { preloadAudio } = useAudioCache();
  const [wordData, setWordData] = useState<WordData>({ loading: false });
  const isNonEnglish = bookLanguage !== 'en';
  const [saved, setSaved] = useState(false);

  // Syllable mode state
  const [syllableModeEnabled, setSyllableModeEnabled] = useState(false);
  const [syllableModeLoading, setSyllableModeLoading] = useState(false);
  const [sentenceWordData, setSentenceWordData] = useState<Map<string, { ipa: string; syllables: string }>>(new Map());

  // Helper function to highlight the selected word/phrase in a sentence
  const highlightWord = useCallback((sentence: string, word: string) => {
    if (!word || !sentence) return <>{sentence}</>;

    // Try to find the word in the sentence, with some flexibility for contractions
    let searchWord = word;

    // If exact match not found, try common variations
    if (!sentence.toLowerCase().includes(word.toLowerCase())) {
      // Try replacing doesn't with don't, etc.
      const variations = [
        word.replace(/doesn't/gi, "don't"),
        word.replace(/don't/gi, "doesn't"),
        word.replace(/isn't/gi, "aren't"),
        word.replace(/aren't/gi, "isn't"),
        word.replace(/won't/gi, "will not"),
        word.replace(/can't/gi, "cannot"),
      ];

      for (const variation of variations) {
        if (sentence.toLowerCase().includes(variation.toLowerCase())) {
          searchWord = variation;
          console.log('[DEBUG] Using variation:', variation, 'instead of:', word);
          break;
        }
      }
    }

    // Escape special regex characters in the word/phrase
    const escaped = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create a case-insensitive regex to find the word/phrase (Unicode-aware for Russian, etc.)
    const isPhrase = searchWord.includes(' ');
    const pattern = isPhrase ? `(${escaped})` : `(${getWordBoundaryPattern(escaped)})`;
    const regex = new RegExp(pattern, 'giu'); // 'u' flag for Unicode support

    const parts = sentence.split(regex);

    return (
      <>
        {parts.map((part, index) => {
          // Check if this part matches (case-insensitive)
          const isMatch = part.toLowerCase() === searchWord.toLowerCase();
          return isMatch ? (
            <span key={index} className="text-red-600 dark:text-red-400 font-semibold not-italic">
              {part}
            </span>
          ) : (
            <span key={index}>{part}</span>
          );
        })}
      </>
    );
  }, []);

  // Preload audio when panel opens (background fetch)
  // Note: For German nouns with articles, we re-preload when article becomes available
  useEffect(() => {
    if (!isOpen || !selectedWord) return;

    // For German nouns with articles, include article in pronunciation
    const wordText = wordData.germanArticle
      ? `${wordData.germanArticle} ${capitalizeGermanNoun(selectedWord.word)}`
      : selectedWord.word;

    // Build list of audio to preload
    // Normalize sentence to prevent newlines from causing TTS pauses
    const preloadItems = [
      { text: wordText, language: bookLanguage, type: AudioType.WORD },
      { text: normalizeForTTS(selectedWord.sentence), language: bookLanguage, type: AudioType.SENTENCE },
    ];

    // Preload in background (non-blocking)
    preloadAudio(preloadItems);
  }, [isOpen, selectedWord?.word, selectedWord?.sentence, bookLanguage, preloadAudio, wordData.germanArticle]);

  // Preload simplified sentence audio when it becomes available
  useEffect(() => {
    if (!isOpen || !wordData.simplifiedSentence) return;

    preloadAudio([
      { text: wordData.simplifiedSentence, language: bookLanguage, type: AudioType.SIMPLIFIED },
    ]);
  }, [isOpen, wordData.simplifiedSentence, bookLanguage, preloadAudio]);

  // Reset syllable mode when word changes
  useEffect(() => {
    setSyllableModeEnabled(false);
    setSyllableModeLoading(false);
    setSentenceWordData(new Map());
  }, [selectedWord?.word, selectedWord?.sentence]);

  // Fetch word data when word changes (or use preloaded data)
  useEffect(() => {
    if (!selectedWord || !isOpen) return;

    // If we have preloaded data, use it immediately
    if (preloadedData) {
      setWordData({
        loading: false,
        definition: preloadedData.definition,
        ipa: preloadedData.ipa,
        syllables: preloadedData.syllables,
        simplifiedSentence: preloadedData.simplifiedSentence,
        wordEquivalent: preloadedData.wordEquivalent,
        occurrences: preloadedData.occurrences,
        tatoebaExamples: preloadedData.tatoebaExamples,
        // Translation fields
        wordTranslation: preloadedData.wordTranslation,
        sentenceTranslation: preloadedData.sentenceTranslation,
        simplifiedTranslation: preloadedData.simplifiedTranslation,
        phraseTranslation: preloadedData.phraseTranslation,
        // Word type
        wordType: preloadedData.wordType,
        // German article
        germanArticle: preloadedData.germanArticle,
      });
      setSaved(false);
      return;
    }

    // Otherwise fetch as before (fallback for direct panel opens)
    const fetchWordData = async () => {
      setWordData({ loading: true });
      setSaved(false);

      try {
        const results: WordData = { loading: false };

        if (window.electronAPI) {
          // Fetch definition and IPA in parallel (pass bookLanguage for proper language handling)
          const [defResult, ipaResult, simplifyResult] = await Promise.allSettled([
            window.electronAPI.ai.getDefinition(selectedWord.word, selectedWord.sentence, bookLanguage),
            window.electronAPI.ai.getIPA(selectedWord.word, bookLanguage),
            window.electronAPI.ai.simplifySentence(selectedWord.sentence, bookLanguage),
          ]);

          if (defResult.status === 'fulfilled') {
            results.definition = defResult.value.definition;
          }
          if (ipaResult.status === 'fulfilled') {
            results.ipa = ipaResult.value.ipa;
            results.syllables = ipaResult.value.syllables;
          }
          if (simplifyResult.status === 'fulfilled') {
            results.simplifiedSentence = simplifyResult.value.simplified;

            // Get word equivalent in simplified sentence (separate AI call for accuracy)
            try {
              console.log('[DEBUG] Calling getWordEquivalent with:', {
                word: selectedWord.word,
                original: selectedWord.sentence,
                simplified: simplifyResult.value.simplified
              });

              const equivalentResult = await window.electronAPI.ai.getWordEquivalent(
                selectedWord.word,
                selectedWord.sentence,
                simplifyResult.value.simplified
              );

              console.log('[DEBUG] getWordEquivalent response:', equivalentResult);

              if (equivalentResult.equivalent) {
                // Check if we need to regenerate the simplified sentence
                if (equivalentResult.needsRegeneration) {
                  console.log('[DEBUG] Equivalent not found in sentence, regenerating with:', equivalentResult.equivalent);

                  // Regenerate simplified sentence with the equivalent word included
                  const resimplifyResult = await window.electronAPI.ai.resimplifyWithWord(
                    selectedWord.sentence,
                    selectedWord.word,
                    equivalentResult.equivalent
                  );

                  console.log('[DEBUG] Resimplified sentence:', resimplifyResult.simplified);
                  results.simplifiedSentence = resimplifyResult.simplified;
                }

                results.wordEquivalent = equivalentResult.equivalent;
                console.log('[DEBUG] Set wordEquivalent to:', equivalentResult.equivalent);
              } else {
                console.log('[DEBUG] No equivalent found (empty response)');
              }
            } catch (err) {
              console.error('[DEBUG] getWordEquivalent error:', err);
            }
          }

          // Search for other occurrences
          try {
            const occurrences = await window.electronAPI.book.searchWord(bookId, selectedWord.word);
            results.occurrences = occurrences;
          } catch {
            // Non-critical, ignore
          }

          // Tatoeba examples if enabled
          if (settings.tatoeba_enabled) {
            try {
              const tatoeba = await window.electronAPI.tatoeba.search(
                selectedWord.word,
                settings.tatoeba_language
              );
              results.tatoebaExamples = tatoeba.map(s => ({
                sentence: s.sentence,
                translation: s.translations?.[0]?.sentence,
              }));
            } catch {
              // Non-critical, ignore
            }
          }
        }

        setWordData(results);
      } catch (error) {
        setWordData({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch word data',
        });
      }
    };

    fetchWordData();
  }, [selectedWord, isOpen, bookId, settings.tatoeba_enabled, settings.tatoeba_language, preloadedData]);

  // Handle syllable mode toggle
  const handleSyllableModeToggle = useCallback(async () => {
    if (!selectedWord || !window.electronAPI) return;

    // If already enabled, just disable
    if (syllableModeEnabled) {
      setSyllableModeEnabled(false);
      return;
    }

    // Start loading
    setSyllableModeLoading(true);

    try {
      // Split sentence into words - preserve punctuation separately
      const sentence = selectedWord.sentence;
      const wordTokens = sentence.split(/(\s+)/).filter(Boolean);

      // Extract just the words (not whitespace) and clean them
      const words = wordTokens
        .filter(token => /\p{L}/u.test(token))
        .map(token => token.replace(/[^\p{L}]/gu, '')); // Remove punctuation

      // Fetch IPA from Python server (accurate) and syllables from AI
      // Process in parallel for efficiency
      const dataMap = new Map<string, { ipa: string; syllables: string }>();

      await Promise.all(words.map(async (word) => {
        const wordLower = word.toLowerCase();
        if (dataMap.has(wordLower)) return; // Skip duplicates

        let ipa = '';
        let syllables = '';

        // Try Python server for IPA first (accurate)
        try {
          const pythonResult = await window.electronAPI.pronunciation.getIPA(word, bookLanguage);
          if (pythonResult.success && pythonResult.ipa) {
            ipa = pythonResult.ipa;
          }
        } catch {
          // Python IPA failed, will try AI fallback below
        }

        // Get syllables from AI (and IPA fallback if Python failed)
        try {
          const aiResult = await window.electronAPI.ai.getIPA(word, bookLanguage);
          if (aiResult.syllables) {
            syllables = aiResult.syllables;
          }
          // Use AI IPA only as fallback if Python failed
          if (!ipa && aiResult.ipa) {
            ipa = aiResult.ipa;
          }
        } catch {
          // AI also failed, leave empty
        }

        dataMap.set(wordLower, { ipa, syllables });
      }));

      setSentenceWordData(dataMap);
      setSyllableModeEnabled(true);
    } catch (error) {
      console.error('Failed to fetch batch IPA:', error);
    } finally {
      setSyllableModeLoading(false);
    }
  }, [selectedWord, syllableModeEnabled, bookLanguage]);

  // Save to vocabulary
  const handleSave = useCallback(async () => {
    if (!selectedWord || !window.electronAPI) return;

    try {
      await window.electronAPI.vocabulary.add({
        word: selectedWord.word,
        book_id: bookId,
        meaning: wordData.definition,
        ipa_pronunciation: wordData.ipa,
        simplified_sentence: wordData.simplifiedSentence,
        original_sentence: selectedWord.sentence,
      });
      setSaved(true);
    } catch (error) {
      console.error('Failed to save to vocabulary:', error);
    }
  }, [selectedWord, bookId, wordData]);

  if (!isOpen || !selectedWord) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-96 bg-white dark:bg-gray-800 shadow-2xl z-50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-primary-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                {/* Display word with German article if available */}
                <h2 className="text-xl font-semibold">
                  {wordData.germanArticle
                    ? `${wordData.germanArticle} ${capitalizeGermanNoun(selectedWord.word)}`
                    : selectedWord.word}
                </h2>
                {/* Word pronunciation buttons - include article for German nouns */}
                {!selectedWord.isPhrase && (
                  <div className="flex items-center gap-0.5">
                    <PronunciationButton
                      text={wordData.germanArticle
                        ? `${wordData.germanArticle} ${capitalizeGermanNoun(selectedWord.word)}`
                        : selectedWord.word}
                      language={bookLanguage}
                      audioType={AudioType.WORD}
                      size="sm"
                      title="Pronounce word"
                      className="text-white/80 hover:text-white hover:bg-white/20"
                    />
                    <LoopPlayButton
                      text={wordData.germanArticle
                        ? `${wordData.germanArticle} ${capitalizeGermanNoun(selectedWord.word)}`
                        : selectedWord.word}
                      language={bookLanguage}
                      audioType={AudioType.WORD}
                      size="sm"
                      title="Loop pronunciation"
                      className="text-white/80 hover:text-white hover:bg-white/20"
                    />
                    <SlowLoopPlayButton
                      text={wordData.germanArticle
                        ? `${wordData.germanArticle} ${capitalizeGermanNoun(selectedWord.word)}`
                        : selectedWord.word}
                      language={bookLanguage}
                      audioType={AudioType.WORD}
                      size="sm"
                      className="text-white/80 hover:text-white hover:bg-white/20"
                    />
                  </div>
                )}
              </div>
              {/* Only show IPA and syllables for single words, not phrases */}
              {!selectedWord.isPhrase && (wordData.ipa || wordData.syllables) && (
                <div className="flex items-center gap-2 text-sm">
                  {wordData.ipa && (
                    <span className="text-primary-100 font-mono">
                      /{wordData.ipa}/
                    </span>
                  )}
                  {wordData.syllables && (
                    <span className="text-primary-200">
                      {wordData.syllables}
                    </span>
                  )}
                </div>
              )}
              {/* Word type badge - on its own line to avoid crowding IPA */}
              {!selectedWord.isPhrase && wordData.wordType && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-white/20 text-primary-100 inline-block mt-1">
                  {wordData.wordType}
                </span>
              )}
              {selectedWord.isPhrase && (
                <span className="text-primary-200 text-xs">
                  phrase
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {wordData.loading ? (
            <div className="text-center py-8">
              <div className="text-4xl animate-pulse mb-2">🔍</div>
              <div className="text-gray-500 dark:text-gray-400">
                {selectedWord.isPhrase ? 'Looking up phrase...' : 'Looking up word...'}
              </div>
            </div>
          ) : wordData.error ? (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-lg">
              {wordData.error}
            </div>
          ) : (
            <>
              {/* Definition / Phrase Meaning */}
              <section>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {selectedWord.isPhrase ? '📖 Phrase Meaning' : '📖 Definition'}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  {wordData.definition || (selectedWord.isPhrase ? 'No phrase meaning available' : 'No definition available')}
                </p>
                {/* English translation of word/phrase (for non-English books) */}
                {isNonEnglish && (wordData.wordTranslation || wordData.phraseTranslation) && (
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1">
                    <span>🇬🇧</span>
                    <span>{selectedWord.isPhrase ? wordData.phraseTranslation : wordData.wordTranslation}</span>
                  </p>
                )}
              </section>

              {/* Original Sentence */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300">📝 Original Sentence</h3>
                  <div className="flex items-center gap-0.5">
                    <PronunciationButton
                      text={normalizeForTTS(selectedWord.sentence)}
                      language={bookLanguage}
                      audioType={AudioType.SENTENCE}
                      size="sm"
                      title="Pronounce sentence"
                    />
                    <LoopPlayButton
                      text={normalizeForTTS(selectedWord.sentence)}
                      language={bookLanguage}
                      audioType={AudioType.SENTENCE}
                      size="sm"
                      title="Loop sentence"
                    />
                    <SlowLoopPlayButton
                      text={normalizeForTTS(selectedWord.sentence)}
                      language={bookLanguage}
                      audioType={AudioType.SENTENCE}
                      size="sm"
                    />
                    {/* Syllable mode button */}
                    <button
                      onClick={handleSyllableModeToggle}
                      disabled={syllableModeLoading}
                      className={`p-1 rounded transition-colors ${
                        syllableModeEnabled
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : syllableModeLoading
                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-wait'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title={syllableModeEnabled ? 'Hide syllables' : 'Show syllables & IPA'}
                    >
                      {syllableModeLoading ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <span className="text-xs font-bold">Aa</span>
                      )}
                    </button>
                  </div>
                </div>
                {/* Sentence display - normal or syllable mode */}
                {syllableModeEnabled && sentenceWordData.size > 0 ? (
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    <div className="flex flex-wrap gap-x-4 gap-y-3 italic">
                      {selectedWord.sentence.split(/(\s+)/).map((token, idx) => {
                        // Check if token is a word (contains letters)
                        const isWord = /\p{L}/u.test(token);
                        if (!isWord) {
                          // Whitespace or punctuation - render as-is
                          return <span key={idx}>{token}</span>;
                        }

                        // Get IPA and syllables for this word
                        const wordLower = token.replace(/[^\p{L}]/gu, '').toLowerCase();
                        const data = sentenceWordData.get(wordLower);
                        const isHighlighted = token.toLowerCase() === selectedWord.word.toLowerCase() ||
                          token.toLowerCase().includes(selectedWord.word.toLowerCase());

                        return (
                          <div key={idx} className="flex flex-col items-center">
                            {/* IPA above */}
                            <span className="text-[10px] font-mono text-primary-500 dark:text-primary-400 leading-none">
                              {data?.ipa ? `/${data.ipa}/` : '\u00A0'}
                            </span>
                            {/* Word */}
                            <span className={isHighlighted
                              ? 'text-red-600 dark:text-red-400 font-semibold not-italic'
                              : 'text-gray-600 dark:text-gray-300'
                            }>
                              {token}
                            </span>
                            {/* Syllables below */}
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-none">
                              {data?.syllables || '\u00A0'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg italic">
                    "{highlightWord(selectedWord.sentence, selectedWord.word)}"
                  </p>
                )}
                {/* English translation of sentence (for non-English books) */}
                {isNonEnglish && wordData.sentenceTranslation && (
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-2 flex items-start gap-1">
                    <span>🇬🇧</span>
                    <span>"{wordData.sentenceTranslation}"</span>
                  </p>
                )}
              </section>

              {/* Simplified Sentence - only for single words */}
              {!selectedWord.isPhrase && wordData.simplifiedSentence && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-700 dark:text-gray-300">✨ Simplified</h3>
                    <div className="flex items-center gap-0.5">
                      <PronunciationButton
                        text={wordData.simplifiedSentence}
                        language={bookLanguage}
                        audioType={AudioType.SIMPLIFIED}
                        size="sm"
                        title="Pronounce simplified sentence"
                      />
                      <LoopPlayButton
                        text={wordData.simplifiedSentence}
                        language={bookLanguage}
                        audioType={AudioType.SIMPLIFIED}
                        size="sm"
                        title="Loop simplified sentence"
                      />
                      <SlowLoopPlayButton
                        text={wordData.simplifiedSentence}
                        language={bookLanguage}
                        audioType={AudioType.SIMPLIFIED}
                        size="sm"
                        />
                    </div>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 bg-green-50 dark:bg-green-900/30 p-3 rounded-lg">
                    {wordData.wordEquivalent
                      ? highlightWord(wordData.simplifiedSentence, wordData.wordEquivalent)
                      : wordData.simplifiedSentence}
                  </p>
                  {/* English translation of simplified sentence (for non-English books) */}
                  {isNonEnglish && wordData.simplifiedTranslation && (
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-2 flex items-start gap-1">
                      <span>🇬🇧</span>
                      <span>"{wordData.simplifiedTranslation}"</span>
                    </p>
                  )}
                </section>
              )}

              {/* Other Occurrences - only for single words */}
              {!selectedWord.isPhrase && wordData.occurrences && wordData.occurrences.length > 1 && (
                <section>
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    📍 Other Occurrences ({wordData.occurrences.length})
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-auto custom-scrollbar">
                    {wordData.occurrences.slice(0, 10).map((occ, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (onNavigateToPage) {
                            onNavigateToPage(occ.page);
                            onClose();
                          }
                        }}
                        className="w-full text-left text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      >
                        <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">Page {occ.page} →</span>
                        <p className="line-clamp-2 mt-1">"{occ.sentence}"</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Tatoeba Examples - only for single words */}
              {!selectedWord.isPhrase && settings.tatoeba_enabled && wordData.tatoebaExamples && wordData.tatoebaExamples.length > 0 && (
                <section>
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    🌐 Example Sentences (Tatoeba)
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {wordData.tatoebaExamples.slice(0, 5).map((ex, idx) => (
                      <div key={idx} className="text-sm bg-blue-50 dark:bg-blue-900/30 p-2 rounded">
                        <p className="text-gray-700 dark:text-gray-300">{ex.sentence}</p>
                        {ex.translation && (
                          <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">{ex.translation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <button
            onClick={handleSave}
            disabled={saved || wordData.loading}
            className={`w-full py-2 rounded-lg font-medium transition-colors ${
              saved
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {saved
              ? '✓ Saved to Vocabulary'
              : selectedWord.isPhrase
                ? '💾 Save Phrase to Vocabulary'
                : '💾 Save to Vocabulary'}
          </button>
        </div>
      </div>
    </>
  );
};

export default WordPanel;
