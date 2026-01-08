# Media Assets

This directory contains visual assets for documentation and GitHub presentation.

## Structure

- **`demos/`** - GIF demonstrations of key features
- **`screenshots/`** - Static images (optional future use)

## Demo GIFs

Demo GIFs showcase the application's key features:

- `book-reading-demo.gif` - Main reading interface and navigation
- `dictionary-lookup-demo.gif` - AI-powered word lookup feature
- `vocabulary-tracking-demo.gif` - Vocabulary management system
- `text-wrapping-demo.gif` - Dynamic text wrapping in action
- `file-opening-demo.gif` - Opening and importing books

## Guidelines

### Recording Demos
- **Resolution**: 1280x720 or 1920x1080 for clarity
- **Duration**: 5-15 seconds per GIF (keep file sizes reasonable)
- **Frame Rate**: 10-15 fps (balances quality and file size)
- **File Size**: Target <5MB per GIF (use optimization tools if needed)

### Naming Convention
- Use lowercase with hyphens: `feature-name-demo.gif`
- Be descriptive: what feature does it show?
- End with `-demo.gif` for consistency

### Optimization Tools
- [gifski](https://gif.ski/) - High-quality GIF encoder
- [ezgif.com](https://ezgif.com/optimize) - Online GIF optimizer
- [gifsicle](https://www.lcdf.org/gifsicle/) - Command-line GIF optimizer

## Usage in Documentation

Reference in README.md using relative paths:

```markdown
![Feature Demo](.github/media/demos/feature-name-demo.gif)
```

Or with alt text and title:

```markdown
![Dictionary Lookup](.github/media/demos/dictionary-lookup-demo.gif "AI-powered word lookup in action")
```
