import React, { useState, useEffect } from 'react';

interface OCREngine {
  engine: string;
  installed: boolean;
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
  const [engines, setEngines] = useState<OCREngine[]>([]);
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEngines();
  }, []);

  const loadEngines = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8766/api/ocr/engines');
      const data = await res.json();
      if (data.success) {
        setEngines(data.engines);
      } else {
        setError('Failed to load OCR engines');
      }
    } catch (err) {
      console.error('Failed to load OCR engines:', err);
      setError('Failed to connect to server');
    }
  };

  const installEngine = async (engine: string) => {
    setInstalling({ ...installing, [engine]: true });
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
        setInstalling({ ...installing, [engine]: false });
        return;
      }

      // Poll installation progress
      const interval = setInterval(async () => {
        try {
          const progressRes = await fetch(
            `http://127.0.0.1:8766/api/ocr/install/progress/${engine}`
          );
          const progressData: InstallProgress = await progressRes.json();

          setProgress({ ...progress, [engine]: progressData.progress });

          if (progressData.progress >= 100) {
            clearInterval(interval);
            setInstalling({ ...installing, [engine]: false });
            loadEngines(); // Reload to update installed status
          } else if (progressData.progress < 0) {
            // Installation failed
            clearInterval(interval);
            setInstalling({ ...installing, [engine]: false });
            setError(`Installation failed for ${engine}`);
          }
        } catch (err) {
          clearInterval(interval);
          setInstalling({ ...installing, [engine]: false });
          setError('Failed to check installation progress');
        }
      }, 1000);
    } catch (err) {
      console.error('Installation failed:', err);
      setInstalling({ ...installing, [engine]: false });
      setError('Failed to start installation');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h2 style={{ marginBottom: '10px', fontSize: '24px', fontWeight: 'bold' }}>
        OCR Engine Management
      </h2>
      <p style={{ marginBottom: '20px', color: '#666', lineHeight: '1.5' }}>
        Install OCR engines for manga/comic text extraction. Engines are stored in your user data
        directory and preserved across app updates.
      </p>

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
        {engines.map((engine) => (
          <div
            key={engine.engine}
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '16px',
              backgroundColor: '#fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }}>
                  {engine.engine.toUpperCase()}
                </h3>
                <p style={{ margin: '0 0 8px 0', color: '#666' }}>{engine.description}</p>
                <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#888' }}>
                  <strong>Languages:</strong> {engine.languages.join(', ')}
                </p>
                <p style={{ margin: '0', fontSize: '14px', color: '#888' }}>
                  <strong>Download size:</strong> ~{engine.size_mb}MB
                </p>
              </div>

              <div style={{ marginLeft: '20px', minWidth: '150px' }}>
                {engine.installed ? (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '8px 16px',
                      backgroundColor: '#4caf50',
                      color: 'white',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                    }}
                  >
                    ✓ Installed
                  </span>
                ) : installing[engine.engine] ? (
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
                ) : (
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
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#1976d2';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#2196f3';
                    }}
                  >
                    Install (~{engine.size_mb}MB)
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {engines.length === 0 && !error && (
        <p style={{ textAlign: 'center', color: '#888', marginTop: '40px' }}>
          Loading OCR engines...
        </p>
      )}
    </div>
  );
};
