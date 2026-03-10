# Change Log

## [0.1.0] - Unreleased

### Added
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
- Vibrancy scoring: V = (0.5 * Resolution) + (0.4 * Engagement) + (0.1 * Popularity)
- Four categories: Vibrant, Quiet, Legacy-Locked, End of Life
- Auto-scan on workspace open (configurable)
- File watcher re-scans on pubspec.lock changes
- GitHub PAT support for increased rate limits
- Option to include dev_dependencies in scan
