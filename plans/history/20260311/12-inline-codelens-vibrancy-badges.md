# Plan: Inline CodeLens Vibrancy Badges

## Problem

Version Lens shows version numbers as CodeLens decorations — it's the most
installed pubspec extension (~3M installs). But it only shows currency, not
health. Saropa has rich health data but requires hovering each package to see
it. Developers want a single glance at `pubspec.yaml` that tells the whole
story.

## Goal

Show vibrancy scores as color-coded CodeLens annotations above each
dependency line in `pubspec.yaml`. One glance reveals the full health profile
of the project without any interaction.

## How It Works

### CodeLens Content

For each dependency with scan results, show a CodeLens line above it:

```
🟢 92/100 Vibrant · MIT · 0.3 MB · ✓ Up to date
  http: ^1.2.0

🟡 48/100 Quiet · BSD-3 · 1.2 MB · ⬆ 2.0.0 → 3.1.0 (major)
  some_package: ^2.0.0

🔴 12/100 End of Life · ⚠ Known issue · Replace with sign_in_with_apple
  apple_sign_in: ^4.0.0
```

### CodeLens Format

Each CodeLens contains clickable segments:

1. **Score badge** — `92/100 Vibrant` — click opens the package in the
   tree view
2. **Update info** — `⬆ 3.1.0 (major)` — click runs "Update to Latest"
   command
3. **Alert** — `⚠ Known issue` — click opens the known issue details

### Color Coding

CodeLens text doesn't support color directly, so use emoji prefixes:
- `🟢` Vibrant (70–100)
- `🟡` Quiet (40–69)
- `🟠` Legacy-Locked (10–39)
- `🔴` End of Life (0–9)

### Coexistence with Version Lens

Version Lens shows its CodeLens on the *same* line (inline decorations).
Saropa's CodeLens appears *above* the line. They coexist without conflict
because VS Code stacks CodeLens from different providers.

## Refresh Behavior

- CodeLens updates when scan results change (after a scan completes)
- No flickering — only refresh when data actually changes
- CodeLens resolves lazily (VS Code calls `resolveCodeLens` only for
  visible lines)

## Changes

### New File: `src/providers/codelens-provider.ts`

- `VibrancyCodeLensProvider` implements `vscode.CodeLensProvider`
- `provideCodeLenses()` — returns a CodeLens per dependency line
- `resolveCodeLens()` — fills in the title and command
- Uses `findPackageRange()` from pubspec-parser to locate lines

### Modified: `src/extension-activation.ts`

- Register `VibrancyCodeLensProvider` for `pubspec.yaml` documents
- Pass scan results to provider on update

### Modified: `package.json`

- Add setting: `saropaPackageVibrancy.enableCodeLens` (default: true)
- Add setting: `saropaPackageVibrancy.codeLensDetail` — controls how much
  info to show:
  - `"minimal"` — score + category only
  - `"standard"` — score + category + update status (default)
  - `"full"` — score + category + license + size + update + alerts

### New File: `src/scoring/codelens-formatter.ts`

- `formatCodeLensTitle(result, detailLevel): string` — pure function
- Builds the display string based on result data and detail setting

### Tests

- `src/test/providers/codelens-provider.test.ts` — CodeLens generation:
  correct line positions, no results (empty), suppressed packages excluded,
  clickable commands
- `src/test/scoring/codelens-formatter.test.ts` — format strings at each
  detail level, edge cases (no pub.dev data, no update info, known issue)

## Performance

- CodeLens is resolved lazily by VS Code (only visible lines)
- No API calls during CodeLens resolution — purely reads cached scan results
- Refresh only fires on scan completion via `onDidChangeCodeLenses` event

## Out of Scope

- Inline decorations on the same line (reserved for Adoption Gate)
- CodeLens for transitive dependencies
- CodeLens in `pubspec.lock` (only `pubspec.yaml`)
