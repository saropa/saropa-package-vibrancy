# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**pub.dev** — [saropa_drift_viewer](https://pub.dev/packages/saropa_drift_viewer)

## [0.1.1] - Unreleased

### Added

- Pub.dev-inspired gem icon for sidebar activity bar and marketplace listing
- Copy as JSON context menu action on tree view package nodes

### Changed

- Diagnostic messages now lead with actionable verbs (Replace, Review, Monitor) instead of category labels
- Vibrancy score shown as 0–10 scale instead of decimal out of 100
- Severity downgraded: end-of-life is now Warning (was Error), legacy-locked is Information, quiet is Hint
- Package name included in all diagnostic messages for readability in the Problems panel

---

## [0.1.0]

### Added

- Pub update check: detects outdated dependencies by comparing current vs latest versions
- Changelog fetching from GitHub (with monorepo subpath support) and parsing
- Update indicators in tree view, hover tooltips, diagnostics, report, and status bar
- Report "Updates" summary card and sortable "Update" column with severity coloring
- Tree view sidebar showing package vibrancy scores, sorted worst-first
- Diagnostics (error/warning/info squiggles) in pubspec.yaml
- Quick-fix code actions for known-bad packages with replacements
- Hover tooltips with score, category, dates, stars, and pub.dev links
- Status bar showing overall project vibrancy score
- Webview report dashboard with sortable table and category breakdown
- Pub.dev API integration (package info + scores)
- GitHub API integration (issues, PRs, stars)
- 24-hour response caching via VS Code globalState
- 100 bundled known-bad packages database
- Vibrancy scoring: V = (0.5 _ Resolution) + (0.4 _ Engagement) + (0.1 \* Popularity)
- Four categories: Vibrant, Quiet, Legacy-Locked, End of Life
- Auto-scan on workspace open (configurable)
- File watcher re-scans on pubspec.lock changes
- GitHub PAT support for increased rate limits
- Option to include dev_dependencies in scan
