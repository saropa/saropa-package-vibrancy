# Plan: Dependency Drift Timeline

## Problem

A static vibrancy score tells you a package is unhealthy *now*, but not
whether it's getting worse or recovering. Developers need to know: "Is this
package falling further behind with each Flutter release, or is it catching
up?" This trend data transforms a number into a decision.

## Goal

Track how far behind each package's last publish date is relative to
Flutter/Dart stable releases. Show drift velocity — how many Flutter releases
have passed since the package was last updated — as a trend indicator.

## How It Works

### Step 1: Fetch Flutter Release Timeline

Query the Flutter releases endpoint to get stable release dates:
`https://storage.googleapis.com/flutter_infra_release/releases/releases_<platform>.json`

Extract: version, release_date, channel (filter to "stable" only). This gives
a timeline of Flutter milestones.

### Step 2: Compute Drift Per Package

For each package, compare its `publishedDate` against the Flutter release
timeline:

- **Flutter releases since last publish**: Count how many stable Flutter
  releases have shipped since this package was last published
- **Drift category**:
  - `current` — published after the latest Flutter stable
  - `recent` — published within the last 2 Flutter releases
  - `drifting` — 3–5 Flutter releases behind
  - `stale` — 6+ Flutter releases behind

### Step 3: Compute Drift Velocity (Optional, v2)

If historical scan data is stored (see below), compare drift across scans:
- "This package was 2 releases behind last month, now 3 releases behind"
- Velocity: +1 release/month = "falling behind"

For v1, skip velocity — just show the current drift count.

## Drift Score

Map drift to a 0–10 scale for display consistency:

| Drift Releases | Score | Label     |
| -------------- | ----- | --------- |
| 0              | 10    | Current   |
| 1              | 8     | Recent    |
| 2              | 6     | Recent    |
| 3–4            | 4     | Drifting  |
| 5–6            | 2     | Stale     |
| 7+             | 0     | Abandoned |

## UI: Tree View

Add drift info to the `📦 Version` group:

```
📦 Version
  ├─ Version: ^3.0.3
  ├─ Latest: 3.0.7
  ├─ Published: 2025-08-14
  └─ 🕐 Drift: 4 Flutter releases behind (Drifting)
```

## UI: Hover

Add drift row:
```
| Ecosystem Drift | 4 Flutter releases behind (Drifting) |
```

## UI: Report

Add "Drift" column to the report table showing the release count and
category label. Color-code: green (current/recent), yellow (drifting), red
(stale/abandoned).

Add a summary card: "Average drift: 2.3 Flutter releases behind"

## Changes

### New File: `src/services/flutter-releases.ts`

(Shared with Pre-Flight Upgrade Simulator plan)

- `fetchFlutterReleases(): Promise<FlutterRelease[]>`
- Returns stable releases with version and date
- Cached with standard TTL (releases change infrequently)

### New File: `src/scoring/drift-calculator.ts`

- `calcDrift(publishedDate, releases): DriftInfo` — pure function
- `driftLabel(releasesBehind): string`
- `driftScore(releasesBehind): number` — 0–10 scale

### New Types in `src/types.ts`

```typescript
interface DriftInfo {
  readonly releasesBehind: number;
  readonly driftScore: number;
  readonly label: 'current' | 'recent' | 'drifting' | 'stale' | 'abandoned';
  readonly latestFlutterVersion: string;
}
```

- Add `readonly drift: DriftInfo | null` to `VibrancyResult`

### Modified: `src/extension-activation.ts`

- Fetch Flutter releases once at scan start
- Compute drift per package after vibrancy scan

### Modified: `src/scan-orchestrator.ts`

- Accept Flutter releases list, compute drift during result assembly

### Modified: `src/providers/tree-items.ts`

- Add drift detail to `buildVersionGroup()`

### Modified: `src/providers/hover-provider.ts`

- Add drift row to hover

### Modified: `src/views/report-html.ts`

- Add "Drift" column and summary card

### Tests

- `src/test/services/flutter-releases.test.ts` — parse fixture release JSON,
  filter to stable only
- `src/test/scoring/drift-calculator.test.ts` — published today (0 behind),
  published 1 year ago (N behind), no publish date (null), package published
  between two releases

## Dependencies

- Shares `flutter-releases.ts` with Pre-Flight Upgrade Simulator plan

## Out of Scope

- Drift velocity tracking across multiple scans (requires persistent
  historical storage — future enhancement)
- Dart SDK drift (only Flutter releases tracked for v1)
- Predicting when a package will become incompatible
