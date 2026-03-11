# Plan: Lock File Diff Narrator

## Problem

When `pubspec.lock` changes — after `pub get`, `pub upgrade`, or a git
merge — developers see an opaque diff of hundreds of lines. They don't know
what actually changed, whether vibrancy improved or worsened, or if a risky
package snuck in. The existing file watcher triggers a re-scan but doesn't
explain *what changed*.

## Goal

On every `pubspec.lock` change, auto-generate a human-readable summary of
what changed and what the vibrancy impact is. Show as a notification with
a "View Details" action.

## How It Works

### Step 1: Capture Before/After State

When the file watcher fires on `pubspec.lock` change:

1. **Before**: Use the last scan results (already stored in
   `latestResults`)
2. **After**: Parse the new `pubspec.lock` to get updated package versions
3. **Diff**: Compare the two sets to identify:
   - **Added** packages (new dependencies)
   - **Removed** packages (dependencies dropped)
   - **Upgraded** packages (version increased)
   - **Downgraded** packages (version decreased, rare but possible)
   - **Unchanged** packages

### Step 2: Compute Vibrancy Delta

For upgraded/added packages, compare old vibrancy score (if known) to the
new score after re-scan:

- Net vibrancy change: sum of score deltas across all changed packages
- New risks: any added package with score < 40
- Resolved risks: any removed package that was Legacy-Locked or End of Life

### Step 3: Generate Summary

Format a concise narrative:

```
Lock file changed: 3 upgraded, 1 added, 0 removed.
  ⬆ http 1.2.0 → 1.3.0
  ⬆ meta 1.11.0 → 1.11.1
  ⬆ collection 1.18.0 → 1.18.1
  ➕ new_package 2.0.0 (vibrancy: 78/100)
Net vibrancy: +4 points
```

### Step 4: Show Notification

Display via `vscode.window.showInformationMessage()`:

```
Lock file: 3 upgraded, 1 added. Net vibrancy: +4
[View Details]  [Dismiss]
```

"View Details" opens the full narrative in an output channel.

## Changes

### New File: `src/services/lock-diff.ts`

- `diffLockFiles(oldResults, newLockContent): LockDiff`
- Parses new lock content, compares with old results
- Returns structured diff

### New File: `src/scoring/diff-narrator.ts`

- `narrateDiff(diff: LockDiff): string` — pure function
- Generates human-readable summary text
- `summarizeDiff(diff: LockDiff): string` — one-line summary for
  notification

### New Types in `src/types.ts`

```typescript
interface LockDiff {
  readonly added: readonly { name: string; version: string }[];
  readonly removed: readonly { name: string; version: string }[];
  readonly upgraded: readonly {
    name: string; from: string; to: string;
  }[];
  readonly downgraded: readonly {
    name: string; from: string; to: string;
  }[];
  readonly unchangedCount: number;
}
```

### Modified: `src/extension-activation.ts`

- In `registerFileWatcher()`, before triggering re-scan, capture current
  lock state and compute diff
- After re-scan completes, compute vibrancy delta and show notification

### Modified: `package.json`

- Add setting: `saropaPackageVibrancy.showLockDiffNotifications`
  (default: true)

### Tests

- `src/test/services/lock-diff.test.ts` — diff computation: additions,
  removals, upgrades, downgrades, no changes, first scan (no previous
  results)
- `src/test/scoring/diff-narrator.test.ts` — narrative formatting: single
  change, multiple changes, vibrancy delta, empty diff

## Out of Scope

- Showing the diff in a dedicated webview (output channel is sufficient)
- Diffing against git history (only compares against last scan)
- Blocking lock file changes based on vibrancy rules (that's the Budget
  feature)
