---
name: Startup Splash Screen
about: Add initialization progress feedback during app startup
title: "[Feature] Implement Startup Splash Screen with Progress Indicators"
labels: enhancement, UX, cross-platform
assignees: ''
---

## Problem Statement

When launching the production app, users see no visual feedback during the ~12-second initialization process. This creates uncertainty about whether the app is working correctly, especially for:

- Database initialization
- Migration checks
- Python pronunciation server startup (takes 10-12 seconds)
- Port cleanup and server health checks

**Current Experience:**
```
User clicks app icon → Black screen/Nothing → App suddenly appears after 12s
```

**Observed from logs:**
```
Database initialization
Migration checks
[PythonManager] Waiting for server to be ready...
[PythonManager] Still waiting... 2.3s elapsed (5 attempts)
[PythonManager] Still waiting... 4.8s elapsed (10 attempts)
[PythonManager] Still waiting... 7.4s elapsed (15 attempts)
[PythonManager] Still waiting... 10.0s elapsed (20 attempts)
...
[PythonManager] Server ready after 12.1s (24 attempts)
```

## Proposed Solution

Implement a modal splash screen that:

1. **Appears Immediately** - Shows as soon as the app is clicked
2. **Real-time Progress** - Displays initialization steps as they happen
3. **Visual Feedback** - Progress indicators, status messages, and step completion
4. **Auto-dismiss** - Closes automatically when initialization completes
5. **Cross-platform** - Works consistently on Windows and macOS

## Technical Implementation

### 1. Splash Screen Window

```javascript
// Create splash window in main.js before mainWindow
const splash = new BrowserWindow({
  width: 500,
  height: 300,
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  center: true,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js')
  }
});
```

### 2. Initialization Steps to Track

```javascript
const initSteps = [
  { id: 'database', label: 'Initializing database...', status: 'pending' },
  { id: 'migrations', label: 'Running migrations...', status: 'pending' },
  { id: 'cleanup', label: 'Cleaning up ports...', status: 'pending' },
  { id: 'python-server', label: 'Starting pronunciation server...', status: 'pending' },
  { id: 'health-check', label: 'Verifying server health...', status: 'pending' },
  { id: 'ready', label: 'Application ready!', status: 'pending' }
];
```

### 3. IPC Communication

```javascript
// Main process sends updates
mainWindow.webContents.send('init-progress', {
  step: 'database',
  status: 'complete',
  message: 'Database initialized',
  progress: 16.6 // percentage
});

// Splash screen receives updates
ipcRenderer.on('init-progress', (event, data) => {
  updateProgressUI(data);
});
```

### 4. UI Components

**Features:**
- App logo/icon
- Progress bar (0-100%)
- Current step label
- Step-by-step checklist with status indicators
- Estimated time remaining
- Error handling (show errors if initialization fails)

## Design Mockup (ASCII)

```
┌─────────────────────────────────────────┐
│                                         │
│         📚 Smart Book Reader            │
│                                         │
│    ════════════════════ 75%             │
│                                         │
│    ✓ Database initialized               │
│    ✓ Migrations complete                │
│    ✓ Ports cleaned up                   │
│    ⏳ Starting pronunciation server...  │
│    ○ Verifying server health            │
│    ○ Application ready                  │
│                                         │
│         Please wait... (~5s)            │
│                                         │
└─────────────────────────────────────────┘
```

## Acceptance Criteria

- [ ] Splash screen appears immediately on app launch
- [ ] All initialization steps are tracked and displayed
- [ ] Progress bar updates smoothly
- [ ] Each step shows appropriate status (pending/in-progress/complete/error)
- [ ] Splash screen auto-closes when initialization completes
- [ ] Works on both Windows and macOS
- [ ] Handles initialization errors gracefully
- [ ] No performance impact on startup time
- [ ] Splash screen is properly centered on screen

## Additional Considerations

### Error Handling
- If server fails to start, show error message with retry option
- If initialization takes >30s, show warning message
- Provide "Skip" or "Continue Anyway" option for non-critical failures

### Performance
- Splash screen HTML should be minimal/lightweight
- Use CSS animations instead of JavaScript where possible
- Preload splash assets to avoid delays

### Accessibility
- Screen reader announcements for progress updates
- Keyboard navigation for any interactive elements
- High contrast mode support

## Related Files

- `src/main.js` - Main initialization logic
- `src/database.js` - Database initialization
- `src/pythonManager.js` - Python server startup
- `src/main/ipc.js` - IPC handlers

## Priority

**Medium-High** - Affects user experience on every app launch, especially important for first-time users.

## Estimated Effort

~4-6 hours
- Splash window creation: 1h
- Progress tracking integration: 2-3h
- UI/styling: 1h
- Testing (Windows/macOS): 1-2h
