# [Feature] Implement Startup Splash Screen with Progress Indicators

**Labels:** `enhancement`, `UX`, `cross-platform`

## 🎯 Problem Statement

When launching the production app, users see no visual feedback during the ~12-second initialization process. This creates uncertainty about whether the app is working correctly.

**Current Experience:**
```
User clicks app icon → Nothing visible → App suddenly appears after 12s
```

**What's happening behind the scenes (from console logs):**
```
Database path: C:\Users\asxdc\AppData\Roaming\Smart Book\bookreader.db
Database initialized
[Migration] API keys already migrated to secure storage
[PythonManager] Cleaning up port 8766...
[PythonManager] Waiting for server to be ready...
[PythonManager] Still waiting... 2.3s elapsed (5 attempts)
[PythonManager] Still waiting... 4.8s elapsed (10 attempts)
[PythonManager] Still waiting... 7.4s elapsed (15 attempts)
[PythonManager] Still waiting... 10.0s elapsed (20 attempts)
[PythonManager] Server ready after 12.1s (24 attempts)
```

Users have no visibility into these steps, causing concern that the app isn't working.

---

## 💡 Proposed Solution

Create a modal splash screen that:

1. ✅ **Appears Immediately** - Shows as soon as the app is clicked
2. 📊 **Real-time Progress** - Displays initialization steps as they happen
3. ⏱️ **Visual Feedback** - Progress bar, status messages, step completion indicators
4. 🚀 **Auto-dismiss** - Closes automatically when initialization completes
5. 🌍 **Cross-platform** - Works on both Windows and macOS

---

## 🎨 Design Mockup

```
┌──────────────────────────────────────────────┐
│                                              │
│           📚 Smart Book Reader               │
│                                              │
│      ██████████████████████░░░░░ 75%         │
│                                              │
│      ✅ Database initialized                 │
│      ✅ Migrations complete                  │
│      ✅ Ports cleaned up                     │
│      🔄 Starting pronunciation server...     │
│      ⭕ Verifying server health              │
│      ⭕ Application ready                    │
│                                              │
│           Please wait... (~5s)               │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 🛠️ Technical Implementation

### Initialization Steps to Track

| Step | Label | Trigger Point |
|------|-------|---------------|
| 1 | Database initialized | After `database.js` init |
| 2 | Migrations complete | After migration check |
| 3 | Ports cleaned up | After port cleanup |
| 4 | Starting pronunciation server | During `pythonManager.js` startup |
| 5 | Verifying server health | During health check loop |
| 6 | Application ready | After all systems ready |

### Files to Modify

```
src/main.js              → Create splash window, coordinate closing
src/database.js          → Send 'database-ready' event
src/pythonManager.js     → Send progress updates during server startup
src/main/ipc.js          → Add splash progress IPC handlers
src/splash/              → New directory for splash screen HTML/CSS/JS
```

### IPC Events

```javascript
// Main → Splash
'splash:update' → { step: string, status: 'pending'|'active'|'complete', progress: number }
'splash:error' → { step: string, error: string }

// Splash → Main
'splash:ready' → Splash window loaded
'splash:skip' → User wants to skip (for errors)
```

---

## ✅ Acceptance Criteria

- [ ] Splash screen appears within 100ms of app launch
- [ ] All 6 initialization steps are tracked and displayed
- [ ] Progress bar updates from 0% to 100%
- [ ] Each step shows visual status indicator (⭕→🔄→✅)
- [ ] Server wait times are reflected in progress (longest step)
- [ ] Splash auto-closes when initialization completes
- [ ] Works on both Windows and macOS
- [ ] Handles errors gracefully (shows error + retry option)
- [ ] Splash window is centered on screen
- [ ] No performance degradation during startup

---

## 🎯 Priority & Effort

**Priority:** Medium-High (affects every app launch)
**Estimated Effort:** 4-6 hours
- Splash window creation: 1h
- Progress tracking integration: 2-3h
- UI/styling: 1h
- Cross-platform testing: 1-2h

---

## 📝 Additional Notes

### Error Handling
- If server fails after 30s → Show error with "Retry" button
- If database fails → Show critical error, prevent app start
- Non-critical errors → Allow "Continue Anyway" option

### Performance Considerations
- Keep splash HTML minimal (<50KB)
- Use CSS animations (GPU accelerated)
- Preload in `index.html` to avoid flash

### Accessibility
- Screen reader announcements for each step
- High contrast mode support
- Clear error messages

---

**Affects Platforms:** Windows, macOS
**Related to:** UX, Electron, Initialization

---

### To create this issue on GitHub:
1. Go to your repository's Issues tab
2. Click "New Issue"
3. Copy and paste this entire content
4. Add labels: `enhancement`, `UX`, `cross-platform`
5. Submit
