/**
 * Python Server Manager for BookReader.
 * Manages the lifecycle of the Python pronunciation server.
 */
import { spawn, ChildProcess, exec } from 'child_process';
import { createServer } from 'net';
import path from 'path';
import { app } from 'electron';
import type { HealthResponse, PronunciationServerStatus } from '../../shared/types/pronunciation.types';

const DEFAULT_PORT = 8766;
const HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
const STARTUP_TIMEOUT = 30000; // 30 seconds
const SHUTDOWN_TIMEOUT = 5000; // 5 seconds
const STARTUP_RETRY_ATTEMPTS = 3;
const STARTUP_RETRY_BASE_DELAY = 500;
const PORT_RELEASE_TIMEOUT = 3000;

class PythonManager {
  private process: ChildProcess | null = null;
  private port: number = DEFAULT_PORT;
  private isReady = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private startupPromise: Promise<void> | null = null;
  private isRestarting = false;
  private lastStartupError: string | null = null;

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
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= STARTUP_RETRY_ATTEMPTS; attempt++) {
        try {
          // Kill any existing process on the port
          await this.killExistingProcess();
          await this.ensurePortAvailable(PORT_RELEASE_TIMEOUT);

          this.spawnServerProcess();

          // Wait for server to be ready
          await this.waitForReady();

          // Start health checks
          this.startHealthChecks();

          // Clear any previous errors on successful start
          this.lastStartupError = null;

          console.log('[PythonManager] Server started successfully');
          return;
        } catch (error) {
          lastError = error;
          console.warn(`[PythonManager] Start attempt ${attempt}/${STARTUP_RETRY_ATTEMPTS} failed:`, error);

          await this.cleanupFailedStart();

          if (attempt < STARTUP_RETRY_ATTEMPTS) {
            const delayMs = STARTUP_RETRY_BASE_DELAY * attempt;
            console.log(`[PythonManager] Retrying start in ${delayMs}ms...`);
            await this.sleep(delayMs);
          }
        }
      }

      throw lastError ?? new Error('Failed to start server');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[PythonManager] Failed to start server:', errorMsg);
      this.lastStartupError = errorMsg;
      this.startupPromise = null;
      throw error;
    }
  }

  private spawnServerProcess(): void {
    // Check if we're in development or production
    const isDev = !app.isPackaged;
    const fs = require('fs');

    if (isDev) {
      // Development: Use venv Python to run the script
      const scriptPath = this.getScriptPath();
      const serverDir = path.dirname(scriptPath);
      const pythonPath = this.getVenvPythonPath(serverDir);

      console.log(`[PythonManager] Development mode - using venv Python`);
      console.log(`[PythonManager] Python: ${pythonPath}`);
      console.log(`[PythonManager] Script: ${scriptPath}`);

      // Check if Python executable exists
      if (!fs.existsSync(pythonPath)) {
        const error = `Python executable not found at: ${pythonPath}`;
        console.error(`[PythonManager] ${error}`);
        this.lastStartupError = error;
        throw new Error(error);
      }

      // Check if script exists
      if (!fs.existsSync(scriptPath)) {
        const error = `Server script not found at: ${scriptPath}`;
        console.error(`[PythonManager] ${error}`);
        this.lastStartupError = error;
        throw new Error(error);
      }

      this.process = spawn(pythonPath, [scriptPath], {
        cwd: serverDir,
        env: { ...process.env, PORT: String(this.port), PYTHONUNBUFFERED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      // Production: Run bundled PyInstaller binary
      const binaryPath = this.getBinaryPath();
      console.log(`[PythonManager] Production mode - using bundled binary`);
      console.log(`[PythonManager] Binary path: ${binaryPath}`);
      console.log(`[PythonManager] Resources path: ${process.resourcesPath}`);

      // Check if binary exists
      if (!fs.existsSync(binaryPath)) {
        const error = `Server binary not found at: ${binaryPath}\n` +
          `This usually means the binary was not included in the app build.\n` +
          `Expected location: ${process.resourcesPath}/pronunciation-server.exe`;
        console.error(`[PythonManager] ${error}`);
        this.lastStartupError = error;
        throw new Error(error);
      }

      console.log(`[PythonManager] Binary exists: ${fs.existsSync(binaryPath)}`);
      console.log(`[PythonManager] Binary size: ${fs.statSync(binaryPath).size} bytes`);

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
      const errorMsg = `Process spawn error: ${err.message}`;
      console.error('[PythonManager]', errorMsg);
      this.lastStartupError = errorMsg;
      this.isReady = false;
    });

    this.process.on('exit', (code) => {
      console.log(`[PythonManager] Process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        this.lastStartupError = `Process exited with non-zero code: ${code}`;
      }
      this.isReady = false;
      this.process = null;
    });
  }

  /**
   * Stop the Python server.
   */
  async stop(): Promise<void> {
    // Don't interfere if we're in the middle of a restart
    if (this.isRestarting) {
      console.log('[PythonManager] Restart in progress, skipping stop');
      return;
    }

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
          console.log('[PythonManager] Graceful shutdown timeout, force killing...');

          if (process.platform === 'win32') {
            // Windows: Use taskkill with /T to kill process tree
            const pid = this.process.pid;
            if (pid) {
              exec(`taskkill /F /PID ${pid} /T`, () => {
                this.process = null;
                this.isReady = false;
                this.startupPromise = null;
              });
            }
          } else {
            // Unix: SIGKILL
            this.process.kill('SIGKILL');
          }
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
   * Force cleanup: kill current process AND any port conflicts.
   */
  private async forceCleanup(): Promise<void> {
    console.log('[PythonManager] Force cleanup initiated...');

    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Kill current process if running
    if (this.process) {
      try {
        if (process.platform === 'win32') {
          const pid = this.process.pid;
          if (pid) {
            exec(`taskkill /F /PID ${pid} /T`, () => {
              // Fire-and-forget cleanup
            });
          }
        } else {
          this.process.kill('SIGKILL');
        }
      } catch (error) {
        console.error('[PythonManager] Error force killing process:', error);
      }

      this.process = null;
    }

    // Clean up port
    await this.killExistingProcess();

    // Reset state
    this.isReady = false;
    this.startupPromise = null;

    console.log('[PythonManager] Force cleanup complete');
  }

  /**
   * Restart the Python server with force cleanup.
   */
  async restart(): Promise<void> {
    console.log('[PythonManager] Restarting server...');

    // Set flag to prevent interference from app quit handlers
    this.isRestarting = true;

    try {
      // Force cleanup any existing processes
      await this.forceCleanup();

      // Wait for port to be released
      await this.sleep(1000);

      // Start fresh
      await this.start();

      console.log('[PythonManager] Server restarted successfully');
    } catch (error) {
      console.error('[PythonManager] Failed to restart server:', error);
      throw error;
    } finally {
      // Clear flag after restart completes (success or failure)
      this.isRestarting = false;
    }
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
      error: this.lastStartupError || undefined,
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

      if (!this.process) {
        throw new Error('Server process exited before becoming ready');
      }

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
   * Ensure the port is available before starting the server.
   */
  private async ensurePortAvailable(timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isPortAvailable()) {
        return;
      }
      await this.sleep(200);
    }

    throw new Error(`Port ${this.port} is still in use after ${timeoutMs}ms`);
  }

  private async isPortAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();

      server.once('error', () => {
        resolve(false);
      });

      server.once('listening', () => {
        server.close(() => resolve(true));
      });

      server.listen(this.port, '127.0.0.1');
    });
  }

  private async cleanupFailedStart(): Promise<void> {
    if (!this.process) {
      return;
    }

    const failedProcess = this.process;
    this.process = null;
    this.isReady = false;

    try {
      if (process.platform === 'win32' && failedProcess.pid) {
        exec(`taskkill /F /PID ${failedProcess.pid} /T`, () => {
          // Best-effort cleanup
        });
      } else {
        failedProcess.kill('SIGKILL');
      }
    } catch (error) {
      console.warn('[PythonManager] Cleanup after failed start encountered an error:', error);
    }
  }

  private execCommand(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(command, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Kill process on Windows by port number using PowerShell with netstat fallback.
   */
  private async killProcessOnPortWindows(): Promise<void> {
    const powershellCommand = `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${this.port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`;
    const powerShellOk = await this.execCommand(powershellCommand);

    if (powerShellOk) {
      await this.sleep(500);
      return;
    }

    return this.killProcessOnPortWindowsNetstat();
  }

  private async killProcessOnPortWindowsNetstat(): Promise<void> {
    return new Promise((resolve) => {
      exec('netstat -ano', (error, stdout) => {
        if (error || !stdout) {
          resolve();
          return;
        }

        const lines = stdout.split('\n');
        const pids = new Set<string>();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          const parts = trimmed.split(/\s+/);
          if (parts.length < 4) {
            continue;
          }

          const localAddress = parts[1];
          const pid = parts[parts.length - 1];

          if (!localAddress.endsWith(`:${this.port}`)) {
            continue;
          }

          if (!/^\d+$/.test(pid)) {
            continue;
          }

          pids.add(pid);
        }

        if (pids.size === 0) {
          resolve();
          return;
        }

        const pidList = Array.from(pids).join(' /PID ');
        exec(`taskkill /F /T /PID ${pidList}`, () => {
          setTimeout(resolve, 500);
        });
      });
    });
  }

  /**
   * Kill any existing process on the port (cross-platform).
   */
  private async killExistingProcess(): Promise<void> {
    console.log(`[PythonManager] Cleaning up port ${this.port}...`);

    if (process.platform === 'win32') {
      await this.killProcessOnPortWindows();
    } else {
      // macOS/Linux
      return new Promise((resolve) => {
        exec(`lsof -ti:${this.port} | xargs kill -9 2>/dev/null || true`, () => {
          setTimeout(resolve, 500);
        });
      });
    }
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
