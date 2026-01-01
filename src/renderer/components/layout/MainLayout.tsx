import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useFocusMode } from '../../context/FocusModeContext';

const MainLayout: React.FC = () => {
  const { isFocusMode } = useFocusMode();
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-lg transition-colors no-underline ${
      isActive
        ? 'bg-primary-600 text-white'
        : 'text-gray-600 dark:text-cream-200 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`;

  return (
    <div className="h-full flex flex-col">
      {/* Header - pl-20 accounts for macOS traffic light buttons, app-drag enables window dragging */}
      <header className="app-drag bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 pl-20 pr-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isFocusMode && (
            <>
              <span className="text-2xl">📚</span>
              <h1 className="text-xl font-semibold text-gray-800 dark:text-cream-100">
                Smart Book
              </h1>
            </>
          )}
        </div>

        <nav className="app-no-drag flex items-center gap-2">
          <NavLink to="/library" className={navLinkClass}>
            Library
          </NavLink>
          <NavLink to="/vocabulary" className={navLinkClass}>
            Vocabulary
          </NavLink>
          <NavLink to="/settings" className={navLinkClass}>
            Settings
          </NavLink>
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
