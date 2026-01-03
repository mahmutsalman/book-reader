/**
 * MangaImageView Component
 *
 * Displays manga/comic page images with interactive OCR text overlay.
 * Supports:
 * - Image display with zoom
 * - OCR text regions as clickable overlays
 * - Single word clicking
 * - Multi-word selection (Shift+click)
 * - Hover visual feedback
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ZOOM_LEVELS } from '../../../shared/constants';
import type { BookLanguage, MangaPage, OCRTextRegion } from '../../../shared/types';
import type { OCREngine } from '../../../shared/types/settings.types';

type Rect = { x: number; y: number; width: number; height: number };

interface MangaImageViewProps {
  page: MangaPage;
  zoom: number;
  bookId: number;
  bookLanguage: BookLanguage;
  ocrSelectionMode: boolean;
  ocrEngine: OCREngine;
  onOcrSelectionModeChange: (active: boolean) => void;
  onWordClick: (word: string, sentence: string, regionIndex: number, event?: React.MouseEvent) => void;
  onPhraseSelect?: (phrase: string, sentence: string) => void;
  onPhraseClick?: (phrase: string, sentence: string, indices: number[]) => void;
  onZoomChange?: (zoom: number) => void;
  className?: string;
  // Translation tracking props
  knownWords?: Set<string>;
  isWordReady?: (word: string, sentence: string, bookId: number) => boolean;
  onTranslationStatusChange?: (regionIndex: number, status: 'loading' | 'ready') => void;
}

export const MangaImageView: React.FC<MangaImageViewProps> = ({
  page,
  zoom,
  bookId,
  bookLanguage,
  ocrSelectionMode,
  ocrEngine,
  onOcrSelectionModeChange,
  onWordClick,
  onPhraseSelect,
  onPhraseClick,
  onZoomChange,
  className = '',
  knownWords,
  isWordReady,
  onTranslationStatusChange,
}) => {
  const [selectedRegions, setSelectedRegions] = useState<number[]>([]);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [hoveredRegion, setHoveredRegion] = useState<number | null>(null);
  const [ocrRegions, setOcrRegions] = useState<OCRTextRegion[]>(page.ocr_regions || []);
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [imagePath, setImagePath] = useState<string>('');
  const [imageScale, setImageScale] = useState<number>(1);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [ocrMetadata, setOcrMetadata] = useState<{
    total_extracted?: number;
    filtered_count?: number;
    filtered_out?: number;
    confidence_stats?: {
      count: number;
      min: number;
      max: number;
      avg: number;
      median: number;
      distribution: { high: number; medium: number; low: number };
    };
  } | null>(null);
  const [showOcrFeedback, setShowOcrFeedback] = useState(false);
  // Translation status tracking for OCR regions
  const [regionTranslationStatus, setRegionTranslationStatus] = useState<Map<number, 'loading' | 'ready'>>(new Map());
  // Phrase ranges for multi-word selections
  const [mangaPhraseRanges, setMangaPhraseRanges] = useState<Map<string, {
    indices: number[];
    middleIndex: number;
    phrase: string;
    status: 'loading' | 'ready';
    sentence: string;
  }>>(new Map());
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragSelectionRect, setDragSelectionRect] = useState<Rect | null>(null);
  // Pan and zoom state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const [zoomViewportHeight, setZoomViewportHeight] = useState<number | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionTransformRef = useRef<{ rect: DOMRect; zoom: number; imageScale: number } | null>(null);
  const dragStartOrderRef = useRef<number | null>(null);
  const dragStartRegionRef = useRef<number | null>(null);
  const dragActivationTimeoutRef = useRef<number | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const selectedRegionsRef = useRef<number[]>([]);
  const ocrOverridesRef = useRef<Map<number, OCRTextRegion[]>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomIndicatorTimerRef = useRef<number | null>(null);
  const previousZoomRef = useRef<number>(zoom);
  const dragRafRef = useRef<number | null>(null);
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
  
  useEffect(() => {
    selectedRegionsRef.current = selectedRegions;
  }, [selectedRegions]);

  const ocrReadingOrder = useMemo(() => {
    return ocrRegions
      .map((region, idx) => ({ idx, region }))
      .sort((a, b) => {
        const yDiff = a.region.bbox[1] - b.region.bbox[1];
        if (Math.abs(yDiff) > 20) return yDiff;
        return a.region.bbox[0] - b.region.bbox[0];
      })
      .map(item => item.idx);
  }, [ocrRegions]);

  const ocrOrderIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    ocrReadingOrder.forEach((idx, order) => map.set(idx, order));
    return map;
  }, [ocrReadingOrder]);

  const phraseInfoByIndex = useMemo(() => {
    const map = new Map<number, { phrase: string; sentence: string; status: 'loading' | 'ready'; indices: number[] }>();
    for (const [, range] of mangaPhraseRanges) {
      for (const idx of range.indices) {
        map.set(idx, {
          phrase: range.phrase,
          sentence: range.sentence,
          status: range.status,
          indices: range.indices,
        });
      }
    }
    return map;
  }, [mangaPhraseRanges]);

  useEffect(() => {
    const overrideRegions = ocrOverridesRef.current.get(page.page);
    const regions = overrideRegions || page.ocr_regions || [];
    setOcrRegions(regions);
    setSelectedRegions([]);
    setHoveredRegion(null);
    setIsDragSelecting(false);
    setDragSelectionRect(null);
    dragStartOrderRef.current = null;
    dragStartRegionRef.current = null;
    if (dragActivationTimeoutRef.current) {
      window.clearTimeout(dragActivationTimeoutRef.current);
      dragActivationTimeoutRef.current = null;
    }
  }, [page.page, page.ocr_regions]);

  useEffect(() => {
    if (ocrSelectionMode) {
      setSelectedRegions([]);
      setHoveredRegion(null);
      setIsDragSelecting(false);
      setDragSelectionRect(null);
      dragStartOrderRef.current = null;
      dragStartRegionRef.current = null;
      if (dragActivationTimeoutRef.current) {
        window.clearTimeout(dragActivationTimeoutRef.current);
        dragActivationTimeoutRef.current = null;
      }
      return;
    }
    setSelectionRect(null);
    setIsSelecting(false);
    selectionStartRef.current = null;
    selectionTransformRef.current = null;
  }, [ocrSelectionMode]);

  const clampZoom = useCallback((nextZoom: number) => {
    return Math.max(ZOOM_LEVELS.MIN, Math.min(ZOOM_LEVELS.MAX, nextZoom));
  }, []);

  const clampPanOffset = useCallback((next: { x: number; y: number }, zoomLevel: number) => {
    if (!imageDimensions || !viewportRef.current) return next;
    if (zoomLevel <= 1.0) return { x: 0, y: 0 };

    const viewportWidth = viewportRef.current.clientWidth;
    let viewportHeight = viewportRef.current.clientHeight;
    if (!zoomViewportHeight) {
      const readerViewport = viewportRef.current.closest('.reader-text') as HTMLElement | null;
      if (readerViewport) {
        const styles = window.getComputedStyle(readerViewport);
        const paddingTop = parseFloat(styles.paddingTop || '0') || 0;
        const paddingBottom = parseFloat(styles.paddingBottom || '0') || 0;
        viewportHeight = Math.max(0, readerViewport.clientHeight - paddingTop - paddingBottom);
      }
    } else {
      viewportHeight = zoomViewportHeight;
    }
    const baseWidth = imageDimensions.width;
    const baseHeight = imageDimensions.height;

    const maxPanX = Math.max(0, (baseWidth * zoomLevel - viewportWidth) / 2);
    const maxPanY = Math.max(0, (baseHeight * zoomLevel - viewportHeight));

    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, next.x)),
      y: Math.max(-maxPanY, Math.min(0, next.y)),
    };
  }, [imageDimensions, zoomViewportHeight]);

  // Track Shift key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
        // If Shift is released and we have selected regions, trigger phrase select
        if (selectedRegions.length > 1 && onPhraseSelect) {
          handlePhraseComplete();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedRegions, onPhraseSelect]);

  // Reset pan offset on page change.
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
  }, [page.page]);

  // Clamp/disable pan on zoom and viewport changes.
  useEffect(() => {
    setPanOffset(prev => clampPanOffset(prev, zoom));
  }, [zoom, imageDimensions, clampPanOffset]);

  // When zoomed, lock the local viewport height to the reader viewport so pan bounds
  // are based on the visible area (not the full image height inside the scroll container).
  useEffect(() => {
    if (zoom <= 1.0) {
      setZoomViewportHeight(null);
      return;
    }

    const container = viewportRef.current;
    if (!container) return;

    const readerViewport = container.closest('.reader-text') as HTMLElement | null;
    if (!readerViewport) return;

    const computeHeight = () => {
      const styles = window.getComputedStyle(readerViewport);
      const paddingTop = parseFloat(styles.paddingTop || '0') || 0;
      const paddingBottom = parseFloat(styles.paddingBottom || '0') || 0;
      const nextHeight = Math.max(0, readerViewport.clientHeight - paddingTop - paddingBottom);
      setZoomViewportHeight(nextHeight || null);
    };

    computeHeight();

    window.addEventListener('resize', computeHeight);
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', computeHeight);
      };
    }

    const observer = new ResizeObserver(() => computeHeight());
    observer.observe(readerViewport);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', computeHeight);
    };
  }, [zoom]);

  // Show a brief zoom indicator whenever zoom changes.
  useEffect(() => {
    if (previousZoomRef.current === zoom) return;
    previousZoomRef.current = zoom;

    setShowZoomIndicator(true);
    if (zoomIndicatorTimerRef.current) {
      window.clearTimeout(zoomIndicatorTimerRef.current);
    }
    zoomIndicatorTimerRef.current = window.setTimeout(() => {
      setShowZoomIndicator(false);
      zoomIndicatorTimerRef.current = null;
    }, 1000);
  }, [zoom]);

  useEffect(() => {
    return () => {
      if (zoomIndicatorTimerRef.current) {
        window.clearTimeout(zoomIndicatorTimerRef.current);
      }
      if (dragRafRef.current) {
        window.cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

  /**
   * Handle mouse wheel for zooming and panning.
   * - Ctrl+wheel or trackpad pinch gesture → zoom
   * - Two-finger scroll or regular wheel → pan when zoomed in
   */
  const handleWheel = useCallback((event: WheelEvent) => {
    if (ocrSelectionMode) return;
    if (!viewportRef.current) return;

    // Pinch-to-zoom gesture (trackpad pinch or Ctrl+wheel)
    if (event.ctrlKey) {
      if (!onZoomChange) return;
      event.preventDefault();

      const zoomDelta = event.deltaY > 0 ? -ZOOM_LEVELS.STEP : ZOOM_LEVELS.STEP;
      const nextZoom = clampZoom(zoom + zoomDelta);

      if (!imageDimensions) {
        onZoomChange(nextZoom);
        return;
      }

      const rect = viewportRef.current.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const baseWidth = imageDimensions.width;

      const imageX = ((cursorX - panOffset.x - baseWidth / 2) / zoom) + baseWidth / 2;
      const imageY = (cursorY - panOffset.y) / zoom;

      const newPanX = cursorX - ((imageX - baseWidth / 2) * nextZoom + baseWidth / 2);
      const newPanY = cursorY - (imageY * nextZoom);
      setPanOffset(clampPanOffset({ x: newPanX, y: newPanY }, nextZoom));
      onZoomChange(nextZoom);
    }
    // Trackpad two-finger scroll for panning (only when zoomed in)
    else if (zoom > 1.0 && (
      Math.abs(event.deltaX) > 0 ||
      (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(event.deltaY) < 50)
    )) {
      event.preventDefault();

      setPanOffset(prev => clampPanOffset({
        x: prev.x - event.deltaX,
        y: prev.y - event.deltaY,
      }, zoom));
    }
    // Regular mouse wheel zoom in/out (including when already zoomed).
    else {
      if (!onZoomChange) return;
      event.preventDefault();

      const zoomDelta = event.deltaY > 0 ? -ZOOM_LEVELS.STEP : ZOOM_LEVELS.STEP;
      const nextZoom = clampZoom(zoom + zoomDelta);

      if (!imageDimensions) {
        onZoomChange(nextZoom);
        return;
      }

      const rect = viewportRef.current.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const baseWidth = imageDimensions.width;

      const imageX = ((cursorX - panOffset.x - baseWidth / 2) / zoom) + baseWidth / 2;
      const imageY = (cursorY - panOffset.y) / zoom;

      const newPanX = cursorX - ((imageX - baseWidth / 2) * nextZoom + baseWidth / 2);
      const newPanY = cursorY - (imageY * nextZoom);
      setPanOffset(clampPanOffset({ x: newPanX, y: newPanY }, nextZoom));
      onZoomChange(nextZoom);
    }
  }, [zoom, onZoomChange, ocrSelectionMode, clampZoom, clampPanOffset, imageDimensions, panOffset]);

  /**
   * Handle drag start for panning when zoomed in.
   */
  const handleDragStart = useCallback((event: React.MouseEvent) => {
    // Only allow dragging if zoomed in and not in OCR selection mode
    if (zoom <= 1.0 || ocrSelectionMode) return;

    // Don't interfere with OCR region clicks
    const target = event.target as HTMLElement;
    if (target.classList.contains('ocr-region')) return;

    // Prevent any default behavior
    event.preventDefault();

    setIsDragging(true);
    setDragStart({
      x: event.clientX - panOffset.x,
      y: event.clientY - panOffset.y,
    });

    // Change cursor
    if (wrapperRef.current) {
      wrapperRef.current.style.cursor = 'grabbing';
    }
  }, [zoom, ocrSelectionMode, panOffset]);

  /**
   * Handle drag move for panning.
   */
  const handleDragMove = useCallback((event: MouseEvent) => {
    if (!isDragging) return;

    event.preventDefault();

    pendingPanRef.current = {
      x: event.clientX - dragStart.x,
      y: event.clientY - dragStart.y,
    };

    if (dragRafRef.current) return;
    dragRafRef.current = window.requestAnimationFrame(() => {
      dragRafRef.current = null;
      if (!pendingPanRef.current) return;
      setPanOffset(clampPanOffset(pendingPanRef.current, zoom));
      pendingPanRef.current = null;
    });
  }, [isDragging, dragStart, clampPanOffset, zoom]);

  /**
   * Handle drag end.
   */
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);

    // Reset cursor
    if (wrapperRef.current && zoom > 1.0) {
      wrapperRef.current.style.cursor = 'grab';
    }
  }, [zoom]);

  /**
   * Extract sentence context from surrounding OCR regions.
   * For English comics, we look for regions on the same line (similar Y coordinate).
   */
  const extractSentenceContext = useCallback((targetRegion: OCRTextRegion, allRegions: OCRTextRegion[]): string => {
    // Find regions on same line (within 20px vertically)
    const sameLine = allRegions.filter(r =>
      Math.abs(r.bbox[1] - targetRegion.bbox[1]) < 20
    );

    // Sort by X coordinate (left to right)
    sameLine.sort((a, b) => a.bbox[0] - b.bbox[0]);

    // Find target index and extract ±5 words for context
    const targetIdx = sameLine.findIndex(r =>
      r.bbox[0] === targetRegion.bbox[0] &&
      r.bbox[1] === targetRegion.bbox[1]
    );

    if (targetIdx === -1) {
      return targetRegion.text;
    }

    const start = Math.max(0, targetIdx - 5);
    const end = Math.min(sameLine.length, targetIdx + 6);

    return sameLine.slice(start, end).map(r => r.text).join(' ');
  }, []);

  /**
   * Handle single region click or multi-selection.
   */
  const handleRegionClick = useCallback((region: OCRTextRegion, index: number, event: React.MouseEvent) => {
    if (ocrSelectionMode) {
      return;
    }

    event.stopPropagation();

    if (performance.now() < suppressClickUntilRef.current) {
      event.preventDefault();
      return;
    }

    const phraseInfo = phraseInfoByIndex.get(index);
    if (phraseInfo) {
      event.preventDefault();
      const phraseIsReady = isWordReady?.(phraseInfo.phrase, phraseInfo.sentence, bookId) || phraseInfo.status === 'ready';
      console.log('[MangaImageView][PhraseClick]', {
        phrase: phraseInfo.phrase,
        sentence: phraseInfo.sentence,
        phraseIsReady,
        indices: phraseInfo.indices,
      });
      if (phraseIsReady) {
        onPhraseClick?.(phraseInfo.phrase, phraseInfo.sentence, phraseInfo.indices);
      } else {
        onPhraseSelect?.(phraseInfo.phrase, phraseInfo.sentence);
      }
      return;
    }

    if (isShiftPressed) {
      // Multi-select mode
      setSelectedRegions(prev => {
        if (prev.includes(index)) {
          // Deselect if already selected
          return prev.filter(i => i !== index);
        } else {
          // Add to selection
          return [...prev, index];
        }
      });
    } else {
      // Single word click
      const sentence = extractSentenceContext(region, ocrRegions);

      // Set loading status immediately
      setRegionTranslationStatus(prev => {
        const newMap = new Map(prev);
        newMap.set(index, 'loading');
        return newMap;
      });

      onWordClick(region.text, sentence, index, event);

      // Callback to parent for tracking
      onTranslationStatusChange?.(index, 'loading');

      // Clear any previous multi-selection
      setSelectedRegions([]);
    }
  }, [ocrSelectionMode, isShiftPressed, ocrRegions, extractSentenceContext, onWordClick, onTranslationStatusChange, phraseInfoByIndex, onPhraseClick, onPhraseSelect, isWordReady, bookId]);

  /**
   * Calculate the spatial middle index for phrase dot placement.
   * Sorts regions by position (Y first, then X) and returns the middle index.
   */
  const calculateSpatialMiddleIndex = useCallback((
    indices: number[],
    regions: OCRTextRegion[]
  ): number => {
    if (indices.length === 0) return -1;

    // Sort indices by region position (top-to-bottom, left-to-right)
    const sortedIndices = indices
      .map(idx => ({ idx, region: regions[idx] }))
      .sort((a, b) => {
        const yDiff = a.region.bbox[1] - b.region.bbox[1];
        if (Math.abs(yDiff) > 20) return yDiff;
        return a.region.bbox[0] - b.region.bbox[0];
      })
      .map(item => item.idx);

    return sortedIndices[Math.floor(sortedIndices.length / 2)];
  }, []);

  /**
   * Determine which dot indicator to show for a region.
   * Returns flags for red (ready), yellow (loading), and gray (known) dots.
   */
  const getDotIndicator = useCallback((
    region: OCRTextRegion,
    index: number
  ): { showRed: boolean; showYellow: boolean; showGray: boolean } => {
    const cleanedWord = region.text.trim().toLowerCase();

    const phraseInfo = phraseInfoByIndex.get(index);
    if (phraseInfo) {
      // For phrases, only show dot on spatial middle region.
      let isMiddle = false;
      for (const [, range] of mangaPhraseRanges) {
        if (range.phrase === phraseInfo.phrase && range.indices.includes(index)) {
          isMiddle = index === range.middleIndex;
          break;
        }
      }

      if (isMiddle) {
        const phraseIsReady = isWordReady?.(phraseInfo.phrase, phraseInfo.sentence, bookId) || phraseInfo.status === 'ready';
        return {
          showRed: phraseIsReady,
          showYellow: !phraseIsReady && phraseInfo.status === 'loading',
          showGray: false
        };
      }
      return { showRed: false, showYellow: false, showGray: false };
    }

    // Single word logic
    const sentence = extractSentenceContext(region, ocrRegions);
    const wordIsReady = isWordReady?.(cleanedWord, sentence, bookId) || false;
    const isLoading = regionTranslationStatus.get(index) === 'loading';
    const isKnown = knownWords?.has(cleanedWord) || false;

    if (wordIsReady || regionTranslationStatus.get(index) === 'ready') {
      return { showRed: true, showYellow: false, showGray: false };
    } else if (isLoading) {
      return { showRed: false, showYellow: true, showGray: false };
    } else if (isKnown) {
      return { showRed: false, showYellow: false, showGray: true };
    }

    return { showRed: false, showYellow: false, showGray: false };
  }, [phraseInfoByIndex, mangaPhraseRanges, regionTranslationStatus, knownWords, isWordReady, bookId, ocrRegions, extractSentenceContext]);

  /**
   * Extract expanded context for multi-word selection.
   */
  const extractExpandedContext = useCallback((selectedRegions: OCRTextRegion[], allRegions: OCRTextRegion[]): string => {
    if (selectedRegions.length === 0) return '';

    // Find the bounding box of all selected regions
    const minY = Math.min(...selectedRegions.map(r => r.bbox[1]));
    const maxY = Math.max(...selectedRegions.map(r => r.bbox[1] + r.bbox[3]));
    const minX = Math.min(...selectedRegions.map(r => r.bbox[0]));
    const maxX = Math.max(...selectedRegions.map(r => r.bbox[0] + r.bbox[2]));

    // Find all regions in the same area (expanded by ±50px)
    const nearbyRegions = allRegions.filter(r => {
      const regionY = r.bbox[1];
      const regionX = r.bbox[0];
      return regionY >= minY - 50 &&
             regionY <= maxY + 50 &&
             regionX >= minX - 100 &&
             regionX <= maxX + 100;
    });

    // Sort and join
    nearbyRegions.sort((a, b) => {
      const yDiff = a.bbox[1] - b.bbox[1];
      if (Math.abs(yDiff) > 20) return yDiff;
      return a.bbox[0] - b.bbox[0];
    });

    return nearbyRegions.map(r => r.text).join(' ');
  }, []);

  /**
   * Complete phrase selection and trigger callback.
   */
  const handlePhraseComplete = useCallback((indicesOverride?: number[]) => {
    const indicesToUse = indicesOverride ?? selectedRegions;
    if (indicesToUse.length === 0) return;

    // Get selected regions and sort by position (top to bottom, left to right)
    const regions = indicesToUse
      .map(idx => ({ region: ocrRegions[idx], idx }))
      .sort((a, b) => {
        // Sort by Y first (top to bottom), then X (left to right)
        const yDiff = a.region.bbox[1] - b.region.bbox[1];
        if (Math.abs(yDiff) > 20) return yDiff;
        return a.region.bbox[0] - b.region.bbox[0];
      });

    // Build phrase from selected regions
    const phrase = regions.map(r => r.region.text).join(' ');
    const indices = regions.map(r => r.idx);

    // Calculate middle index for dot placement
    const middleIndex = calculateSpatialMiddleIndex(indices, ocrRegions);

    // Extract expanded sentence context
    const allSelectedRegions = regions.map(r => r.region);
    const expandedContext = extractExpandedContext(allSelectedRegions, ocrRegions);
    const initialStatus: 'loading' | 'ready' =
      isWordReady?.(phrase, expandedContext, bookId) ? 'ready' : 'loading';

    console.log('[MangaImageView][PhraseComplete]', {
      indices,
      phrase,
      sentence: expandedContext,
      middleIndex,
      initialStatus,
    });

    // Create phrase range with loading status
    setMangaPhraseRanges(prev => {
      const newMap = new Map(prev);
      newMap.set(phrase, {
        indices,
        middleIndex,
        phrase,
        status: initialStatus,
        sentence: expandedContext,
      });
      return newMap;
    });

    if (onPhraseSelect) {
      onPhraseSelect(phrase, expandedContext);
    }

    // Clear selection
    setSelectedRegions([]);
  }, [selectedRegions, ocrRegions, onPhraseSelect, calculateSpatialMiddleIndex, extractExpandedContext, isWordReady, bookId]);

  // Update phrase status to 'ready' when the phrase becomes available in the translation cache.
  useEffect(() => {
    if (!isWordReady || mangaPhraseRanges.size === 0) return;

    const updated = new Map(mangaPhraseRanges);
    let hasChanges = false;

    mangaPhraseRanges.forEach((range, phrase) => {
      if (range.status !== 'loading') return;
      if (!range.sentence) return;
      if (isWordReady(phrase, range.sentence, bookId)) {
        console.log('[MangaImageView][PhraseReady]', { phrase, sentence: range.sentence, bookId });
        updated.set(phrase, { ...range, status: 'ready' });
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setMangaPhraseRanges(updated);
    }
  }, [mangaPhraseRanges, isWordReady, bookId]);

  /**
   * Calculate scale factor when image loads.
   * This ensures OCR coordinates (from original image) match the displayed image size.
   */
  const handleImageLoad = useCallback(() => {
    if (!imageRef.current) return;

    const displayedWidth = imageRef.current.clientWidth;
    const displayedHeight = imageRef.current.clientHeight;
    const natural = {
      width: imageRef.current.naturalWidth,
      height: imageRef.current.naturalHeight,
    };

    if (!displayedWidth || !natural.width) return;

    const scale = displayedWidth / natural.width;
    setImageScale(scale);
    setImageDimensions({
      width: displayedWidth,
      height: displayedHeight,
    });

    console.log(`[MangaImageView] Image scale: ${scale.toFixed(3)} (${natural.width}px → ${displayedWidth.toFixed(0)}px)`);
    console.log(`[MangaImageView] Image dimensions: ${displayedWidth.toFixed(0)}px x ${displayedHeight.toFixed(0)}px`);
  }, []);

  const screenToImageCoords = useCallback((
    clientX: number,
    clientY: number,
    transform: { rect: DOMRect; zoom: number; imageScale: number }
  ): { x: number; y: number } | null => {
    if (!imageRef.current) return null;

    const { rect, zoom: zoomAtStart, imageScale: scaleAtStart } = transform;
    if (zoomAtStart <= 0 || scaleAtStart <= 0) return null;

    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;
    const unzoomedX = relativeX / zoomAtStart;
    const unzoomedY = relativeY / zoomAtStart;
    const originalX = unzoomedX / scaleAtStart;
    const originalY = unzoomedY / scaleAtStart;

    const naturalWidth = imageRef.current.naturalWidth;
    const naturalHeight = imageRef.current.naturalHeight;

    return {
      x: Math.max(0, Math.min(originalX, naturalWidth)),
      y: Math.max(0, Math.min(originalY, naturalHeight)),
    };
  }, []);

  const normalizeRect = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    return { x, y, width, height };
  };

  const clampRectToImageBounds = (rect: Rect) => {
    if (!imageRef.current) return rect;

    const maxWidth = imageRef.current.naturalWidth;
    const maxHeight = imageRef.current.naturalHeight;

    const x = Math.max(0, Math.min(rect.x, maxWidth));
    const y = Math.max(0, Math.min(rect.y, maxHeight));
    const right = Math.max(x, Math.min(rect.x + rect.width, maxWidth));
    const bottom = Math.max(y, Math.min(rect.y + rect.height, maxHeight));

    return {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y),
    };
  };

  const rectanglesOverlap = useCallback((
    bbox1: [number, number, number, number],
    bbox2: [number, number, number, number]
  ): boolean => {
    const [x1, y1, w1, h1] = bbox1;
    const [x2, y2, w2, h2] = bbox2;

    return !(
      x1 + w1 < x2 ||
      x2 + w2 < x1 ||
      y1 + h1 < y2 ||
      y2 + h2 < y1
    );
  }, []);

  const getBoundingRectForIndices = useCallback((indices: number[]): Rect | null => {
    if (indices.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const idx of indices) {
      const region = ocrRegions[idx];
      if (!region) continue;
      const [x, y, w, h] = region.bbox;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  }, [ocrRegions]);

  // Implements Android gallery-style drag-to-select for OCR regions (matches text reader interaction pattern).
  // Behavior: long-press (150ms) to enter drag mode, then hover over regions to extend a continuous range.
  const handleRegionMouseDown = useCallback((index: number, event: React.MouseEvent) => {
    if (ocrSelectionMode || isOcrProcessing) return;
    if (isShiftPressed) return;
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    if (dragActivationTimeoutRef.current) {
      window.clearTimeout(dragActivationTimeoutRef.current);
      dragActivationTimeoutRef.current = null;
    }

    const startOrder = ocrOrderIndexMap.get(index);
    if (startOrder === undefined) return;

    dragStartOrderRef.current = startOrder;
    dragStartRegionRef.current = index;

    setDragSelectionRect(null);
    setIsDragSelecting(false);

    const startRect = getBoundingRectForIndices([index]);

    // Set timeout for drag detection (150ms)
    dragActivationTimeoutRef.current = window.setTimeout(() => {
      setIsDragSelecting(true);
      selectedRegionsRef.current = [index];
      setSelectedRegions([index]);
      setDragSelectionRect(startRect);
    }, 150);
  }, [ocrSelectionMode, isOcrProcessing, isShiftPressed, ocrOrderIndexMap, getBoundingRectForIndices]);

  const handleRegionMouseEnter = useCallback((index: number, event: React.MouseEvent) => {
    setHoveredRegion(index);

    if (!isDragSelecting || dragStartOrderRef.current === null) return;

    event.preventDefault();

    // Precise hit detection: verify mouse is actually within the region's bounding box
    const region = ocrRegions[index];
    if (!region || !wrapperRef.current) return;

    const containerRect = wrapperRef.current.getBoundingClientRect();
    // Account for zoom and pan transformations
    const mouseX = (event.clientX - containerRect.left) / zoom;
    const mouseY = (event.clientY - containerRect.top) / zoom;

    const regionLeft = region.bbox[0] * imageScale;
    const regionTop = region.bbox[1] * imageScale;
    const regionRight = regionLeft + region.bbox[2] * imageScale;
    const regionBottom = regionTop + region.bbox[3] * imageScale;

    // Only proceed if mouse is actually within the region's bounding box
    const isMouseInRegion = mouseX >= regionLeft && mouseX <= regionRight &&
                           mouseY >= regionTop && mouseY <= regionBottom;

    if (!isMouseInRegion) return;

    const currentOrder = ocrOrderIndexMap.get(index);
    if (currentOrder === undefined) return;

    const startOrder = dragStartOrderRef.current;
    const start = Math.min(startOrder, currentOrder);
    const end = Math.max(startOrder, currentOrder);
    const indices = ocrReadingOrder.slice(start, end + 1);

    selectedRegionsRef.current = indices;
    setSelectedRegions(indices);
    setDragSelectionRect(getBoundingRectForIndices(indices));
  }, [isDragSelecting, ocrOrderIndexMap, ocrReadingOrder, getBoundingRectForIndices, ocrRegions, imageScale, zoom]);

  const endDragSelection = useCallback(() => {
    if (!isDragSelecting) return;

    const indices = selectedRegionsRef.current;
    if (indices.length > 1 && onPhraseSelect) {
      handlePhraseComplete(indices);
    } else {
      selectedRegionsRef.current = [];
      setSelectedRegions([]);
    }

    setIsDragSelecting(false);
    setDragSelectionRect(null);
    dragStartOrderRef.current = null;
    dragStartRegionRef.current = null;
    suppressClickUntilRef.current = performance.now() + 300;
  }, [isDragSelecting, onPhraseSelect, handlePhraseComplete]);

  const performInReadingOCR = useCallback(async (rect: { x: number; y: number; width: number; height: number }) => {
    if (!window.electronAPI) {
      alert('OCR is not available in this environment.');
      return;
    }

    setIsOcrProcessing(true);

    try {
      const response = await window.electronAPI.book.ocrMangaRegion(
        page.image_path,
        rect,
        bookLanguage,
        ocrEngine
      );

      // Capture metadata for debugging and user feedback
      if (response.metadata) {
        setOcrMetadata(response.metadata);
      }

      const filteredRegions = ocrRegions.filter(region => !rectanglesOverlap(
        region.bbox,
        [rect.x, rect.y, rect.width, rect.height]
      ));
      const updatedRegions = [...filteredRegions, ...response.regions];

      // Show feedback notification if current OCR returned 0 regions
      if (response.regions.length === 0 && response.metadata?.total_extracted) {
        setShowOcrFeedback(true);
        // Auto-dismiss after 4 seconds
        setTimeout(() => setShowOcrFeedback(false), 4000);
      }

      const persistedPage = await window.electronAPI.book.updateMangaPageOCR(
        bookId,
        page.page,
        updatedRegions
      );

      const finalRegions = persistedPage?.ocr_regions || updatedRegions;
      ocrOverridesRef.current.set(page.page, finalRegions);
      setOcrRegions(finalRegions);
      setSelectedRegions([]);
      setHoveredRegion(null);
    } catch (error) {
      console.error('[MangaImageView] In-reading OCR failed:', error);
      alert('Failed to process OCR for the selected region.');
    } finally {
      setIsOcrProcessing(false);
    }
  }, [bookId, bookLanguage, ocrEngine, ocrRegions, page.image_path, page.page, rectanglesOverlap]);

  const handleSelectionStart = useCallback((event: React.MouseEvent) => {
    if (!ocrSelectionMode || isOcrProcessing) return;
    if (!imageRef.current || !imageDimensions) return;
    if (event.button !== 0) return;

    event.preventDefault();

    const rect = imageRef.current.getBoundingClientRect();
    selectionTransformRef.current = { rect, zoom, imageScale };

    const start = screenToImageCoords(event.clientX, event.clientY, selectionTransformRef.current);
    if (!start) return;

    selectionStartRef.current = start;
    setSelectionRect({ x: start.x, y: start.y, width: 0, height: 0 });
    setIsSelecting(true);
  }, [ocrSelectionMode, isOcrProcessing, imageDimensions, zoom, imageScale]);

  const handleSelectionMove = useCallback((event: MouseEvent) => {
    if (!isSelecting || !selectionStartRef.current || !selectionTransformRef.current) return;

    const current = screenToImageCoords(event.clientX, event.clientY, selectionTransformRef.current);
    if (!current) return;

    const rect = normalizeRect(selectionStartRef.current, current);
    setSelectionRect(rect);
  }, [isSelecting]);

  const handleSelectionEnd = useCallback(async (event: MouseEvent) => {
    if (!isSelecting || !selectionStartRef.current || !selectionTransformRef.current) return;

    const start = selectionStartRef.current;
    const current = screenToImageCoords(event.clientX, event.clientY, selectionTransformRef.current);

    setIsSelecting(false);
    selectionStartRef.current = null;
    selectionTransformRef.current = null;

    if (!current || !imageRef.current) {
      setSelectionRect(null);
      return;
    }

    const rect = normalizeRect(start, current);
    const clamped = clampRectToImageBounds(rect);

    const minSize = 20;
    if (clamped.width < minSize || clamped.height < minSize) {
      setSelectionRect(null);
      alert('Selection too small. Please select a larger area.');
      return;
    }

    setSelectionRect(clamped);
    await performInReadingOCR(clamped);
    setSelectionRect(null);
    onOcrSelectionModeChange(false);
  }, [isSelecting, performInReadingOCR, onOcrSelectionModeChange]);

  /**
   * Get CSS class for region based on state.
   */
  const getRegionClassName = useCallback((index: number): string => {
    const baseClass = 'ocr-region';
    const classes = [baseClass];

    if (selectedRegions.includes(index)) {
      classes.push('word-phrase-selected');
      if (isDragSelecting) {
        classes.push('word-phrase-selecting');
      }
    }

    const phraseInfo = phraseInfoByIndex.get(index);
    if (phraseInfo) {
      classes.push('manga-phrase-group');
      classes.push(phraseInfo.status === 'ready' ? 'manga-phrase-group-ready' : 'manga-phrase-group-loading');
    }

    if (hoveredRegion === index) {
      classes.push('ocr-region-hover');
    }

    if (isDragSelecting) {
      classes.push('word-drag-mode');
    }

    return classes.join(' ');
  }, [selectedRegions, hoveredRegion, isDragSelecting, phraseInfoByIndex]);

  // Load absolute image path from relative path
  useEffect(() => {
    const loadImagePath = async () => {
      setImageDimensions(null);
      setImageScale(1);
      if (page.image_path && window.electronAPI) {
        try {
          const absolutePath = await window.electronAPI.book.getMangaImagePath(page.image_path);
          setImagePath(absolutePath);
        } catch (error) {
          console.error('Failed to load manga image path:', error);
          setImagePath('');
        }
      }
    };
    loadImagePath();

    // Debug: Log OCR regions
    console.log('[MangaImageView] Page data:', {
      page: page.page,
      has_text: page.has_text,
      ocr_regions_count: page.ocr_regions?.length || 0,
      ocr_regions: page.ocr_regions?.slice(0, 3), // First 3 regions for debugging
    });
  }, [page.image_path]);

  // Handle window resize to recalculate scale
  useEffect(() => {
    const handleResize = () => {
      handleImageLoad();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [handleImageLoad]);

  // Observe image size changes to keep OCR overlay aligned on viewport changes.
  useEffect(() => {
    if (!imageRef.current || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        handleImageLoad();
      });
    });

    observer.observe(imageRef.current);
    return () => observer.disconnect();
  }, [handleImageLoad, imagePath]);

  useEffect(() => {
    if (!isSelecting) return;

    const handleMove = (event: MouseEvent) => handleSelectionMove(event);
    const handleUp = (event: MouseEvent) => handleSelectionEnd(event);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isSelecting, handleSelectionMove, handleSelectionEnd]);

  useEffect(() => {
    if (!isDragSelecting) return;

    const handleUp = () => endDragSelection();

    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragSelecting, endDragSelection]);

  // Always clear pending drag activation on mouseup (prevents post-click activation).
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragActivationTimeoutRef.current) {
        window.clearTimeout(dragActivationTimeoutRef.current);
        dragActivationTimeoutRef.current = null;
      }
      dragStartOrderRef.current = null;
      dragStartRegionRef.current = null;
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  useEffect(() => {
    return () => {
      if (dragActivationTimeoutRef.current) {
        window.clearTimeout(dragActivationTimeoutRef.current);
        dragActivationTimeoutRef.current = null;
      }
    };
  }, []);

  // Attach wheel event listener for zoom
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    wrapper.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Attach drag event listeners for panning
  useEffect(() => {
    if (!isDragging) return;

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  /**
   * Get color scheme for OCR region based on confidence tier.
   * Returns background and border colors for different confidence levels.
   */
  const getConfidenceColor = useCallback((
    confidence: number,
    tier?: string,
    invisibleMode = true
  ): {
    bg: string;
    border: string;
    bgHover: string;
    borderHover: string;
  } => {
    // Invisible mode: transparent regions with subtle hover effect
    if (invisibleMode) {
      return {
        bg: 'transparent',
        border: '1px solid transparent',
        bgHover: 'rgba(59, 130, 246, 0.05)',
        borderHover: '1px solid rgba(59, 130, 246, 0.15)'
      };
    }

    // Original confidence-based colors (preserved for debugging)
    const effectiveTier = tier || (
      confidence >= 0.60 ? 'high' :
      confidence >= 0.30 ? 'medium' : 'low'
    );

    switch (effectiveTier) {
      case 'high':
        return {
          bg: 'rgba(34, 197, 94, 0.15)',        // Green - reliable
          border: '1px solid rgba(34, 197, 94, 0.4)',
          bgHover: 'rgba(34, 197, 94, 0.25)',
          borderHover: '1px solid rgba(34, 197, 94, 0.6)'
        };
      case 'medium':
        return {
          bg: 'rgba(251, 191, 36, 0.15)',       // Yellow - partial
          border: '1px solid rgba(251, 191, 36, 0.4)',
          bgHover: 'rgba(251, 191, 36, 0.25)',
          borderHover: '1px solid rgba(251, 191, 36, 0.6)'
        };
      case 'low':
        return {
          bg: 'rgba(239, 68, 68, 0.12)',        // Red - questionable
          border: '1px solid rgba(239, 68, 68, 0.3)',
          bgHover: 'rgba(239, 68, 68, 0.2)',
          borderHover: '1px solid rgba(239, 68, 68, 0.5)'
        };
      default:
        return {
          bg: 'rgba(156, 163, 175, 0.15)',      // Gray - unknown
          border: '1px solid rgba(156, 163, 175, 0.4)',
          bgHover: 'rgba(156, 163, 175, 0.25)',
          borderHover: '1px solid rgba(156, 163, 175, 0.6)'
        };
    }
  }, []);

  const hasOCRRegions = ocrRegions.length > 0;

  return (
    <div
      ref={viewportRef}
      className={`manga-page-container ${ocrSelectionMode ? 'ocr-selection-active' : ''} ${isDragSelecting ? 'manga-drag-selecting' : ''} ${className}`}
      style={{
        height: zoom > 1.0 && zoomViewportHeight ? `${zoomViewportHeight}px` : undefined,
      }}
    >
      {/* Comic page image */}
      <div
        ref={wrapperRef}
        className="manga-image-wrapper"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: 'top center',
          transition: isDragging ? 'none' : 'transform 200ms ease-out',
          cursor: ocrSelectionMode || isDragSelecting ? 'crosshair' : (zoom > 1.0 ? 'grab' : 'default'),
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        onMouseDown={(e) => {
          if (ocrSelectionMode) {
            handleSelectionStart(e);
          } else if (zoom > 1.0) {
            handleDragStart(e);
          }
        }}
      >
        {imagePath ? (
          <img
            ref={imageRef}
            src={imagePath}
            alt={`Page ${page.page}`}
            className="manga-image"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onLoad={handleImageLoad}
            style={{
              maxWidth: '100%',
              height: 'auto',
              display: 'block',
              userSelect: 'none',
              WebkitUserDrag: 'none',
            }}
          />
        ) : (
          <div
            className="manga-image-loading"
            style={{
              width: '100%',
              minHeight: '400px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
            }}
          >
            Loading image...
          </div>
        )}

        {/* OCR text overlay - invisible clickable regions */}
        {hasOCRRegions && imageDimensions ? (
          <div
            className="ocr-overlay"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${imageDimensions.width}px`,
              height: `${imageDimensions.height}px`,
              pointerEvents: 'none',
              border: '2px solid rgba(255, 0, 0, 0.3)',
            }}
          >
            {ocrRegions.map((region, idx) => {
              const colors = getConfidenceColor(region.confidence, region.confidence_tier, true);
              const isSelected = selectedRegions.includes(idx);
              const isHovered = hoveredRegion === idx;
              const { showRed, showYellow, showGray } = getDotIndicator(region, idx);
              const tierLabel = region.confidence_tier || (
                region.confidence >= 0.60 ? 'high' :
                region.confidence >= 0.30 ? 'medium' : 'low'
              );

              return (
                <span
                  key={idx}
                  className={`${getRegionClassName(idx)} ocr-region-invisible`}
                  data-word-index={idx}
                  data-text={region.text}
                  title={`${region.text}\nConfidence: ${Math.round(region.confidence * 100)}% (${tierLabel})`}
                  style={{
                    position: 'absolute',
                    left: `${region.bbox[0] * imageScale}px`,
                    top: `${region.bbox[1] * imageScale}px`,
                    width: `${region.bbox[2] * imageScale}px`,
                    height: `${region.bbox[3] * imageScale}px`,
                    cursor: 'pointer',
                    pointerEvents: ocrSelectionMode ? 'none' : 'auto',
                    backgroundColor: isSelected
                      ? 'rgba(59, 130, 246, 0.3)' // Blue for selected (overrides tier color)
                      : isHovered
                      ? colors.bgHover
                      : colors.bg,
                    border: isSelected
                      ? '2px solid rgba(59, 130, 246, 0.8)'
                      : isHovered
                      ? colors.borderHover
                      : colors.border,
                    transition: isDragSelecting ? 'none' : 'all 150ms ease',
                  }}
                  onMouseDown={(e) => handleRegionMouseDown(idx, e)}
                  onClick={(e) => handleRegionClick(region, idx, e)}
                  onMouseEnter={(e) => handleRegionMouseEnter(idx, e)}
                  onMouseLeave={() => setHoveredRegion(null)}
                >
                  {/* Dot indicators */}
                  {showRed && <span className="manga-word-ready-dot" />}
                  {showYellow && <span className="manga-word-loading-dot" />}
                  {showGray && <span className="manga-word-gray-dot" />}
                </span>
              );
            })}
          </div>
        ) : hasOCRRegions ? (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              backgroundColor: 'rgba(255, 165, 0, 0.8)',
              color: 'white',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '14px',
              zIndex: 1000,
            }}
          >
            Loading OCR overlay... (waiting for image dimensions)
          </div>
        ) : null}

        {selectionRect && imageDimensions && (
          <div
            className={`ocr-selection-rectangle ${isOcrProcessing ? 'ocr-selection-processing' : ''}`}
            style={{
              left: `${selectionRect.x * imageScale}px`,
              top: `${selectionRect.y * imageScale}px`,
              width: `${selectionRect.width * imageScale}px`,
              height: `${selectionRect.height * imageScale}px`,
            }}
          >
            {isOcrProcessing && (
              <div className="spinner" style={{ width: '22px', height: '22px' }} />
            )}
          </div>
        )}
      </div>

      {showZoomIndicator && (
        <div
          className="zoom-indicator"
          style={{
            position: 'absolute',
            right: '10px',
            bottom: '10px',
            zIndex: 20,
            backgroundColor: 'rgba(0,0,0,0.65)',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: 600,
            pointerEvents: 'none',
            backdropFilter: 'blur(6px)',
          }}
        >
          {Math.round(zoom * 100)}%
        </div>
      )}

      {selectedRegions.length > 0 && (
        <div
          className="selection-count-badge"
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: 'rgba(251, 191, 36, 0.9)',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 'bold',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          {selectedRegions.length} selected
        </div>
      )}
    </div>
  );
};
