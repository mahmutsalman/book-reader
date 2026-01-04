import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import fs from 'fs';
import path from 'path';

// Helper to copy directory recursively
function copyDirSync(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '{**/node_modules/better-sqlite3/**,**/node_modules/bindings/**,**/node_modules/file-uri-to-path/**}',
    },
    icon: 'assets/icon',
    // Include bundled Python server binary in resources
    extraResource: [
      // macOS/Linux binary
      ...(process.platform !== 'win32' ? ['src/python-server/dist/pronunciation-server'] : []),
      // Windows binary
      ...(process.platform === 'win32' ? ['src/python-server/dist/pronunciation-server.exe'] : []),
    ].filter(Boolean),
  },
  rebuildConfig: {
    force: true,
  },
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // Copy native modules to the build directory
      const nodeModulesSrc = path.resolve(__dirname, 'node_modules');
      const nodeModulesDest = path.join(buildPath, 'node_modules');

      // Copy better-sqlite3 and its dependencies
      const modulesToCopy = ['better-sqlite3', 'bindings', 'file-uri-to-path'];
      for (const mod of modulesToCopy) {
        const src = path.join(nodeModulesSrc, mod);
        const dest = path.join(nodeModulesDest, mod);
        if (fs.existsSync(src)) {
          copyDirSync(src, dest);
          console.log(`Copied ${mod} to build`);
        }
      }

      // CRITICAL: Copy Python server binary to resources directory
      // This ensures the binary is included even if extraResource fails
      console.log('[Python Binary Copy] Starting binary copy process...');
      console.log(`[Python Binary Copy] Platform: ${process.platform}`);
      console.log(`[Python Binary Copy] Build path: ${buildPath}`);

      const binaryName = process.platform === 'win32'
        ? 'pronunciation-server.exe'
        : 'pronunciation-server';
      const binarySrc = path.resolve(__dirname, 'src', 'python-server', 'dist', binaryName);

      console.log(`[Python Binary Copy] Binary name: ${binaryName}`);
      console.log(`[Python Binary Copy] Source path: ${binarySrc}`);
      console.log(`[Python Binary Copy] Source exists: ${fs.existsSync(binarySrc)}`);

      // Check if source binary exists
      if (!fs.existsSync(binarySrc)) {
        console.error(`[ERROR] [Python Binary Copy] Source binary not found at ${binarySrc}`);
        console.error(`[Python Binary Copy] This usually means the Python build step failed.`);
        console.error(`[Python Binary Copy] Skipping binary copy to avoid breaking the build.`);
        console.error(`[Python Binary Copy] WARNING: The packaged app will NOT have the Python server!`);
        return; // Don't throw - let the verification step catch this
      }

      // Calculate destination path
      // buildPath structure varies by platform:
      // macOS: .../Smart Book.app/Contents/Resources/app
      // Windows: .../BookReader-win32-x64/resources/app

      let resourcesPath: string;
      if (process.platform === 'darwin') {
        // macOS: buildPath = .../Smart Book.app/Contents/Resources/app
        // We want: .../Smart Book.app/Contents/Resources/
        resourcesPath = path.dirname(buildPath);
      } else {
        // Windows/Linux: buildPath = .../resources/app
        // We want: .../resources/
        resourcesPath = path.dirname(buildPath);
      }

      const binaryDest = path.join(resourcesPath, binaryName);

      console.log(`[Python Binary Copy] Resources path: ${resourcesPath}`);
      console.log(`[Python Binary Copy] Destination path: ${binaryDest}`);
      console.log(`[Python Binary Copy] Resources path exists: ${fs.existsSync(resourcesPath)}`);

      try {
        fs.copyFileSync(binarySrc, binaryDest);
        console.log(`[SUCCESS] [Python Binary Copy] Successfully copied ${binaryName}`);

        // Verify the copy
        if (fs.existsSync(binaryDest)) {
          const stats = fs.statSync(binaryDest);
          console.log(`[SUCCESS] [Python Binary Copy] Verified: ${binaryName} (${stats.size} bytes)`);
        } else {
          console.error(`[ERROR] [Python Binary Copy] Copy verification failed - file not found at destination`);
        }
      } catch (error) {
        console.error(`[ERROR] [Python Binary Copy] Failed to copy binary:`, error);
        console.error(`[Python Binary Copy] WARNING: The packaged app will NOT have the Python server!`);
      }
    },
  },
  makers: [
    new MakerSquirrel({
      name: 'SmartBook',
      authors: 'Mahmut Salman',
      description: 'A smart book reader with AI-powered word lookup and vocabulary tracking',
      setupIcon: 'assets/icon.ico',
      // Note: iconUrl should point to a publicly accessible URL for auto-updates
      // For now, leaving it undefined. Add when hosting releases on GitHub.
      // Skip MSI creation (reduces installer complexity and Windows security issues)
      noMsi: true,
      // Reduce Windows Application Control issues by skipping desktop shortcuts
      // Users can still pin to taskbar manually or create shortcuts
      loadingGif: undefined,
    }),
    // Portable ZIP for both platforms (Windows: alternative to problematic Squirrel installer)
    new MakerZIP({}, ['darwin', 'win32']),
    new MakerDMG({
      format: 'ULFO',
      icon: 'assets/icon.icns',
    }),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};

export default config;
