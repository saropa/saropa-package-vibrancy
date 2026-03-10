import knownIssuesData from '../data/knownIssues.json';
import { KnownIssue } from '../types';

const issueMap = new Map<string, KnownIssue>();
for (const entry of knownIssuesData as KnownIssue[]) {
    issueMap.set(entry.name, entry);
}

/** Look up a package in the bundled known-issues database. */
export function findKnownIssue(packageName: string): KnownIssue | null {
    return issueMap.get(packageName) ?? null;
}

/** Return all known issues. */
export function allKnownIssues(): ReadonlyMap<string, KnownIssue> {
    return issueMap;
}
