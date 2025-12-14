/**
 * Python Server Manager for BookReader.
 * Manages the lifecycle of the Python pronunciation server.
 */
import { spawn, ChildProcess, exec } from 'child_process';
import path from 'path';
import { app } from 'electron';
import type { HealthResponse, PronunciationServerStatus } from '../../shared/types/pronunciation.types';

const DEFAULT_PORT = 8766;
const HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
const STARTUP_TIMEOUT = 30000; // 30 seconds
const SHUTDOWN_TIMEOUT = 5000; // 5 seconds

class PythonManager {
  private process: ChildProcess | null = null;
  private port: number = DEFAULT_PORT;
  private isReady: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private startupPromise: Promise<void> | null = null;

  /**
   * Get the base URL of the Python server.
   */
  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * Check if the server is running and ready.
   */
  get ready(): boolean {
    return this.isReady;
  }

  /**
   * Start the Python server.
   */
  async start(): Promise<void> {
    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = this._start();
    return this.startupPromise;
  }

  private async _start(): Promise<void> {
    try {
      // Kill any existing process on the port
      await this.killExistingProcess();

      // Check if we're in development or production
      const isDev = !app.isPackaged;

      if (isDev) {
        // Development: Use venv Python to run the script
        const scriptPath = this.getScriptPath();
        const serverDir = path.dirname(scriptPath);
        const pythonPath = this.getVenvPythonPath(serverDir);

        console.log(`[PythonManager] Development mode - using venv Python`);
        console.log(`[PythonManager] Python: ${pythonPath}`);
        console.log(`[PythonManager] Script: ${scriptPath}`);

        this.process = spawn(pythonPath, [scriptPath], {
          cwd: serverDir,
          env: { ...process.env, PORT: String(this.port), PYTHONUNBUFFERED: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        // Production: Run bundled PyInstaller binary
        const binaryPath = this.getBinaryPath();
        console.log(`[PythonManager] Production mode - using bundled binary`);
        console.log(`[PythonManager] Binary: ${binaryPath}`);

        this.process = spawn(binaryPath, [], {
          cwd: path.dirname(binaryPath),
          env: { ...process.env, PORT: String(this.port), PYTHONUNBUFFERED: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      }

      // Handle process output
      this.process.stdout?.on('data', (data) => {
        const msg = data.toString().trim();
        console.log(`[Python:${new Date().toISOString()}] ${msg}`);
      });

      this.process.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        console.error(`[Python:ERROR:${new Date().toISOString()}] ${msg}`);
      });

      this.process.on('error', (err) => {
        console.error('[PythonManager] Process error:', err);
        this.isReady = false;
      });

      this.process.on('exit', (code) => {
        console.log(`[PythonManager] Process exited with code ${code}`);
        this.isReady = false;
        this.process = null;
      });

      // Wait for server to be ready
      await this.waitForReady();

      // Start health checks
      this.startHealthChecks();

      console.log('[PythonManager] Server started successfully');
    } catch (error) {
      console.error('[PythonManager] Failed to start server:', error);
      this.startupPromise = null;
      throw error;
    }
  }

  /**
   * Stop the Python server.
   */
  async stop(): Promise<void> {
    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (!this.process) {
      return;
    }

    console.log('[PythonManager] Stopping server...');

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if graceful shutdown fails
        if (this.process) {
          console.log('[PythonManager] Force killing server...');
          this.process.kill('SIGKILL');
        }
        resolve();
      }, SHUTDOWN_TIMEOUT);

      if (this.process) {
        this.process.once('exit', () => {
          clearTimeout(timeout);
          this.process = null;
          this.isReady = false;
          this.startupPromise = null;
          console.log('[PythonManager] Server stopped');
          resolve();
        });

        // Try graceful shutdown first
        this.process.kill('SIGTERM');
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  /**
   * Get the server status.
   */
  getStatus(): PronunciationServerStatus {
    return {
      running: this.process !== null,
      ready: this.isReady,
      port: this.port,
      url: this.baseUrl,
    };
  }

  /**
   * Check server health.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as HealthResponse;
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Wait for the server to be ready.
   */
  private async waitForReady(): Promise<void> {
    const startTime = Date.now();
    let attemptCount = 0;

    console.log('[PythonManager] Waiting for server to be ready...');

    while (Date.now() - startTime < STARTUP_TIMEOUT) {
      attemptCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (await this.checkHealth()) {
        console.log(`[PythonManager] Server ready after ${elapsed}s (${attemptCount} attempts)`);
        this.isReady = true;
        return;
      }

      if (attemptCount % 5 === 0) {
        console.log(`[PythonManager] Still waiting... ${elapsed}s elapsed (${attemptCount} attempts)`);
      }

      await this.sleep(500);
    }

    console.error('[PythonManager] Server startup timeout after 30s');
    throw new Error('Server startup timeout - check Python server logs for details');
  }

  /**
   * Start periodic health checks.
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      const healthy = await this.checkHealth();
      if (!healthy && this.isReady) {
        console.warn('[PythonManager] Server health check failed');
        this.isReady = false;
      } else if (healthy && !this.isReady) {
        console.log('[PythonManager] Server recovered');
        this.isReady = true;
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Get the path to the Python server script (development only).
   */
  private getScriptPath(): string {
    // Development: Look in src directory
    return path.join(app.getAppPath(), 'src', 'python-server', 'server.py');
  }

  /**
   * Get the path to the venv Python interpreter (development only).
   */
  private getVenvPythonPath(serverDir: string): string {
    if (process.platform === 'win32') {
      return path.join(serverDir, 'venv', 'Scripts', 'python.exe');
    }
    return path.join(serverDir, 'venv', 'bin', 'python');
  }

  /**
   * Get the path to the bundled binary (production only).
   * extraResource places the binary at the root of resourcesPath.
   */
  private getBinaryPath(): string {
    const binaryName = process.platform === 'win32'
      ? 'pronunciation-server.exe'
      : 'pronunciation-server';
    return path.join(process.resourcesPath, binaryName);
  }

  /**
   * Kill any existing process on the port.
   */
  private async killExistingProcess(): Promise<void> {
    return new Promise((resolve) => {
      // Try to find and kill any process on the port
      exec(`lsof -ti:${this.port} | xargs kill -9 2>/dev/null || true`, () => {
        // Wait a bit for the port to be released
        setTimeout(resolve, 500);
      });
    });
  }

  /**
   * Sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const pythonManager = new PythonManager();
