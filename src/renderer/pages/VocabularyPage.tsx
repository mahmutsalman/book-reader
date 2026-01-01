import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { VocabularyEntry, Book, WordType, WordTypeCounts, VocabularyExportType } from '../../shared/types';
import { useSessionVocabulary } from '../context/SessionVocabularyContext';
import VocabularyTabs, { type VocabularyTab } from '../components/vocabulary/VocabularyTabs';
import BookFilter from '../components/vocabulary/BookFilter';
import { ExportContextMenu } from '../components/vocabulary/ExportContextMenu';

const VocabularyPage: React.FC = () => {
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<VocabularyTab>('word');
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [counts, setCounts] = useState<WordTypeCounts>({ word: 0, phrasal_verb: 0, word_group: 0 });
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportMenuPosition, setExportMenuPosition] = useState({ x: 0, y: 0 });
  const exportButtonRef = useRef<HTMLButtonElement>(null);

  const { getSessionEntries, getSessionCounts, totalSessionCount } = useSessionVocabulary();

  // Load books list
  const loadBooks = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const booksList = await window.electronAPI.book.getAll();
      setBooks(booksList);
    } catch (error) {
      console.error('Failed to load books:', error);
    }
  }, []);

  // Load vocabulary counts
  const loadCounts = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const typeCounts = await window.electronAPI.vocabulary.getCounts(selectedBookId ?? undefined);
      setCounts(typeCounts);
    } catch (error) {
      console.error('Failed to load counts:', error);
    }
  }, [selectedBookId]);

  // Load vocabulary entries
  const loadVocabulary = useCallback(async () => {
    if (!window.electronAPI) return;
    if (activeTab === 'session') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const entries = await window.electronAPI.vocabulary.getAll({
        bookId: selectedBookId ?? undefined,
        wordType: activeTab as WordType,
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
  }, [search, activeTab, selectedBookId]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    loadVocabulary();
  }, [loadVocabulary]);

  const handleDelete = async (id: number) => {
    if (!window.electronAPI) return;
    if (!confirm('Delete this entry from your vocabulary?')) return;

    try {
      await window.electronAPI.vocabulary.delete(id);
      setVocabulary(prev => prev.filter(v => v.id !== id));
      loadCounts(); // Refresh counts
    } catch (error) {
      console.error('Failed to delete vocabulary:', error);
    }
  };

  const handleTabChange = (tab: VocabularyTab) => {
    setActiveTab(tab);
    setSearch(''); // Clear search when switching tabs
  };

  const handleBookChange = (bookId: number | null) => {
    setSelectedBookId(bookId);
  };

  // Show export menu
  const handleExportButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setExportMenuPosition({
      x: rect.left,
      y: rect.bottom + 5, // 5px below the button
    });
    setShowExportMenu(true);
  };

  // Export vocabulary
  const handleExport = async (exportType: VocabularyExportType) => {
    if (!window.electronAPI || exporting) return;

    // Get entries based on current tab
    const entriesToExport = activeTab === 'session'
      ? sessionEntries.map(e => ({
          word: e.word,
          sentence: e.sentence,
          shortDefinition: e.short_definition
        }))
      : vocabulary.map(e => ({
          word: e.word,
          sentence: e.original_sentence,
          shortDefinition: e.short_definition
        }));

    if (entriesToExport.length === 0) {
      alert('No entries to export');
      return;
    }

    setExporting(true);
    try {
      const result = await window.electronAPI.vocabulary.export(exportType, entriesToExport);
      if (result.success) {
        alert(`Exported ${entriesToExport.length} entries to:\n${result.filePath}`);
      } else if (!result.cancelled) {
        alert(`Export failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Get session entries for session tab
  const sessionEntries = activeTab === 'session'
    ? getSessionEntries({ bookId: selectedBookId ?? undefined })
    : [];

  const sessionCounts = getSessionCounts(selectedBookId ?? undefined);

  // Combined counts for tabs
  const tabCounts = {
    ...counts,
    session: selectedBookId ? sessionCounts.word + sessionCounts.phrasal_verb + sessionCounts.word_group : totalSessionCount,
  };

  // Get entries to display based on active tab
  const displayEntries = activeTab === 'session' ? sessionEntries : vocabulary;

  const getTabTitle = () => {
    switch (activeTab) {
      case 'word': return 'Words';
      case 'phrasal_verb': return 'Phrasal Verbs';
      case 'word_group': return 'Word Groups';
      case 'session': return 'Session Vocabulary';
    }
  };

  const getEmptyMessage = () => {
    switch (activeTab) {
      case 'word': return 'Click on words while reading to add them here';
      case 'phrasal_verb': return 'Select phrasal verbs (like "give up") while reading';
      case 'word_group': return 'Select word groups while reading';
      case 'session': return 'Words you look up this session will appear here';
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-cream-100">Your Vocabulary</h2>
        <div className="flex items-center gap-2">
          <BookFilter
            books={books}
            selectedBookId={selectedBookId}
            onBookChange={handleBookChange}
          />
          <button
            ref={exportButtonRef}
            onClick={handleExportButtonClick}
            disabled={exporting || displayEntries.length === 0}
            className="px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            title="Export vocabulary"
          >
            {exporting ? 'Exporting...' : (
              <>
                Export Words
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      <VocabularyTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        counts={tabCounts}
      />

      {/* Search - only show for persistent tabs */}
      {activeTab !== 'session' && (
        <div className="mb-6">
          <input
            type="text"
            placeholder={`Search ${getTabTitle().toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-cream-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>
      )}

      {loading && activeTab !== 'session' ? (
        <div className="text-center py-12 text-gray-500 dark:text-cream-300">
          Loading vocabulary...
        </div>
      ) : displayEntries.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">
            {activeTab === 'session' ? '⏱️' : activeTab === 'phrasal_verb' ? '🔗' : activeTab === 'word_group' ? '📚' : '📝'}
          </div>
          <h3 className="text-xl font-medium text-gray-700 dark:text-cream-200 mb-2">
            No {getTabTitle().toLowerCase()} yet
          </h3>
          <p className="text-gray-500 dark:text-cream-300">
            {getEmptyMessage()}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeTab === 'session' ? (
            // Session entries (from context)
            sessionEntries.map((entry, index) => (
              <div key={`session-${index}`} className={`card ${
                entry.word_type === 'phrasal_verb'
                  ? 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-400'
                  : entry.word_type === 'word_group'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400'
                  : 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-800 dark:text-cream-100">
                        {entry.word}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        entry.word_type === 'phrasal_verb'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                          : entry.word_type === 'word_group'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      }`}>
                        {entry.word_type === 'phrasal_verb' ? 'Phrasal Verb' : entry.word_type === 'word_group' ? 'Word Group' : 'Word'}
                      </span>
                    </div>
                    {entry.short_definition && (
                      <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded border-l-2 border-blue-500">
                        <p className="text-base font-semibold text-blue-900 dark:text-blue-100">
                          {entry.short_definition}
                        </p>
                      </div>
                    )}
                    {entry.meaning && (
                      <p className="text-gray-600 dark:text-cream-200 mb-2">{entry.meaning}</p>
                    )}
                    {entry.sentence && (
                      <div className="text-sm text-gray-500 dark:text-cream-300 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                        <span className="font-medium">Context:</span>{' '}
                        "{entry.sentence}"
                      </div>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 dark:text-cream-400">
                      <span>Added {new Date(entry.timestamp).toLocaleTimeString()}</span>
                      {entry.book_title && <span>From: {entry.book_title}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            // Persistent entries (from database)
            vocabulary.map((entry) => (
              <div key={entry.id} className={`card ${
                entry.word_type === 'phrasal_verb'
                  ? 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-400'
                  : entry.word_type === 'word_group'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400'
                  : 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400'
              }`}>
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
                    {entry.short_definition && (
                      <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded border-l-2 border-blue-500">
                        <p className="text-base font-semibold text-blue-900 dark:text-blue-100">
                          {entry.short_definition}
                        </p>
                      </div>
                    )}
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
            ))
          )}
        </div>
      )}

      {/* Export Context Menu */}
      {showExportMenu && (
        <ExportContextMenu
          x={exportMenuPosition.x}
          y={exportMenuPosition.y}
          onExportSelect={handleExport}
          onClose={() => setShowExportMenu(false)}
          entriesCount={displayEntries.length}
        />
      )}
    </div>
  );
};

export default VocabularyPage;
