import React from 'react';
import type { WordType } from '../../../shared/types';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha } from '../../utils/colorUtils';

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
  const theme = useReaderTheme();
  const tabs: { key: VocabularyTab; label: string; count: number }[] = [
    { key: 'word', label: 'Words', count: counts.word },
    { key: 'phrasal_verb', label: 'Phrasal Verbs', count: counts.phrasal_verb },
    { key: 'word_group', label: 'Word Groups', count: counts.word_group },
    { key: 'session', label: 'Session', count: counts.session },
  ];

  return (
    <div
      className="flex border-b mb-4 overflow-x-auto"
      style={{ borderBottomColor: theme.border }}
    >
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className="px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border-b-2"
          style={{
            color: activeTab === tab.key ? theme.accent : theme.textSecondary,
            borderBottomColor: activeTab === tab.key ? theme.accent : 'transparent',
          }}
        >
          {tab.label}
          <span
            className="ml-2 px-2 py-0.5 text-xs rounded-full"
            style={{
              backgroundColor: activeTab === tab.key ? addAlpha(theme.accent, 0.2) : theme.panel,
              color: activeTab === tab.key ? theme.accent : theme.textSecondary,
            }}
          >
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
};

export default VocabularyTabs;
