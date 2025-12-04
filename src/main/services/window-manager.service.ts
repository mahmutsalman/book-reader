import { BrowserWindow } from 'electron';

/**
 * Service for managing additional Electron windows
 */
export class WindowManagerService {
  private static instance: WindowManagerService;
  private preStudyWindow: BrowserWindow | null = null;

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

    // Load HTML content using data URL
    const encodedHtml = encodeURIComponent(htmlContent);
    this.preStudyWindow.loadURL(`data:text/html;charset=utf-8,${encodedHtml}`);

    // Show window when ready
    this.preStudyWindow.once('ready-to-show', () => {
      this.preStudyWindow?.show();
      this.preStudyWindow?.focus();
    });

    // Handle window close
    this.preStudyWindow.on('closed', () => {
      this.preStudyWindow = null;
    });
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
