import React, { useState, useEffect, useCallback } from 'react';
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
import UpdateNotification from './components/UpdateNotification';
import type { UpdateCheckResult } from '../shared/types/update.types';

// Inner component that uses the theme hook (must be inside SettingsProvider)
const AppContent: React.FC = () => {
  // Apply theme based on settings
  useTheme();

  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Check for updates on startup
  useEffect(() => {
    const checkForUpdates = async () => {
      if (!window.electronAPI?.update) return;

      try {
        // Check if auto-check is enabled
        const prefsResponse = await window.electronAPI.update.getPreferences();
        if (!prefsResponse.success || !prefsResponse.preferences?.autoCheckEnabled) {
          return;
        }

        // Check for updates
        const response = await window.electronAPI.update.check();
        if (response.success && response.result?.updateAvailable) {
          setUpdateInfo(response.result);
          setShowUpdateModal(true);
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    // Delay the check slightly to not slow down startup
    const timeout = setTimeout(checkForUpdates, 3000);
    return () => clearTimeout(timeout);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!window.electronAPI?.update || !updateInfo?.downloadUrl) return;

    try {
      await window.electronAPI.update.openUrl(updateInfo.downloadUrl);
    } catch (error) {
      console.error('Failed to open download URL:', error);
    } finally {
      setShowUpdateModal(false);
    }
  }, [updateInfo]);

  const handleSkip = useCallback(async () => {
    if (!window.electronAPI?.update || !updateInfo?.latestVersion) return;

    try {
      await window.electronAPI.update.skipVersion(updateInfo.latestVersion);
    } catch (error) {
      console.error('Failed to skip version:', error);
    } finally {
      setShowUpdateModal(false);
    }
  }, [updateInfo]);

  const handleRemindLater = useCallback(() => {
    setShowUpdateModal(false);
  }, []);

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

            {/* Update Notification Modal */}
            {showUpdateModal && updateInfo && (
              <UpdateNotification
                updateInfo={updateInfo}
                onDownload={handleDownload}
                onSkip={handleSkip}
                onRemindLater={handleRemindLater}
              />
            )}
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
