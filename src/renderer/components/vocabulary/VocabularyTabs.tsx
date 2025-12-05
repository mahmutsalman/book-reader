import React from 'react';
import type { WordType } from '../../../shared/types';

export type VocabularyTab = WordType | 'session';

interface VocabularyTabsProps {
  activeTab: VocabularyTab;
  onTabChange: (tab: VocabularyTab) => void;
  counts: {
    word: number;
    phrasal_verb: number;
    word_group: number;
    session: number;
  };
}

const VocabularyTabs: React.FC<VocabularyTabsProps> = ({ activeTab, onTabChange, counts }) => {
  const tabs: { key: VocabularyTab; label: string; count: number }[] = [
    { key: 'word', label: 'Words', count: counts.word },
    { key: 'phrasal_verb', label: 'Phrasal Verbs', count: counts.phrasal_verb },
    { key: 'word_group', label: 'Word Groups', count: counts.word_group },
    { key: 'session', label: 'Session', count: counts.session },
  ];

  return (
    <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === tab.key
              ? 'text-primary-600 border-b-2 border-primary-600 dark:text-primary-400 dark:border-primary-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-cream-300 dark:hover:text-cream-100'
          }`}
        >
          {tab.label}
          <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
            activeTab === tab.key
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-cream-300'
          }`}>
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
};

export default VocabularyTabs;
