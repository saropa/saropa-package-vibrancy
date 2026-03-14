# Family conflict: Google family removed (false positive fix)

**Date:** 2025-03-14

## Summary

Family conflict detection was flagging packages like `google_fonts` when other `google_*` packages in the project were on different major versions (e.g. "Family conflict: google_fonts is in the Google family on major v8, but other members use major v2, v3, v7"). This was a false positive: `google_*` is a publisher prefix, not a version-coupled product family. Packages such as `google_fonts`, `google_sign_in`, and `google_maps_flutter` are independent products with separate release cadences.

## Change

- **Removed** the "Google" family from `src/data/package-families.ts`.
- Family conflict detection now applies only to real version-coupled families: Firebase, Riverpod, Bloc, Freezed, Drift.
- Added a code comment that families must be product lines whose packages are version-coupled; publisher prefixes like `google_` must not be used.

## Related

- Plan: `plans/history/20260311/08-package-family-conflict-detector.md` (original design included a Google family; this fix narrows the design).
- Changelog: [1.2.0] — Family conflict no longer flags unrelated packages.
