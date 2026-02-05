#!/usr/bin/env node
/**
 * Generate update manifest (latest.json) for Smart Book auto-update system
 *
 * Usage: node scripts/generate-update-manifest.js [--artifacts-dir ./artifacts]
 *
 * This script:
 * 1. Reads version from package.json
 * 2. Scans for build artifacts (Windows ZIP, macOS ZIP/DMG)
 * 3. Calculates SHA512 checksums
 * 4. Generates latest.json with platform-specific download URLs
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const UPDATE_SERVER_URL = 'https://smartbook.mahmutsalman.cloud';
const DEFAULT_ARTIFACTS_DIR = './artifacts';

/**
 * Calculate SHA512 hash of a file
 */
function calculateSha512(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha512');
  hashSum.update(fileBuffer);
  return hashSum.digest('base64');
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size;
}

/**
 * Find artifact files in directory structure
 */
function findArtifacts(artifactsDir) {
  const artifacts = {
    'win32-x64': null,
    'darwin-arm64': null,
    'darwin-x64': null,
  };

  // Recursively search for files
  function searchDir(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        searchDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.zip')) {
        const fileName = entry.name.toLowerCase();

        // Windows: Smart-Book-*-win32-x64.zip
        if (fileName.includes('win32') && fileName.includes('x64')) {
          artifacts['win32-x64'] = fullPath;
        }
        // macOS ARM: Smart-Book-*-darwin-arm64.zip
        else if (fileName.includes('darwin') && fileName.includes('arm64')) {
          artifacts['darwin-arm64'] = fullPath;
        }
        // macOS Intel: Smart-Book-*-darwin-x64.zip
        else if (fileName.includes('darwin') && fileName.includes('x64') && !fileName.includes('arm')) {
          artifacts['darwin-x64'] = fullPath;
        }
      }
    }
  }

  searchDir(artifactsDir);
  return artifacts;
}

/**
 * Generate the manifest
 */
function generateManifest(version, artifacts, changelog = []) {
  const platforms = {};

  for (const [platform, filePath] of Object.entries(artifacts)) {
    if (filePath && fs.existsSync(filePath)) {
      const fileName = path.basename(filePath);
      const platformDir = platform.startsWith('darwin') ? 'macos' : 'windows';

      platforms[platform] = {
        url: `${UPDATE_SERVER_URL}/releases/${platformDir}/${fileName}`,
        sha512: calculateSha512(filePath),
        size: getFileSize(filePath),
      };

      console.log(`Found ${platform}: ${fileName} (${(platforms[platform].size / 1024 / 1024).toFixed(2)} MB)`);
    }
  }

  const manifest = {
    version: version,
    releaseDate: new Date().toISOString(),
    releaseNotesUrl: `${UPDATE_SERVER_URL}/releases/release-notes/v${version}.md`,
    platforms: platforms,
    changelog: changelog,
  };

  return manifest;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  let artifactsDir = DEFAULT_ARTIFACTS_DIR;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--artifacts-dir' && args[i + 1]) {
      artifactsDir = args[i + 1];
      i++;
    }
  }

  // Read version from package.json
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    console.error('Error: package.json not found');
    process.exit(1);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;

  console.log(`Generating update manifest for Smart Book v${version}`);
  console.log(`Artifacts directory: ${artifactsDir}`);
  console.log('');

  // Find artifacts
  const artifacts = findArtifacts(artifactsDir);

  // Check if we found any artifacts
  const foundArtifacts = Object.values(artifacts).filter(Boolean).length;
  if (foundArtifacts === 0) {
    console.error('Error: No artifacts found');
    console.error('Expected structure:');
    console.error('  artifacts/');
    console.error('    windows/Smart-Book-*-win32-x64.zip');
    console.error('    macos/Smart-Book-*-darwin-arm64.zip');
    console.error('    macos/Smart-Book-*-darwin-x64.zip');
    process.exit(1);
  }

  console.log(`Found ${foundArtifacts} artifact(s)`);
  console.log('');

  // Generate manifest
  const manifest = generateManifest(version, artifacts);

  // Write manifest to artifacts directory
  const manifestPath = path.join(artifactsDir, 'latest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to: ${manifestPath}`);

  // Also output to stdout for CI/CD
  console.log('\n=== latest.json ===');
  console.log(JSON.stringify(manifest, null, 2));
}

main();
