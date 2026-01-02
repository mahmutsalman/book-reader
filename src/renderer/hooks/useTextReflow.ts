import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { BookData, BookPage } from '../../shared/types';
import { REFLOW_SETTINGS } from '../../shared/constants';

interface ReflowState {
  currentText: string;
  currentPageIndex: number;
  totalPages: number;
  totalCharacters: number;
  characterOffset: number;
  chapterName: string | null;
  originalPage: number;
}

interface UseTextReflowOptions {
  bookData: BookData;
  containerRef: React.RefObject<HTMLDivElement>;
  zoom: number;
  initialCharacterOffset?: number;
  initialProgressPercentage?: number;
}

interface UseTextReflowReturn {
  state: ReflowState;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  goToPageIndex: (pageIndex: number) => void;
  goToCharacterOffset: (offset: number) => void;
  goToOriginalPage: (pageNum: number) => void;
  reflowPages: () => void;
}

// Combine all text from book pages into one continuous string
function buildFullText(pages: BookPage[]): string {
  return pages.map(p => p.text || '').join('\n\n');
}

// Build a mapping from character offset to original page info
function buildPageMap(pages: BookPage[]): { offset: number; page: BookPage }[] {
  const map: { offset: number; page: BookPage }[] = [];
  let offset = 0;

  for (const page of pages) {
    map.push({ offset, page });
    offset += (page.text || '').length + 2; // +2 for \n\n separator
  }

  return map;
}

// Find which original page a character offset belongs to
function findOriginalPage(offset: number, pageMap: { offset: number; page: BookPage }[]): BookPage | null {
  for (let i = pageMap.length - 1; i >= 0; i--) {
    if (offset >= pageMap[i].offset) {
      return pageMap[i].page;
    }
  }
  return pageMap[0]?.page || null;
}

// Measure how many characters fit in the container
function measureTextCapacity(
  container: HTMLDivElement,
  fontSize: number,
  lineHeight: number
): number {
  const containerHeight = container.clientHeight;
  const containerWidth = container.clientWidth;

  // Estimate characters per line based on average character width
  // Using a conservative estimate for serif fonts (0.5em average width)
  const avgCharWidth = fontSize * 0.5;
  const charsPerLine = Math.floor(containerWidth / avgCharWidth);

  // Calculate lines that fit
  const lineHeightPx = fontSize * lineHeight;
  const linesPerPage = Math.floor(containerHeight / lineHeightPx);

  // Total characters with some buffer for word wrapping
  const capacity = Math.floor(charsPerLine * linesPerPage * 0.85);

  return Math.max(capacity, 100); // Minimum 100 chars
}

// Split text into pages based on capacity
function paginateText(fullText: string, capacity: number): string[] {
  if (!fullText || capacity <= 0) return [''];

  const pages: string[] = [];
  let remaining = fullText;

  while (remaining.length > 0) {
    if (remaining.length <= capacity) {
      pages.push(remaining.trim());
      break;
    }

    // Find a good break point (end of sentence or word)
    let breakPoint = capacity;

    // Try to break at end of sentence
    const sentenceEnd = remaining.lastIndexOf('. ', breakPoint);
    if (sentenceEnd > capacity * 0.5) {
      breakPoint = sentenceEnd + 1;
    } else {
      // Break at end of word
      const wordEnd = remaining.lastIndexOf(' ', breakPoint);
      if (wordEnd > capacity * 0.5) {
        breakPoint = wordEnd;
      }
    }

    pages.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }

  return pages.length > 0 ? pages : [''];
}

