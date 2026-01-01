import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SettingsProvider } from './context/SettingsContext';
import { FocusModeProvider } from './context/FocusModeContext';
import { BookProvider } from './context/BookContext';
import { DeferredWordProvider } from './context/DeferredWordContext';
import { SessionVocabularyProvider } from './context/SessionVocabularyContext';
import { useTheme } from './hooks/useTheme';
import MainLayout from './components/layout/MainLayout';
import LibraryPage from './pages/LibraryPage';
import ReaderPage from './pages/ReaderPage';
import VocabularyPage from './pages/VocabularyPage';
import SettingsPage from './pages/SettingsPage';

// Inner component that uses the theme hook (must be inside SettingsProvider)
const AppContent: React.FC = () => {
  // Apply theme based on settings
  useTheme();

  return (
    <FocusModeProvider>
      <BookProvider>
        <DeferredWordProvider>
          <SessionVocabularyProvider>
            <Routes>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Navigate to="/library" replace />} />
                <Route path="library" element={<LibraryPage />} />
                <Route path="reader/:bookId" element={<ReaderPage />} />
                <Route path="vocabulary" element={<VocabularyPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </SessionVocabularyProvider>
        </DeferredWordProvider>
      </BookProvider>
    </FocusModeProvider>
  );
};

const App: React.FC = () => {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
};

export default App;
