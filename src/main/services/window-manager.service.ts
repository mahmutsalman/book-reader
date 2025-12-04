import { BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Service for managing additional Electron windows
 */
export class WindowManagerService {
  private static instance: WindowManagerService;
  private preStudyWindow: BrowserWindow | null = null;
  private tempHtmlPath: string | null = null;

  private constructor() {
    // Singleton pattern - prevent external instantiation
  }

  static getInstance(): WindowManagerService {
    if (!WindowManagerService.instance) {
      WindowManagerService.instance = new WindowManagerService();
    }
    return WindowManagerService.instance;
  }

  /**
   * Open a new window with HTML content
   */
  openHtmlWindow(htmlContent: string, title: string): void {
    // Close existing window if open
    if (this.preStudyWindow && !this.preStudyWindow.isDestroyed()) {
      this.preStudyWindow.close();
    }

    // Clean up previous temp file
    this.cleanupTempFile();

    // Write HTML to temp file (data URLs have size limits with large base64 audio)
    const tempDir = app.getPath('temp');
    this.tempHtmlPath = path.join(tempDir, `pre-study-${Date.now()}.html`);

    try {
      fs.writeFileSync(this.tempHtmlPath, htmlContent, 'utf-8');
      console.log('[WindowManager] HTML written to temp file:', this.tempHtmlPath, 'size:', htmlContent.length);
    } catch (err) {
      console.error('[WindowManager] Failed to write temp file:', err);
      return;
    }

    // Create new window
    this.preStudyWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 600,
      minHeight: 400,
      title,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
      backgroundColor: '#f5f5f5',
      show: false, // Don't show until ready
    });

    // Remove menu bar
    this.preStudyWindow.setMenuBarVisibility(false);

    // Load HTML from temp file (avoids data URL size limits)
    this.preStudyWindow.loadFile(this.tempHtmlPath).catch((err) => {
      console.error('[WindowManager] Failed to load HTML file:', err);
    });

    // Show window when ready
    this.preStudyWindow.once('ready-to-show', () => {
      console.log('[WindowManager] Window ready to show');
      this.preStudyWindow?.show();
      this.preStudyWindow?.focus();
    });

    // Handle load failures
    this.preStudyWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('[WindowManager] Load failed:', errorCode, errorDescription);
    });

    // Handle window close
    this.preStudyWindow.on('closed', () => {
      this.preStudyWindow = null;
      this.cleanupTempFile();
    });
  }

  /**
   * Clean up temporary HTML file
   */
  private cleanupTempFile(): void {
    if (this.tempHtmlPath) {
      try {
        if (fs.existsSync(this.tempHtmlPath)) {
          fs.unlinkSync(this.tempHtmlPath);
          console.log('[WindowManager] Temp file cleaned up:', this.tempHtmlPath);
        }
      } catch (err) {
        console.error('[WindowManager] Failed to clean up temp file:', err);
      }
      this.tempHtmlPath = null;
    }
  }

  /**
   * Close the pre-study window if open
   */
  closePreStudyWindow(): void {
    if (this.preStudyWindow && !this.preStudyWindow.isDestroyed()) {
      this.preStudyWindow.close();
      this.preStudyWindow = null;
    }
  }

  /**
   * Check if pre-study window is open
   */
  isPreStudyWindowOpen(): boolean {
    return this.preStudyWindow !== null && !this.preStudyWindow.isDestroyed();
  }
}

// Export singleton
export const windowManagerService = WindowManagerService.getInstance();
