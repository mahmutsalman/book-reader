import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';

const MainLayout: React.FC = () => {
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-lg transition-colors ${
      isActive
        ? 'bg-primary-600 text-white'
        : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📚</span>
          <h1 className="text-xl font-semibold text-gray-800">Book Reader</h1>
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
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
