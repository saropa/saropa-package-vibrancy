# Plan: Dependency Freshness Watch

**Status: Implemented** (v0.1.3)

## Problem

Developers discover new package versions days or weeks after release — often
only when they manually run `pub outdated`. Renovate and Dependabot solve
this in CI but require repo-level configuration. There's no local, instant
notification system for Dart/Flutter dependency updates.

## Goal

Background polling that notifies you when a dependency publishes a new
version. Toast notification in VS Code with one-click actions. Like
Dependabot but local, zero-config, and instant.

## How It Works

### Step 1: Build Watch List

After each scan, the extension knows every direct dependency and its current
version. This becomes the watch list automatically.

Optionally, the user can configure a custom watch list or set filters:
- Watch all dependencies (default)
- Watch only packages below a vibrancy threshold
- Watch only specific packages (manual list)

### Step 2: Background Polling

Run a periodic check (configurable interval, default 6 hours):

1. For each watched package, call `fetchPackageInfo()` to get the latest
   version (uses cache — only makes API calls after cache TTL expires)
2. Compare latest version against the version in the last scan results
3. If a new version is detected, add it to the notification queue

### Step 3: Batch Notifications

Don't spam a toast per package. Batch all new versions discovered in one
polling cycle into a single notification:

```
📦 3 packages have new versions:
  http 1.2.0 → 1.3.0 (patch)
  firebase_core 2.31.0 → 3.0.0 (major)
  intl 0.18.0 → 0.19.0 (minor)
[View Details]  [Update All]  [Dismiss]
```

### Step 4: Actions

- **View Details**: Opens the update group in the tree view (or the
  changelog diff webview if plan 15 is implemented)
- **Update All**: Triggers the existing "Update to Latest" command for
  each package (or the Upgrade Sequencer if plan 10 is implemented)
- **Dismiss**: Suppresses these notifications until the next polling cycle

### Step 5: Track Seen Versions

Store "last seen latest version" per package in the cache to avoid
re-notifying for the same version across polling cycles.

## Polling Strategy

- **Timer**: Use `setInterval` with configurable period (1–24 hours)
- **Smart polling**: Don't poll when VS Code is in the background (use
  `vscode.window.state.focused`)
- **Staggered checks**: Don't check all packages simultaneously — batch
  in groups of 5 with 500ms delay between groups to avoid rate limits
- **Cache-aware**: If the cache TTL hasn't expired, the poll is a no-op
  (free — no API calls)

## Changes

### New File: `src/services/freshness-watcher.ts`

- `FreshnessWatcher` class
- `start(results, cache)` — begins polling loop
- `stop()` — clears timer
- `onNewVersions` — event emitter for notification handling
- Manages seen-version tracking

### New File: `src/services/version-comparator.ts`

- `detectNewVersions(watchList, cache): Promise<NewVersion[]>`
- Compares cached latest against stored seen-latest
- Returns list of packages with new versions

### New Types in `src/types.ts`

```typescript
interface NewVersionNotification {
  readonly name: string;
  readonly currentVersion: string;
  readonly newVersion: string;
  readonly updateType: 'patch' | 'minor' | 'major';
}
```

### Modified: `src/extension-activation.ts`

- Instantiate `FreshnessWatcher` on activation
- Start watching after first scan completes
- Stop on deactivation
- Handle notification actions (view details, update all)

### Modified: `package.json`

- Add settings:
  - `saropaPackageVibrancy.watchEnabled` (default: true)
  - `saropaPackageVibrancy.watchIntervalHours` (default: 6, range: 1–24)
  - `saropaPackageVibrancy.watchFilter`:
    - `"all"` — watch everything (default)
    - `"unhealthy"` — only packages with vibrancy < 40
    - `"custom"` — use `watchList` setting
  - `saropaPackageVibrancy.watchList` — array of package names (when
    filter is "custom")

### Tests

- `src/test/services/freshness-watcher.test.ts` — timer lifecycle: start,
  stop, restart; polling behavior: cache hit (no API call), new version
  detected, seen-version tracking (no re-notify)
- `src/test/services/version-comparator.test.ts` — comparison logic: no
  change, patch update, major update, package removed from watch list

## Out of Scope

- Watching transitive dependencies
- Watching packages not in the project (use case: monitoring a package
  you're considering adopting — that's the Adoption Gate)
- Email/Slack notifications (VS Code toast only)
- Watching pre-release versions