export function useTextReflow({
  bookData,
  containerRef,
  zoom,
  initialCharacterOffset = 0,
  initialProgressPercentage,
}: UseTextReflowOptions): UseTextReflowReturn {
  const [state, setState] = useState<ReflowState>({
    currentText: '',
    currentPageIndex: 0,
    totalPages: 1,
    totalCharacters: 0,
    characterOffset: initialCharacterOffset,
    chapterName: null,
    originalPage: 1,
  });

  const pagesRef = useRef<string[]>([]);
  const pageOffsetsRef = useRef<number[]>([]);
  const fullTextRef = useRef<string>('');
  const pageMapRef = useRef<{ offset: number; page: BookPage }[]>([]);

  // Use ref for characterOffset in reflow calculations to decouple navigation from re-pagination
  // This prevents navigation from triggering unnecessary reflows
  const characterOffsetRef = useRef<number>(initialCharacterOffset);

  // Build full text and page map once
  // Also calculate initial character offset from percentage if provided (more stable than absolute offset)
  useEffect(() => {
    fullTextRef.current = buildFullText(bookData.pages);
    pageMapRef.current = buildPageMap(bookData.pages);

    // If percentage is provided and valid, use it to calculate the initial character offset
    // This provides stable position restoration regardless of pagination changes
    if (initialProgressPercentage && initialProgressPercentage > 0 && fullTextRef.current.length > 0) {
      const calculatedOffset = Math.floor(fullTextRef.current.length * initialProgressPercentage);
      characterOffsetRef.current = Math.min(calculatedOffset, fullTextRef.current.length);
    }
  }, [bookData, initialProgressPercentage]);

  // Calculate font size from zoom
  const fontSize = useMemo(() => REFLOW_SETTINGS.BASE_FONT_SIZE * zoom, [zoom]);

  // Reflow text when zoom or container changes (NOT when navigating)
  // Uses characterOffsetRef to decouple navigation from re-pagination
  const reflowPages = useCallback(() => {
    const container = containerRef.current;
    if (!container || !fullTextRef.current) return;

    const capacity = measureTextCapacity(
      container,
      fontSize,
      REFLOW_SETTINGS.LINE_HEIGHT
    );

    // Paginate the text
    const pages = paginateText(fullTextRef.current, capacity);
    pagesRef.current = pages;

    // Build offset map for each page
    const offsets: number[] = [];
    let offset = 0;
    for (const page of pages) {
      offsets.push(offset);
      offset += page.length;
    }
    pageOffsetsRef.current = offsets;

    // Find which page contains the current character offset (using ref, not state)
    let newPageIndex = 0;
    for (let i = offsets.length - 1; i >= 0; i--) {
      if (characterOffsetRef.current >= offsets[i]) {
        newPageIndex = i;
        break;
      }
    }

    // Update state
    const currentPage = pages[newPageIndex] || '';
    const currentOffset = offsets[newPageIndex] || 0;
    const originalPage = findOriginalPage(currentOffset, pageMapRef.current);

    setState(prev => ({
      ...prev,
      currentText: currentPage,
      currentPageIndex: newPageIndex,
      totalPages: pages.length,
      totalCharacters: fullTextRef.current.length,
      characterOffset: characterOffsetRef.current, // Sync state with ref
      chapterName: originalPage?.chapter || null,
      originalPage: originalPage?.page || 1,
    }));
  }, [containerRef, fontSize]); // Removed state.characterOffset - navigation won't trigger reflow

  // Reflow on mount and when dependencies change
  // Note: Window resize listener removed intentionally to keep word count stable.
  // Layout uses fixed width container with horizontal scroll instead.
  useEffect(() => {
    reflowPages();
  }, [reflowPages]);

  // Navigation functions - update ref first, then state (no reflow triggered)
  const goToNextPage = useCallback(() => {
    const nextIndex = state.currentPageIndex + 1;
    if (nextIndex >= pagesRef.current.length) return;

    const newOffset = pageOffsetsRef.current[nextIndex] || 0;
    characterOffsetRef.current = newOffset; // Update ref first
    const originalPage = findOriginalPage(newOffset, pageMapRef.current);

    setState(prev => ({
      ...prev,
      currentPageIndex: nextIndex,
      currentText: pagesRef.current[nextIndex] || '',
      characterOffset: newOffset,
      chapterName: originalPage?.chapter || null,
      originalPage: originalPage?.page || 1,
    }));
  }, [state.currentPageIndex]);

  const goToPrevPage = useCallback(() => {
    const prevIndex = state.currentPageIndex - 1;
    if (prevIndex < 0) return;

    const newOffset = pageOffsetsRef.current[prevIndex] || 0;
    characterOffsetRef.current = newOffset; // Update ref first
    const originalPage = findOriginalPage(newOffset, pageMapRef.current);

    setState(prev => ({
      ...prev,
      currentPageIndex: prevIndex,
      currentText: pagesRef.current[prevIndex] || '',
      characterOffset: newOffset,
      chapterName: originalPage?.chapter || null,
      originalPage: originalPage?.page || 1,
    }));
  }, [state.currentPageIndex]);

  const goToPageIndex = useCallback((pageIndex: number) => {
    const maxIndex = pagesRef.current.length - 1;
    if (maxIndex < 0) return;
    const clampedIndex = Math.max(0, Math.min(pageIndex, maxIndex));
    const newOffset = pageOffsetsRef.current[clampedIndex] || 0;
    characterOffsetRef.current = newOffset; // Update ref first
    const originalPage = findOriginalPage(newOffset, pageMapRef.current);

    setState(prev => ({
      ...prev,
      currentPageIndex: clampedIndex,
      currentText: pagesRef.current[clampedIndex] || '',
      characterOffset: newOffset,
      chapterName: originalPage?.chapter || null,
      originalPage: originalPage?.page || 1,
    }));
  }, []);

  const goToCharacterOffset = useCallback((offset: number) => {
    const clampedOffset = Math.max(0, Math.min(offset, fullTextRef.current.length));
    characterOffsetRef.current = clampedOffset; // Update ref first
    setState(prev => ({
      ...prev,
      characterOffset: clampedOffset,
    }));
    // Reflow will happen via effect (triggered by reflowPages dependency on fontSize/containerRef)
    // But only if zoom or container changed, not just offset
    reflowPages();
  }, [reflowPages]);

  const goToOriginalPage = useCallback((pageNum: number) => {
    const pageEntry = pageMapRef.current.find(p => p.page.page === pageNum);
    if (pageEntry) {
      goToCharacterOffset(pageEntry.offset);
    }
  }, [goToCharacterOffset]);

  return {
    state,
    goToNextPage,
    goToPrevPage,
    goToPageIndex,
    goToCharacterOffset,
    goToOriginalPage,
    reflowPages,
  };
}

export default useTextReflow;
