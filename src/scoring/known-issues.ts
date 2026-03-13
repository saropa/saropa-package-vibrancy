import knownIssuesData from '../data/known_issues.json';
import { KnownIssue } from '../types';

/** Treat "N/A", empty, and whitespace-only strings as unset. */
function normalizeOptional(value: unknown): string | undefined {
    if (typeof value !== 'string') { return undefined; }
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'n/a') { return undefined; }
    return trimmed;
}

function normalizeIssue(raw: Record<string, unknown>): KnownIssue {
    return {
        name: raw.name as string,
        status: raw.status as string,
        reason: raw.reason as string | undefined,
        as_of: raw.as_of as string | undefined,
        replacement: normalizeOptional(raw.replacement),
        migrationNotes: normalizeOptional(raw.migrationNotes),
        archiveSizeBytes: typeof raw.archiveSizeBytes === 'number'
            ? raw.archiveSizeBytes : undefined,
        archiveSizeMB: typeof raw.archiveSizeMB === 'number'
            ? raw.archiveSizeMB : undefined,
        license: normalizeOptional(raw.license),
        lastUpdated: normalizeOptional(raw.lastUpdated),
        pubPoints: typeof raw.pubPoints === 'number'
            ? raw.pubPoints : undefined,
        wasmReady: typeof raw.wasmReady === 'boolean'
            ? raw.wasmReady : undefined,
        verifiedPublisher: typeof raw.verifiedPublisher === 'boolean'
            ? raw.verifiedPublisher : undefined,
        platforms: Array.isArray(raw.platforms)
            ? raw.platforms.filter(
                (p: unknown): p is string => typeof p === 'string',
            )
            : undefined,
    };
}

const issueMap = new Map<string, KnownIssue>();
const { issues } = knownIssuesData as { issues: Record<string, unknown>[] };
for (const entry of issues) {
    const issue = normalizeIssue(entry);
    issueMap.set(issue.name, issue);
}

/**
 * True when replacement is a pub package name (safe to use in "Replace with X" and in
 * pubspec edits). False for instructions or freeform text (e.g. "Update to v9+",
 * "Update to latest version", "Use Native Channels"). Consumers should use this to
 * choose message format (Replace with X vs Deprecated — X / Consider: X) and to
 * avoid offering a code action that would write non-package text into pubspec.yaml.
 */
export function isReplacementPackageName(replacement: string): boolean {
    return /^[a-z0-9_]+$/.test(replacement.trim());
}

/** Look up a package in the bundled known-issues database. */
export function findKnownIssue(packageName: string): KnownIssue | null {
    return issueMap.get(packageName) ?? null;
}

/** Return all known issues. */
export function allKnownIssues(): ReadonlyMap<string, KnownIssue> {
    return issueMap;
}
