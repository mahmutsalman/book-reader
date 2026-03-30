---
name: release
description: >
  Use this skill when the user wants to release a new version of Smart Book,
  trigger a build, or says things like "release", "build and release", "trigger build",
  "publish new version", "make a release". Handles version bump, commit, push, and
  GitHub Actions trigger — in the right order to avoid the filename/version mismatch bug.
---

# Smart Book Release Skill

## The Rule (Never Skip)

`package.json` version MUST be bumped BEFORE the build is triggered.
`app.getVersion()` reads from `package.json`, NOT the git tag.
If you skip this, artifact filenames say the old version and the app
reports the wrong version in Settings forever.

## Steps — Always Follow This Exact Order

### 1. Determine new version

Read current version from `package.json`. Ask the user for the new version
if they haven't specified one. Suggest the next patch increment by default
(e.g. `1.0.15` → `1.0.16`).

### 2. Bump package.json

Use `sed` or `Edit` tool to update the `"version"` field in `package.json`.
Verify the change with `grep '"version"' package.json`.

### 3. Commit the version bump

Stage ONLY `package.json`:
```bash
git add package.json
```

Commit with:
```bash
git commit -m "chore: bump version to X.X.X"
```

### 4. Push to main

```bash
git push origin main
```

### 5. Trigger GitHub Actions build

```bash
gh workflow run build-release.yml --ref main -f version=vX.X.X -f prerelease=true
```

Use the SAME version that was set in `package.json` (e.g. `v1.0.16`).

### 6. Confirm the build started

```bash
sleep 4 && gh run list --workflow=build-release.yml --limit=3
```

Show the user the run ID and status.

### 7. Verify artifact filenames (after build completes)

Once the build finishes, check:
```bash
gh release view vX.X.X --json assets --jq '.assets[].name'
```

The artifact filenames MUST contain the new version number.
If they still show the old version → the package.json bump was not picked up → investigate.

## What NOT to Do

- Never trigger the build before pushing the package.json bump
- Never use `git tag` manually — the CI creates the tag via `workflow_dispatch`
- Never skip the version bump — even for "small" fixes
- Never bump package.json AFTER triggering the build

## Build takes ~15 minutes

Both macOS and Windows build in parallel on GitHub Actions.
The deploy-to-vps job runs after both complete and updates:
- `/releases/latest.json` — Squirrel.Mac feed for macOS
- `/releases/windows/RELEASES` — Squirrel feed for Windows

After deploy, all running app instances will detect the update within 10 seconds
of their next launch.
