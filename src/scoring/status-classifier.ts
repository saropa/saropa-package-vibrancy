import { VibrancyCategory, KnownIssue, PubDevPackageInfo, VibrancyResult } from '../types';

/** Count results by vibrancy category. */
export function countByCategory(results: readonly VibrancyResult[]) {
    let vibrant = 0, quiet = 0, legacy = 0, eol = 0;
    for (const r of results) {
        switch (r.category) {
            case 'vibrant': vibrant++; break;
            case 'quiet': quiet++; break;
            case 'legacy-locked': legacy++; break;
            case 'end-of-life': eol++; break;
        }
    }
    return { vibrant, quiet, legacy, eol };
}

/**
 * Minimum pub.dev points for a package to qualify as actively maintained.
 * 130/160 (81%) represents a package that passes all critical pub.dev checks
 * but allows some tolerance below the maximum score.
 */
const ACTIVE_PUB_POINTS_THRESHOLD = 130;

/** Maximum months since last publish before the guardrail stops protecting. */
const ACTIVE_MONTHS_THRESHOLD = 18;

/** Approximate milliseconds in one month (30 days). */
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

/** Classify a package into a vibrancy category. */
export function classifyStatus(params: {
    score: number;
    knownIssue: KnownIssue | null;
    pubDev: PubDevPackageInfo | null;
}): VibrancyCategory {
    // Hard override: pub.dev discontinuation is objective — always end-of-life
    if (params.pubDev?.isDiscontinued) { return 'end-of-life'; }

    // Known issue override with guardrail: if pub.dev data (fetched at scan
    // time) shows the package is actively maintained, cap at legacy-locked to
    // prevent editorial overrides from condemning healthy packages.
    // Note: other known issue statuses (caution, maintenance_mode, etc.)
    // intentionally have no override — those packages are scored normally.
    if (params.knownIssue?.status === 'end_of_life') {
        if (isActivelyMaintained(params.pubDev)) { return 'legacy-locked'; }
        return 'end-of-life';
    }

    if (params.score >= 70) { return 'vibrant'; }
    if (params.score >= 40) { return 'quiet'; }
    if (params.score >= 10) { return 'legacy-locked'; }
    return 'end-of-life';
}

/**
 * Check if pub.dev data indicates active maintenance.
 * Uses pub.dev signals fetched at analysis time (not static known_issues.json
 * data) to detect when an editorial EOL classification contradicts reality.
 * Accepts an optional `nowMs` for deterministic testing of time boundaries.
 */
export function isActivelyMaintained(
    pubDev: PubDevPackageInfo | null,
    nowMs: number = Date.now(),
): boolean {
    if (!pubDev || pubDev.isDiscontinued) { return false; }
    if (pubDev.pubPoints < ACTIVE_PUB_POINTS_THRESHOLD) { return false; }
    const publishedMs = Date.parse(pubDev.publishedDate);
    if (isNaN(publishedMs)) { return false; }
    const monthsSincePublish = (nowMs - publishedMs) / MS_PER_MONTH;
    return monthsSincePublish <= ACTIVE_MONTHS_THRESHOLD;
}

/** Map category to ThemeIcon id. */
export function categoryIcon(category: VibrancyCategory): string {
    switch (category) {
        case 'vibrant': return 'pass';
        case 'quiet': return 'info';
        case 'legacy-locked': return 'warning';
        case 'end-of-life': return 'error';
    }
}

/** Map category to DiagnosticSeverity value. */
export function categoryToSeverity(category: VibrancyCategory): number {
    switch (category) {
        case 'end-of-life': return 1;
        case 'legacy-locked': return 2;
        case 'quiet': return 3;
        case 'vibrant': return 3;
    }
}

/** Human-readable label for a category. */
export function categoryLabel(category: VibrancyCategory): string {
    switch (category) {
        case 'vibrant': return 'Vibrant';
        case 'quiet': return 'Quiet';
        case 'legacy-locked': return 'Legacy-Locked';
        case 'end-of-life': return 'End of Life';
    }
}
