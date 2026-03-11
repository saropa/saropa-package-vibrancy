# Plan: Package Adoption Gate

## Problem

Developers add dependencies by typing a name in `pubspec.yaml` and running
`pub get`. There is no checkpoint between "I heard about this package" and
"it's now in my project." Bad packages enter silently and stay forever.
Pubspec Assist helps you *find* packages but doesn't vet them.

## Goal

When the user types a new (not yet resolved) package name in `pubspec.yaml`,
run a quick vibrancy check and show an inline decoration before they run
`pub get`. Prevent unhealthy packages from entering the project.

## How It Works

### Step 1: Detect New Package Names

Register a `DocumentChangeListener` on `pubspec.yaml`. When a line is added
or modified in the `dependencies:` or `dev_dependencies:` section:

- Parse the package name from the line (`  new_package: ^1.0.0`)
- Check if it already exists in the last scan results
- If not, it's a **candidate** — trigger a lightweight check

### Step 2: Lightweight Pre-Scan

For candidate packages, run a minimal API check (not the full vibrancy scan):

1. `fetchPackageInfo()` — does it exist on pub.dev? Is it discontinued?
2. `fetchPackageScore()` — pub points (quick proxy for quality)
3. `fetchPublisher()` — verified publisher?
4. `findKnownIssue()` — is it in the known issues database?

This reuses existing service functions and takes ~1 second.

### Step 3: Show Inline Feedback

Use a VS Code `DecorationProvider` to show a colored badge at the end of the
line:

- **Green**: "92 pts — verified publisher (google.dev)" — looks healthy
- **Yellow**: "45 pts — unverified publisher" — proceed with caution
- **Red**: "Discontinued" or "Known issue: End of Life" — reconsider
- **Gray**: "Not found on pub.dev" — typo or private package

### Step 4: Hover for Details

On hover over the decoration, show a mini-tooltip with:
- Pub points, publisher, discontinued status
- Known issue reason (if applicable)
- Latest version and publish date
- "Run a full vibrancy scan after adding this package"

## Debouncing

Don't fire API calls on every keystroke. Debounce with a 1.5-second delay
after the last edit in the dependencies section. Only check names that look
complete (match `^\s{2}\w[\w_]+\s*:`).

## UI: Decoration Type

Use `vscode.window.createTextEditorDecorationType()` with:
- `after.contentText` — the badge text (e.g., "92 pts ✓")
- `after.color` — themed color based on score tier
- `after.margin` — spacing from the line content

The decoration appears at the end of the line, not as a CodeLens (CodeLens
is reserved for plan 12).

## Changes

### New File: `src/providers/adoption-gate.ts`

- `AdoptionGateProvider` class
- Registers `onDidChangeTextDocument` listener for pubspec.yaml
- Debounced candidate detection
- Calls existing pub.dev services for lightweight check
- Manages inline decorations

### New File: `src/scoring/adoption-classifier.ts`

- `classifyAdoption(info): 'healthy' | 'caution' | 'warning' | 'unknown'`
- Pure function based on pub points, publisher, discontinued status,
  known issues
- `adoptionBadgeText(classification, info): string`

### Modified: `src/extension-activation.ts`

- Instantiate and register `AdoptionGateProvider`
- Pass cache service for API call caching

### Modified: `package.json`

- Add setting: `saropaPackageVibrancy.enableAdoptionGate` (default: true)

### Tests

- `src/test/providers/adoption-gate.test.ts` — debounce behavior, candidate
  detection from YAML edits, decoration generation
- `src/test/scoring/adoption-classifier.test.ts` — classification tiers:
  high points + verified, low points + unverified, discontinued, not found

## Out of Scope

- Blocking `pub get` from running (too invasive)
- Full vibrancy scan at adoption time (too slow for inline feedback)
- Suggesting alternative packages inline (covered by plan 04)
- Checking transitive dependencies of the candidate
