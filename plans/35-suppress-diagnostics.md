# Plan: Suppress Diagnostics

## Problem

Developers often have packages they know are problematic but cannot address
immediately (e.g., waiting for upstream fixes, internal packages). These
packages create noise in the Problems panel and distract from actionable
issues. There's no way to acknowledge a known issue and hide it temporarily.

## Goal

Provide multiple ways to suppress diagnostics for specific packages:

1. **Quick Fix in Problems panel**: Suppress directly from the lightbulb menu
2. **Bulk suppression by category**: Suppress all end-of-life, legacy-locked,
   quiet, or blocked packages at once
3. **Bulk unsuppress**: Clear all suppressions with one command

## How It Works

### Quick Fix Code Action

When hovering over a vibrancy diagnostic in pubspec.yaml or viewing it in
the Problems panel, show a code action:

```
Suppress "http" diagnostics
```

Clicking adds the package name to `suppressedPackages` setting array.

### Bulk Suppression Commands

Three new commands in Command Palette and tree view title menu:

1. **Suppress by Category...** — Shows quick pick with options:
   - End of Life packages (N packages)
   - Legacy-Locked packages (N packages)
   - Quiet packages (N packages)
   - All Blocked packages (N packages)

2. **Suppress All Unhealthy Packages** — Suppresses everything not "vibrant"
   with confirmation dialog

3. **Unsuppress All Packages** — Clears the suppressedPackages array

### Visual Feedback

- Suppressed packages appear dimmed in tree view
- Grouped under collapsible "Suppressed" section at bottom
- Status bar shows "(N suppressed)" when any packages are suppressed

## Changes

### Modified: `src/providers/code-action-provider.ts`

Add code action for each vibrancy diagnostic:

```typescript
{
  title: `Suppress "${packageName}" diagnostics`,
  command: 'saropaPackageVibrancy.suppressPackageByName',
  arguments: [packageName],
}
```

### Modified: `src/extension-activation.ts`

Register three new commands:
- `suppressByCategory`
- `suppressAllProblems`
- `unsuppressAll`

### Modified: `src/services/config-service.ts`

Add helpers:
- `addSuppressedPackage(name: string)`
- `addSuppressedPackages(names: string[])`
- `clearSuppressedPackages()`

### Modified: `src/providers/tree-data-provider.ts`

- Add "Suppressed" group at bottom of tree
- Dim suppressed package items
- Show count in group label

### Modified: `package.json`

```json
{
  "commands": [
    { "command": "saropaPackageVibrancy.suppressPackageByName", "title": "Suppress Package Diagnostics" },
    { "command": "saropaPackageVibrancy.suppressByCategory", "title": "Saropa: Suppress by Category...", "icon": "$(filter)" },
    { "command": "saropaPackageVibrancy.suppressAllProblems", "title": "Saropa: Suppress All Unhealthy Packages", "icon": "$(eye-closed)" },
    { "command": "saropaPackageVibrancy.unsuppressAll", "title": "Saropa: Unsuppress All Packages", "icon": "$(eye)" }
  ],
  "menus": {
    "view/title": [
      { "command": "saropaPackageVibrancy.suppressByCategory", "when": "view == saropaPackageVibrancy.packages", "group": "suppress@1" },
      { "command": "saropaPackageVibrancy.unsuppressAll", "when": "view == saropaPackageVibrancy.packages", "group": "suppress@2" }
    ]
  }
}
```

### Tests

- `src/test/providers/code-action-provider.test.ts`:
  - Suppress action appears for vibrancy diagnostics
  - Action calls correct command with package name

- `src/test/services/config-service.test.ts`:
  - Add single package
  - Add multiple packages (deduplication)
  - Clear all

## Out of Scope

- Per-diagnostic-type suppression (only per-package)
- Temporary suppression with expiry
- Workspace-level vs user-level suppression
