# Plan: "Why Can't I Upgrade?" Diagnostic

## Problem

`dart pub outdated` shows four version columns (current, upgradable,
resolvable, latest) but developers don't understand why resolvable differs
from latest. The answer is buried in constraint chains they can't see. Worse,
`pub upgrade` and `pub outdated` sometimes contradict each other (Flutter
issue #149708), leaving developers going in circles.

## Goal

For each package where an upgrade is blocked, show a plain-English explanation
of *which* other dependency is the blocker and *why* — directly in the editor,
with vibrancy context to help decide what to do about it.

## How It Works

### Step 1: Get Outdated Data

Run `dart pub outdated --json --no-dev-dependencies` (or with dev deps based
on setting). Parse the JSON output which provides per-package:

```json
{
  "package": "intl",
  "current": { "version": "0.17.0" },
  "upgradable": { "version": "0.17.0" },
  "resolvable": { "version": "0.17.0" },
  "latest": { "version": "0.19.0" }
}
```

When `resolvable.version < latest.version`, the package is **blocked**.

### Step 2: Identify the Blocker

Run `dart pub deps --json` to get the dependency graph. For each blocked
package:
- Find all packages that depend on it (reverse lookup)
- Check which of those packages has a constraint that excludes the latest
  version
- That package is the **blocker**

Example result: "You can't upgrade `intl` to 0.19.0 because
`date_picker_timeline ^1.2.3` requires `intl >=0.16.0 <0.18.0`."

### Step 3: Enrich with Vibrancy Data

Attach the blocker's vibrancy score and category. If the blocker is
Legacy-Locked or End-of-Life, the message becomes actionable: "The blocker
`date_picker_timeline` has a vibrancy score of 12/100 (End of Life). Consider
replacing it."

### Step 4: Compute Upgrade Status Per Package

Classify each dependency into one of:

| Status        | Condition                           |
| ------------- | ----------------------------------- |
| Up to date    | current == latest                   |
| Upgradable    | current < upgradable                |
| Blocked       | resolvable < latest                 |
| Constrained   | upgradable < resolvable (your own constraint limits it) |

## UI: Tree View Detail

Add to the `⬆️ Update` group for blocked packages:

```
⬆️ Update
  🟡 1.2.0 → 1.5.0 (minor)
  🔒 Blocked by: date_picker_timeline
     requires intl >=0.16.0 <0.18.0
     vibrancy: 12/100 (End of Life)
```

## UI: Hover

Add "Upgrade Status" row to hover tooltip:
```
| Upgrade Status | Blocked by date_picker_timeline |
```

## UI: Diagnostics

For blocked packages, append to the existing diagnostic message:
```
Monitor intl — Blocked: date_picker_timeline requires intl <0.18.0
(date_picker_timeline vibrancy 12/100) | (7/10)
```

## UI: Code Action

New quick-fix when a package is blocked:
- **"Show blocker details"** — jumps to the blocker package line in
  pubspec.yaml (if it's a direct dep)

## Changes

### New File: `src/services/pub-outdated.ts`

(Shared with Pre-Flight Upgrade Simulator plan)

- `runPubOutdated(cwd: string): Promise<PubOutdatedEntry[]>`
- Runs `dart pub outdated --json`, parses output

### New File: `src/scoring/blocker-analyzer.ts`

- `findBlockers(outdated, depGraph): BlockerInfo[]` — pure function
- For each blocked package, walks the reverse dependency graph to find the
  constraining package

### New Types in `src/types.ts`

```typescript
interface BlockerInfo {
  readonly blockedPackage: string;
  readonly blockerPackage: string;
  readonly blockerConstraint: string;
  readonly blockerVibrancyScore: number | null;
  readonly blockerCategory: VibrancyCategory | null;
}

type UpgradeBlockStatus =
  | 'up-to-date'
  | 'upgradable'
  | 'blocked'
  | 'constrained';
```

- Add `readonly blocker: BlockerInfo | null` to `VibrancyResult`
- Add `readonly upgradeBlockStatus: UpgradeBlockStatus` to `VibrancyResult`

### Modified: `src/extension-activation.ts`

- Run `pub outdated` + blocker analysis during scan (after vibrancy scan)
- Attach blocker info to results

### Modified: `src/providers/tree-items.ts`

- Extend `buildUpdateGroup()` to show blocker details

### Modified: `src/providers/hover-provider.ts`

- Add upgrade status and blocker info to hover

### Modified: `src/providers/diagnostics.ts`

- Append blocker info to diagnostic messages for blocked packages

### Tests

- `src/test/services/pub-outdated.test.ts` — parse fixtures
- `src/test/scoring/blocker-analyzer.test.ts` — find blockers in various
  graph configurations: single blocker, multiple blockers, SDK blocker,
  no blocker (all upgradable)

## Dependencies

- Shares `pub-outdated.ts` with the Pre-Flight Upgrade Simulator plan
- Uses `dep-graph.ts` from the Transitive X-Ray plan (if built), otherwise
  runs `dart pub deps --json` independently

## Out of Scope

- Automatically resolving blockers
- Handling non-pub constraints (Git dependencies, path dependencies)
- Analyzing SDK-level blockers (e.g., Flutter SDK pins `material_color_utilities`)
