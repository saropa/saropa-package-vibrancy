# Plan: Package Detail View

## Problem

Tree view items display extended information (suggestions, known issues,
flagged GitHub issues) as suffixed descriptions. These grow too long,
cluttering the tree and making it hard to scan. Tree item labels and
descriptions are single-line only — VS Code doesn't support multiline
content inline.

Tooltips require mouse hover, show only one at a time, and aren't
searchable. Child nodes fragment long text awkwardly across multiple lines.

## Goal

1. **Detail View**: A selection-synced webview view in the sidebar, below
   the tree view. Shows full package details when a tree item is selected.
   Integrated with tree, doesn't steal editor space.

2. **Output Channel**: Log all package details to a dedicated output
   channel for searchability and persistence across sessions.

## Layout

Tree and details share the same sidebar container:

```
┌──────────────────────────────┐
│ VIBRANCY                     │
│ ├─ 📦 firebase_core       ◄──┼── selected
│ ├─ 📦 http                   │
│ └─ 📦 provider               │
├──────────────────────────────┤
│ PACKAGE DETAILS              │
│ firebase_core — 8/10         │
│ ─────────────────────────    │
│ 💡 Suggestion:               │
│ Upgrade firebase_core first  │
│ then firebase_auth...        │
│                              │
│ 🚨 Known Issue:              │
│ Critical security vuln...    │
└──────────────────────────────┘
```

Benefits:
- Cohesive — tree and details in one place
- Non-intrusive — editor space untouched
- Modern pattern — used by GitLens, Docker, Thunder Client

## How It Works

### Tree View Changes

Simplify tree item descriptions to short status indicators:

**Before:**
```
firebase_core  8/10 — Vibrant → 2.0.0 | 💡 Upgrade firebase_auth first...
```

**After:**
```
firebase_core  8/10 — Vibrant → 2.0.0
```

Long content moves to the detail view.

### Detail View (Sidebar Webview)

When user selects a package in the tree view, the detail view updates to
show all information for that package. Optimized for narrow sidebar width
(~300px):

```
┌────────────────────────────┐
│ firebase_core        8/10  │
│ ──────────────────────────│
│                            │
│ 📦 VERSION                 │
│ ^2.24.0 → 2.27.0           │
│ Published: 2024-03-01      │
│ BSD-3-Clause ✅            │
│ android, ios, web, +3      │
│                            │
│ ⬆️ UPDATE (minor)          │
│ [Upgrade] [Changelog]      │
│                            │
│ 💡 SUGGESTION              │
│ Upgrade firebase_core      │
│ first, then firebase_auth  │
│ to resolve the version     │
│ conflict.                  │
│                            │
│ 📊 COMMUNITY               │
│ ⭐ 1,234  📋 45 issues     │
│ 160/160 pub points         │
│ ✅ firebase.google.com     │
│                            │
│ 🚨 ALERTS                  │
│ ❌ Critical security       │
│ vulnerability in versions  │
│ below 2.0.0.               │
│                            │
│ 🚩 #1234: Null safety...   │
│ 🚩 #1456: Memory leak...   │
│                            │
│ [View on pub.dev]          │
└────────────────────────────┘
```

Features:
- Updates automatically on tree selection change
- Compact layout for sidebar width
- Collapsible sections (click header to expand/collapse)
- Clickable links (pub.dev, GitHub issues)
- Action buttons: "Upgrade", "Changelog", "View on pub.dev"
- Text wraps naturally in narrow width

### Output Channel

A dedicated "Vibrancy Details" output channel logs package information:

```
[2024-03-01 14:32:15] ══════════════════════════════════════════
[2024-03-01 14:32:15] firebase_core — 8/10 (Vibrant)
[2024-03-01 14:32:15] ──────────────────────────────────────────
[2024-03-01 14:32:15] Version: ^2.24.0 → 2.27.0 available (minor)
[2024-03-01 14:32:15] 
[2024-03-01 14:32:15] 💡 Suggestion:
[2024-03-01 14:32:15]    Upgrade firebase_core first, then firebase_auth
[2024-03-01 14:32:15]    to resolve the version conflict.
[2024-03-01 14:32:15] 
[2024-03-01 14:32:15] 🚨 Known Issue:
[2024-03-01 14:32:15]    Critical security vulnerability in versions
[2024-03-01 14:32:15]    below 2.0.0 affecting authentication flow.
```

Logged on:
- Initial scan completion (all packages)
- Tree item selection (selected package)
- Manual "Log Details" command

## UI: Entry Points

### Detail View

1. **Always visible**: View appears in sidebar below tree (when sidebar open)
2. **Tree selection**: Selecting any package updates the view content
3. **Command**: `Saropa: Focus Package Details` to focus the view
4. **Initial state**: Shows "Select a package to see details" placeholder

