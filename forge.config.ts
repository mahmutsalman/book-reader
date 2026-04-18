import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerMSIX } from '@electron-forge/maker-msix';
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
    // macOS code signing — requires APPLE_IDENTITY secret in GitHub Actions
    ...(process.platform === 'darwin' && process.env.APPLE_IDENTITY ? {
      osxSign: {
        identity: process.env.APPLE_IDENTITY,
        hardenedRuntime: true,
        entitlements: 'entitlements.plist',
        entitlementsInherit: 'entitlements.plist',
      },
      // Notarization is handled as a separate CI step for better visibility + timeout control
    } : {}),
    // Include embedded Python runtime and server files
    extraResource: [
      // WASM binary for CBR extraction (node-unrar-js fetch fails in Electron main process)
      'node_modules/node-unrar-js/dist/js/unrar.wasm',

      // Bundle entire Python runtime directory
      'src/python-server/python-runtime',

      // Bundle server source files
      'src/python-server/server.py',
      'src/python-server/generators',

      // Bundle pre-downloaded OCR wheels for offline installation (Windows only)
      // Note: macOS would need different wheels (macosx_arm64/x86_64), not built yet
      process.platform === 'win32' && fs.existsSync('src/python-server/ocr-wheels')
        ? 'src/python-server/ocr-wheels'
        : null,

      // Bundle platform-specific launcher
      process.platform === 'win32'
        ? 'src/python-server/launch-server.bat'
        : 'src/python-server/launch-server.sh'
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

      // Note: Python runtime and launcher are copied via extraResource
      // They will be available in the final packaged app, but not during this hook
      console.log('[Python Server] Python runtime will be bundled via extraResource');
    },
  },
  makers: [
    // Windows: MSIX for Microsoft Store — post-build CI script fixes the manifest
    // (manifestVariables overrides are silently ignored by maker-msix, so we unpack
    //  and patch AppxManifest.xml after the build in the build-msix CI job)
    new MakerMSIX({
      publisher: `CN=${process.env.MSIX_PUBLISHER_ID || 'CB8EE37E-117E-4E70-8185-8DEF5C546796'}`,
      publisherDisplayName: 'Mahmut Salman',
      identityName: 'MahmutSalman.SmartBookReader',
    }),
    // Windows: Squirrel installer — enables silent auto-update via Electron autoUpdater.
    // Friends install once via SmartBookSetup.exe, then the app updates itself silently.
    // SmartScreen may warn on first install (one-time bypass: "More info" → "Run anyway").
    // All subsequent updates happen in-app with no user friction.
    new MakerSquirrel({
      name: 'SmartBook',
      setupExe: 'SmartBookSetup.exe',
      setupIcon: 'assets/icon.ico',
      loadingGif: 'assets/installer-loading.gif',
      // Code signing (optional — add cert secrets to GitHub Actions to eliminate SmartScreen):
      // certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
      // certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
    }),
    // macOS: ZIP + DMG (ZIP used by autoUpdater feed; DMG for manual first install)
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
