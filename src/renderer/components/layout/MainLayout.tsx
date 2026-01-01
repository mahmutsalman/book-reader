import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useFocusMode } from '../../context/FocusModeContext';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha, getContrastColor } from '../../utils/colorUtils';

const MainLayout: React.FC = () => {
  const { isFocusMode } = useFocusMode();
  const theme = useReaderTheme();
  const navLinkBaseClass = 'px-4 py-2 rounded-lg transition-colors no-underline';
  const navHoverColor = theme.wordHover || addAlpha(theme.panel, 0.4);

  return (
    <div className="h-full flex flex-col">
      {/* Header - pl-20 accounts for macOS traffic light buttons, app-drag enables window dragging */}
      <header
        className="app-drag border-b pl-20 pr-6 py-3 flex items-center justify-between"
        style={{
          backgroundColor: theme.panel,
          borderBottomColor: theme.panelBorder,
          color: theme.text,
        }}
      >
        <div className="flex items-center gap-2">
          {!isFocusMode && (
            <>
              <span className="text-2xl">📚</span>
              <h1 className="text-xl font-semibold" style={{ color: theme.accent }}>
                Smart Book
              </h1>
            </>
          )}
        </div>

        <nav className="app-no-drag flex items-center gap-2">
          <NavLink
            to="/library"
            className={navLinkBaseClass}
            style={({ isActive }) => ({
              backgroundColor: isActive ? theme.accent : 'transparent',
              color: isActive ? getContrastColor(theme.accent) : theme.textSecondary,
            })}
            onMouseEnter={(event) => {
              const target = event.currentTarget;
              if (target.getAttribute('aria-current') !== 'page') {
                target.style.backgroundColor = navHoverColor;
              }
            }}
            onMouseLeave={(event) => {
              const target = event.currentTarget;
              if (target.getAttribute('aria-current') !== 'page') {
                target.style.backgroundColor = 'transparent';
              }
            }}
          >
            Library
          </NavLink>
          <NavLink
            to="/vocabulary"
            className={navLinkBaseClass}
            style={({ isActive }) => ({
              backgroundColor: isActive ? theme.accent : 'transparent',
              color: isActive ? getContrastColor(theme.accent) : theme.textSecondary,
            })}
            onMouseEnter={(event) => {
              const target = event.currentTarget;
              if (target.getAttribute('aria-current') !== 'page') {
                target.style.backgroundColor = navHoverColor;
              }
            }}
            onMouseLeave={(event) => {
              const target = event.currentTarget;
              if (target.getAttribute('aria-current') !== 'page') {
                target.style.backgroundColor = 'transparent';
              }
            }}
          >
            Vocabulary
          </NavLink>
          <NavLink
            to="/settings"
            className={navLinkBaseClass}
            style={({ isActive }) => ({
              backgroundColor: isActive ? theme.accent : 'transparent',
              color: isActive ? getContrastColor(theme.accent) : theme.textSecondary,
            })}
            onMouseEnter={(event) => {
              const target = event.currentTarget;
              if (target.getAttribute('aria-current') !== 'page') {
                target.style.backgroundColor = navHoverColor;
              }
            }}
            onMouseLeave={(event) => {
              const target = event.currentTarget;
              if (target.getAttribute('aria-current') !== 'page') {
                target.style.backgroundColor = 'transparent';
              }
            }}
          >
            Settings
          </NavLink>
        </nav>
      </header>

      {/* Main content */}
      <main
        className="flex-1 overflow-auto"
        style={{ backgroundColor: theme.background, color: theme.text }}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
