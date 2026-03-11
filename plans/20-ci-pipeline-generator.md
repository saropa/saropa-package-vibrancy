# Plan: CI Pipeline Generator

## Problem

Saropa Package Vibrancy runs locally in VS Code. Teams want dependency
health checks in CI — blocking PRs that introduce End-of-Life packages or
that exceed vibrancy budgets. Setting this up manually requires writing
custom scripts, installing `osv-scanner`, parsing JSON, and configuring
thresholds. Nobody does it because it's too much effort.

## Goal

One command generates a ready-to-commit CI workflow file (GitHub Actions or
GitLab CI) that runs vibrancy checks on every PR. Auto-configures thresholds
based on current project health. Turns Saropa from a local tool into a
team-wide quality gate.

## How It Works

### Step 1: Choose CI Platform

Quick-pick: "Which CI platform?"
- GitHub Actions (default)
- GitLab CI
- Manual/Custom (generates a portable shell script)

### Step 2: Auto-Configure Thresholds

Based on the current scan results, suggest sensible defaults:

- **Max End-of-Life**: current count (so existing ones don't fail; any
  new ones will)
- **Max Legacy-Locked**: current count + 1 (small buffer)
- **Min average vibrancy**: current average rounded down to nearest 5
- **Fail on new vulnerability**: true

Present these to the user for confirmation/editing via a multi-step
quick-pick or input box flow.

### Step 3: Generate Workflow

#### GitHub Actions Template

```yaml
name: Dependency Health Check
on:
  pull_request:
    paths:
      - 'pubspec.yaml'
      - 'pubspec.lock'

jobs:
  vibrancy-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: subosito/flutter-action@v2
        with:
          channel: stable

      - name: Install dependencies
        run: flutter pub get

      - name: Run vibrancy check
        run: dart pub global activate saropa_vibrancy_cli && saropa-vibrancy check
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Check thresholds
        run: |
          saropa-vibrancy check \
            --max-eol <threshold> \
            --max-legacy <threshold> \
            --min-avg-vibrancy <threshold> \
            --fail-on-vuln \
            --output report/vibrancy.json

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: vibrancy-report
          path: report/vibrancy.json

      - name: Comment on PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            // Read report and post summary as PR comment
```

### Step 4: Write File

Write the generated workflow to:
- `.github/workflows/vibrancy-check.yml` (GitHub Actions)
- `.gitlab-ci.yml` section (GitLab CI — append to existing or create new)
- `scripts/vibrancy-check.sh` (Manual/Custom)

Show a confirmation before writing, with a preview of the file content.

## The CLI Companion

The CI workflow references `saropa_vibrancy_cli` — a lightweight Dart CLI
package that runs the scoring logic without VS Code. This is a **separate
package** published to pub.dev:

- Reuses the scoring layer (`vibrancy-calculator.ts`, `status-classifier.ts`,
  etc.) — compiled to a standalone Dart CLI
- Accepts thresholds as CLI flags
- Outputs JSON report
- Returns exit codes: 0 (pass), 1 (warning), 2 (fail)

**Important**: The CLI package is a future deliverable. For v1, the generated
workflow can use a simpler approach: run `dart pub outdated --json` and parse
the output with a shell script to check basic thresholds. The generated
workflow template is still valuable even without the full CLI.

## PR Comment Format

The workflow posts a comment on the PR:

```markdown
## 📊 Dependency Health Check

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| End of Life | 1 | ≤ 2 | ✅ Pass |
| Legacy-Locked | 3 | ≤ 4 | ✅ Pass |
| Avg Vibrancy | 62 | ≥ 55 | ✅ Pass |
| Vulnerabilities | 0 | 0 | ✅ Pass |

**Result: All checks passed** ✅
```

## Changes

### New File: `src/services/ci-generator.ts`

- `generateGitHubActions(thresholds): string` — YAML template
- `generateGitLabCi(thresholds): string` — YAML template
- `generateShellScript(thresholds): string` — portable bash script
- Pure functions, no I/O (return strings)

### New File: `src/services/threshold-suggester.ts`

- `suggestThresholds(results): ThresholdConfig` — pure function
- Computes sensible defaults from current scan results

### New Types in `src/types.ts`

```typescript
interface CiThresholds {
  readonly maxEndOfLife: number;
  readonly maxLegacyLocked: number;
  readonly minAverageVibrancy: number;
  readonly failOnVulnerability: boolean;
}

type CiPlatform = 'github-actions' | 'gitlab-ci' | 'shell-script';
```

### Modified: `src/extension-activation.ts`

- Register `saropaPackageVibrancy.generateCiConfig` command
- Wire up quick-pick flow for platform selection and threshold confirmation

### Modified: `package.json`

- Add command: `saropaPackageVibrancy.generateCiConfig` / "Saropa: Generate
  CI Pipeline"

### Tests

- `src/test/services/ci-generator.test.ts` — valid YAML output for each
  platform, thresholds correctly interpolated, edge cases (zero thresholds,
  all defaults)
- `src/test/services/threshold-suggester.test.ts` — suggestions from
  various scan profiles: healthy project, many EOL packages, first scan
  (no history)

## Out of Scope

- Building the `saropa_vibrancy_cli` Dart package (separate project)
- Managing CI secrets (just references `${{ secrets.GITHUB_TOKEN }}`)
- Running the CI workflow from VS Code
- Supporting other CI platforms (Jenkins, CircleCI, Bitrise)
