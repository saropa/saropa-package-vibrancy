import { GitHubMetrics } from '../types';
import { CacheService } from './cache-service';
import { ScanLogger } from './scan-logger';
import { fetchWithRetry } from './fetch-retry';

/** GitHub REST API v3 base URL. */
const GITHUB_API = 'https://api.github.com';

/** Window for "recent" activity — issues/PRs closed within this period count. */
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Milliseconds in one day, used for recency calculations. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Sentinel value when no issue/PR has ever been closed in the repo. */
const NO_CLOSE_DAYS = 999;

/** Extract owner/repo from a GitHub URL. */
export function extractGitHubRepo(
    repoUrl: string,
): { owner: string; repo: string } | null {
    const match = repoUrl.match(
        /github\.com\/([^/]+)\/([^/.\s#]+)/,
    );
    if (!match) { return null; }
    return { owner: match[1], repo: match[2] };
}

function buildHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'saropa-package-vibrancy',
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }
    return headers;
}

/** Fetch GitHub metrics for a repository. */
export async function fetchRepoMetrics(
    owner: string,
    repo: string,
    params?: { token?: string; cache?: CacheService; logger?: ScanLogger },
): Promise<GitHubMetrics | null> {
    const log = params?.logger;
    const cacheKey = `gh.${owner}.${repo}`;
    const cached = params?.cache?.get<GitHubMetrics>(cacheKey);
    if (cached) {
        log?.cacheHit(cacheKey);
        return cached;
    }
    log?.cacheMiss(cacheKey);

    try {
        const headers = buildHeaders(params?.token);
        const now = Date.now();
        const cutoff = new Date(now - NINETY_DAYS_MS).toISOString();
        const repoUrl = `${GITHUB_API}/repos/${owner}/${repo}`;
        const issuesUrl = `${repoUrl}/issues?state=closed&since=${cutoff}&per_page=100`;
        const pullsUrl = `${repoUrl}/pulls?state=closed&per_page=100`;

        log?.apiRequest('GET', repoUrl);
        log?.apiRequest('GET', issuesUrl);
        log?.apiRequest('GET', pullsUrl);
        const t0 = Date.now();

        const [repoResp, issuesResp, pullsResp] = await Promise.all([
            fetchWithRetry(repoUrl, { headers }, log),
            fetchWithRetry(issuesUrl, { headers }, log),
            fetchWithRetry(pullsUrl, { headers }, log),
        ]);
        const elapsed = Date.now() - t0;
        log?.apiResponse(repoResp.status, repoResp.statusText, elapsed);
        log?.apiResponse(issuesResp.status, issuesResp.statusText, elapsed);
        log?.apiResponse(pullsResp.status, pullsResp.statusText, elapsed);

        if (!repoResp.ok) { return null; }

        const repoData: any = await repoResp.json();
        const rawIssues: any[] = issuesResp.ok
            ? await issuesResp.json() as any[] : [];
        const pulls: any[] = pullsResp.ok
            ? await pullsResp.json() as any[] : [];

        // GitHub /issues endpoint includes PRs — filter them out
        const issues = rawIssues.filter(
            (i: any) => !i.pull_request,
        );

        const metrics = buildMetrics(repoData, issues, pulls, now);
        await params?.cache?.set(cacheKey, metrics);
        return metrics;
    } catch {
        log?.error(`Failed to fetch GitHub metrics for ${owner}/${repo}`);
        return null;
    }
}

function buildMetrics(
    repoData: any,
    issues: any[],
    pulls: any[],
    now: number,
): GitHubMetrics {
    const cutoff = now - NINETY_DAYS_MS;

    const closedRecent = issues.filter(
        (i: any) => i.closed_at && new Date(i.closed_at).getTime() > cutoff,
    );
    const mergedRecent = pulls.filter(
        (p: any) => p.merged_at && new Date(p.merged_at).getTime() > cutoff,
    );

    const totalComments = issues.reduce(
        (sum: number, i: any) => sum + (i.comments ?? 0), 0,
    );
    const avgComments = issues.length > 0
        ? totalComments / issues.length : 0;

    const lastClose = closedRecent.length > 0
        ? Math.max(...closedRecent.map(
            (i: any) => new Date(i.closed_at).getTime(),
        ))
        : 0;

    const daysSinceClose = lastClose > 0
        ? Math.floor((now - lastClose) / ONE_DAY_MS) : NO_CLOSE_DAYS;

    const updatedAt = new Date(repoData.updated_at ?? 0).getTime();
    const daysSinceUpdate = Math.floor(
        (now - updatedAt) / ONE_DAY_MS,
    );

    return {
        stars: repoData.stargazers_count ?? 0,
        openIssues: repoData.open_issues_count ?? 0,
        closedIssuesLast90d: closedRecent.length,
        mergedPrsLast90d: mergedRecent.length,
        avgCommentsPerIssue: Math.round(avgComments * 10) / 10,
        daysSinceLastUpdate: Math.max(0, daysSinceUpdate),
        daysSinceLastClose: daysSinceClose,
    };
}
