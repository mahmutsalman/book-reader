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
      const binaryName = process.platform === 'win32'
        ? 'pronunciation-server.exe'
        : 'pronunciation-server';
      const binarySrc = path.resolve(__dirname, 'src', 'python-server', 'dist', binaryName);

      // The buildPath is the app directory (e.g., .../app)
      // We need to copy to the parent resources directory
      const resourcesPath = path.dirname(buildPath);
      const binaryDest = path.join(resourcesPath, binaryName);

      console.log(`[Python Binary Copy] Source: ${binarySrc}`);
      console.log(`[Python Binary Copy] Destination: ${binaryDest}`);
      console.log(`[Python Binary Copy] Build path: ${buildPath}`);
      console.log(`[Python Binary Copy] Resources path: ${resourcesPath}`);

      if (fs.existsSync(binarySrc)) {
        fs.copyFileSync(binarySrc, binaryDest);
        console.log(`✅ [Python Binary Copy] Successfully copied ${binaryName} to resources`);

        // Verify the copy
        if (fs.existsSync(binaryDest)) {
          const stats = fs.statSync(binaryDest);
          console.log(`✅ [Python Binary Copy] Verified: ${binaryName} (${stats.size} bytes)`);
        } else {
          console.error(`❌ [Python Binary Copy] ERROR: Copy verification failed for ${binaryName}`);
        }
      } else {
        console.error(`❌ [Python Binary Copy] ERROR: Source binary not found at ${binarySrc}`);
        throw new Error(`Python server binary not found at ${binarySrc}. Did the Python build step complete successfully?`);
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
    }),
    new MakerZIP({}, ['darwin']),
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
