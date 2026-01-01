import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useSessionVocabulary } from '../../context/SessionVocabularyContext';
import type { CachedWordData } from '../../../shared/types/deferred-word.types';
import { getWordBoundaryPattern } from '../../../shared/utils/text-utils';
import type { BookLanguage, WordType } from '../../../shared/types';
import type { GrammarAnalysis } from '../../../shared/types/grammar.types';
import type { MeaningAnalysisType } from '../../../shared/types/meaning-analysis.types';
import { useMeaningAnalysis } from '../../hooks/useMeaningAnalysis';
import PronunciationButton from './PronunciationButton';
import LoopPlayButton from './LoopPlayButton';
import SlowLoopPlayButton from './SlowLoopPlayButton';
import { useAudioCache, AudioType } from '../../hooks/useAudioCache';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useReaderTheme } from '../../hooks/useReaderTheme';

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
  preloadedGrammarData?: GrammarAnalysis;
  isGrammarMode?: boolean;
  isMeaningMode?: boolean;
  pageContent?: string;
  pageIndex?: number;
}

interface WordData {
  shortDefinition?: string;        // 1-3 word concise meaning (for single words)
  shortMeaning?: string;           // 1-3 word brief meaning (for phrases)
  definition?: string;
  meaning?: string;                // Detailed explanation (for phrases)
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
  // Phrasal verb detection (for multi-word phrases)
  isPhrasalVerb?: boolean;
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

const WordPanel: React.FC<WordPanelProps> = ({
  isOpen,
  onClose,
  selectedWord,
  bookId,
  bookLanguage = 'en',
  onNavigateToPage,
  preloadedData,
  preloadedGrammarData,
  isGrammarMode = false,
  isMeaningMode = false,
  pageContent,
  pageIndex,
}) => {
  const { settings } = useSettings();
  const { addSessionEntry } = useSessionVocabulary();
  const { preloadAudio, getAudio, setAudio } = useAudioCache();
  const { playAudio, stop: stopAudio, isLoading: isLoadingAudio, setIsLoading } = useAudioPlayer();
  const theme = useReaderTheme();
  const [wordData, setWordData] = useState<WordData>({ loading: false });
  const isNonEnglish = bookLanguage !== 'en';
  const [saved, setSaved] = useState(false);

  // Grammar mode state
  const [grammarData, setGrammarData] = useState<GrammarAnalysis | null>(null);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarError, setGrammarError] = useState<string | null>(null);

  // Meaning mode state
  const [selectedMeaningType, setSelectedMeaningType] = useState<MeaningAnalysisType | null>(null);
  const { analysis: meaningAnalysis, loading: meaningLoading, error: meaningError, fetchAnalysis } = useMeaningAnalysis();

  // Syllable mode state
  const [syllableModeEnabled, setSyllableModeEnabled] = useState(false);
  const [syllableModeLoading, setSyllableModeLoading] = useState(false);
  const [sentenceWordData, setSentenceWordData] = useState<Map<string, { ipa: string; syllables: string }>>(new Map());

  // Retry trigger for rate limit errors
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [retryingModel, setRetryingModel] = useState<string | null>(null);

  // Format model name for display
  const formatModelName = (model: string): string => {
    const names: Record<string, string> = {
      'llama-3.1-8b-instant': 'Llama 3.1 8B',
      'llama-3.3-70b-versatile': 'Llama 3.3 70B',
      'meta-llama/llama-4-scout-17b-16e-instruct': 'Llama 4 Scout',
      'qwen/qwen3-32b': 'Qwen3 32B',
    };
    return names[model] || model;
  };

  // Handle retry when rate limited
  const handleRetry = useCallback(async () => {
    if (!window.electronAPI) return;

    // Get next available model
    const nextModel = await window.electronAPI.ai.getNextModel();
    if (nextModel) {
      setRetryingModel(nextModel);
      // Show for 1 second, then trigger fetch
      setTimeout(() => {
        setRetryingModel(null);
        setRetryTrigger(prev => prev + 1);
      }, 1000);
    } else {
      // No models available, just retry anyway
      setRetryTrigger(prev => prev + 1);
    }
  }, []);

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

  // Helper function to play audio for clickable areas
  // Clicking always stops current audio and starts new one immediately
  const playText = useCallback(async (text: string, language: string, audioType: AudioType) => {
    // Stop any currently playing audio first
    stopAudio();

    if (isLoadingAudio) return; // Only skip if we're still loading/fetching
    setIsLoading(true);

    try {
      // Check cache first
      const cached = await getAudio(text, language, audioType);
      if (cached) {
        console.log('[WordPanel] Cache hit for', audioType);
        await playAudio(cached);
        return;
      }

      // Fetch from server
      console.log('[WordPanel] Fetching audio:', { text: text.substring(0, 50), language, audioType });
      const response = await window.electronAPI?.pronunciation.getTTS(text, language);

      if (!response?.success || !response.audio_base64) {
        const errorMsg = response?.error || 'Server returned no audio data';
        console.error('[WordPanel] TTS failed:', {
          text: text.substring(0, 50),
          language,
          error: errorMsg,
          response
        });
        throw new Error(errorMsg);
      }

      await setAudio(text, language, audioType, response.audio_base64);
      await playAudio(response.audio_base64);
    } catch (error) {
      console.error('[WordPanel] playText error:', error);
      // Silent failure - could add toast notification here in future
    } finally {
      setIsLoading(false);
    }
  }, [isLoadingAudio, stopAudio, playAudio, setIsLoading, getAudio, setAudio]);

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

