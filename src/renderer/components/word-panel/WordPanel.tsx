import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../../context/SettingsContext';

interface SelectedWord {
  word: string;
  sentence: string;
  pageNumber: number;
}

interface WordPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWord: SelectedWord | null;
  bookId: number;
  onNavigateToPage?: (page: number) => void;
}

interface WordData {
  definition?: string;
  ipa?: string;
  simplifiedSentence?: string;
  occurrences?: { page: number; sentence: string }[];
  tatoebaExamples?: { sentence: string; translation?: string }[];
  loading: boolean;
  error?: string;
}

const WordPanel: React.FC<WordPanelProps> = ({ isOpen, onClose, selectedWord, bookId, onNavigateToPage }) => {
  const { settings } = useSettings();
  const [wordData, setWordData] = useState<WordData>({ loading: false });
  const [saved, setSaved] = useState(false);

  // Helper function to highlight the selected word in a sentence
  const highlightWord = useCallback((sentence: string, word: string) => {
    if (!word) return <>{sentence}</>;

    // Create a case-insensitive regex to find the word
    const regex = new RegExp(`(\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b)`, 'gi');
    const parts = sentence.split(regex);

    return (
      <>
        {parts.map((part, index) =>
          regex.test(part) ? (
            <span key={index} className="text-red-600 font-semibold not-italic">
              {part}
            </span>
          ) : (
            <span key={index}>{part}</span>
          )
        )}
      </>
    );
  }, []);

  // Fetch word data when word changes
  useEffect(() => {
    if (!selectedWord || !isOpen) return;

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
  }, [selectedWord, isOpen, bookId, settings.tatoeba_enabled, settings.tatoeba_language]);

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
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-primary-600 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{selectedWord.word}</h2>
            {wordData.ipa && (
              <span className="text-primary-100 font-mono text-sm">
                /{wordData.ipa}/
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
              <div className="text-gray-500">Looking up word...</div>
            </div>
          ) : wordData.error ? (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg">
              {wordData.error}
            </div>
          ) : (
            <>
              {/* Definition */}
              <section>
                <h3 className="font-semibold text-gray-700 mb-2">📖 Definition</h3>
                <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">
                  {wordData.definition || 'No definition available'}
                </p>
              </section>

              {/* Original Sentence */}
              <section>
                <h3 className="font-semibold text-gray-700 mb-2">📝 Original Sentence</h3>
                <p className="text-gray-600 bg-gray-50 p-3 rounded-lg italic">
                  "{highlightWord(selectedWord.sentence, selectedWord.word)}"
                </p>
              </section>

              {/* Simplified Sentence */}
              {wordData.simplifiedSentence && (
                <section>
                  <h3 className="font-semibold text-gray-700 mb-2">✨ Simplified</h3>
                  <p className="text-gray-600 bg-green-50 p-3 rounded-lg">
                    {wordData.simplifiedSentence}
                  </p>
                </section>
              )}

              {/* Other Occurrences */}
              {wordData.occurrences && wordData.occurrences.length > 1 && (
                <section>
                  <h3 className="font-semibold text-gray-700 mb-2">
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
                        className="w-full text-left text-sm text-gray-600 bg-gray-50 p-2 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                      >
                        <span className="text-xs text-primary-600 font-medium">Page {occ.page} →</span>
                        <p className="line-clamp-2 mt-1">"{occ.sentence}"</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Tatoeba Examples */}
              {settings.tatoeba_enabled && wordData.tatoebaExamples && wordData.tatoebaExamples.length > 0 && (
                <section>
                  <h3 className="font-semibold text-gray-700 mb-2">
                    🌐 Example Sentences (Tatoeba)
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {wordData.tatoebaExamples.slice(0, 5).map((ex, idx) => (
                      <div key={idx} className="text-sm bg-blue-50 p-2 rounded">
                        <p className="text-gray-700">{ex.sentence}</p>
                        {ex.translation && (
                          <p className="text-gray-500 text-xs mt-1">{ex.translation}</p>
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
        <div className="border-t border-gray-200 p-4">
          <button
            onClick={handleSave}
            disabled={saved || wordData.loading}
            className={`w-full py-2 rounded-lg font-medium transition-colors ${
              saved
                ? 'bg-green-100 text-green-700'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {saved ? '✓ Saved to Vocabulary' : '💾 Save to Vocabulary'}
          </button>
        </div>
      </div>
    </>
  );
};

export default WordPanel;
