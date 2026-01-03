import React from 'react';
import type { OCREngine } from '../../shared/types/settings.types';

interface OCREngineSelectorProps {
  value: OCREngine;
  onChange: (engine: OCREngine) => void;
  compact?: boolean;
  showDescriptions?: boolean;
}

interface EngineOption {
  id: OCREngine;
  name: string;
  description: string;
  features: string[];
  recommended?: boolean;
  requiresGPU?: boolean;
  isDownloadable?: boolean; // Can be downloaded from UI
}

const OCR_ENGINES: EngineOption[] = [
  {
    id: 'tesseract',
    name: 'Tesseract',
    description: 'Installed by default - Fast and reliable for printed text',
    features: ['Fast', 'CPU only', 'Good for printed text', '~4MB'],
  },
  {
    id: 'paddleocr',
    name: 'PaddleOCR',
    description: 'Installed by default - Optimized for comics/manga with varied fonts',
    features: ['Very fast', 'CPU/GPU', 'Excellent for comics', '<10MB'],
    recommended: true,
  },
  {
    id: 'trocr',
    name: 'TrOCR',
    description: '📥 Download from UI - Transformer-based, excellent for handwriting',
    features: ['Handwriting specialist', 'GPU recommended', 'Slower', '~500MB', '📥 Downloadable'],
    requiresGPU: true,
    isDownloadable: true,
  },
  {
    id: 'easyocr',
    name: 'EasyOCR',
    description: '📥 Download from UI - Good balance, supports 80+ languages',
    features: ['80+ languages', 'CPU/GPU', 'Good overall', '~100MB', '📥 Downloadable'],
    isDownloadable: true,
  },
  {
    id: 'hybrid',
    name: 'Hybrid (PaddleOCR + TrOCR)',
    description: '📥 Requires TrOCR download - Auto-switches based on confidence',
    features: ['Best quality', 'Smart fallback', 'Automatic', 'GPU optional', '📥 Requires TrOCR'],
    recommended: true,
    isDownloadable: true,
  },
];

export const OCREngineSelector: React.FC<OCREngineSelectorProps> = ({
  value,
  onChange,
  compact = false,
  showDescriptions = true,
}) => {
  if (compact) {
    // Compact dropdown for context menus
    return (
      <div style={{ minWidth: '200px' }}>
        {OCR_ENGINES.map((engine) => (
          <div
            key={engine.id}
            onClick={() => onChange(engine.id)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              backgroundColor: value === engine.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              borderLeft: value === engine.id ? '3px solid rgb(59, 130, 246)' : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => {
              if (value !== engine.id) {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (value !== engine.id) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <input
              type="radio"
              checked={value === engine.id}
              readOnly
              style={{ margin: 0 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: value === engine.id ? '600' : '400', fontSize: '14px' }}>
                {engine.name}
                {engine.recommended && (
                  <span style={{ marginLeft: '6px', fontSize: '11px', color: '#10b981', fontWeight: '600' }}>
                    ⭐ RECOMMENDED
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Full card-based selection for dialogs
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {OCR_ENGINES.map((engine) => {
        const isSelected = value === engine.id;

        return (
          <div
            key={engine.id}
            onClick={() => onChange(engine.id)}
            style={{
              padding: '16px',
              border: isSelected ? '2px solid rgb(59, 130, 246)' : '2px solid #e5e7eb',
              borderRadius: '8px',
              cursor: 'pointer',
              backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'white',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.backgroundColor = 'white';
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <input
                type="radio"
                checked={isSelected}
                onChange={() => onChange(engine.id)}
                style={{ marginTop: '2px' }}
              />

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                    {engine.name}
                  </span>

                  {engine.recommended && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      ⭐ RECOMMENDED
                    </span>
                  )}

                  {engine.requiresGPU && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      GPU REC
                    </span>
                  )}
                </div>

                {showDescriptions && (
                  <>
                    <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#6b7280', lineHeight: '1.5' }}>
                      {engine.description}
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {engine.features.map((feature, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '12px',
                            color: '#374151',
                            backgroundColor: '#f3f4f6',
                            padding: '3px 8px',
                            borderRadius: '4px',
                          }}
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
