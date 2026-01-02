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
import type { MangaPage, OCRTextRegion } from '../../../shared/types';

interface MangaImageViewProps {
  page: MangaPage;
  zoom: number;
  onWordClick: (word: string, sentence: string, regionIndex: number) => void;
  onPhraseSelect?: (phrase: string, sentence: string) => void;
  className?: string;
}

export const MangaImageView: React.FC<MangaImageViewProps> = ({
  page,
  zoom,
  onWordClick,
  onPhraseSelect,
  className = '',
}) => {
  const [selectedRegions, setSelectedRegions] = useState<number[]>([]);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [hoveredRegion, setHoveredRegion] = useState<number | null>(null);
  const [imagePath, setImagePath] = useState<string>('');
  const [imageScale, setImageScale] = useState<number>(1);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

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
      const sentence = extractSentenceContext(region, page.ocr_regions);
      onWordClick(region.text, sentence, index);

      // Clear any previous multi-selection
      setSelectedRegions([]);
    }
  }, [isShiftPressed, page.ocr_regions, extractSentenceContext, onWordClick]);

  /**
   * Complete phrase selection and trigger callback.
   */
  const handlePhraseComplete = useCallback(() => {
    if (selectedRegions.length === 0) return;

    // Get selected regions and sort by position (left to right, top to bottom)
    const regions = selectedRegions
      .map(idx => ({ region: page.ocr_regions[idx], idx }))
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
    const expandedContext = extractExpandedContext(allSelectedRegions, page.ocr_regions);

    if (onPhraseSelect) {
      onPhraseSelect(phrase, expandedContext);
    }

    // Clear selection
    setSelectedRegions([]);
  }, [selectedRegions, page.ocr_regions, onPhraseSelect]);

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

    const displayed = imageRef.current.getBoundingClientRect();
    const natural = {
      width: imageRef.current.naturalWidth,
      height: imageRef.current.naturalHeight,
    };

    const scale = displayed.width / natural.width;
    setImageScale(scale);
    setImageDimensions({
      width: displayed.width,
      height: displayed.height,
    });

    console.log(`[MangaImageView] Image scale: ${scale.toFixed(3)} (${natural.width}px → ${displayed.width.toFixed(0)}px)`);
    console.log(`[MangaImageView] Image dimensions: ${displayed.width.toFixed(0)}px x ${displayed.height.toFixed(0)}px`);
  }, []);

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

  const hasOCRRegions = page.has_text && page.ocr_regions.length > 0;

  return (
    <div className={`manga-page-container ${className}`}>
      {/* Comic page image */}
      <div
        className="manga-image-wrapper"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
          transition: 'transform 200ms ease-out',
        }}
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
            {page.ocr_regions.map((region, idx) => (
              <span
                key={idx}
                className={getRegionClassName(idx)}
                data-word-index={idx}
                data-text={region.text}
                title={`${region.text} (${Math.round(region.confidence * 100)}% confidence)`}
                style={{
                  position: 'absolute',
                  left: `${region.bbox[0] * imageScale}px`,
                  top: `${region.bbox[1] * imageScale}px`,
                  width: `${region.bbox[2] * imageScale}px`,
                  height: `${region.bbox[3] * imageScale}px`,
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  // DEBUG: Show all OCR regions with visible highlights
                  backgroundColor: selectedRegions.includes(idx)
                    ? 'rgba(251, 191, 36, 0.3)' // Yellow for selected
                    : hoveredRegion === idx
                    ? 'rgba(59, 130, 246, 0.25)' // Blue for hover
                    : 'rgba(0, 255, 0, 0.15)', // Green for all regions (DEBUG)
                  border: selectedRegions.includes(idx)
                    ? '2px solid rgba(251, 191, 36, 0.8)'
                    : hoveredRegion === idx
                    ? '2px solid rgba(59, 130, 246, 0.6)'
                    : '1px solid rgba(0, 255, 0, 0.4)', // Green border (DEBUG)
                  transition: 'all 150ms ease',
                }}
                onClick={(e) => handleRegionClick(region, idx, e)}
                onMouseEnter={() => setHoveredRegion(idx)}
                onMouseLeave={() => setHoveredRegion(null)}
              />
            ))}
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
        ) : (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              backgroundColor: 'rgba(255, 0, 0, 0.8)',
              color: 'white',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '14px',
              zIndex: 1000,
            }}
          >
            No OCR regions found (has_text: {String(page.has_text)}, regions: {page.ocr_regions?.length || 0})
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
      </div>
    </div>
  );
};
