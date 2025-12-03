import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';

const MainLayout: React.FC = () => {
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-lg transition-colors no-underline ${
      isActive
        ? 'bg-primary-600 text-white'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📚</span>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            Book Reader
          </h1>
        </div>

        <nav className="flex items-center gap-2">
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
