import React, { useState, useEffect } from 'react';
import type { OCREngine } from '../../../shared/types/settings.types';

interface OCREngineInfo {
  engine: string;
  installed: boolean;
  built_in: boolean;
  size_mb: number;
  languages: string[];
  description: string;
}

interface InstallProgress {
  engine: string;
  installing: boolean;
  progress: number;
}

export const OCRSettings: React.FC = () => {
  const [engines, setEngines] = useState<OCREngineInfo[]>([]);
  const [activeEngine, setActiveEngine] = useState<OCREngine>('rapidocr');
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    loadEngines();
    loadActiveEngine();
  }, []);

  const loadActiveEngine = async () => {
    try {
      const engine = await window.electronAPI.settings.get('ocr_engine');
      const valid: OCREngine[] = ['rapidocr', 'paddleocr', 'tesseract'];
      const e = engine as OCREngine;
      if (valid.includes(e)) setActiveEngine(e);
    } catch {
      // fall back to default
    }
  };

  const loadEngines = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8766/api/ocr/engines');
      const data = await res.json();
      if (data.success) {
        setEngines(data.engines);
      } else {
        setError('Failed to load OCR engines');
      }
    } catch {
      setError('Could not connect to server — make sure the app is running');
    }
  };

  const setActive = async (engine: OCREngine) => {
    try {
      await window.electronAPI.settings.set('ocr_engine', engine);
      setActiveEngine(engine);
      const displayName = engine === 'rapidocr' ? 'OnnxOCR (PP-OCRv5)' : engine.toUpperCase();
      setSaveStatus(`Switched to ${displayName}`);
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setError('Failed to save engine preference');
    }
  };

  const installEngine = async (engine: string) => {
    setInstalling(prev => ({ ...prev, [engine]: true }));
    setError(null);

    try {
      const res = await fetch('http://127.0.0.1:8766/api/ocr/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine })
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message);
        setInstalling(prev => ({ ...prev, [engine]: false }));
        return;
      }

      const interval = setInterval(async () => {
        try {
          const progressRes = await fetch(`http://127.0.0.1:8766/api/ocr/install/progress/${engine}`);
          const progressData: InstallProgress = await progressRes.json();
          setProgress(prev => ({ ...prev, [engine]: progressData.progress }));

          if (progressData.progress >= 100) {
            clearInterval(interval);
            setInstalling(prev => ({ ...prev, [engine]: false }));
            loadEngines();
          } else if (progressData.progress < 0) {
            clearInterval(interval);
            setInstalling(prev => ({ ...prev, [engine]: false }));
            setError(`Installation failed for ${engine}`);
          }
        } catch {
          clearInterval(interval);
          setInstalling(prev => ({ ...prev, [engine]: false }));
          setError('Failed to check installation progress');
        }
      }, 1000);
    } catch {
      setInstalling(prev => ({ ...prev, [engine]: false }));
      setError('Failed to start installation');
    }
  };

  const isAvailable = (engine: OCREngineInfo) => engine.built_in || engine.installed;

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h2 style={{ marginBottom: '4px', fontSize: '24px', fontWeight: 'bold' }}>
        OCR Engine Management
      </h2>
      <p style={{ marginBottom: '20px', color: '#666', lineHeight: '1.5' }}>
        Manage OCR engines for manga/comic text extraction. Built-in engines are always available.
        Optional engines are stored in your user data directory and preserved across app updates.
      </p>

      {/* Active engine banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          marginBottom: 20,
          backgroundColor: '#e8f5e9',
          border: '1px solid #a5d6a7',
          borderRadius: 8,
        }}
      >
        <span style={{ fontSize: 18 }}>⚙️</span>
        <div>
          <span style={{ fontWeight: 600, color: '#2e7d32' }}>Active OCR engine: </span>
          <span
            style={{
              fontWeight: 700,
              color: '#1b5e20',
              fontSize: 15,
            }}
          >
            {activeEngine === 'rapidocr' ? 'OnnxOCR (PP-OCRv5)' : activeEngine.toUpperCase()}
          </span>
          {activeEngine === 'rapidocr' && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#555' }}>
              (built-in · no download needed)
            </span>
          )}
        </div>
        {saveStatus && (
          <span style={{ marginLeft: 'auto', color: '#2e7d32', fontSize: 13, fontWeight: 500 }}>
            ✓ {saveStatus}
          </span>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: '12px',
            marginBottom: '20px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c33',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {engines.map((engine) => {
          const isActive = activeEngine === engine.engine;
          const available = isAvailable(engine);

          return (
            <div
              key={engine.engine}
              style={{
                border: isActive ? '2px solid #4caf50' : '1px solid #ddd',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: isActive ? '#f1f8e9' : '#fff',
                boxShadow: isActive ? '0 2px 8px rgba(76,175,80,0.15)' : '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                      {engine.engine.toUpperCase()}
                    </h3>
                    {isActive && (
                      <span
                        style={{
                          padding: '2px 8px',
                          backgroundColor: '#4caf50',
                          color: 'white',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                    {engine.built_in && (
                      <span
                        style={{
                          padding: '2px 8px',
                          backgroundColor: '#0288d1',
                          color: 'white',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        Built-in
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 8px 0', color: '#666' }}>{engine.description}</p>
                  <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#888' }}>
                    <strong>Languages:</strong> {engine.languages.join(', ')}
                  </p>
                  {!engine.built_in && (
                    <p style={{ margin: '0', fontSize: '14px', color: '#888' }}>
                      <strong>Download size:</strong> ~{engine.size_mb}MB
                    </p>
                  )}
                </div>

                <div style={{ marginLeft: '20px', minWidth: '150px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Set as active button — shown when available and not already active */}
                  {available && !isActive && (
                    <button
                      onClick={() => setActive(engine.engine as OCREngine)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '14px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#388e3c')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4caf50')}
                    >
                      Use this engine
                    </button>
                  )}

                  {/* Install button */}
                  {!engine.built_in && !engine.installed && !installing[engine.engine] && (
                    <button
                      onClick={() => installEngine(engine.engine)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#2196f3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '14px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1976d2')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2196f3')}
                    >
                      Install (~{engine.size_mb}MB)
                    </button>
                  )}

                  {/* Install progress */}
                  {installing[engine.engine] && (
                    <div style={{ width: '150px' }}>
                      <div
                        style={{
                          width: '100%',
                          height: '32px',
                          backgroundColor: '#f0f0f0',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            width: `${progress[engine.engine] || 0}%`,
                            height: '100%',
                            backgroundColor: '#2196f3',
                            transition: 'width 0.3s ease',
                          }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            fontWeight: 'bold',
                            fontSize: '14px',
                          }}
                        >
                          {progress[engine.engine] || 0}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {engines.length === 0 && !error && (
        <p style={{ textAlign: 'center', color: '#888', marginTop: '40px' }}>
          Loading OCR engines...
        </p>
      )}
    </div>
  );
};
