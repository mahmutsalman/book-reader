import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { CachedWordData } from '../../../shared/types/deferred-word.types';

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
  onNavigateToPage?: (page: number) => void;
  preloadedData?: CachedWordData | null;
}

interface WordData {
  definition?: string;
  ipa?: string;
  simplifiedSentence?: string;
  wordEquivalent?: string;
  occurrences?: { page: number; sentence: string }[];
  tatoebaExamples?: { sentence: string; translation?: string }[];
  loading: boolean;
  error?: string;
}

const WordPanel: React.FC<WordPanelProps> = ({ isOpen, onClose, selectedWord, bookId, onNavigateToPage, preloadedData }) => {
  const { settings } = useSettings();
  const [wordData, setWordData] = useState<WordData>({ loading: false });
  const [saved, setSaved] = useState(false);

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

    // Create a case-insensitive regex to find the word/phrase
    const isPhrase = searchWord.includes(' ');
    const pattern = isPhrase ? `(${escaped})` : `(\\b${escaped}\\b)`;
    const regex = new RegExp(pattern, 'gi');

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

  // Fetch word data when word changes (or use preloaded data)
  useEffect(() => {
    if (!selectedWord || !isOpen) return;

    // If we have preloaded data, use it immediately
    if (preloadedData) {
      setWordData({
        loading: false,
        definition: preloadedData.definition,
        ipa: preloadedData.ipa,
        simplifiedSentence: preloadedData.simplifiedSentence,
        wordEquivalent: preloadedData.wordEquivalent,
        occurrences: preloadedData.occurrences,
        tatoebaExamples: preloadedData.tatoebaExamples,
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
          // Fetch definition and IPA in parallel
          const [defResult, ipaResult, simplifyResult] = await Promise.allSettled([
            window.electronAPI.ai.getDefinition(selectedWord.word, selectedWord.sentence),
            window.electronAPI.ai.getIPA(selectedWord.word),
            window.electronAPI.ai.simplifySentence(selectedWord.sentence),
          ]);

          if (defResult.status === 'fulfilled') {
            results.definition = defResult.value.definition;
          }
          if (ipaResult.status === 'fulfilled') {
            results.ipa = ipaResult.value.ipa;
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
          <div>
            <h2 className="text-xl font-semibold">{selectedWord.word}</h2>
            {/* Only show IPA for single words, not phrases */}
            {!selectedWord.isPhrase && wordData.ipa && (
              <span className="text-primary-100 font-mono text-sm">
                /{wordData.ipa}/
              </span>
            )}
            {selectedWord.isPhrase && (
              <span className="text-primary-200 text-xs">
                phrase
              </span>
            )}
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
              </section>

              {/* Original Sentence */}
              <section>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">📝 Original Sentence</h3>
                <p className="text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg italic">
                  "{highlightWord(selectedWord.sentence, selectedWord.word)}"
                </p>
              </section>

              {/* Simplified Sentence - only for single words */}
              {!selectedWord.isPhrase && wordData.simplifiedSentence && (
                <section>
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">✨ Simplified</h3>
                  <p className="text-gray-600 dark:text-gray-300 bg-green-50 dark:bg-green-900/30 p-3 rounded-lg">
                    {wordData.wordEquivalent
                      ? highlightWord(wordData.simplifiedSentence, wordData.wordEquivalent)
                      : wordData.simplifiedSentence}
                  </p>
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
