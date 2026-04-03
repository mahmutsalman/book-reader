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
    id: 'rapidocr',
    name: 'OnnxOCR (PP-OCRv5)',
    description: 'Built-in — PP-OCRv5 mobile models, no download needed',
    features: ['Built-in', 'CPU only', 'PP-OCRv5', '~19MB'],
    recommended: true,
  },
  {
    id: 'paddleocr',
    name: 'PaddleOCR',
    description: 'Optional install via Settings — requires ~50MB download',
    features: ['Optional install', 'CPU/GPU', 'Excellent for CJK', '~50MB'],
  },
  {
    id: 'tesseract',
    name: 'Tesseract',
    description: 'Fallback — requires Tesseract installed on system',
    features: ['System install', 'CPU only', 'Printed text', '~4MB'],
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
