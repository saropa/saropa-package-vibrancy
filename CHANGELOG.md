# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**VSCode Marketplace** — [Saropa Package Vibrancy](https://marketplace.visualstudio.com/items?itemName=saropa.saropa-package-vibrancy)

**Source Code** - [GitHub](https://github.com/saropa/saropa-package-vibrancy)

## [Unreleased]

### Changed

- Enriched About panel with full company profile, consumer apps, developer ecosystem, social links, and company details from ABOUT_SAROPA.md
- Tree view packages now expand into logical groups (Version, Update, Community, Size, Alerts) with colored emoji indicators for update severity and bloat rating

---

## [0.1.2]

### Added

- About panel with version number, Marketplace link, and GitHub link (info icon in sidebar header)
- Extension version displayed in sidebar tree view header

### Changed

- Redesigned extension and sidebar icons to match Saropa family style (cream background, gem hexagon, centered pulse line, status pills)

---

## [0.1.1]

### Added

- Flagged issues detection: scans open GitHub issues for high-signal keywords (deprecated, obsolete, breaking change, build failure, null safety, etc.) and surfaces them in hover tooltips, tree view, and diagnostics
- Scoring penalty for flagged issues (5–15 points based on count)
- Pub.dev-inspired gem icon for sidebar activity bar and marketplace listing
- Copy as JSON context menu action on tree view package nodes
- Expanded known issues database to 472 entries covering top 100 Flutter packages (active, maintenance, freemium, commercial statuses)
- Tree view click-to-navigate: clicking a package opens its line in pubspec.yaml; context menu to open on pub.dev and update to latest version
- Suppress package: right-click any package to suppress it from diagnostics and hover; suppressed packages appear dimmed in a collapsible "Suppressed" group at the bottom of the tree view
- Upgrade-and-test command: upgrades a dependency, runs flutter test, and auto-rolls back if tests fail
- Export vibrancy report as timestamped Markdown and JSON files to a report/ directory
- Retry with exponential backoff for API calls (handles 429 rate-limits and 5xx errors)
- Pub.dev changelog fallback when GitHub API is unavailable
- Publish pipeline reports known issues summary: entry counts by status, duplicate check, oldest as_of date

### Fixed

- Stable packages with low GitHub activity but recent pub.dev publishes no longer falsely classified as End of Life
- Known issues loader normalizes "N/A" and empty strings as unset values

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
