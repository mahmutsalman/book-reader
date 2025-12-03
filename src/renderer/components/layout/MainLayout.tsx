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
    <div className="h-full flex flex-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header
        className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between"
        style={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="text-2xl" style={{ fontSize: '24px' }}>📚</span>
          <h1
            className="text-xl font-semibold text-gray-800"
            style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937' }}
          >
            Book Reader
          </h1>
        </div>

        <nav className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NavLink
            to="/library"
            className={navLinkClass}
            style={({ isActive }) => ({
              padding: '8px 16px',
              borderRadius: '8px',
              textDecoration: 'none',
              backgroundColor: isActive ? '#0284c7' : 'transparent',
              color: isActive ? 'white' : '#4b5563',
            })}
          >
            Library
          </NavLink>
          <NavLink
            to="/vocabulary"
            className={navLinkClass}
            style={({ isActive }) => ({
              padding: '8px 16px',
              borderRadius: '8px',
              textDecoration: 'none',
              backgroundColor: isActive ? '#0284c7' : 'transparent',
              color: isActive ? 'white' : '#4b5563',
            })}
          >
            Vocabulary
          </NavLink>
          <NavLink
            to="/settings"
            className={navLinkClass}
            style={({ isActive }) => ({
              padding: '8px 16px',
              borderRadius: '8px',
              textDecoration: 'none',
              backgroundColor: isActive ? '#0284c7' : 'transparent',
              color: isActive ? 'white' : '#4b5563',
            })}
          >
            Settings
          </NavLink>
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto" style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
