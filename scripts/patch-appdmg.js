const fs = require('fs');
const path = require('path');

function patchFile(filePath, patchFn) {
  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, 'utf8');
  const patched = patchFn(original);
  if (patched === original) return false;
  fs.writeFileSync(filePath, patched, 'utf8');
  return true;
}

function main() {
  const hdiutilPath = path.resolve(__dirname, '..', 'node_modules', 'appdmg', 'lib', 'hdiutil.js');
  const didPatch = patchFile(hdiutilPath, (contents) => {
    let next = contents;

    // 1) Ensure mount path is trimmed (some environments may include CRLF in hdiutil output).
    next = next.replace(
      /cb\(null,\s*m\[1\]\)/,
      'cb(null, m[1].trim())'
    );

    // 2) Treat "already detached / not mounted" as success (CI flakiness).
    // Insert after "attempts += 1" inside attemptDetach.
    if (!next.includes('detach failed - No such file or directory') && next.includes('function attemptDetach (err)')) {
      next = next.replace(
        /attempts \+= 1\n/,
        `attempts += 1
    if (err) {
      const msg = String(err.stderr || '') + '\\n' + String(err.message || '')
      if (/detach failed - No such file or directory/i.test(msg) || /No such file or directory/i.test(msg) || /not currently mounted/i.test(msg)) {
        return cb(null)
      }
    }
`
      );
    }

    return next;
  });

  if (didPatch) {
    // Keep logs minimal but visible in CI.
    console.log('[postinstall] Patched appdmg (hdiutil mount/detach robustness)');
  }
}

main();

