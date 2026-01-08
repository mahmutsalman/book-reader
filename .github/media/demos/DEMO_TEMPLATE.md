# Demo GIF Template for README

Add this section to your README.md after the **Features** section (around line 17) to showcase your app in action.

## Suggested README Section

```markdown
## 🎬 See It in Action

<div align="center">

### 📖 Reading & Navigation
![Reading Demo](.github/media/demos/book-reading-demo.gif)
*Smooth page navigation and dynamic text wrapping*

---

### 🔍 AI-Powered Dictionary Lookup
![Dictionary Lookup Demo](.github/media/demos/dictionary-lookup-demo.gif)
*Instant definitions with context and pronunciation*

---

### 📚 Vocabulary Tracking
![Vocabulary Demo](.github/media/demos/vocabulary-tracking-demo.gif)
*Build and manage your personal vocabulary library*

---

### 🎯 Manga OCR in Action
![OCR Demo](.github/media/demos/manga-ocr-demo.gif)
*Draw a rectangle to extract text from images*

</div>
```

## Recording Tips

### Tools for Screen Recording
- **macOS**: QuickTime Player (Cmd+Shift+5) or Screenshot.app
- **Windows**: Xbox Game Bar (Win+G) or OBS Studio
- **Linux**: SimpleScreenRecorder or Kazam

### Recommended GIF Converters
```bash
# Using ffmpeg (best quality)
ffmpeg -i recording.mov -vf "fps=15,scale=1280:-1:flags=lanczos" -c:v gif output.gif

# Or use online tools:
# - https://ezgif.com/video-to-gif
# - https://cloudconvert.com/mov-to-gif
```

### Recording Checklist
- ✅ Clean, distraction-free UI
- ✅ 5-15 second duration per demo
- ✅ Show one feature clearly
- ✅ 1280x720 or 1920x1080 resolution
- ✅ Keep file size under 5MB
- ✅ Use consistent theme/settings across demos

## Feature Suggestions to Demo

1. **`book-reading-demo.gif`**
   - Open a book
   - Navigate between pages
   - Show smooth text wrapping

2. **`dictionary-lookup-demo.gif`**
   - Click on a word
   - Show AI definition appearing
   - Display pronunciation and IPA

3. **`vocabulary-tracking-demo.gif`**
   - Navigate to vocabulary section
   - Show saved words
   - Demonstrate search/filter

4. **`manga-ocr-demo.gif`**
   - Open a manga/comic page
   - Draw OCR selection rectangle
   - Show extracted text

5. **`theme-switching-demo.gif`** (optional)
   - Switch between reading themes
   - Show adaptive adjustments