  // Fetch grammar analysis when in grammar mode
  useEffect(() => {
    if (!isGrammarMode || !selectedWord || !isOpen) {
      setGrammarData(null);
      setGrammarError(null);
      return;
    }

    const fetchGrammarAnalysis = async () => {
      // Check if we have preloaded data from background analysis
      if (preloadedGrammarData) {
        console.log('[GRAMMAR DEBUG] Using preloaded grammar data from cache');
        setGrammarData(preloadedGrammarData);
        setGrammarLoading(false);
        setGrammarError(null);
        return;
      }

      // No preloaded data - fetch from API
      setGrammarLoading(true);
      setGrammarError(null);

      try {
        const result = await window.electronAPI?.ai.getGrammarAnalysis(
          selectedWord.word,
          selectedWord.sentence,
          bookLanguage
        );

        if (result?.success) {
          setGrammarData({
            partsOfSpeech: result.partsOfSpeech || [],
            structure: result.structure || { type: 'Unknown', description: 'No structure analysis available' },
            ruleExplanation: result.ruleExplanation || 'No rule explanation available',
            contextAnalysis: result.contextAnalysis || 'No context analysis available',
            pattern: result.pattern || 'No pattern available',
            examples: result.examples || [],
            commonMistakes: result.commonMistakes || [],
            practiceTask: result.practiceTask || { instruction: 'No practice task available', template: '' },
          });
        } else {
          setGrammarError(result?.error || 'Failed to analyze grammar');
        }
      } catch (error) {
        setGrammarError(error instanceof Error ? error.message : 'Failed to fetch grammar analysis');
      } finally {
        setGrammarLoading(false);
      }
    };

    fetchGrammarAnalysis();
  }, [isGrammarMode, selectedWord?.word, selectedWord?.sentence, isOpen, bookLanguage, preloadedGrammarData]);

  // Auto-select narrative context when meaning mode is activated
  useEffect(() => {
    if (isMeaningMode && !selectedMeaningType) {
      setSelectedMeaningType('narrative');
    }
  }, [isMeaningMode, selectedMeaningType]);

  // Fetch meaning analysis when type is selected
  useEffect(() => {
    console.log('[MEANING DEBUG] useEffect triggered:', {
      isMeaningMode,
      selectedMeaningType,
      hasPageContent: !!pageContent,
      pageIndex,
      selectedWord: selectedWord?.word,
      selectedSentence: selectedWord?.sentence
    });

    if (isMeaningMode && selectedMeaningType && pageContent && pageIndex !== undefined) {
      console.log('[MEANING DEBUG] Calling fetchAnalysis with word:', selectedWord?.word);
      fetchAnalysis(
        pageContent,
        selectedMeaningType,
        bookId,
        pageIndex,
        bookLanguage,
        selectedWord?.word,      // Pass selected word for micro analysis
        selectedWord?.sentence   // Pass sentence context
      );
    }
  }, [isMeaningMode, selectedMeaningType, pageContent, pageIndex, bookId, bookLanguage, fetchAnalysis, selectedWord]);

  // Reset meaning state when meaning mode is disabled
  useEffect(() => {
    if (!isMeaningMode) {
      setSelectedMeaningType(null);
    }
  }, [isMeaningMode]);

  // Fetch word data when word changes (or use preloaded data)
  useEffect(() => {
    if (!selectedWord || !isOpen) return;

    // If we have preloaded data, use it immediately
    if (preloadedData) {
      setWordData({
        loading: false,
        shortDefinition: preloadedData.shortDefinition,
        shortMeaning: preloadedData.shortMeaning,
        definition: preloadedData.definition,
        meaning: preloadedData.meaning,
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
        // Phrasal verb detection
        isPhrasalVerb: preloadedData.isPhrasalVerb,
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
            results.shortDefinition = defResult.value.shortDefinition;
            results.definition = defResult.value.definition;
            results.wordTranslation = defResult.value.wordTranslation;
            results.wordType = defResult.value.wordType;
            results.germanArticle = defResult.value.germanArticle;
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
  }, [selectedWord, isOpen, bookId, settings.tatoeba_enabled, settings.tatoeba_language, preloadedData, retryTrigger]);

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
      // Determine word_type based on:
      // - Single word → 'word'
      // - Phrase + isPhrasalVerb → 'phrasal_verb'
      // - Phrase + !isPhrasalVerb → 'word_group'
      let wordType: WordType = 'word';
      if (selectedWord.isPhrase) {
        wordType = wordData.isPhrasalVerb ? 'phrasal_verb' : 'word_group';
      }

      // Save to persistent database
      await window.electronAPI.vocabulary.add({
        word: selectedWord.word,
        book_id: bookId,
        short_definition: wordData.shortDefinition || wordData.shortMeaning,
        meaning: wordData.definition || wordData.meaning,
        ipa_pronunciation: wordData.ipa,
        simplified_sentence: wordData.simplifiedSentence,
        original_sentence: selectedWord.sentence,
        word_type: wordType,
      });

      // Also add to session vocabulary context
      addSessionEntry({
        word: selectedWord.word,
        word_type: wordType,
        book_id: bookId,
        short_definition: wordData.shortDefinition || wordData.shortMeaning,
        meaning: wordData.definition || wordData.meaning,
        sentence: selectedWord.sentence,
        timestamp: Date.now(),
      });

      setSaved(true);
    } catch (error) {
      console.error('Failed to save to vocabulary:', error);
    }
  }, [selectedWord, bookId, wordData, addSessionEntry]);

