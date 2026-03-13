# Command errors: goToLine not found, copyAsJson argument failure

**Resolved:** 2025-03 (Unreleased)

## Summary

- **goToLine**: Problems view tree items invoked `saropaPackageVibrancy.goToLine` but the command was never registered → "command not found".
- **copyAsJson (and similar)**: When commands that expect a `PackageItem` (e.g. Copy as JSON, Open on pub.dev) were invoked with no or invalid argument (e.g. from wrong context), VS Code reported "Error processing argument at index 0, conversion failure from undefined".

## Resolution

- Implemented and registered `goToLine`: opens workspace `pubspec.yaml` at the given 0-based line (used when clicking a problem in the Problems view).
- Implemented and registered `showChangelog` (was invoked by Package Details webview but never registered): opens `https://pub.dev/packages/<name>/changelog`.
- Added shared guard `requirePackageItem()` for all commands that require a Packages view item; invalid/undefined argument now shows a clear warning instead of throwing.
- Added `package.json` contribution for `goToLine` and `showChangelog`.
- Tightened argument types (e.g. `line: number | undefined`, `packageName: string | undefined`) and added unit tests for new commands and guard behavior.