### Output Channel

1. **Auto-log**: Full scan results logged on scan completion
2. **Tree context menu**: Right-click → "Log to Output"
3. **Command**: `Saropa: Log Package Details`

## Changes

### New File: `src/views/detail-view-html.ts`

- `buildDetailViewHtml(result: VibrancyResult | null): string` — HTML template
- Compact layout optimized for ~300px sidebar width
- Sections: version, update, suggestion, community, alerts
- Collapsible sections with CSS transitions
- Action buttons wired to VS Code commands via postMessage
- Placeholder state when no package selected

### New File: `src/views/detail-view-provider.ts`

- `DetailViewProvider` class implements `WebviewViewProvider`
- `resolveWebviewView()` — called by VS Code when view becomes visible
- `update(result: VibrancyResult)` — refreshes content for new selection
- `clear()` — shows placeholder state
- Handles postMessage from webview for button clicks

### New File: `src/services/detail-logger.ts`

- `DetailLogger` class — manages output channel
- `logPackage(result: VibrancyResult)` — logs single package
- `logAllPackages(results: VibrancyResult[])` — logs full scan
- Formats multiline content with proper indentation
- Timestamps each log entry

### Modified: `src/extension-activation.ts`

- Register `DetailViewProvider` with `window.registerWebviewViewProvider`
- Create output channel: `vscode.window.createOutputChannel('Vibrancy Details')`
- Register tree selection listener to call `detailViewProvider.update()`
- Pass output channel to DetailLogger

### Modified: `src/providers/tree-data-provider.ts`

- Expose selection event for detail view sync
- Optional: simplify tree structure if detail view handles rich content

### Modified: `src/providers/tree-items.ts`

- Simplify `PackageItem` description (remove suggestion/issue suffixes)
- Keep: name, score, category, update indicator
- Remove: long-form content that moves to detail view

### Modified: `src/providers/tree-commands.ts`

- Add `saropaPackageVibrancy.focusDetails` command
- Add `saropaPackageVibrancy.logDetails` command

### Modified: `package.json`

```json
{
  "contributes": {
    "views": {
      "saropaVibrancy": [
        {
          "id": "saropaPackageVibrancy.packages",
          "name": "Packages"
        },
        {
          "id": "saropaPackageVibrancy.details",
          "name": "Package Details",
          "type": "webview"
        }
      ]
    },
    "commands": [
      {
        "command": "saropaPackageVibrancy.focusDetails",
        "title": "Focus Package Details",
        "category": "Saropa"
      },
      {
        "command": "saropaPackageVibrancy.logDetails",
        "title": "Log Package Details",
        "category": "Saropa"
      }
    ]
  }
}
```

### Tests

- `src/test/views/detail-view-html.test.ts`:
  - All sections rendered
  - Suggestion text appears in full (wrapped)
  - Known issues displayed
  - Flagged issues listed with links
  - Empty sections hidden
  - Action buttons present
  - Placeholder state when no selection

- `src/test/views/detail-view-provider.test.ts`:
  - Provider registered correctly
  - `update()` refreshes webview content
  - `clear()` shows placeholder
  - postMessage handlers work

- `src/test/services/detail-logger.test.ts`:
  - Single package logging
  - Full scan logging
  - Multiline content indentation
  - Timestamp format
  - Output channel receives content

## View Behavior

### Lifecycle

- View registered in `package.json` contributes.views
- VS Code creates view when sidebar opens
- Content updates on tree selection change
- View persists across selection changes
- Disposed with extension

### Selection Sync

```typescript
const treeView = vscode.window.createTreeView('saropaPackageVibrancy.packages', {
  treeDataProvider,
});

treeView.onDidChangeSelection(e => {
  if (e.selection.length === 1 && e.selection[0] instanceof PackageItem) {
    detailViewProvider.update(e.selection[0].result);
  } else {
    detailViewProvider.clear();
  }
});
```

### Position

- Below the tree view in the same sidebar container
- User can drag to reorder within sidebar
- Collapsible independently from tree

## Out of Scope

- Multiple package comparison in detail view (separate feature: plan 18)
- Inline editing of pubspec from detail view
- Detail view for non-package tree items (family conflicts, suppressed group)

---

**Update (2025-03):** Selection sync extended so that selecting a package from the **Action Items** (Problems) list also updates the Package Details panel. The tree provider exposes `getResultByName(name)` to resolve an InsightItem’s package name to a `VibrancyResult`. See `bugs/history/20250314/package-detail-selection-from-action-items.md`.

**Update (2026-03):** Selection sync extended to cover OverrideItem (Packages tree) and PackageWithProblemsItem (Problems tree). Shared boilerplate extracted into `syncDetailOnSelection` helper. Both trees now resolve package names via `getResultByName()` and update the detail panel.
