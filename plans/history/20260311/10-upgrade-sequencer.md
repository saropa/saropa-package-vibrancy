# Plan: Upgrade Sequencer

## Problem

Upgrading dependencies one at a time is tedious. Upgrading them all at once
often fails because order matters — `firebase_core` must be upgraded before
`cloud_firestore`, or the constraints won't resolve. No tool computes a safe
upgrade order with test gates between steps.

## Goal

Analyze all available upgrades, determine a safe execution order respecting
interdependencies, and present a numbered plan. Execute step-by-step with
`pub get` + `flutter test` gates — stop on first failure, report exactly
where it broke.

## How It Works

### Step 1: Identify Upgradable Packages

From the existing scan results, collect all packages where
`updateInfo.updateStatus !== 'up-to-date'`. Group by update type:
- Patch updates (safest)
- Minor updates
- Major updates (riskiest)

### Step 2: Build Upgrade Order

Using the dependency graph (from `dart pub deps --json`):

1. **Topological sort**: If package A depends on package B, and both need
   upgrading, upgrade B first
2. **Within the same level**, order by:
   - Patch before minor before major (risk gradient)
   - Higher vibrancy score first (more likely to succeed)
3. **Family grouping**: If Firebase packages need upgrading, group them
   together (from family detector) since they must move in lockstep

Result: an ordered list of upgrade steps.

### Step 3: Present the Plan

Show the upgrade plan in an output channel or webview before execution:

```
Upgrade Plan (7 packages):
  1. [patch]  meta 1.11.0 → 1.11.1
  2. [patch]  collection 1.18.0 → 1.18.1
  3. [minor]  firebase_core 2.31.0 → 2.32.0  ← family: Firebase
  4. [minor]  firebase_auth 4.19.0 → 4.20.0  ← family: Firebase
  5. [minor]  http 1.2.0 → 1.3.0
  6. [major]  intl 0.18.0 → 0.19.0
  7. [major]  go_router 13.0.0 → 14.0.0

Each step: bump version → pub get → flutter test → next
Stop on first failure.
```

### Step 4: Execute with Gates

For each step:
1. Edit `pubspec.yaml` to update the version constraint
2. Run `flutter pub get`
3. If `pub get` fails: rollback this change, report failure, stop
4. Run `flutter test`
5. If tests fail: rollback this change, report failure, stop
6. If both pass: commit the change (optional, configurable), proceed to next

### Step 5: Report Results

After execution (or failure), show a summary:

```
Upgrade Results:
  ✅ meta 1.11.0 → 1.11.1
  ✅ collection 1.18.0 → 1.18.1
  ✅ firebase_core 2.31.0 → 2.32.0
  ❌ firebase_auth 4.19.0 → 4.20.0
     └─ flutter test failed (3 failures)
  ⏭️ http, intl, go_router — skipped (blocked by failure)
```

## UI: Command

New command: `Saropa: Plan & Execute Upgrades`

1. Shows the plan in an output channel
2. Confirmation dialog: "Proceed with 7 upgrades? (stop on first failure)"
3. Progress notification with current step
4. Final summary in output channel

## UI: Tree View

Add a toolbar button when upgrades are available:
- Icon: `$(rocket)` — "Plan Upgrades"
- Opens the upgrade plan view

## Changes

### New File: `src/scoring/upgrade-sequencer.ts`

- `buildUpgradeOrder(results, depGraph): UpgradeStep[]` — pure function
- Topological sort with risk-gradient tiebreaking
- Family grouping integration

### New File: `src/services/upgrade-executor.ts`

- `executeUpgradePlan(steps, cwd, channel): Promise<UpgradeReport>`
- Iterates through steps, runs pub get + test per step
- Handles rollback on failure
- Streams progress to an output channel

### New Types in `src/types.ts`

```typescript
interface UpgradeStep {
  readonly packageName: string;
  readonly currentVersion: string;
  readonly targetVersion: string;
  readonly updateType: 'patch' | 'minor' | 'major';
  readonly familyId: string | null;
  readonly order: number;
}

type StepOutcome = 'success' | 'pub-get-failed' | 'test-failed' | 'skipped';

interface UpgradeStepResult {
  readonly step: UpgradeStep;
  readonly outcome: StepOutcome;
  readonly output: string;
}

interface UpgradeReport {
  readonly steps: readonly UpgradeStepResult[];
  readonly completedCount: number;
  readonly failedAt: string | null;
}
```

### New File: `src/services/pubspec-editor.ts`

- `updateConstraint(yamlContent, packageName, newConstraint): string`
  — pure string manipulation
- `rollbackConstraint(yamlContent, packageName, oldConstraint): string`
- Preserves YAML formatting (only modifies the specific line)

### Modified: `src/extension-activation.ts`

- Register new command `saropaPackageVibrancy.planUpgrades`

### Modified: `package.json`

- Add command: `saropaPackageVibrancy.planUpgrades` / "Saropa: Plan &
  Execute Upgrades"
- Add to tree view title menu

### Tests

- `src/test/scoring/upgrade-sequencer.test.ts` — topological sort: linear
  chain, diamond dependency, independent packages, family grouping, empty
  input
- `src/test/services/pubspec-editor.test.ts` — constraint update: caret
  syntax, exact version, quoted values, rollback
- `src/test/services/upgrade-executor.test.ts` — mock CLI calls: all pass,
  pub get fails at step 3, test fails at step 5, rollback verification

## Dependencies

- Uses `dep-graph.ts` from Transitive X-Ray plan (or runs `dart pub deps
  --json` independently)
- Uses `package-families.ts` from Family Conflict Detector plan (optional —
  skips family grouping if not available)
- Uses `flutter-cli.ts` (existing) for `pub get` and `flutter test`

## Configuration

### New Settings in `package.json`

- `saropaPackageVibrancy.upgradeAutoCommit` — auto-commit each successful
  step (default: false)
- `saropaPackageVibrancy.upgradeSkipTests` — skip `flutter test` gates for
  faster execution (default: false)
- `saropaPackageVibrancy.upgradeMaxSteps` — maximum steps to execute in one
  run (default: 20)

## Out of Scope

- Upgrading transitive dependencies directly
- Running specific test files per package (runs full test suite each time)
- Parallel upgrades (must be sequential for correctness)
- Automatically creating a PR with the upgrade results
