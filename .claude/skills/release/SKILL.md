---
name: release
description: >
  Use this skill when the user wants to release a new version of Smart Book,
  trigger a build, or says things like "release", "build and release", "trigger build",
  "publish new version", "make a release". Handles version bump, commit, tag, and
  push — in the right order to avoid the filename/version mismatch bug.
---

# Smart Book Release Skill

## The Golden Rule (Never Skip)

`package.json` version MUST be bumped and committed BEFORE the tag is pushed.
`app.getVersion()` reads from `package.json`, NOT the git tag.
If you skip this, artifact filenames say the old version and the app
reports the wrong version in Settings forever.

## Steps — Always Follow This Exact Order

### 1. Determine new version

Read current version from `package.json`:
```bash
grep '"version"' package.json
```

Ask the user for the new version if not specified.
Default suggestion: next patch increment (e.g. `1.0.15` → `1.0.16`).

### 2. Bump package.json

```bash
sed -i '' 's/"version": "X.X.X"/"version": "Y.Y.Y"/' package.json
grep '"version"' package.json   # verify
```

### 3. Commit the version bump

```bash
git add package.json
git commit -m "chore: bump version to Y.Y.Y"
```

### 4. Push main

```bash
git push origin main
```

### 5. Create and push the tag

```bash
git tag vY.Y.Y
git push origin vY.Y.Y
```

This automatically triggers GitHub Actions via `on: push: tags: v*`.
The run will show the commit message and version badge in the Actions UI.

### 6. Confirm the build started

```bash
sleep 5 && gh run list --workflow=build-release.yml --limit=3
```

The run title should show the commit message (e.g. "chore: bump version to Y.Y.Y"),
NOT "Manually run by..." — if it says Manually run, you used workflow_dispatch by mistake.

### 7. Verify artifact filenames after build completes (~15 min)

```bash
gh release view vY.Y.Y --json assets --jq '.assets[].name'
```

Filenames MUST contain the new version number. If they show the old version,
the package.json bump was not picked up → investigate.

## What NOT to Do

- Never use `gh workflow run build-release.yml` — this triggers workflow_dispatch
  which shows as "Manually run" with no commit info or version badge
- Never push the tag before pushing the package.json bump commit
- Never skip the version bump, even for small fixes
- Never manually create a GitHub Release — the CI creates it automatically from the tag

## After Build Completes

The deploy-to-vps job updates:
- `/releases/latest.json` — Squirrel.Mac feed (macOS silent update)
- `/releases/windows/RELEASES` — Squirrel feed (Windows silent update)

All running app instances detect the update within 10 seconds of their next launch
and show the "Restart Now" banner automatically.
