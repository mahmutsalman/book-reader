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

      // Determine the Python script path
      const scriptPath = this.getScriptPath();
      console.log(`[PythonManager] Starting server from: ${scriptPath}`);

      // Check if we're in development or production
      const isDev = !app.isPackaged;

      if (isDev) {
        // Development: Run Python script directly
        this.process = spawn('python3', [scriptPath], {
          cwd: path.dirname(scriptPath),
          env: { ...process.env, PORT: String(this.port) },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        // Production: Run bundled binary
        // TODO: Implement PyInstaller binary execution for production
        // For now, fall back to Python script
        this.process = spawn('python3', [scriptPath], {
          cwd: path.dirname(scriptPath),
          env: { ...process.env, PORT: String(this.port) },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      }

      // Handle process output
      this.process.stdout?.on('data', (data) => {
        console.log(`[Python] ${data.toString().trim()}`);
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[Python] ${data.toString().trim()}`);
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

    while (Date.now() - startTime < STARTUP_TIMEOUT) {
      if (await this.checkHealth()) {
        this.isReady = true;
        return;
      }
      await this.sleep(500);
    }

    throw new Error('Server startup timeout');
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
   * Get the path to the Python server script.
   */
  private getScriptPath(): string {
    if (app.isPackaged) {
      // Production: Look in resources
      return path.join(process.resourcesPath, 'python-server', 'server.py');
    } else {
      // Development: Look in src directory
      return path.join(app.getAppPath(), 'src', 'python-server', 'server.py');
    }
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
