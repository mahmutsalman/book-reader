import React, { useEffect, useState, useCallback } from 'react';
import type { VocabularyEntry } from '../../shared/types';

const VocabularyPage: React.FC = () => {
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadVocabulary = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      setLoading(true);
      const entries = await window.electronAPI.vocabulary.getAll({
        search: search || undefined,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });
      setVocabulary(entries);
    } catch (error) {
      console.error('Failed to load vocabulary:', error);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadVocabulary();
  }, [loadVocabulary]);

  const handleDelete = async (id: number) => {
    if (!window.electronAPI) return;
    if (!confirm('Delete this word from your vocabulary?')) return;

    try {
      await window.electronAPI.vocabulary.delete(id);
      setVocabulary(prev => prev.filter(v => v.id !== id));
    } catch (error) {
      console.error('Failed to delete vocabulary:', error);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-cream-100">Your Vocabulary</h2>
        <div className="text-sm text-gray-500 dark:text-cream-300">
          {vocabulary.length} words learned
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search words..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-cream-100 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-cream-300">
          Loading vocabulary...
        </div>
      ) : vocabulary.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-medium text-gray-700 dark:text-cream-200 mb-2">
            No words yet
          </h3>
          <p className="text-gray-500 dark:text-cream-300">
            Click on words while reading to add them to your vocabulary
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {vocabulary.map((entry) => (
            <div key={entry.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-cream-100">
                      {entry.word}
                    </h3>
                    {entry.ipa_pronunciation && (
                      <span className="text-gray-500 dark:text-cream-300 font-mono text-sm">
                        /{entry.ipa_pronunciation}/
                      </span>
                    )}
                  </div>
                  {entry.meaning && (
                    <p className="text-gray-600 dark:text-cream-200 mb-2">{entry.meaning}</p>
                  )}
                  {entry.original_sentence && (
                    <div className="text-sm text-gray-500 dark:text-cream-300 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                      <span className="font-medium">Context:</span>{' '}
                      "{entry.original_sentence}"
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 dark:text-cream-400">
                    <span>Looked up {entry.lookup_count} times</span>
                    <span>
                      Added {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="text-gray-400 hover:text-red-500 dark:text-cream-400 dark:hover:text-red-400 ml-4"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VocabularyPage;
