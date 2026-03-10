import knownIssuesData from '../data/knownIssues.json';
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
    };
}

const issueMap = new Map<string, KnownIssue>();
const { issues } = knownIssuesData as { issues: Record<string, unknown>[] };
for (const entry of issues) {
    const issue = normalizeIssue(entry);
    issueMap.set(issue.name, issue);
}

/** Look up a package in the bundled known-issues database. */
export function findKnownIssue(packageName: string): KnownIssue | null {
    return issueMap.get(packageName) ?? null;
}

/** Return all known issues. */
export function allKnownIssues(): ReadonlyMap<string, KnownIssue> {
    return issueMap;
}
