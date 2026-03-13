# Known-issue replacement semantics and version-aware display

**Resolved:** 2025-03-13

## Summary

- **Problem:** The `replacement` field in known_issues.json was used for both package names (e.g. `dio`) and instructions (e.g. `Update to v9+`). All consumers treated it as a package name, so: (1) code actions could overwrite the pubspec with literal "Update to v9+"; (2) v10 users saw "Consider replacing with Update to v9+"; (3) inferring a version by parsing the replacement text was fragile ("9" could mean "9 issues" etc.).
- **Fix:** (1) Added `isReplacementPackageName()` so only package-name replacements are used for "Replace with X" and code actions. (2) Added optional `replacementObsoleteFromVersion` (version string, e.g. `"9.0.0"`) in the JSON; when set, the replacement message is hidden when the user's version is ≥ that version (segment-wise comparison). No parsing of the replacement message text. (3) All display paths (diagnostics, CodeLens, detail view, logger, orchestrator) use `getReplacementDisplayText(replacement, currentVersion, replacementObsoleteFromVersion)`.

## Files changed

- `src/types.ts` — `replacementObsoleteFromVersion?: string`
- `src/scoring/known-issues.ts` — `isReplacementPackageName`, `getReplacementDisplayText`, `parseVersionSegments` / `versionGte`
- `src/data/known_issues.json` — `replacementObsoleteFromVersion: "9.0.0"` for flutter_secure_storage, flutter_sound_v7
- Diagnostics, CodeLens, detail view, detail logger, scan-orchestrator — pass version/obsolete field and use display text only when returned
- `docs/replacement-semantics-review.md` — design and implementation notes