  if (!isOpen || !selectedWord) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-96 shadow-2xl z-50 overflow-hidden flex flex-col"
        style={{ backgroundColor: theme.background, color: theme.text }}
      >
        {/* Header - entire area clickable for word pronunciation */}
        <div
          className={`px-3 py-2.5 flex items-center justify-between transition-colors ${!selectedWord.isPhrase ? 'cursor-pointer' : ''}`}
          style={{
            backgroundColor: theme.panel,
            color: theme.text,
            borderBottom: `1px solid ${theme.panelBorder}`
          }}
          onClick={() => {
            if (!selectedWord.isPhrase) {
              const wordText = wordData.germanArticle
                ? `${wordData.germanArticle} ${capitalizeGermanNoun(selectedWord.word)}`
                : selectedWord.word;
              playText(wordText, bookLanguage, AudioType.WORD);
            }
          }}
          onMouseEnter={(e) => {
            if (!selectedWord.isPhrase) {
              e.currentTarget.style.backgroundColor = theme.background;
            }
          }}
          onMouseLeave={(e) => {
            if (!selectedWord.isPhrase) {
              e.currentTarget.style.backgroundColor = theme.panel;
            }
          }}
          title={!selectedWord.isPhrase ? 'Click anywhere to hear pronunciation' : undefined}
        >
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                {/* Display word with German article if available */}
                <h2 className="text-lg font-semibold">
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
                    />
                    <LoopPlayButton
                      text={wordData.germanArticle
                        ? `${wordData.germanArticle} ${capitalizeGermanNoun(selectedWord.word)}`
                        : selectedWord.word}
                      language={bookLanguage}
                      audioType={AudioType.WORD}
                      size="sm"
                      title="Loop pronunciation"
                    />
                    <SlowLoopPlayButton
                      text={wordData.germanArticle
                        ? `${wordData.germanArticle} ${capitalizeGermanNoun(selectedWord.word)}`
                        : selectedWord.word}
                      language={bookLanguage}
                      audioType={AudioType.WORD}
                      size="sm"
                    />
                  </div>
                )}
              </div>
              {/* Only show IPA and syllables for single words, not phrases */}
              {!selectedWord.isPhrase && (wordData.ipa || wordData.syllables) && (
                <div className="flex items-center gap-2 text-sm">
                  {wordData.ipa && (
                    <span className="font-mono" style={{ color: theme.textSecondary }}>
                      /{wordData.ipa}/
                    </span>
                  )}
                  {wordData.syllables && (
                    <span style={{ color: theme.textSecondary }}>
                      {wordData.syllables}
                    </span>
                  )}
                </div>
              )}
              {/* Word type badge - on its own line to avoid crowding IPA */}
              {!selectedWord.isPhrase && wordData.wordType && (
                <span
                  className="px-2 py-0.5 text-xs rounded-full inline-block mt-1"
                  style={{ backgroundColor: theme.background, color: theme.text }}
                >
                  {wordData.wordType}
                </span>
              )}
              {selectedWord.isPhrase && (
                <span className="text-xs" style={{ color: theme.textSecondary }}>
                  phrase
                </span>
              )}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-2xl rounded-lg px-2 py-1 transition-colors"
            style={{ color: theme.textSecondary }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = theme.text;
              e.currentTarget.style.backgroundColor = theme.background;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = theme.textSecondary;
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {/* Meaning Mode Content */}
          {isMeaningMode ? (
            <>
              {/* Analysis Type Buttons */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {/* Narrative Analysis Button */}
                <button
                  onClick={() => setSelectedMeaningType('narrative')}
                  className={`p-3 rounded-lg border-2 transition-all shadow-lg ${
                    selectedMeaningType === 'narrative' ? 'font-semibold' : ''
                  }`}
                  style={
                    selectedMeaningType === 'narrative'
                      ? {
                          backgroundColor: theme.accent,
                          color: theme.background,
                          borderColor: theme.accent
                        }
                      : {
                          backgroundColor: theme.panel,
                          color: theme.textSecondary,
                          borderColor: theme.panelBorder
                        }
                  }
                  onMouseEnter={(e) => {
                    if (selectedMeaningType !== 'narrative') {
                      e.currentTarget.style.backgroundColor = theme.background;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedMeaningType !== 'narrative') {
                      e.currentTarget.style.backgroundColor = theme.panel;
                    }
                  }}
                >
                  <div className="text-xl mb-1">📖</div>
                  <div className="font-semibold text-sm">Narrative Context</div>
                </button>

                {/* Literary Analysis Button */}
                <button
                  onClick={() => setSelectedMeaningType('literary')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedMeaningType === 'literary'
                      ? 'bg-green-600 text-white border-green-600 shadow-lg'
                      : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50'
                  }`}
                >
                  <div className="text-xl mb-1">✨</div>
                  <div className="font-semibold text-sm">Literary Analysis</div>
                </button>

                {/* Semantic Analysis Button */}
                <button
                  onClick={() => setSelectedMeaningType('semantic')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedMeaningType === 'semantic'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-lg'
                      : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                  }`}
                >
                  <div className="text-xl mb-1">🔍</div>
                  <div className="font-semibold text-sm">Semantic Analysis</div>
                </button>

                {/* Simplified Explanation Button */}
                <button
                  onClick={() => setSelectedMeaningType('simplified')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedMeaningType === 'simplified'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-lg'
                      : 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/50'
                  }`}
                >
                  <div className="text-xl mb-1">📝</div>
                  <div className="font-semibold text-sm">Simplified</div>
                </button>
              </div>

              {/* Analysis Content */}
              {meaningLoading ? (
                <div className="text-center py-8">
                  <div className="text-4xl animate-pulse mb-2">🔍</div>
                  <div style={{ color: theme.textSecondary }}>
                    Analyzing context...
                  </div>
                </div>
              ) : meaningError ? (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-3 rounded-lg">
                  <p>{meaningError}</p>
                </div>
              ) : meaningAnalysis && selectedMeaningType ? (
                <>
                  {/* Narrative Analysis Content */}
                  {selectedMeaningType === 'narrative' && meaningAnalysis.narrative && (
                    <div className="space-y-3">
                      <section>
                        <h3 className="font-semibold mb-2" style={{ color: theme.accent }}>
                          📖 Plot Context
                        </h3>
                        <p className="p-3 rounded-lg" style={{ backgroundColor: theme.panel, color: theme.text }}>
                          {meaningAnalysis.narrative.plotContext}
                        </p>
                      </section>

                      <section>
                        <h3 className="font-semibold mb-2" style={{ color: theme.accent }}>
                          👥 Character Dynamics
                        </h3>
                        <p className="p-3 rounded-lg" style={{ backgroundColor: theme.panel, color: theme.text }}>
                          {meaningAnalysis.narrative.characterDynamics}
                        </p>
                      </section>

                      <section>
                        <h3 className="font-semibold mb-2" style={{ color: theme.accent }}>
                          🎯 Narrative Function
                        </h3>
                        <p className="p-3 rounded-lg" style={{ backgroundColor: theme.panel, color: theme.text }}>
                          {meaningAnalysis.narrative.narrativeFunction}
                        </p>
                      </section>

                      {/* Word-Specific Analysis (Micro View) */}
                      {meaningAnalysis.narrative.wordSpecific && (
                        <>
                          <div className="border-t-2 my-3" style={{ borderColor: theme.panelBorder }} />
                          <div
                            className="p-2 rounded-lg mb-2 border-l-4"
                            style={{
                              backgroundColor: theme.panel,
                              borderLeftColor: theme.accent,
                              color: theme.text
                            }}
                          >
                            <h4 className="font-semibold text-sm" style={{ color: theme.accent }}>
                              🔍 Word-Level Focus: "{selectedWord?.word}"
                            </h4>
                          </div>

                          <section>
                            <h3 className="font-semibold mb-2" style={{ color: theme.accent }}>
                              🎬 Word's Role in Plot
                            </h3>
                            <p className="p-3 rounded-lg" style={{ backgroundColor: theme.panel, color: theme.text }}>
                              {meaningAnalysis.narrative.wordSpecific.wordInPlot}
                            </p>
                          </section>

                          <section>
                            <h3 className="font-semibold mb-2" style={{ color: theme.accent }}>
                              👤 Character Insight
                            </h3>
                            <p className="p-3 rounded-lg" style={{ backgroundColor: theme.panel, color: theme.text }}>
                              {meaningAnalysis.narrative.wordSpecific.characterInsight}
                            </p>
                          </section>

                          <section>
                            <h3 className="font-semibold mb-2" style={{ color: theme.accent }}>
                              🎭 Thematic Role
                            </h3>
                            <p className="p-3 rounded-lg" style={{ backgroundColor: theme.panel, color: theme.text }}>
                              {meaningAnalysis.narrative.wordSpecific.thematicRole}
                            </p>
                          </section>
                        </>
                      )}
                    </div>
                  )}

                  {/* Literary Analysis Content */}
                  {selectedMeaningType === 'literary' && meaningAnalysis.literary && (
                    <div className="space-y-3">
                      <section>
                        <h3 className="font-semibold text-green-700 dark:text-green-300 mb-2">
                          ✍️ Word Choice
                        </h3>
                        <p className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                          {meaningAnalysis.literary.wordChoice}
                        </p>
                      </section>

                      <section>
                        <h3 className="font-semibold text-green-700 dark:text-green-300 mb-2">
                          🎭 Tone & Atmosphere
                        </h3>
                        <p className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                          {meaningAnalysis.literary.tone}
                        </p>
                      </section>

                      {meaningAnalysis.literary.literaryDevices.length > 0 && (
                        <section>
                          <h3 className="font-semibold text-green-700 dark:text-green-300 mb-2">
                            ✨ Literary Devices
                          </h3>
                          <ul className="space-y-2 bg-green-50 dark:bg-green-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                            {meaningAnalysis.literary.literaryDevices.map((device, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-green-500">•</span>
                                <span>{device}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                      {/* Word-Specific Analysis (Micro View) */}
                      {meaningAnalysis.literary.wordSpecific && (
                        <>
                          <div className="border-t-2 border-green-200 dark:border-green-800 my-3" />
                          <div className="bg-green-100 dark:bg-green-900/50 p-2 rounded-lg mb-2">
                            <h4 className="font-semibold text-green-900 dark:text-green-200 text-sm">
                              🔍 Word-Level Focus: "{selectedWord?.word}"
                            </h4>
                          </div>

                          <section>
                            <h3 className="font-semibold text-green-700 dark:text-green-300 mb-2">
                              🎯 Rhetorical Effect
                            </h3>
                            <p className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                              {meaningAnalysis.literary.wordSpecific.rhetoricalEffect}
                            </p>
                          </section>

                          <section>
                            <h3 className="font-semibold text-green-700 dark:text-green-300 mb-2">
                              💫 Emotional Impact
                            </h3>
                            <p className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                              {meaningAnalysis.literary.wordSpecific.emotionalImpact}
                            </p>
                          </section>

                          <section>
                            <h3 className="font-semibold text-green-700 dark:text-green-300 mb-2">
                              ✨ Stylistic Purpose
                            </h3>
                            <p className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                              {meaningAnalysis.literary.wordSpecific.stylisticPurpose}
                            </p>
                          </section>
                        </>
                      )}
                    </div>
                  )}

                  {/* Semantic Analysis Content */}
                  {selectedMeaningType === 'semantic' && meaningAnalysis.semantic && (
                    <div className="space-y-3">
                      {meaningAnalysis.semantic.multipleMeanings.length > 0 && (
                        <section>
                          <h3 className="font-semibold text-amber-700 dark:text-amber-300 mb-2">
                            🔄 Multiple Interpretations
                          </h3>
                          <ul className="space-y-2 bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                            {meaningAnalysis.semantic.multipleMeanings.map((meaning, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-amber-500">{idx + 1}.</span>
                                <span>{meaning}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                      <section>
                        <h3 className="font-semibold text-amber-700 dark:text-amber-300 mb-2">
                          💭 Nuances
                        </h3>
                        <p className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                          {meaningAnalysis.semantic.nuances}
                        </p>
                      </section>

                      <section>
                        <h3 className="font-semibold text-amber-700 dark:text-amber-300 mb-2">
                          🌍 Cultural Context
                        </h3>
                        <p className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                          {meaningAnalysis.semantic.culturalContext}
                        </p>
                      </section>

                      {/* Word-Specific Analysis (Micro View) */}
                      {meaningAnalysis.semantic.wordSpecific && (
                        <>
                          <div className="border-t-2 border-amber-200 dark:border-amber-800 my-3" />
                          <div className="bg-amber-100 dark:bg-amber-900/50 p-2 rounded-lg mb-2">
                            <h4 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                              🔍 Word-Level Focus: "{selectedWord?.word}"
                            </h4>
                          </div>

                          <section>
                            <h3 className="font-semibold text-amber-700 dark:text-amber-300 mb-2">
                              📝 Contextual Meaning
                            </h3>
                            <p className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                              {meaningAnalysis.semantic.wordSpecific.contextualMeaning}
                            </p>
                          </section>

                          <section>
                            <h3 className="font-semibold text-amber-700 dark:text-amber-300 mb-2">
                              🔀 Ambiguity Analysis
                            </h3>
                            <p className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                              {meaningAnalysis.semantic.wordSpecific.ambiguityAnalysis}
                            </p>
                          </section>

                          <section>
                            <h3 className="font-semibold text-amber-700 dark:text-amber-300 mb-2">
                              🌏 Cultural Significance
                            </h3>
                            <p className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                              {meaningAnalysis.semantic.wordSpecific.culturalSignificance}
                            </p>
                          </section>
                        </>
                      )}
                    </div>
                  )}

                  {/* Simplified Analysis Content */}
                  {selectedMeaningType === 'simplified' && meaningAnalysis.simplified && (
                    <div className="space-y-3">
                      <section>
                        <h3 className="font-semibold text-purple-700 dark:text-purple-300 mb-2">
                          💡 Main Idea
                        </h3>
                        <p className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                          {meaningAnalysis.simplified.mainIdea}
                        </p>
                      </section>

                      <section>
                        <h3 className="font-semibold text-purple-700 dark:text-purple-300 mb-2">
                          📝 Breakdown
                        </h3>
                        <p className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg whitespace-pre-wrap" style={{ color: theme.text }}>
                          {meaningAnalysis.simplified.breakdown}
                        </p>
                      </section>

                      {meaningAnalysis.simplified.keyVocabulary.length > 0 && (
                        <section>
                          <h3 className="font-semibold text-purple-700 dark:text-purple-300 mb-2">
                            📚 Key Vocabulary
                          </h3>
                          <ul className="space-y-2 bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                            {meaningAnalysis.simplified.keyVocabulary.map((vocab, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-purple-500">•</span>
                                <span>{vocab}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                      {/* Word-Specific Analysis (Micro View) */}
                      {meaningAnalysis.simplified.wordSpecific && (
                        <>
                          <div className="border-t-2 border-purple-200 dark:border-purple-800 my-3" />
                          <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-lg mb-2">
                            <h4 className="font-semibold text-purple-900 dark:text-purple-200 text-sm">
                              🔍 Word-Level Focus: "{selectedWord?.word}"
                            </h4>
                          </div>

                          <section>
                            <h3 className="font-semibold text-purple-700 dark:text-purple-300 mb-2">
                              📖 Simple Definition
                            </h3>
                            <p className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                              {meaningAnalysis.simplified.wordSpecific.simpleDefinition}
                            </p>
                          </section>

                          <section>
                            <h3 className="font-semibold text-purple-700 dark:text-purple-300 mb-2">
                              💬 Usage Example
                            </h3>
                            <p className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                              {meaningAnalysis.simplified.wordSpecific.usageExample}
                            </p>
                          </section>

                          <section>
                            <h3 className="font-semibold text-purple-700 dark:text-purple-300 mb-2">
                              💡 Learner Tip
                            </h3>
                            <p className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                              {meaningAnalysis.simplified.wordSpecific.learnerTip}
                            </p>
                          </section>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8" style={{ color: theme.textSecondary }}>
                  Select an analysis type to explore the context
                </div>
              )}
            </>
          ) : isGrammarMode ? (
            grammarLoading ? (
              <div className="text-center py-8">
                <div className="text-4xl animate-pulse mb-2">📚</div>
                <div style={{ color: theme.textSecondary }}>
                  Analyzing grammar structure...
                </div>
              </div>
            ) : grammarError ? (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-3 rounded-lg">
                <p>{grammarError}</p>
              </div>
            ) : grammarData ? (
              <>
                {/* Grammar Structure */}
                <section>
                  <h3 className="font-semibold mb-2 flex items-center gap-2" style={{ color: theme.text }}>
                    🏗️ Grammar Structure
                    <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                      {grammarData.structure.type}
                    </span>
                  </h3>
                  <p className="p-3 rounded-lg" style={{ backgroundColor: theme.panel, color: theme.text }}>
                    {grammarData.structure.description}
                  </p>
                </section>

                {/* Parts of Speech - Color coded words from sentence */}
                {grammarData.partsOfSpeech.length > 0 && (
                  <section>
                    <h3 className="font-semibold mb-2" style={{ color: theme.text }}>
                      🏷️ Parts of Speech
                    </h3>
                    <div className="flex flex-wrap gap-2 p-3 rounded-lg" style={{ backgroundColor: theme.panel, color: theme.text }}>
                      {grammarData.partsOfSpeech.map((item, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-1 rounded text-sm font-medium word-pos-${item.pos}`}
                          title={item.pos}
                        >
                          {item.word}
                        </span>
                      ))}
                    </div>
                    {/* POS Legend */}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: theme.textSecondary }}>
                      <span><span className="word-pos-noun">●</span> noun</span>
                      <span><span className="word-pos-verb">●</span> verb</span>
                      <span><span className="word-pos-adjective">●</span> adj</span>
                      <span><span className="word-pos-adverb">●</span> adv</span>
                      <span><span className="word-pos-preposition">●</span> prep</span>
                      <span><span className="word-pos-pronoun">●</span> pron</span>
                    </div>
                  </section>
                )}

                {/* Rule Explanation */}
                <section>
                  <h3 className="font-semibold mb-2" style={{ color: theme.text }}>
                    📖 Rule Explanation
                  </h3>
                  <p className="p-3 rounded-lg" style={{ backgroundColor: theme.panel, color: theme.text }}>
                    {grammarData.ruleExplanation}
                  </p>
                </section>

                {/* Context Analysis */}
                <section>
                  <h3 className="font-semibold mb-2" style={{ color: theme.text }}>
                    🎯 Why This Structure?
                  </h3>
                  <p className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                    {grammarData.contextAnalysis}
                  </p>
                </section>

                {/* Pattern Template */}
                <section>
                  <h3 className="font-semibold mb-2" style={{ color: theme.text }}>
                    📝 Reusable Pattern
                  </h3>
                  <div
                    className="p-3 rounded-lg font-mono text-sm overflow-x-auto border"
                    style={{
                      backgroundColor: theme.panel,
                      color: theme.textSecondary,
                      borderColor: theme.panelBorder
                    }}
                  >
                    {grammarData.pattern}
                  </div>
                </section>

                {/* Examples */}
                {grammarData.examples.length > 0 && (
                  <section>
                    <h3 className="font-semibold mb-2" style={{ color: theme.text }}>
                      💡 Example Sentences
                    </h3>
                    <div className="space-y-2">
                      {grammarData.examples.map((example, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg ${
                            example.complexity === 'simple'
                              ? 'bg-green-50 dark:bg-green-900/30 border-l-4 border-green-400'
                              : example.complexity === 'medium'
                                ? 'bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-400'
                                : 'bg-red-50 dark:bg-red-900/30 border-l-4 border-red-400'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              example.complexity === 'simple'
                                ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                                : example.complexity === 'medium'
                                  ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200'
                                  : 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200'
                            }`}>
                              {example.complexity}
                            </span>
                          </div>
                          <p style={{ color: theme.text }}>{example.sentence}</p>
                          {example.translation && (
                            <p className="text-sm mt-1 italic" style={{ color: theme.textSecondary }}>
                              {example.translation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Common Mistakes */}
                {grammarData.commonMistakes.length > 0 && (
                  <section>
                    <h3 className="font-semibold mb-2" style={{ color: theme.text }}>
                      ⚠️ Common Mistakes
                    </h3>
                    <ul className="space-y-2 bg-orange-50 dark:bg-orange-900/30 p-3 rounded-lg" style={{ color: theme.text }}>
                      {grammarData.commonMistakes.map((mistake, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-orange-500">✗</span>
                          <span>{mistake}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Practice Task */}
                <section>
                  <h3 className="font-semibold mb-2" style={{ color: theme.text }}>
                    ✏️ Practice Task
                  </h3>
                  <div className="bg-teal-50 dark:bg-teal-900/30 p-3 rounded-lg">
                    <p className="mb-2" style={{ color: theme.text }}>
                      {grammarData.practiceTask.instruction}
                    </p>
                    {grammarData.practiceTask.template && (
                      <div
                        className="p-2 rounded border-2 border-dashed font-mono text-sm"
                        style={{
                          backgroundColor: theme.panel,
                          color: theme.textSecondary,
                          borderColor: theme.panelBorder
                        }}
                      >
                        {grammarData.practiceTask.template}
                      </div>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="text-center py-8" style={{ color: theme.textSecondary }}>
                Select a word or phrase to analyze grammar
              </div>
            )
          ) : wordData.loading ? (
            <div className="text-center py-8">
              <div className="text-4xl animate-pulse mb-2">🔍</div>
              <div style={{ color: theme.textSecondary }}>
                {selectedWord.isPhrase ? 'Looking up phrase...' : 'Looking up word...'}
              </div>
            </div>
          ) : wordData.error ? (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-3 rounded-lg">
              <p>{wordData.error}</p>
              {wordData.error.toLowerCase().includes('rate limit') && (
                <button
                  onClick={handleRetry}
                  className="mt-3 px-4 py-2 font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
                  style={{
                    backgroundColor: theme.accent,
                    color: theme.background
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  🔄 Try Next AI Model
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Definition / Phrase Meaning */}
              <section>
                <h3 className="font-semibold mb-2" style={{ color: theme.text }}>
                  {selectedWord.isPhrase ? '📖 Phrase Meaning' : '📖 Definition'}
                </h3>

                {/* Short Definition - Prominent Display */}
                {(wordData.shortDefinition || (selectedWord.isPhrase && wordData.shortMeaning)) && (
                  <div
                    className="mb-3 p-3 rounded-lg border-l-4"
                    style={{
                      backgroundColor: theme.panel,
                      borderLeftColor: theme.accent
                    }}
                  >
                    <p className="text-lg font-bold" style={{ color: theme.accent }}>
                      {selectedWord.isPhrase ? wordData.shortMeaning : wordData.shortDefinition}
                    </p>
                  </div>
                )}

                {/* English translation of word/phrase (for non-English books) - shown prominently */}
                {isNonEnglish && (wordData.wordTranslation || wordData.phraseTranslation) && (
                  <p className="text-sm mb-2 flex items-center gap-1 font-medium" style={{ color: theme.accent }}>
                    <span>🇬🇧</span>
                    <span>{selectedWord.isPhrase ? wordData.phraseTranslation : wordData.wordTranslation}</span>
                  </p>
                )}

                {/* Detailed Definition - Below short version */}
                <div className="mt-3">
                  <p className="text-sm mb-1 font-medium" style={{ color: theme.textSecondary }}>
                    Detailed Explanation:
                  </p>
                  <p
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: theme.panel, color: theme.text }}
                  >
                    {wordData.definition || (selectedWord.isPhrase ? wordData.meaning : null) || 'No definition available'}
                  </p>
                </div>

                {/* Retry button for rate limit errors */}
                {retryingModel ? (
                  <div
                    className="mt-3 px-4 py-2 rounded-lg text-sm flex items-center gap-2 border-l-4"
                    style={{
                      backgroundColor: theme.panel,
                      color: theme.textSecondary,
                      borderLeftColor: theme.accent
                    }}
                  >
                    <span className="inline-block animate-spin">⏳</span>
                    Trying {formatModelName(retryingModel)}...
                  </div>
                ) : wordData.definition?.toLowerCase().includes('rate limit') && (
                  <button
                    onClick={handleRetry}
                    className="mt-3 px-4 py-2 font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
                    style={{
                      backgroundColor: theme.accent,
                      color: theme.background
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '0.8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                  >
                    🔄 Try Next AI Model
                  </button>
                )}
              </section>

              {/* Original Sentence */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold" style={{ color: theme.text }}>📝 Original Sentence</h3>
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
                            ? 'cursor-wait'
                            : ''
                      }`}
                      style={
                        syllableModeEnabled
                          ? undefined
                          : syllableModeLoading
                            ? {
                                backgroundColor: theme.panel,
                                color: theme.textSecondary
                              }
                            : {
                                color: theme.textSecondary
                              }
                      }
                      onMouseEnter={(e) => {
                        if (!syllableModeEnabled && !syllableModeLoading) {
                          e.currentTarget.style.color = theme.text;
                          e.currentTarget.style.backgroundColor = theme.background;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!syllableModeEnabled && !syllableModeLoading) {
                          e.currentTarget.style.color = theme.textSecondary;
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
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
                  <div className="p-3 rounded-lg" style={{ backgroundColor: theme.panel }}>
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
                            <span className="text-[10px] font-mono leading-none" style={{ color: theme.textSecondary }}>
                              {data?.ipa ? `/${data.ipa}/` : '\u00A0'}
                            </span>
                            {/* Word */}
                            <span
                              className={isHighlighted
                                ? 'text-red-600 dark:text-red-400 font-semibold not-italic'
                                : ''
                              }
                              style={isHighlighted ? undefined : { color: theme.text }}
                            >
                              {token}
                            </span>
                            {/* Syllables below */}
                            <span className="text-[10px] leading-none" style={{ color: theme.textSecondary }}>
                              {data?.syllables || '\u00A0'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p
                    className="p-3 rounded-lg italic cursor-pointer transition-colors"
                    style={{ backgroundColor: theme.panel, color: theme.text }}
                    onClick={() => playText(normalizeForTTS(selectedWord.sentence), bookLanguage, AudioType.SENTENCE)}
                    title="Click to hear sentence"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '0.8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                  >
                    "{highlightWord(selectedWord.sentence, selectedWord.word)}"
                  </p>
                )}
                {/* English translation of sentence (for non-English books) */}
                {isNonEnglish && wordData.sentenceTranslation && (
                  <p className="text-sm mt-2 flex items-start gap-1" style={{ color: theme.accent }}>
                    <span>🇬🇧</span>
                    <span>"{wordData.sentenceTranslation}"</span>
                  </p>
                )}
              </section>

              {/* Simplified Sentence - only for single words */}
              {!selectedWord.isPhrase && wordData.simplifiedSentence && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold" style={{ color: theme.text }}>✨ Simplified</h3>
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
                  <p
                    className="p-3 rounded-lg cursor-pointer transition-colors"
                    style={{ backgroundColor: theme.panel, color: theme.text }}
                    onClick={() => playText(wordData.simplifiedSentence!, bookLanguage, AudioType.SIMPLIFIED)}
                    title="Click to hear simplified sentence"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '0.8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                  >
                    {wordData.wordEquivalent
                      ? highlightWord(wordData.simplifiedSentence, wordData.wordEquivalent)
                      : wordData.simplifiedSentence}
                  </p>
                  {/* English translation of simplified sentence (for non-English books) */}
                  {isNonEnglish && wordData.simplifiedTranslation && (
                    <p className="text-sm mt-2 flex items-start gap-1" style={{ color: theme.accent }}>
                      <span>🇬🇧</span>
                      <span>"{wordData.simplifiedTranslation}"</span>
                    </p>
                  )}
                </section>
              )}

              {/* Other Occurrences - only for single words */}
              {!selectedWord.isPhrase && wordData.occurrences && wordData.occurrences.length > 1 && (
                <section>
                  <h3 className="font-semibold mb-2" style={{ color: theme.text }}>
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
                        className="w-full text-left text-sm p-2 rounded cursor-pointer transition-colors"
                        style={{ backgroundColor: theme.panel, color: theme.text }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '0.8';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
                      >
                        <span className="text-xs font-medium" style={{ color: theme.accent }}>Page {occ.page} →</span>
                        <p className="line-clamp-2 mt-1">"{occ.sentence}"</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Tatoeba Examples - only for single words */}
              {!selectedWord.isPhrase && settings.tatoeba_enabled && wordData.tatoebaExamples && wordData.tatoebaExamples.length > 0 && (
                <section>
                  <h3 className="font-semibold mb-2" style={{ color: theme.text }}>
                    🌐 Example Sentences (Tatoeba)
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {wordData.tatoebaExamples.slice(0, 5).map((ex, idx) => (
                      <div key={idx} className="text-sm p-2 rounded" style={{ backgroundColor: theme.panel }}>
                        <p style={{ color: theme.text }}>{ex.sentence}</p>
                        {ex.translation && (
                          <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>{ex.translation}</p>
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
        <div className="border-t p-3" style={{ borderColor: theme.panelBorder }}>
          <button
            onClick={handleSave}
            disabled={saved || wordData.loading}
            className={`w-full py-2 rounded-lg font-medium transition-colors ${
              saved
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : ''
            }`}
            style={
              saved
                ? undefined
                : {
                    backgroundColor: theme.accent,
                    color: theme.background
                  }
            }
            onMouseEnter={(e) => {
              if (!saved && !wordData.loading) {
                e.currentTarget.style.opacity = '0.85';
              }
            }}
            onMouseLeave={(e) => {
              if (!saved && !wordData.loading) {
                e.currentTarget.style.opacity = '1';
              }
            }}
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
