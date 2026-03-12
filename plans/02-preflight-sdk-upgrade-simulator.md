# Plan: Pre-Flight SDK Upgrade Simulator

**Status: PARTIAL** — Infrastructure exists (`flutter-releases.ts`, `pub-outdated.ts`,
`PubOutdatedEntry` type). Missing: risk classifier, preflight command, webview report.

## Problem

Upgrading Flutter is a multi-day nightmare. Developers discover breakages
mid-upgrade — abandoned packages that don't support the new SDK, Gradle
incompatibilities, removed APIs. There is no way to preview what will break
*before* committing to the upgrade.

## Goal

A "What breaks if I upgrade?" command that simulates a Flutter SDK upgrade and
shows a before/after risk report — without modifying the project.

## How It Works

### Step 1: Detect Current & Target SDK

- Read current Flutter/Dart version from `flutter --version` (existing
  `sdk-detector.ts`)
- Query the Flutter releases API for available stable versions, or let the
  user pick a target version from a quick-pick menu

### Step 2: Simulate Constraint Resolution

- Run `dart pub outdated --json` which returns four version columns per
  package: current, upgradable, resolvable, latest
- The **resolvable** column shows the best version achievable given all
  constraints — this is the key signal
- When resolvable < latest, something is blocking the upgrade

### Step 3: Cross-Reference with Vibrancy Data

For each package where resolvable !== latest:
- Look up existing vibrancy scan data (score, category, known issues)
- Check if the package has Dart 3.x / null safety issues (from flagged
  issue signals)
- Check if the package is in `known_issues.json` with a replacement

### Step 4: Build Risk Report

Categorize packages into:
- **Safe**: Current version is already compatible, or latest is resolvable
- **Blocked**: A constraint prevents reaching latest — show which package
  blocks it
- **Breaking**: Package has no compatible version for the target SDK
- **Unknown**: Package has no pub.dev data or version info

### Step 5: Present Results

Show in a webview panel (reuse report infrastructure):
- Summary: "X packages safe, Y blocked, Z breaking"
- Table sorted by risk level
- For each blocked/breaking package: the blocking reason, vibrancy score,
  and suggested action (update, replace, or override)

## UI: Command

New command: `Saropa: Pre-Flight Upgrade Check`

1. Quick-pick: "Which Flutter version?" (list stable releases, default to
   latest stable)
2. Progress notification: "Simulating upgrade to Flutter X.Y.Z..."
3. Opens webview with the risk report

## Changes

### New File: `src/services/pub-outdated.ts`

- `runPubOutdated(cwd: string): Promise<PubOutdatedResult>`
- Runs `dart pub outdated --json` and parses the structured output
- Returns per-package: current, upgradable, resolvable, latest versions

### New File: `src/services/flutter-releases.ts`

- `fetchFlutterReleases(): Promise<FlutterRelease[]>`
- Queries `https://storage.googleapis.com/flutter_infra_release/releases/releases_<platform>.json`
- Returns stable channel releases sorted by date
- Cached with standard TTL

### New File: `src/scoring/upgrade-risk-classifier.ts`

- `classifyUpgradeRisk(outdated, vibrancyResults): UpgradeRisk[]`
- Pure function combining pub outdated data with vibrancy scan data
- Returns risk category per package

### New Types in `src/types.ts`

```typescript
interface PubOutdatedEntry {
  readonly name: string;
  readonly current: string | null;
  readonly upgradable: string | null;
  readonly resolvable: string | null;
  readonly latest: string | null;
}

type UpgradeRiskLevel = 'safe' | 'blocked' | 'breaking' | 'unknown';

interface UpgradeRisk {
  readonly name: string;
  readonly risk: UpgradeRiskLevel;
  readonly reason: string;
  readonly vibrancyScore: number | null;
  readonly suggestedAction: string;
}
```

### New File: `src/views/preflight-html.ts`

- HTML template for the risk report webview
- Reuse styling patterns from `report-html.ts`

### New File: `src/views/preflight-webview.ts`

- WebviewPanel manager (same pattern as `report-webview.ts`)

### Modified: `src/extension-activation.ts`

- Register new command `saropaPackageVibrancy.preflightCheck`

### Modified: `package.json`

- Add command: `saropaPackageVibrancy.preflightCheck` / "Saropa: Pre-Flight
  Upgrade Check"

### Tests

- `src/test/services/pub-outdated.test.ts` — parse real `dart pub outdated
  --json` output fixtures
- `src/test/scoring/upgrade-risk-classifier.test.ts` — risk classification
  logic: all safe, some blocked, breaking, unknown

## Out of Scope

- Actually performing the SDK upgrade
- Simulating Gradle/CocoaPods compatibility
- Detecting platform-specific breakages (Android API level, iOS deployment
  target)
