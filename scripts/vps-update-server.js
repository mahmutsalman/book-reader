#!/usr/bin/env node
'use strict';
/**
 * Squirrel.Mac update server for Smart Book
 *
 * Squirrel.Mac (Electron autoUpdater on macOS) sends:
 *   GET /update/darwin/:arch/:version
 *
 * We respond with:
 *   204 No Content   — user is already on latest version
 *   200 { "url": "https://..." } — ZIP URL for the new version
 *
 * Run: node vps-update-server.js
 * Env: RELEASES_DIR, UPDATE_SERVER_PORT
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const RELEASES_DIR = process.env.RELEASES_DIR || '/var/www/smartbook/releases';
const PORT = parseInt(process.env.UPDATE_SERVER_PORT || '3001', 10);

function compareVersions(a, b) {
  const clean = (v) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pa = clean(a);
  const pb = clean(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

const server = http.createServer((req, res) => {
  const match = req.url && req.url.match(/^\/update\/darwin\/(arm64|x64)\/([^/?]+)/);
  if (!match) {
    res.writeHead(404);
    res.end();
    return;
  }

  const [, arch, currentVersion] = match;

  try {
    const manifestPath = path.join(RELEASES_DIR, 'latest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    if (compareVersions(manifest.version, currentVersion) <= 0) {
      // Already on latest — 204 means "no update"
      res.writeHead(204);
      res.end();
      return;
    }

    const platformKey = `darwin-${arch}`;
    const platformInfo = manifest.platforms && manifest.platforms[platformKey];

    if (!platformInfo || !platformInfo.url) {
      res.writeHead(204);
      res.end();
      return;
    }

    const body = JSON.stringify({ url: platformInfo.url });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);

    console.log(`[update] ${arch} ${currentVersion} → ${manifest.version} (${platformInfo.url})`);
  } catch (err) {
    console.error('[update] Error reading manifest:', err.message);
    res.writeHead(500);
    res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Squirrel.Mac update server listening on 127.0.0.1:${PORT}`);
  console.log(`Serving releases from: ${RELEASES_DIR}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
