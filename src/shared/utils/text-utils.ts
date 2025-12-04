/**
 * Text utilities for Unicode-aware word processing
 * Supports all Unicode scripts including Cyrillic (Russian), Greek, Arabic, etc.
 */

/**
 * Clean a word by removing punctuation while preserving Unicode letters and numbers.
 * Also converts to lowercase for consistent matching.
 *
 * Uses Unicode property escapes:
 * - \p{L} matches any Unicode letter (Latin, Cyrillic, Greek, etc.)
 * - \p{N} matches any Unicode number
 *
 * Normalizes various apostrophe-like characters to straight apostrophe:
 * - ' ' (U+2018, U+2019) curly/smart quotes
 * - ` ´ (U+0060, U+00B4) grave/acute accents
 * - ʼ ʻ (U+02BC, U+02BB) modifier letters
 * - ′ (U+2032) prime
 * - ‛ (U+201B) reversed quote
 *
 * Also strips leading/trailing non-letters to handle:
 * - Opening quotes: 'Don't → Don't (dialogue start)
 * - Closing quotes: hello' → hello
 * - Other punctuation: hello, → hello
 *
 * @param word - The word to clean
 * @returns Cleaned lowercase word with only letters, numbers, hyphens, and internal apostrophes
 */
export function cleanWord(word: string): string {
  // Normalize various apostrophe-like characters to straight apostrophe
  const normalized = word.replace(/[''`´ʼʻ′‛]/g, "'");

  // Strip leading/trailing non-letters (removes opening/closing quotes, punctuation)
  // This handles "'Don't" → "Don't" and "hello," → "hello"
  const stripped = normalized
    .replace(/^[^\p{L}]+/u, '')  // Remove leading non-letters
    .replace(/[^\p{L}]+$/u, ''); // Remove trailing non-letters

  // Keep internal letters, numbers, hyphens, and apostrophes
  return stripped.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();
}

/**
 * Get the Unicode-aware word boundary pattern string (without escaping or compiling).
 * Use this when you need to embed the pattern in a larger regex (e.g., with capture groups).
 *
 * @param escapedWord - The word to create a pattern for (should already be regex-escaped)
 * @returns Pattern string with Unicode word boundaries
 */
export function getWordBoundaryPattern(escapedWord: string): string {
  // Use negative lookbehind/lookahead for Unicode word boundaries
  // (?<![\p{L}\p{N}]) - not preceded by a letter or number
  // (?![\p{L}\p{N}]) - not followed by a letter or number
  return `(?<![\\p{L}\\p{N}])${escapedWord}(?![\\p{L}\\p{N}])`;
}

/**
 * Create a Unicode-aware word boundary regex for matching whole words.
 *
 * JavaScript's \b word boundary only works with ASCII characters.
 * This function uses negative lookbehind/lookahead with Unicode property escapes
 * to properly match word boundaries in any script.
 *
 * @param word - The word to create a regex for
 * @param flags - Regex flags (default: 'gi' for global case-insensitive)
 * @returns RegExp that matches the word at word boundaries in any Unicode script
 */
export function createWordBoundaryRegex(word: string, flags = 'gi'): RegExp {
  // Escape special regex characters in the word
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Get the Unicode-aware word boundary pattern
  const pattern = getWordBoundaryPattern(escaped);

  // Ensure 'u' flag is present for Unicode support
  const finalFlags = flags.includes('u') ? flags : flags + 'u';

  return new RegExp(pattern, finalFlags);
}
