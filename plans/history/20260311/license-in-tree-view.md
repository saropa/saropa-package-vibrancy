# Plan: Add License to Package Info

## Goal

Show each package's SPDX license identifier in the tree view, hover tooltip,
and webview report. Surface license risks (unknown, restrictive, or
incompatible) as visual cues.

## Data Source

The pub.dev API at `https://pub.dev/api/packages/{name}` returns
`latest.pubspec.license` — the SPDX identifier from the package's
`pubspec.yaml` (e.g. `"MIT"`, `"BSD-3-Clause"`, `"Apache-2.0"`).

Older packages may not have this field. Fallback: check the GitHub API for
the repo's license via `GET /repos/{owner}/{repo}` which returns
`license.spdx_id`.

## License Classification

Classify licenses into three risk tiers:

| Tier         | Examples                                | Icon  |
| ------------ | --------------------------------------- | ----- |
| Permissive   | MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, Zlib | `🟢` |
| Copyleft     | GPL-2.0, GPL-3.0, LGPL-2.1, LGPL-3.0, MPL-2.0, AGPL-3.0 | `🟡` |
| Unknown      | null, empty, NOASSERTION, unlicensed    | `🔴` |

This is a hint, not legal advice. The classification is intentionally simple.

## Changes

### Modified: `src/types.ts`

- Add to `PubDevPackageInfo`:
  ```typescript
  readonly license: string | null;
  ```
- Add to `VibrancyResult`:
  ```typescript
  readonly license: string | null;
  ```

### New File: `src/scoring/license-classifier.ts`

- `classifyLicense(spdx: string | null): 'permissive' | 'copyleft' | 'unknown'`
- `licenseEmoji(tier: string): string` — returns the icon
- Pure functions, no I/O
- Handles common SPDX identifiers and `OR`/`AND` expressions (use the most
  restrictive component)

### Modified: `src/services/pub-dev-api.ts`

- In `fetchPackageInfo()`, extract `pubspec.license` from the API response
- Add to the returned `PubDevPackageInfo` object

### Modified: `src/services/github-api.ts`

- In `fetchRepoMetrics()`, extract `license.spdx_id` from the repo response
  (this data is already in the GitHub repo endpoint, just not parsed)
- Add `readonly license: string | null` to `GitHubMetrics`

### Modified: `src/scan-orchestrator.ts`

- Resolve license: prefer pub.dev value, fall back to GitHub value
- Set `license` on `VibrancyResult`

### Modified: `src/providers/tree-items.ts`

- Add license row to `buildVersionGroup()`:
  ```
  🟢 License    MIT
  ```
- Use emoji from `licenseEmoji()` for visual tier indicator

### Modified: `src/providers/hover-provider.ts`

- Add "License" row to the hover markdown table

### Modified: `src/views/report-html.ts`

- Add "License" column to the webview report table

### Modified: `src/views/report-export.ts`

- Include `license` field in both JSON and Markdown exports

### Tests

- `src/test/scoring/license-classifier.test.ts` — MIT, GPL, null, compound
  expressions (`MIT OR Apache-2.0`), edge cases (empty string, whitespace)
- Update existing `pub-dev-api` tests to verify license extraction
- Update existing `tree-items` tests for the new detail row

## Out of Scope

- Full license compatibility matrix (MIT + GPL project-wide analysis)
- Reading LICENSE files from package archives
- Legal compliance enforcement or blocking
