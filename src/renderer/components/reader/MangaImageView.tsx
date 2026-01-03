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
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { BookLanguage, MangaPage, OCRTextRegion } from '../../../shared/types';
import type { OCREngine } from '../../../shared/types/settings.types';

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
  className?: string;
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
  className = '',
}) => {
  const [selectedRegions, setSelectedRegions] = useState<number[]>([]);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [hoveredRegion, setHoveredRegion] = useState<number | null>(null);
  const [ocrRegions, setOcrRegions] = useState<OCRTextRegion[]>(page.ocr_regions || []);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
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
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [showOcrFeedback, setShowOcrFeedback] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionTransformRef = useRef<{ rect: DOMRect; zoom: number; imageScale: number } | null>(null);
  const ocrOverridesRef = useRef<Map<number, OCRTextRegion[]>>(new Map());
  
  useEffect(() => {
    const overrideRegions = ocrOverridesRef.current.get(page.page);
    const regions = overrideRegions || page.ocr_regions || [];
    setOcrRegions(regions);
    setSelectedRegions([]);
    setHoveredRegion(null);
  }, [page.page, page.ocr_regions]);

  useEffect(() => {
    if (ocrSelectionMode) {
      setSelectedRegions([]);
      setHoveredRegion(null);
      return;
    }
    setSelectionRect(null);
    setIsSelecting(false);
    selectionStartRef.current = null;
    selectionTransformRef.current = null;
  }, [ocrSelectionMode]);

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
      onWordClick(region.text, sentence, index, event);

      // Clear any previous multi-selection
      setSelectedRegions([]);
    }
  }, [ocrSelectionMode, isShiftPressed, ocrRegions, extractSentenceContext, onWordClick]);

  /**
   * Complete phrase selection and trigger callback.
   */
  const handlePhraseComplete = useCallback(() => {
    if (selectedRegions.length === 0) return;

    // Get selected regions and sort by position (left to right, top to bottom)
    const regions = selectedRegions
      .map(idx => ({ region: ocrRegions[idx], idx }))
      .sort((a, b) => {
        // Sort by Y first (top to bottom), then X (left to right)
        const yDiff = a.region.bbox[1] - b.region.bbox[1];
        if (Math.abs(yDiff) > 20) return yDiff;
        return a.region.bbox[0] - b.region.bbox[0];
      });

    // Build phrase from selected regions
    const phrase = regions.map(r => r.region.text).join(' ');

    // Extract expanded sentence context
    const allSelectedRegions = regions.map(r => r.region);
    const expandedContext = extractExpandedContext(allSelectedRegions, ocrRegions);

    if (onPhraseSelect) {
      onPhraseSelect(phrase, expandedContext);
    }

    // Clear selection
    setSelectedRegions([]);
  }, [selectedRegions, ocrRegions, onPhraseSelect]);

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

  const screenToImageCoords = (
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
  };

  const normalizeRect = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    return { x, y, width, height };
  };

  const clampRectToImageBounds = (rect: { x: number; y: number; width: number; height: number }) => {
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
    }

    if (hoveredRegion === index) {
      classes.push('ocr-region-hover');
    }

    return classes.join(' ');
  }, [selectedRegions, hoveredRegion]);

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

  /**
   * Get color scheme for OCR region based on confidence tier.
   * Returns background and border colors for different confidence levels.
   */
  const getConfidenceColor = useCallback((confidence: number, tier?: string): {
    bg: string;
    border: string;
    bgHover: string;
    borderHover: string;
  } => {
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
    <div className={`manga-page-container ${ocrSelectionMode ? 'ocr-selection-active' : ''} ${className}`}>
      {/* Comic page image */}
      <div
        className="manga-image-wrapper"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
          transition: 'transform 200ms ease-out',
        }}
        onMouseDown={handleSelectionStart}
      >
        {imagePath ? (
          <img
            ref={imageRef}
            src={imagePath}
            alt={`Page ${page.page}`}
            className="manga-image"
            onLoad={handleImageLoad}
            style={{
              maxWidth: '100%',
              height: 'auto',
              display: 'block',
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
              const colors = getConfidenceColor(region.confidence, region.confidence_tier);
              const isSelected = selectedRegions.includes(idx);
              const isHovered = hoveredRegion === idx;
              const tierLabel = region.confidence_tier || (
                region.confidence >= 0.60 ? 'high' :
                region.confidence >= 0.30 ? 'medium' : 'low'
              );

              return (
                <span
                  key={idx}
                  className={getRegionClassName(idx)}
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
                    transition: 'all 150ms ease',
                  }}
                  onClick={(e) => handleRegionClick(region, idx, e)}
                  onMouseEnter={() => setHoveredRegion(idx)}
                  onMouseLeave={() => setHoveredRegion(null)}
                />
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

        {/* Multi-selection indicator */}
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
            }}
          >
            {selectedRegions.length} selected
          </div>
        )}

        {/* Debug stats toggle button */}
        {hasOCRRegions && (
          <button
            onClick={() => setShowDebugInfo(!showDebugInfo)}
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              padding: '6px 12px',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              zIndex: 1001,
              transition: 'background-color 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.8)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.6)')}
          >
            {showDebugInfo ? 'Hide' : 'Show'} OCR Stats
          </button>
        )}

        {/* Debug statistics panel */}
        {showDebugInfo && ocrMetadata?.confidence_stats && (
          <div
            style={{
              position: 'absolute',
              bottom: '10px',
              right: '10px',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              color: 'white',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'monospace',
              maxWidth: '300px',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
              OCR Confidence Stats
            </div>
            <div style={{ lineHeight: '1.8' }}>
              <div>Total: {ocrMetadata.confidence_stats.count} regions</div>
              <div>
                Range: {(ocrMetadata.confidence_stats.min * 100).toFixed(0)}%-
                {(ocrMetadata.confidence_stats.max * 100).toFixed(0)}%
              </div>
              <div>Average: {(ocrMetadata.confidence_stats.avg * 100).toFixed(1)}%</div>
              <div>Median: {(ocrMetadata.confidence_stats.median * 100).toFixed(1)}%</div>
              <div
                style={{
                  marginTop: '6px',
                  borderTop: '1px solid rgba(255,255,255,0.2)',
                  paddingTop: '6px',
                }}
              >
                <div style={{ color: '#22c55e' }}>
                  🟢 High (≥60%): {ocrMetadata.confidence_stats.distribution.high}
                </div>
                <div style={{ color: '#fbbf24' }}>
                  🟡 Medium (30-60%): {ocrMetadata.confidence_stats.distribution.medium}
                </div>
                <div style={{ color: '#ef4444' }}>
                  🔴 Low (15-30%): {ocrMetadata.confidence_stats.distribution.low}
                </div>
              </div>
              {ocrMetadata.total_extracted && (
                <div
                  style={{
                    marginTop: '6px',
                    borderTop: '1px solid rgba(255,255,255,0.2)',
                    paddingTop: '6px',
                    fontSize: '11px',
                    color: '#999',
                  }}
                >
                  Extracted: {ocrMetadata.total_extracted} | Filtered: {ocrMetadata.filtered_out || 0}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
